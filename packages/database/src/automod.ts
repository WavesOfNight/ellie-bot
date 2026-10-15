/**
 * Filtre de mots multilingue (FR, EN, DE, ES, IT) à 4 niveaux.
 *
 * - LOW    : insultes haineuses / discriminatoires graves uniquement.
 * - MEDIUM : LOW + grossièretés courantes.
 * - HIGH   : MEDIUM + vocabulaire vulgaire ou insultant plus léger.
 *
 * Les motifs sont compilés une seule fois au chargement du module. Le texte est normalisé
 * (minuscules, accents retirés, homoglyphes cyrilliques, caractères invisibles) et les motifs
 * résistent au leet speak (a→4/@, e→3, i→1/!, o→0, s→5/$…), aux lettres séparées par de la
 * ponctuation (p.u.t.e) et aux lettres étirées (puuuute).
 *
 * Choix délibérés pour éviter les faux positifs sur des mots courants :
 * - frontières de mot strictes (« dispute », « technique », « salopette » ne sont jamais visés) ;
 * - une lettre simple du mot accepte 1 ou ≥ 3 répétitions mais PAS exactement 2 : « salle » ne
 *   correspond pas à « sale », « bitte » (allemand) ne correspond pas à « bite » ;
 * - « retard », « chatte », « cul », « tapette », « attardé » ne figurent dans aucune liste ;
 * - « nique » ignore « pique-nique ».
 */

export const AUTOMOD_LEVELS = ["OFF", "LOW", "MEDIUM", "HIGH"] as const;
export type AutoModLevel = (typeof AUTOMOD_LEVELS)[number];

export const AUTOMOD_LEVEL_DESCRIPTIONS: Record<AutoModLevel, string> = {
  OFF: "Aucun filtrage des mots.",
  LOW: "Bloque uniquement les insultes haineuses et discriminatoires graves (racisme, homophobie, transphobie…).",
  MEDIUM: "Bloque aussi les grossièretés courantes (putain, merde, fuck…). Recommandé pour la plupart des serveurs.",
  HIGH: "Filtrage strict : bloque également le vocabulaire vulgaire plus léger et les insultes du quotidien (con, idiot, débile…).",
};

const LEVEL_RANK: Record<AutoModLevel, number> = { OFF: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };

export function isAutoModLevel(value: unknown): value is AutoModLevel {
  return typeof value === "string" && (AUTOMOD_LEVELS as readonly string[]).includes(value);
}

export function toAutoModLevel(value: unknown, fallback: AutoModLevel = "OFF"): AutoModLevel {
  return isAutoModLevel(value) ? value : fallback;
}

/** Renvoie le plus strict des deux niveaux (ex. sortie de l'IA : au minimum MEDIUM). */
export function atLeastLevel(level: AutoModLevel, minimum: AutoModLevel): AutoModLevel {
  return LEVEL_RANK[level] >= LEVEL_RANK[minimum] ? level : minimum;
}

interface WordEntry {
  word: string;
  /** Mots qui, juste avant, annulent la détection (ex. « pique » pour « nique »). */
  notPrecededBy?: string[];
  /** Correspondance littérale : ni leet speak, ni lettres étirées, ni séparateurs. */
  exact?: boolean;
}
type RawEntry = string | WordEntry;

// ---------------------------------------------------------------------------
// Listes
// ---------------------------------------------------------------------------

const LOW_WORDS: RawEntry[] = [
  // Français
  "negre", "negresse", "bougnoule", "bougnoul", "bicot", "youpin", "youpine", "youtre",
  "bamboula", "chinetoque", "niakoue", "pede", "pd", "tarlouze", "tafiole", "fiotte",
  "gouine", "travelo",
  { word: "sale arabe", exact: true }, { word: "sale juif", exact: true },
  { word: "sale juive", exact: true }, { word: "sale negre", exact: true },
  // Anglais
  "nigger", "nigga", "sandnigger", "faggot", "kike", "spic", "wetback", "gook", "paki",
  "tranny", "shemale", "raghead", "towelhead", "beaner", "dyke",
  // Allemand
  "neger", "negerin", "kanake", "kanacke", "schwuchtel", "judensau", "zigeuner", "kameltreiber",
  // Espagnol
  "maricon", "marica", "sudaca", "negrata", "bollera",
  // Italien
  "frocio", "ricchione", "culattone", "negraccio", "terrone", "zingaro",
];

const MEDIUM_WORDS: RawEntry[] = [
  // Français
  "putain", "pute", "putasse", "merde", "merdique", "merdeux", "connard", "connasse", "conne",
  "salope", "salaud", "salopard", "encule", "enculee", "enculer", "enfoire", "enfoiree",
  "batard", "batarde", { word: "nique", notPrecededBy: ["pique"] }, "niquer", "ntm", "fdp",
  "ftg", "pouffiasse", "petasse", "branleur", "branleuse", "trouduc",
  { word: "trou du cul", exact: true }, "emmerde", "emmerder", "foutre", "chiasse",
  "gogol", "triso", "mongolien", { word: "ta gueule", exact: true },
  // Anglais
  "fuck", "fucking", "fuckin", "fucker", "fucked", "motherfucker", "fck", "fuk", "shit",
  "shitty", "bullshit", "bitch", "bitches", "cunt", "asshole", "arsehole", "bastard", "whore",
  "slut", "wanker", "twat", "stfu", "dickhead", "jackass",
  // Allemand
  "scheisse", "scheiss", "arschloch", "fotze", "wichser", "hurensohn", "ficken", "fick",
  "missgeburt", "hure", "spast",
  // Espagnol
  "puta", "puto", "mierda", "joder", "gilipollas", "cabron", "pendejo", "culero", "follar",
  "chingar", "chinga", "malparido",
  // Italien
  "cazzo", "merda", "stronzo", "stronza", "vaffanculo", "puttana", "coglione", "minchia", "bastardo",
];

const HIGH_WORDS: RawEntry[] = [
  // Français
  "con", "bordel", "chier", "couille", "bite", "teub", "abruti", "debile", "cretin",
  "imbecile", "idiot", "mongol", "boloss", "bolosse", "baltringue", "tg", "ptn",
  // Anglais
  "damn", "crap", "dick", "cock", "pussy", "prick", "bollocks", "wtf", "stupid", "moron",
  "dumbass", "fag", "piss",
  // Allemand
  "arsch", "depp",
  // Espagnol
  "cono", "verga", "pinche", "idiota", "estupido", "imbecil",
  // Italien
  "troia", "figa", "cretino", "scemo",
];

// ---------------------------------------------------------------------------
// Normalisation et compilation
// ---------------------------------------------------------------------------

const HOMOGLYPHS: Record<string, string> = {
  а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", у: "y", і: "i", ѕ: "s", к: "k", м: "m", т: "t", в: "b", н: "h",
};

/** Normalisation partagée par le filtre de mots : minuscules, sans accents ni caractères invisibles. */
export function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .replace(/[​-‏⁠﻿­]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[аеорсхуіѕкмтвн]/g, (char) => HOMOGLYPHS[char] ?? char);
}

const LEET: Record<string, string> = {
  a: "4@",
  b: "8",
  e: "3€",
  g: "9",
  i: "1!|",
  l: "1|",
  o: "0",
  s: "5$",
  t: "7",
};

const SEPARATOR = String.raw`[\s._\-*'"~^+=/\\:;,]{0,2}`;
const MIN_LENGTH_FOR_SEPARATORS = 4;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeClass(value: string): string {
  return value.replace(/[\]\\^-]/g, "\\$&");
}

function letterPattern(letter: string, count: number): string {
  const leet = LEET[letter];
  const unit = leet ? `[${escapeClass(letter + leet)}]` : escapeRegex(letter);
  return count >= 2 ? `${unit}{${count},}` : `(?:${unit}|${unit}{3,})`;
}

function compileEntry(raw: RawEntry): { word: string; regex: RegExp } {
  const entry: WordEntry = typeof raw === "string" ? { word: raw } : raw;
  const word = normalizeForMatching(entry.word);

  let body: string;
  if (entry.exact) {
    body = word.split(" ").map(escapeRegex).join("[^a-z0-9]+");
  } else {
    const letters = word.replace(/\s+/g, "");
    const allowSeparators = letters.length >= MIN_LENGTH_FOR_SEPARATORS;
    const parts: string[] = [];
    for (let i = 0; i < word.length; ) {
      const char = word[i] as string;
      if (char === " ") {
        parts.push("[^a-z0-9]+");
        i++;
        continue;
      }
      let count = 1;
      while (word[i + count] === char) count++;
      parts.push(letterPattern(char, count));
      i += count;
      const next = word[i];
      if (allowSeparators && next !== undefined && next !== " ") parts.push(SEPARATOR);
    }
    body = parts.join("");
  }

  const exclusions = (entry.notPrecededBy ?? [])
    .map((prefix) => `(?<!${escapeRegex(normalizeForMatching(prefix))}[^a-z0-9]{0,2})`)
    .join("");

  return {
    word: entry.word,
    regex: new RegExp(`${exclusions}(?<![a-z0-9])${body}s?(?![a-z0-9])`, "u"),
  };
}

type CompiledList = ReadonlyArray<{ word: string; regex: RegExp }>;

const COMPILED: Record<Exclude<AutoModLevel, "OFF">, CompiledList> = {
  LOW: LOW_WORDS.map(compileEntry),
  MEDIUM: MEDIUM_WORDS.map(compileEntry),
  HIGH: HIGH_WORDS.map(compileEntry),
};

/**
 * Cherche un mot interdit pour le niveau donné (les niveaux sont cumulatifs).
 * @returns le mot déclencheur (forme canonique de la liste), ou `null`.
 */
export function findAutoModMatch(level: AutoModLevel, text: string): string | null {
  if (level === "OFF" || !text) return null;
  const normalized = normalizeForMatching(text);
  const lists: CompiledList[] = [COMPILED.LOW];
  if (LEVEL_RANK[level] >= LEVEL_RANK.MEDIUM) lists.push(COMPILED.MEDIUM);
  if (LEVEL_RANK[level] >= LEVEL_RANK.HIGH) lists.push(COMPILED.HIGH);
  for (const list of lists) {
    for (const { word, regex } of list) {
      if (regex.test(normalized)) return word;
    }
  }
  return null;
}

/** Nombre de mots surveillés par niveau (affichage dans le panel). */
export function countAutoModWords(level: AutoModLevel): number {
  if (level === "OFF") return 0;
  let total = COMPILED.LOW.length;
  if (LEVEL_RANK[level] >= LEVEL_RANK.MEDIUM) total += COMPILED.MEDIUM.length;
  if (LEVEL_RANK[level] >= LEVEL_RANK.HIGH) total += COMPILED.HIGH.length;
  return total;
}
