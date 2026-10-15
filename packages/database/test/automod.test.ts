import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { atLeastLevel, countAutoModWords, findAutoModMatch } from "../src/automod.js";

/** Phrases françaises (et quelques étrangères) courantes qui ne doivent JAMAIS être filtrées, même en HIGH. */
const SAFE_SENTENCES = [
  "Désolée, je suis en retard ce soir, le train a du retard.",
  "On fait un pique-nique demain au parc ?",
  "La salle noire du cinéma était pleine.",
  "C'est une technique unique, pas de panique.",
  "Il y a eu une dispute entre eux, c'est réputé compliqué.",
  "Le concours commence, le conseil se réunit, les contes sont lus.",
  "J'ai acheté une salopette bleue et une assiette.",
  "Bitte schön, danke !",
  "Mon ordinateur rame, ce computer est lent.",
  "Scunthorpe est une ville anglaise, Assassin's Creed est un jeu.",
  "Le Niger et le Nigeria sont des pays d'Afrique, comme le Monténégro en Europe.",
  "Il m'a donné un baiser sur la joue.",
  "La connexion est revenue, je suis connecté.",
  "Je me suis attardé sur ce point de vue.",
  "Une tapette à mouches et un cul-de-sac.",
  "Ma chatte dort sur le canapé.",
  "Va te faire une idée par toi-même.",
  "Le crapaud saute dans la piscine, quel cocktail !",
  "Je négocie un abricot au marché, Monique aussi.",
  "Le Pakistan et la Mongolie sont loin.",
  "Les classes passent, le bassin est grand.",
  "Shiitake et pâtes, c'est délicieux.",
  "Habitation, bitcoin et analyse de données.",
  "Le pain bâtonnet est bon.",
  "Je vais au ski à Courchevel.",
  "C'est vraiment génial ce stream, merci missTsune !",
];

const LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;

describe("filtre de mots — aucun faux positif", () => {
  for (const level of LEVELS) {
    it(`niveau ${level} : phrases courantes acceptées`, () => {
      for (const sentence of SAFE_SENTENCES) {
        assert.equal(findAutoModMatch(level, sentence), null, `faux positif (${level}) : « ${sentence} »`);
      }
    });
  }

  it("« retard » n'est jamais filtré, à aucun niveau", () => {
    for (const level of LEVELS) {
      assert.equal(findAutoModMatch(level, "retard"), null);
      assert.equal(findAutoModMatch(level, "RETARD"), null);
      assert.equal(findAutoModMatch(level, "t'es en retard"), null);
    }
  });

  it("OFF ne filtre rien", () => {
    assert.equal(findAutoModMatch("OFF", "putain de merde"), null);
  });
});

describe("filtre de mots — détections", () => {
  it("LOW détecte les insultes haineuses graves", () => {
    assert.equal(findAutoModMatch("LOW", "espèce de sale juif"), "sale juif");
    assert.equal(findAutoModMatch("LOW", "t'es qu'un pd"), "pd");
    assert.ok(findAutoModMatch("LOW", "N1GG3R"));
  });

  it("LOW ignore les grossièretés courantes", () => {
    assert.equal(findAutoModMatch("LOW", "putain c'est trop bien"), null);
  });

  it("MEDIUM ajoute les grossièretés courantes, HIGH élargit encore", () => {
    assert.equal(findAutoModMatch("MEDIUM", "putain c'est trop bien"), "putain");
    assert.equal(findAutoModMatch("MEDIUM", "t'es con"), null);
    assert.equal(findAutoModMatch("HIGH", "t'es con"), "con");
  });

  it("résiste au leet speak, aux séparateurs, aux lettres étirées et aux accents", () => {
    assert.equal(findAutoModMatch("MEDIUM", "p.u.t.e"), "pute");
    assert.equal(findAutoModMatch("MEDIUM", "puuuuute"), "pute");
    assert.equal(findAutoModMatch("MEDIUM", "s4l0pe"), "salope");
    assert.equal(findAutoModMatch("MEDIUM", "ENCULÉ"), "encule");
    assert.equal(findAutoModMatch("MEDIUM", "f u c k"), "fuck");
    assert.equal(findAutoModMatch("MEDIUM", "sh1t"), "shit");
    assert.equal(findAutoModMatch("MEDIUM", "pu​te"), "pute");
  });

  it("tolère le pluriel", () => {
    assert.equal(findAutoModMatch("MEDIUM", "bande de connards"), "connard");
  });

  it("« nique » est détecté, mais pas dans « pique-nique »", () => {
    assert.equal(findAutoModMatch("MEDIUM", "nique ta mère"), "nique");
    assert.equal(findAutoModMatch("MEDIUM", "pique-nique géant"), null);
  });

  it("couvre les langues étrangères", () => {
    assert.ok(findAutoModMatch("MEDIUM", "das ist scheiße"));
    assert.ok(findAutoModMatch("MEDIUM", "qué mierda"));
    assert.ok(findAutoModMatch("MEDIUM", "che cazzo"));
  });
});

describe("utilitaires de niveau", () => {
  it("atLeastLevel relève au minimum demandé", () => {
    assert.equal(atLeastLevel("OFF", "MEDIUM"), "MEDIUM");
    assert.equal(atLeastLevel("LOW", "MEDIUM"), "MEDIUM");
    assert.equal(atLeastLevel("HIGH", "MEDIUM"), "HIGH");
  });

  it("les niveaux sont cumulatifs", () => {
    assert.ok(countAutoModWords("LOW") < countAutoModWords("MEDIUM"));
    assert.ok(countAutoModWords("MEDIUM") < countAutoModWords("HIGH"));
    assert.equal(countAutoModWords("OFF"), 0);
  });
});
