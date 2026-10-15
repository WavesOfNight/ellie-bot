import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Collection } from "discord.js";
import { buildRolePanelPayload, type PanelWithGroups } from "../src/lib/reaction-roles.js";
import { formatTranscript, ticketChannelName, ticketOwnerFromTopic } from "../src/lib/tickets.js";

function panel(groups: Array<{ id: number; display: string; options: number; multiple?: boolean }>): PanelWithGroups {
  return {
    id: 1,
    guildId: "1",
    channelId: "2",
    messageId: null,
    title: "🎀 Choisis tes rôles",
    description: "",
    color: "#FF7EB6",
    dirty: true,
    createdAt: new Date(),
    groups: groups.map((group) => ({
      id: group.id,
      panelId: 1,
      title: `Groupe ${group.id}`,
      emoji: "✨",
      help: "Aide",
      display: group.display,
      multiple: group.multiple ?? true,
      order: group.id,
      legacyKey: null,
      options: Array.from({ length: group.options }, (_, index) => ({
        id: group.id * 100 + index,
        groupId: group.id,
        roleId: `1${String(group.id * 100 + index).padStart(17, "0")}`,
        label: `Rôle ${index}`,
        emoji: null,
        description: null,
        order: index,
      })),
    })),
  };
}

describe("panneaux de rôles", () => {
  it("un bouton par groupe « menu », un bouton par rôle d'un groupe « boutons »", () => {
    const payload = buildRolePanelPayload(panel([
      { id: 1, display: "MENU", options: 10 },
      { id: 2, display: "BUTTONS", options: 3 },
    ]));
    const ids = payload.components.flatMap((row) => row.toJSON().components.map((component) => ("custom_id" in component ? component.custom_id : "")));
    assert.deepEqual(ids, ["rrg:1", "rr:2:100000000000000200", "rr:2:100000000000000201", "rr:2:100000000000000202"]);
    assert.deepEqual(payload.allowedMentions, { parse: [] });
    assert.match(payload.embeds[0]?.toJSON().description ?? "", /\*\*Groupe 1\*\* — Aide/);
  });

  it("jamais plus de 5 rangées de 5 boutons", () => {
    const payload = buildRolePanelPayload(panel([{ id: 1, display: "BUTTONS", options: 30 }]));
    assert.equal(payload.components.length, 5);
    assert.ok(payload.components.every((row) => row.components.length <= 5));
  });
});

describe("tickets", () => {
  it("nom de salon « 🎫・pseudo » et auteur·ice retrouvé·e dans le sujet (format de l'ancien bot)", () => {
    assert.equal(ticketChannelName("Lou.Kitsune_99"), "🎫・lou-kitsune_99");
    assert.equal(ticketChannelName("***"), "🎫・membre");
    assert.equal(ticketOwnerFromTopic("Ticket de lou · ticket:123456789012345678"), "123456789012345678");
    assert.equal(ticketOwnerFromTopic("Un salon normal"), null);
  });

  it("transcription : une ligne par message, avec pièces jointes et embeds", () => {
    const text = formatTranscript([
      {
        createdAt: new Date("2026-10-15T18:00:00Z"),
        author: { username: "lou" },
        content: "Bonjour",
        attachments: new Collection([["1", { url: "https://cdn.discordapp.com/x.png" }]]) as never,
        embeds: [],
      },
      { createdAt: new Date("2026-10-15T18:01:00Z"), author: { username: "Ellie" }, content: "", attachments: new Collection() as never, embeds: [{}] as never },
    ]);
    const lines = text.split("\n");
    assert.equal(lines.length, 2);
    assert.match(lines[0] ?? "", /lou : Bonjour https:\/\/cdn\.discordapp\.com\/x\.png$/);
    assert.match(lines[1] ?? "", /Ellie : \[embed\]$/);
  });
});
