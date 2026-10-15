import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findNonWhitelistedLinks,
  hasExcessiveCaps,
  hasExcessiveSymbols,
  hasWordRepetition,
  isGifLink,
  matchesInvite,
  matchesNonGifLink,
  removeLinks,
  SpamTracker,
} from "../src/automod-filters.js";

describe("filtre de liens", () => {
  it("bloque les liens et domaines nus", () => {
    assert.ok(matchesNonGifLink("va sur https://arnaque.example.com/promo"));
    assert.ok(matchesNonGifLink("free nitro sur nitro-gratuit.ru"));
    assert.ok(matchesNonGifLink("mon site (dot) com... non : monsite (dot) com"));
    assert.ok(matchesNonGifLink("www.example.fr"));
  });

  it("autorise les GIF Tenor/Giphy/Klipy et les extensions .gif/.mp4/.webm/.webp", () => {
    assert.equal(matchesNonGifLink("https://tenor.com/view/chat-mignon-gif-123456"), false);
    assert.equal(matchesNonGifLink("https://media.tenor.com/abc/tenor.gif"), false);
    assert.equal(matchesNonGifLink("https://media1.giphy.com/media/xyz/giphy.webp?cid=1"), false);
    assert.equal(matchesNonGifLink("https://klipy.com/gifs/hello"), false);
    assert.equal(matchesNonGifLink("regarde ça https://cdn.exemple.org/clip.mp4."), false);
    assert.equal(matchesNonGifLink("(https://n-importe-quoi.net/anim.gif)"), false);
    assert.ok(isGifLink("https://i.imgur.com/truc.webm"));
  });

  it("ne confond pas des phrases normales avec des domaines", () => {
    assert.equal(matchesNonGifLink("C'est un point de vue intéressant, ok ?"), false);
    assert.equal(matchesNonGifLink("J'ai fini. Me voilà ! Version 1.5 dispo"), false);
    assert.equal(matchesNonGifLink("etc. Je pense que oui"), false);
  });

  it("liste blanche Twitch (sous-domaines compris)", () => {
    assert.deepEqual(findNonWhitelistedLinks("https://clips.twitch.tv/abc", ["twitch.tv"]), []);
    assert.equal(findNonWhitelistedLinks("youtube.com/watch?v=1 et spam.ru", ["youtube.com"]).length, 1);
  });

  it("removeLinks retire liens, domaines et invitations", () => {
    assert.equal(removeLinks("Salut https://x.com/a et discord.gg/abc ou site.fr !"), "Salut et ou !");
  });
});

describe("invitations Discord", () => {
  it("détecte les formes courantes et obfusquées", () => {
    assert.ok(matchesInvite("rejoins discord.gg/abcdef"));
    assert.ok(matchesInvite("https://discord.com/invite/abcdef"));
    assert.ok(matchesInvite("discordapp.com/invite/abc123"));
    assert.ok(matchesInvite("discord (dot) gg/abcdef"));
    assert.equal(matchesInvite("on se retrouve sur discord ce soir"), false);
  });
});

describe("majuscules, symboles, répétitions", () => {
  it("majuscules excessives (> 70 % sur ≥ 12 lettres)", () => {
    assert.ok(hasExcessiveCaps("ARRÊTEZ DE CRIER SVP"));
    assert.equal(hasExcessiveCaps("OK MDR"), false);
    assert.equal(hasExcessiveCaps("Bonjour à tous, ça va ?"), false);
  });

  it("symboles excessifs", () => {
    assert.ok(hasExcessiveSymbols("!!!!!!!!!!!!????????##"));
    assert.equal(hasExcessiveSymbols("Salut ! Ça va ? 😊😊😊"), false);
  });

  it("répétitions", () => {
    assert.ok(hasWordRepetition("lol lol lol lol lol lol"));
    assert.ok(hasWordRepetition("aaaaaaaaaaaaaaaaaaaa"));
    assert.equal(hasWordRepetition("le chat et le chien sont dans le jardin"), false);
  });

  it("spam : 3 messages identiques en 8 s", () => {
    const tracker = new SpamTracker();
    assert.equal(tracker.check("u:c", "coucou", 0), false);
    assert.equal(tracker.check("u:c", "coucou", 1000), false);
    assert.equal(tracker.check("u:c", "coucou", 2000), true);
    assert.equal(tracker.check("u:c", "coucou", 20_000), false);
  });
});
