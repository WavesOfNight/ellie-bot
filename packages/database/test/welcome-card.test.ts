import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_WELCOME_TEXT_COLOR, isHexColor, relativeLuminance, stripEmoji, WELCOME_TEXT_COLOR_PRESETS, welcomeCardPanel } from "../src/welcome-card.js";

describe("carte de bienvenue", () => {
  it("retire les émojis que les polices du serveur ne savent pas dessiner", () => {
    assert.equal(stripEmoji("🐱 Le Cat Café de missTsune"), "Le Cat Café de missTsune");
    assert.equal(stripEmoji("Bienvenue Pseudo ! 🐾✨ 🏳️‍🌈 🇫🇷 1️⃣"), "Bienvenue Pseudo ! 1");
    assert.equal(stripEmoji("Café n°128 — ok"), "Café n°128 — ok");
  });

  it("valide le format #RRVVBB", () => {
    assert.ok(isHexColor("#FF7EB6") && isHexColor("#ff7eb6"));
    for (const value of ["FF7EB6", "#FFF", "#GG0000", "rouge", ""]) assert.equal(isHexColor(value), false, value);
  });

  it("luminance : noir 0, blanc 1", () => {
    assert.equal(relativeLuminance("#000000"), 0);
    assert.equal(relativeLuminance("#FFFFFF"), 1);
  });

  it("cadre clair pour un texte foncé, sombre pour un texte clair", () => {
    assert.equal(welcomeCardPanel(DEFAULT_WELCOME_TEXT_COLOR).dark, false);
    assert.equal(welcomeCardPanel("#4A2C20").dark, false);
    for (const light of ["#FFFFFF", "#FFE66D", "#FFB7D5"]) assert.equal(welcomeCardPanel(light).dark, true, light);
    assert.equal(welcomeCardPanel("pas une couleur").dark, false, "couleur invalide : rendu par défaut");
  });

  it("les suggestions du panel sont des couleurs valides et distinctes", () => {
    const values = WELCOME_TEXT_COLOR_PRESETS.map((preset) => preset.value);
    assert.ok(values.every(isHexColor));
    assert.equal(new Set(values).size, values.length);
    assert.ok(values.includes(DEFAULT_WELCOME_TEXT_COLOR));
  });
});
