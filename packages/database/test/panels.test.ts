import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  COMPONENT_IDS,
  countPanelComponents,
  emojiPayload,
  fillCommunityPlaceholders,
  isValidEmoji,
  rulesMessagePayload,
  splitIds,
  ticketPanelContent,
  verificationMessagePayload,
  type RulesSettings,
} from "../src/panels.js";

describe("panneaux interactifs", () => {
  it("valide les émojis (Unicode, composés, drapeaux, émojis du serveur)", () => {
    for (const emoji of ["😀", "🦊", "🏳️‍🌈", "👩‍💻", "☁️", "🇫🇷", "1️⃣", "<:kitsune:123456789012345678>", "<a:danse:123456789012345678>"]) {
      assert.ok(isValidEmoji(emoji), emoji);
    }
    for (const emoji of ["abc", "", "🦊 renard", "<:bad:12>", "12", "::"]) {
      assert.equal(isValidEmoji(emoji), false, emoji);
    }
  });

  it("compte les composants : 1 par groupe « menu », 1 par rôle d'un groupe « boutons »", () => {
    assert.equal(
      countPanelComponents([
        { display: "MENU", optionCount: 25 },
        { display: "BUTTONS", optionCount: 4 },
      ]),
      5,
    );
  });

  it("panneau d'aide : bouton de signalement seulement si un salon est configuré", () => {
    assert.match(ticketPanelContent(true).description, /Signalement anonyme/);
    assert.doesNotMatch(ticketPanelContent(false).description, /Signalement anonyme/);
  });

  it("splitIds ne garde que des identifiants Discord uniques", () => {
    assert.deepEqual(splitIds("123456789012345678, abc,123456789012345678 223456789012345678"), ["123456789012345678", "223456789012345678"]);
  });
});

describe("règlement et vérification", () => {
  const settings: RulesSettings = {
    rulesTitle: "📜 Règlement",
    rulesContent: "Sois gentil·le.",
    rulesButtonLabel: "J'entre !",
    verifyChannelId: null,
    verifyTitle: "🐾 Bienvenue",
    verifyContent: "Lis le {rules}, puis choisis tes rôles dans {roles} sur {server}.",
    verifyButtonEmoji: "🐾",
  };

  it("bouton sous le règlement quand il n'y a pas de salon de vérification", () => {
    const payload = rulesMessagePayload(settings);
    const button = payload.components[0]?.components[0];
    assert.equal(button?.custom_id, COMPONENT_IDS.RULES_ACCEPT);
    assert.deepEqual(button?.emoji, { name: "🐾" });
    assert.equal(payload.embeds[0]?.description, "Sois gentil·le.");
  });

  it("règlement sans bouton, qui renvoie vers le salon de vérification", () => {
    const payload = rulesMessagePayload({ ...settings, verifyChannelId: "123456789012345678" });
    assert.equal(payload.components.length, 0);
    assert.match(payload.embeds[0]?.description ?? "", /<#123456789012345678>/);
  });

  it("message de vérification : placeholders remplacés, bouton d'accès", () => {
    const placeholders = { rules: "<#1>", roles: "<#2>", server: "Le Cat Café" };
    const payload = verificationMessagePayload({ ...settings, verifyChannelId: "123456789012345678" }, placeholders);
    assert.equal(payload.embeds[0]?.description, "Lis le <#1>, puis choisis tes rôles dans <#2> sur Le Cat Café.");
    assert.equal(payload.components[0]?.components[0]?.custom_id, COMPONENT_IDS.RULES_ACCEPT);
    assert.equal(fillCommunityPlaceholders("{server} {server}", placeholders), "Le Cat Café Le Cat Café");
  });

  it("émoji invalide ignoré, émoji du serveur converti", () => {
    assert.equal(rulesMessagePayload({ ...settings, verifyButtonEmoji: "patte" }).components[0]?.components[0]?.emoji, undefined);
    assert.deepEqual(emojiPayload("<a:danse:123456789012345678>"), { name: "danse", id: "123456789012345678", animated: true });
  });
});

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(join(tmpdir(), "ellie-cat-cafe-"));
const databaseUrl = `file:${join(tempDir, "cat-cafe.db").replace(/\\/g, "/")}`;

describe("configuration du Cat Café (base temporaire)", () => {
  let catCafe: typeof import("../src/cat-cafe.js");
  let client: typeof import("../src/client.js");

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    execFileSync(process.execPath, [resolve(packageDir, "../../node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"], {
      cwd: packageDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "ignore",
    });
    catCafe = await import("../src/cat-cafe.js");
    client = await import("../src/client.js");
  });

  after(async () => {
    await client?.prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("refuse un autre serveur", async () => {
    await assert.rejects(catCafe.applyCatCafeConfig("999999999999999999"));
  });

  it("reprend le panneau importé de l'ancien bot du Terrier et l'aligne sur le Cat Café", async () => {
    const { guildId, channels, roles } = catCafe.CAT_CAFE;
    const oldPassions = "1560237583961952366"; // « Team animaux », remplacé par « Team chats »
    await client.prisma.guild.create({ data: { id: guildId, rulesRoleId: "1560237550537416855", rulesChannelId: channels.rules, rulesMessageId: "1560237866590801999" } });
    await client.prisma.reactionRoleMessage.create({
      data: {
        guildId,
        channelId: "1560237608624197632",
        messageId: "1560237868289364041",
        dirty: false,
        groups: { create: { title: "Passions", legacyKey: "passions", options: { create: { roleId: oldPassions, label: "Team animaux" } } } },
      },
    });

    const first = await catCafe.applyCatCafeConfig(guildId);
    assert.deepEqual(first, { groups: 5, options: 39, levelRewards: 4, liveAlert: true, twitchLinked: true });

    const panels = await client.prisma.reactionRoleMessage.findMany({ where: { guildId }, include: { groups: { include: { options: true } } } });
    assert.equal(panels.length, 1);
    const panel = panels[0];
    assert.equal(panel?.channelId, channels.roles);
    assert.equal(panel?.messageId, null, "nouveau salon : le panneau est republié");
    assert.equal(panel?.dirty, true);
    const passions = panel?.groups.find((group) => group.legacyKey === "passions");
    assert.equal(passions?.options.length, 8);
    assert.ok(!passions?.options.some((option) => option.roleId === oldPassions));
    assert.equal(panel?.groups.find((group) => group.legacyKey === "couleurs")?.multiple, false);

    const guild = await client.prisma.guild.findUniqueOrThrow({ where: { id: guildId } });
    assert.equal(guild.rulesRoleId, roles.membre);
    assert.equal(guild.rulesMessageId, "1560237866590801999", "même salon : le règlement déjà publié est conservé");
    assert.equal(guild.verifyChannelId, channels.verification);
    assert.equal(guild.reportChannelId, channels.reports);
    assert.equal(guild.ticketCategoryId, channels.ticketCategory);
    assert.equal(guild.modLogChannelId, channels.logs);
    assert.equal(guild.permanentInviteChannelId, channels.rules, "lien d'invitation (/invite, !discord) vers le règlement");
    assert.equal((await client.prisma.twitchBotConfig.findUniqueOrThrow({ where: { id: 1 } })).linkedGuildId, guildId);
    assert.equal(splitIds(guild.ticketStaffRoleIds).length, 4);
    assert.ok(guild.rulesContent.length > 500 && guild.rulesContent.length <= 4000);

    const alert = await client.prisma.socialAlert.findFirstOrThrow({ where: { guildId } });
    assert.equal(alert.channelRef, "misstsune");
    assert.match(alert.message, new RegExp(`<@&${roles.notifLives}>`));
  });

  it("peut être relancée sans doublons ni écrasement des niveaux et alertes", async () => {
    const { guildId } = catCafe.CAT_CAFE;
    const second = await catCafe.applyCatCafeConfig(guildId);
    assert.deepEqual(second, { groups: 5, options: 39, levelRewards: 0, liveAlert: false, twitchLinked: false });
    assert.equal(await client.prisma.reactionRoleMessage.count({ where: { guildId } }), 1);
    assert.equal(await client.prisma.reactionRoleGroup.count(), 5);
    assert.equal(await client.prisma.levelReward.count({ where: { guildId } }), 4);
    assert.equal(await client.prisma.socialAlert.count({ where: { guildId } }), 1);
  });
});
