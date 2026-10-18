import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChatBuffer } from "../src/context.js";
import { chatLine, countEmotes, formatLongDuration } from "../src/format.js";
import { HelixError } from "../src/helix.js";
import { explainConnectionError } from "../src/supervisor.js";

const DAY = 86_400_000;

describe("format Twitch", () => {
  it("!followage : deux unités au maximum", () => {
    assert.equal(formatLongDuration((2 * 365 + 14) * DAY), "2 ans, 14 jours");
    assert.equal(formatLongDuration(3 * 3_600_000 + 12 * 60_000), "3 h, 12 min");
    assert.equal(formatLongDuration(DAY + 60_000), "1 jour, 1 min");
    assert.equal(formatLongDuration(10_000), "moins d'une minute");
  });

  it("compte les émotes à partir du tag Twitch", () => {
    assert.equal(countEmotes({ "25": ["0-4", "6-10"], "1902": ["12-16"] }), 3);
    assert.equal(countEmotes(undefined), 0);
  });

  it("une seule ligne de 500 caractères maximum", () => {
    const line = chatLine(`a\nb ${"x".repeat(600)}`);
    assert.ok(line.startsWith("a b"));
    assert.ok(line.length <= 500);
  });
});

describe("tampon du chat", () => {
  it("garde les 8 derniers messages des 10 dernières minutes", () => {
    const buffer = new ChatBuffer();
    const now = Date.now();
    buffer.push({ authorName: "vieux", content: "trop ancien", createdAt: new Date(now - 11 * 60_000) });
    for (let i = 0; i < 12; i++) buffer.push({ authorName: `v${i}`, content: `m${i}`, createdAt: new Date(now - (12 - i) * 1000) });
    const recent = buffer.recent(now);
    assert.equal(recent.length, 8);
    assert.equal(recent.at(-1)?.content, "m11");
    assert.ok(!recent.some((entry) => entry.content === "trop ancien"));
  });
});

describe("erreurs de connexion affichées dans le panel", () => {
  it("traduit les refus de Twitch en marche à suivre", () => {
    assert.match(explainConnectionError("Login authentication failed"), /reconnecte-le avec « Se connecter avec Twitch »/);
    assert.match(explainConnectionError(new HelixError(401, "Invalid OAuth token")), /Jeton Twitch refusé/);
  });

  it("garde le message d'origine sinon", () => {
    assert.equal(explainConnectionError(new Error("compte bot « x » ou chaîne « y » introuvable sur Twitch")), "compte bot « x » ou chaîne « y » introuvable sur Twitch");
  });
});
