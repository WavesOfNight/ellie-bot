import { MESSAGE_MAX_LENGTH } from "./context.js";

export interface DiscordTriggerInput {
  /** Contenu brut du message (avec les mentions sous la forme `<@id>`). */
  content: string;
  authorId: string;
  authorIsBot: boolean;
  isDirectMessage: boolean;
  channelId: string;
  botUserId: string;
  /** Le message est une réponse (reply) à un message écrit par Ellie. */
  isReplyToEllie: boolean;
  /** Déjà traité par l'automodération, une commande personnalisée ou une réponse automatique. */
  handledElsewhere: boolean;
}

export interface DiscordTriggerConfig {
  enabled: boolean;
  apiKeyConfigured: boolean;
  allowedChannelIds: readonly string[];
  blockedUserIds: readonly string[];
  replyToReplies: boolean;
  keywordTrigger: boolean;
}

export type TriggerKind = "mention" | "reply" | "keyword";

export type TriggerDecision =
  | { triggered: true; kind: TriggerKind; text: string }
  | { triggered: false; reason: string };

/** Mention directe du bot (`<@id>` ou `<@!id>`). @everyone, @here et les rôles ne comptent jamais. */
export function mentionsBotDirectly(content: string, botUserId: string): boolean {
  return new RegExp(`<@!?${botUserId}>`).test(content);
}

export function stripBotMention(content: string, botUserId: string): string {
  return content.replace(new RegExp(`<@!?${botUserId}>`, "g"), " ").replace(/\s{2,}/g, " ").trim();
}

/** Le message COMMENCE par « Ellie » suivi de `,` `:` `!` ou d'une espace (casse et accents ignorés). */
export function startsWithEllieKeyword(content: string): boolean {
  const normalized = content.trimStart().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return /^ellie(?:\s*[,:!]|\s)/.test(normalized);
}

export function prepareMessageText(text: string): string {
  return text.trim().slice(0, MESSAGE_MAX_LENGTH);
}

/** Décide si Ellie doit répondre à un message Discord (section 9.1 du cahier des charges). */
export function evaluateDiscordTrigger(input: DiscordTriggerInput, config: DiscordTriggerConfig): TriggerDecision {
  if (input.authorIsBot || input.authorId === input.botUserId) return { triggered: false, reason: "auteur_bot" };
  if (input.isDirectMessage) return { triggered: false, reason: "message_prive" };
  if (input.handledElsewhere) return { triggered: false, reason: "deja_traite" };
  if (!config.enabled) return { triggered: false, reason: "desactive" };
  if (!config.apiKeyConfigured) return { triggered: false, reason: "pas_de_cle" };
  if (!config.allowedChannelIds.includes(input.channelId)) return { triggered: false, reason: "salon_non_autorise" };
  if (config.blockedUserIds.includes(input.authorId)) return { triggered: false, reason: "utilisateur_bloque" };

  if (mentionsBotDirectly(input.content, input.botUserId)) {
    return { triggered: true, kind: "mention", text: prepareMessageText(stripBotMention(input.content, input.botUserId)) };
  }
  if (config.replyToReplies && input.isReplyToEllie) {
    return { triggered: true, kind: "reply", text: prepareMessageText(input.content) };
  }
  if (config.keywordTrigger && startsWithEllieKeyword(input.content)) {
    return { triggered: true, kind: "keyword", text: prepareMessageText(input.content) };
  }
  return { triggered: false, reason: "pas_de_declencheur" };
}

// ---------------------------------------------------------------------------
// Twitch
// ---------------------------------------------------------------------------

/** Bots de chat connus, jamais pris en compte par Ellie. */
export const KNOWN_CHAT_BOTS = [
  "nightbot",
  "streamelements",
  "streamlabs",
  "moobot",
  "fossabot",
  "wizebot",
  "soundalerts",
  "sery_bot",
  "commanderroot",
] as const;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `@nom_du_bot` en mot entier, insensible à la casse. */
export function mentionsTwitchBot(message: string, botLogin: string): boolean {
  if (!botLogin) return false;
  return new RegExp(`(?<![\\w@])@${escapeRegex(botLogin)}(?!\\w)`, "i").test(message);
}

export function stripTwitchMention(message: string, botLogin: string): string {
  return message
    .replace(new RegExp(`(?<![\\w@])@${escapeRegex(botLogin)}(?!\\w)[,:]?`, "gi"), " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function isKnownChatBot(login: string): boolean {
  return (KNOWN_CHAT_BOTS as readonly string[]).includes(login.toLowerCase());
}
