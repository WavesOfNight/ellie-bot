import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findAutoModMatch } from "@ellie/database/shared";
import { FALLBACK_LINES } from "../src/fallback-lines.js";
import { buildDiscordReplyOptions, formatTwitchReply } from "../src/platforms.js";
import { sanitizeReply, truncateNicely } from "../src/sanitize.js";

const discord = { platform: "discord" as const };
const twitch = { platform: "twitch" as const, commandPrefix: "!" };

describe("nettoyage des réponses", () => {
  it("retire liens, domaines nus, liens Markdown et invitations", () => {
    const out = sanitizeReply("Va voir [mon site](https://evil.example.com) ou evil.ru et discord.gg/abcdef ! https://x.io/y", discord);
    assert.ok(!/https?:|evil\.ru|discord\.gg|x\.io/.test(out), out);
    assert.ok(out.includes("mon site"));
  });

  it("neutralise toutes les mentions", () => {
    const out = sanitizeReply("Salut @everyone et @here, <@123456789012345678> <@&123456789012345678> <#123456789012345678>", discord);
    assert.ok(!out.includes("@everyone"));
    assert.ok(!out.includes("@here"));
    assert.ok(out.includes("@​everyone"));
    assert.ok(!/<[@#]/.test(out));
  });

  it("retire le préfixe « Ellie : », les guillemets englobants et les balises", () => {
    assert.equal(sanitizeReply('Ellie : "Salut toi."', discord), "Salut toi.");
    assert.equal(sanitizeReply("« Yo. »", discord), "Yo.");
    assert.equal(sanitizeReply("<message>coucou</message>", discord), "coucou");
  });

  it("Twitch : une seule ligne, pas de / ou . initial, aucune commande déclenchée", () => {
    assert.equal(sanitizeReply("/ban quelqu'un", twitch), "ban quelqu'un");
    assert.equal(sanitizeReply(".timeout lui", twitch), "timeout lui");
    const out = sanitizeReply("Tape !discord pour nous rejoindre.\nEt !!so aussi", twitch);
    assert.ok(!out.includes("!discord"));
    assert.ok(!out.includes("\n"));
    assert.ok(!/(^|\s)!\S/.test(out), out);
    assert.ok(out.includes("discord pour nous rejoindre."));
  });

  it("tronque proprement (fin de phrase ou de mot)", () => {
    const text = "Première phrase assez longue pour remplir. Deuxième phrase qui dépasse largement la limite fixée ici.";
    assert.equal(truncateNicely(text, 60), "Première phrase assez longue pour remplir.");
    const words = truncateNicely("motmotmot ".repeat(10), 25);
    assert.ok(words.endsWith("…") && words.length <= 25);
    assert.ok(sanitizeReply("a ".repeat(400), twitch).length <= 400);
  });
});

describe("envoi par plateforme", () => {
  it("Discord : allowedMentions toujours vide", () => {
    const options = buildDiscordReplyOptions("Salut");
    assert.deepEqual(options.allowedMentions, { parse: [], repliedUser: false });
    assert.equal(options.failIfNotExists, false);
  });

  it("Twitch : une ligne préfixée par @pseudo, 500 caractères maximum", () => {
    const line = formatTwitchReply("viewer", `ligne 1\nligne 2 ${"x".repeat(600)}`);
    assert.ok(line.startsWith("@viewer ligne 1 ligne 2"));
    assert.ok(line.length <= 500);
  });
});

describe("répliques de secours", () => {
  it("passent toutes le filtre de mots (niveau HIGH) et ne contiennent aucun lien", () => {
    for (const lines of Object.values(FALLBACK_LINES)) {
      for (const line of lines) {
        assert.equal(findAutoModMatch("HIGH", line), null, line);
        assert.ok(!/https?:|\.(com|fr|gg)\b/.test(line));
      }
    }
  });
});
