import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { countPanelComponents, isValidEmoji, splitIds, ticketPanelContent } from "../src/panels.js";

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

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(join(tmpdir(), "ellie-legacy-"));
const databaseUrl = `file:${join(tempDir, "legacy.db").replace(/\\/g, "/")}`;

describe("reprise de l'ancien bot du Terrier (base temporaire)", () => {
  let legacy: typeof import("../src/legacy-terrier.js");
  let client: typeof import("../src/client.js");

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    execFileSync(process.execPath, [resolve(packageDir, "../../node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"], {
      cwd: packageDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "ignore",
    });
    legacy = await import("../src/legacy-terrier.js");
    client = await import("../src/client.js");
  });

  after(async () => {
    await client?.prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("refuse un autre serveur", async () => {
    await assert.rejects(legacy.importLegacyTerrier("999999999999999999"));
  });

  it("importe les 5 menus, les tickets et le règlement, une seule fois", async () => {
    const { guildId } = legacy.LEGACY_TERRIER;
    const first = await legacy.importLegacyTerrier(guildId);
    assert.deepEqual(first, { panelCreated: true, groups: 5, options: 39 });

    const panel = await client.prisma.reactionRoleMessage.findFirstOrThrow({ where: { guildId }, include: { groups: { include: { options: true } } } });
    assert.equal(panel.messageId, legacy.LEGACY_TERRIER.messages.roles);
    assert.deepEqual(panel.groups.map((group) => group.legacyKey).sort(), ["couleurs", "jeux", "notifs", "passions", "pronoms"]);
    assert.equal(panel.groups.find((group) => group.legacyKey === "couleurs")?.multiple, false);

    const guild = await client.prisma.guild.findUniqueOrThrow({ where: { id: guildId } });
    assert.equal(guild.rulesRoleId, legacy.LEGACY_TERRIER.roles.member);
    assert.equal(guild.reportChannelId, legacy.LEGACY_TERRIER.channels.reports);
    assert.equal(splitIds(guild.ticketStaffRoleIds).length, 4);
    assert.ok(guild.rulesContent.length > 500 && guild.rulesContent.length <= 4000);

    const second = await legacy.importLegacyTerrier(guildId);
    assert.equal(second.panelCreated, false);
    assert.equal(await client.prisma.reactionRoleMessage.count({ where: { guildId } }), 1);
  });
});
