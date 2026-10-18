import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChatBuffer } from "../src/context.js";
import { chatLine, countEmotes, formatLongDuration, viewerUptimeLine } from "../src/format.js";
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

describe("!myuptime", () => {
  const now = new Date("2026-10-18T21:00:00Z");
  const stream = { id: "live-42", startedAt: new Date("2026-10-18T19:00:00Z") };
  const base = { displayName: "Lou", streamerName: "missTsune", isBroadcaster: false, now };

  it("depuis l'arrivée du viewer sur ce live, avec son temps total", () => {
    const viewer = { sessionStreamId: "live-42", sessionStartedAt: new Date("2026-10-18T19:47:00Z"), watchMinutes: 600 };
    assert.equal(viewerUptimeLine({ ...base, stream, viewer }), "@Lou, tu regardes le live depuis 1 h, 13 min 💜 (10 h au total sur la chaîne)");
  });

  it("arrivée notée lors d'un ancien live ou à l'instant : bienvenue", () => {
    const old = { sessionStreamId: "live-41", sessionStartedAt: new Date("2026-10-17T19:00:00Z"), watchMinutes: 0 };
    assert.equal(viewerUptimeLine({ ...base, stream, viewer: old }), "@Lou, tu viens d'arriver sur le live, bienvenue 💜");
    assert.equal(viewerUptimeLine({ ...base, stream, viewer: null }), "@Lou, tu viens d'arriver sur le live, bienvenue 💜");
  });

  it("hors live et streameuse", () => {
    assert.equal(
      viewerUptimeLine({ ...base, stream: null, viewer: { sessionStreamId: null, sessionStartedAt: null, watchMinutes: 90 } }),
      "@Lou, missTsune n'est pas en live pour le moment… mais tu as déjà passé 1 h, 30 min au total sur la chaîne 💜",
    );
    assert.equal(viewerUptimeLine({ ...base, displayName: "missTsune", isBroadcaster: true, stream, viewer: null }), "@missTsune, c'est toi qui streames 😄 En live depuis 2 h.");
  });
});
