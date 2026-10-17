import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  basePermissions,
  channelPermissions,
  countChecks,
  diagnoseCommunity,
  DISCORD_PERMISSIONS as P,
  missingPermissions,
  type CommunityDiagnosticInput,
  type DiagnosticChannel,
  type DiagnosticRole,
} from "../src/discord-permissions.js";

const GUILD = "100000000000000000";
const BOT = "200000000000000000";
const s = (value: bigint) => value.toString();
const MESSAGES = P.VIEW_CHANNEL | P.SEND_MESSAGES | P.EMBED_LINKS | P.ATTACH_FILES | P.READ_MESSAGE_HISTORY;
const BOT_PERMISSIONS = MESSAGES | P.MANAGE_ROLES | P.MANAGE_CHANNELS | P.MANAGE_MESSAGES | P.MODERATE_MEMBERS | P.KICK_MEMBERS | P.BAN_MEMBERS;

/** Rôles façon Cat Café : @everyone sans permission, accès donné par le rôle vérifié. */
const role = (id: string, name: string, position: number, permissions = 0n, managed = false): DiagnosticRole => ({ id, name, position, permissions: s(permissions), managed });
const ROLES = {
  everyone: role(GUILD, "@everyone", 0),
  membre: role("300000000000000001", "🐾 Client·e du Café", 2, MESSAGES),
  couleur: role("300000000000000002", "🍓 Fraise", 3),
  robots: role("300000000000000003", "🤖 Robots du Café", 5, MESSAGES),
  ellie: role("300000000000000004", "Ellie [BOT]", 6, BOT_PERMISSIONS, true),
  modo: role("300000000000000005", "🛡️ Gardien·ne du Café", 8, MESSAGES | P.KICK_MEMBERS),
};
const allRoles = Object.values(ROLES);

const hidden = (id: string, name: string, ...allowed: string[]): DiagnosticChannel => ({
  id,
  name,
  type: 0,
  permission_overwrites: [
    { id: GUILD, type: 0, allow: "0", deny: s(P.VIEW_CHANNEL) },
    ...allowed.map((roleId) => ({ id: roleId, type: 0, allow: s(MESSAGES), deny: "0" })),
  ],
});
const CHANNELS = {
  reglement: { id: "400000000000000001", name: "📜・règlement", type: 0, permission_overwrites: [{ id: GUILD, type: 0, allow: s(P.VIEW_CHANNEL | P.READ_MESSAGE_HISTORY), deny: s(P.SEND_MESSAGES) }, { id: ROLES.robots.id, type: 0, allow: s(MESSAGES), deny: "0" }] },
  verification: {
    id: "400000000000000002",
    name: "✅・vérification",
    type: 0,
    permission_overwrites: [
      { id: GUILD, type: 0, allow: s(P.VIEW_CHANNEL | P.READ_MESSAGE_HISTORY), deny: s(P.SEND_MESSAGES) },
      { id: ROLES.membre.id, type: 0, allow: "0", deny: s(P.VIEW_CHANNEL) },
      { id: ROLES.robots.id, type: 0, allow: s(MESSAGES), deny: "0" },
    ],
  },
  roles: hidden("400000000000000003", "🎀・choisis-tes-rôles", ROLES.membre.id, ROLES.robots.id),
  signalements: hidden("400000000000000004", "🚨・signalements", ROLES.modo.id),
} satisfies Record<string, DiagnosticChannel>;

function input(overrides: Partial<CommunityDiagnosticInput> = {}): CommunityDiagnosticInput {
  return {
    guildId: GUILD,
    bot: { userId: BOT, roleIds: [ROLES.ellie.id, ROLES.robots.id] },
    roles: allRoles,
    channels: Object.values(CHANNELS),
    accessRoleId: ROLES.membre.id,
    rulesChannelId: CHANNELS.reglement.id,
    verifyChannelId: CHANNELS.verification.id,
    rolePanelChannelIds: [CHANNELS.roles.id],
    autoRoleId: null,
    joinButtonRoleId: null,
    givenRoles: [
      { roleId: ROLES.membre.id, source: "vérification" },
      { roleId: ROLES.couleur.id, source: "panneau de rôles" },
    ],
    channelUses: [
      { label: "Vérification", channelId: CHANNELS.verification.id, needs: ["VIEW_CHANNEL", "SEND_MESSAGES", "EMBED_LINKS"] },
      { label: "Panneau de rôles", channelId: CHANNELS.roles.id, needs: ["VIEW_CHANNEL", "SEND_MESSAGES", "EMBED_LINKS"] },
    ],
    ...overrides,
  };
}

const errors = (sections: ReturnType<typeof diagnoseCommunity>) => sections.flatMap((section) => section.checks).filter((check) => check.level === "error");

describe("calcul des permissions Discord", () => {
  it("@everyone + rôles ; administrateur = tout", () => {
    assert.equal(basePermissions(GUILD, allRoles, { userId: null, roleIds: [] }), 0n);
    assert.equal(basePermissions(GUILD, allRoles, { userId: null, roleIds: [ROLES.membre.id] }), MESSAGES);
    const admin = role("300000000000000009", "Admin", 9, P.ADMINISTRATOR);
    assert.equal(channelPermissions(GUILD, [...allRoles, admin], CHANNELS.signalements, { userId: null, roleIds: [admin.id] }) & P.VIEW_CHANNEL, P.VIEW_CHANNEL);
  });

  it("exceptions de salon : refus de @everyone, autorisation par rôle, refus par rôle", () => {
    assert.equal(channelPermissions(GUILD, allRoles, CHANNELS.signalements, { userId: null, roleIds: [ROLES.membre.id] }), 0n);
    assert.deepEqual(missingPermissions(channelPermissions(GUILD, allRoles, CHANNELS.signalements, { userId: null, roleIds: [ROLES.modo.id] }), ["VIEW_CHANNEL", "SEND_MESSAGES"]), []);
    assert.equal(channelPermissions(GUILD, allRoles, CHANNELS.verification, { userId: null, roleIds: [ROLES.membre.id] }), 0n, "le salon disparaît après la vérification");
    const newcomer = channelPermissions(GUILD, allRoles, CHANNELS.verification, { userId: null, roleIds: [] });
    assert.deepEqual(missingPermissions(newcomer, ["VIEW_CHANNEL", "READ_MESSAGE_HISTORY"]), []);
    assert.deepEqual(missingPermissions(newcomer, ["SEND_MESSAGES"]), ["SEND_MESSAGES"]);
  });

  it("exception personnelle d'un membre appliquée en dernier", () => {
    const channel: DiagnosticChannel = { ...CHANNELS.signalements, permission_overwrites: [...(CHANNELS.signalements.permission_overwrites ?? []), { id: BOT, type: 1, allow: s(MESSAGES), deny: "0" }] };
    assert.deepEqual(missingPermissions(channelPermissions(GUILD, allRoles, channel, { userId: BOT, roleIds: [ROLES.ellie.id] }), ["VIEW_CHANNEL", "SEND_MESSAGES"]), []);
  });
});

describe("diagnostic de la communauté", () => {
  it("configuration du Cat Café correcte : aucune erreur", () => {
    const sections = diagnoseCommunity(input());
    assert.deepEqual(errors(sections), []);
    assert.equal(countChecks(sections).error, 0);
  });

  it("rôle d'Ellie sous un rôle à donner", () => {
    const low = { ...ROLES.ellie, position: 1 };
    const sections = diagnoseCommunity(
      input({ bot: { userId: BOT, roleIds: [low.id] }, roles: allRoles.map((candidate) => (candidate.id === low.id ? low : candidate)) }),
    );
    const [error] = errors(sections);
    assert.match(error?.label ?? "", /ne peut pas donner 2 rôles/);
    assert.match(error?.detail ?? "", /au-dessus de « 🍓 Fraise »/);
  });

  it("salon de modération invisible pour Ellie, avec la marche à suivre", () => {
    const sections = diagnoseCommunity(input({ channelUses: [{ label: "Signalements", channelId: CHANNELS.signalements.id, needs: ["VIEW_CHANNEL", "SEND_MESSAGES"] }] }));
    const [error] = errors(sections);
    assert.match(error?.label ?? "", /Signalements · #🚨・signalements : il manque Voir les salons, Envoyer des messages/);
    assert.match(error?.detail ?? "", /« Ellie \[BOT\] »/);
  });

  it("rôle d'accès donné automatiquement à l'arrivée = vérification inutile", () => {
    assert.match(errors(diagnoseCommunity(input({ autoRoleId: ROLES.membre.id })))[0]?.label ?? "", /donné automatiquement/);
  });

  it("nouveaux membres qui ne voient pas le bouton, rôle géré impossible à donner", () => {
    const sections = diagnoseCommunity(
      input({
        verifyChannelId: CHANNELS.roles.id,
        givenRoles: [{ roleId: ROLES.ellie.id, source: "panneau de rôles" }],
      }),
    );
    const labels = errors(sections).map((check) => check.label);
    assert.ok(labels.some((label) => label.startsWith("Les nouveaux ne voient pas #🎀・choisis-tes-rôles")));
    assert.ok(labels.some((label) => label.startsWith("Rôles gérés par une intégration")));
  });
});
