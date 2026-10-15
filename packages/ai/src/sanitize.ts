import { removeLinks } from "@ellie/database/shared";
import type { Platform } from "./context.js";

export const DISCORD_MAX_LENGTH = 1900;
/** Sur Twitch, on garde de la place pour le préfixe « @pseudo ». */
export const TWITCH_MAX_LENGTH = 400;

export interface SanitizeOptions {
  platform: Platform;
  maxLength?: number;
  /** Préfixe des commandes du bot Twitch (défaut « ! »). */
  commandPrefix?: string;
}

const ZERO_WIDTH_SPACE = "​";
const QUOTE_PAIRS: ReadonlyArray<[string, string]> = [
  ['"', '"'],
  ["«", "»"],
  ["“", "”"],
  ["'", "'"],
  ["‘", "’"],
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripWrappingQuotes(text: string): string {
  for (const [open, close] of QUOTE_PAIRS) {
    if (text.length > 1 && text.startsWith(open) && text.endsWith(close)) {
      const inner = text.slice(open.length, -close.length);
      if (!inner.includes(open) && !inner.includes(close)) return inner.trim();
    }
  }
  return text;
}

/** Tronque à une fin de phrase si possible, sinon à une fin de mot (avec « … »). */
export function truncateNicely(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const sentenceEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "), slice.lastIndexOf("… "));
  if (sentenceEnd >= maxLength * 0.5) return slice.slice(0, sentenceEnd + 1).trim();
  const wordEnd = slice.slice(0, maxLength - 1).lastIndexOf(" ");
  return `${(wordEnd > 0 ? slice.slice(0, wordEnd) : slice.slice(0, maxLength - 1)).trimEnd()}…`;
}

/**
 * Nettoie le texte produit par le modèle AVANT tout envoi : préfixe et guillemets parasites,
 * liens (Markdown, URL, domaines nus, invitations), mentions Discord, balises, et sur Twitch :
 * une seule ligne, jamais de `/` ou `.` initial, jamais de commande déclenchée.
 */
export function sanitizeReply(text: string, options: SanitizeOptions): string {
  const maxLength = options.maxLength ?? (options.platform === "twitch" ? TWITCH_MAX_LENGTH : DISCORD_MAX_LENGTH);
  let result = text.trim();

  result = result.replace(/^\s*(?:\*\*|__)?ellie(?:\*\*|__)?\s*[:：]\s*/i, "");
  result = stripWrappingQuotes(result);
  result = result.replace(/<\/?(?:plateforme|contexte_salon|message|lore_serveur)\b[^>]*>/gi, "");
  result = result.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  result = removeLinks(result);

  result = result
    .replace(/<@[!&]?\d+>/g, "")
    .replace(/<#\d+>/g, "")
    .replace(/<\/[\w -]+:\d+>/g, "")
    .replace(/@/g, `@${ZERO_WIDTH_SPACE}`);

  if (options.platform === "twitch") {
    const prefix = options.commandPrefix || "!";
    result = result.replace(/\s*[\r\n]+\s*/g, " ");
    result = result.replace(new RegExp(`(^|\\s)(?:${escapeRegex(prefix)})+(?=\\S)`, "g"), "$1");
    result = result.replace(/^[\s/.]+/, "");
  } else {
    result = result.replace(/\n{3,}/g, "\n\n");
  }

  result = result.replace(/[ \t]{2,}/g, " ").trim();
  result = truncateNicely(result, maxLength);
  if (options.platform === "twitch") result = result.replace(/^[\s/.]+/, "");
  return result.trim();
}
