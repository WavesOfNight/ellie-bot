import { incrementTwitchDailyStat, parseDomainList, prisma } from "@ellie/database";
import {
  findAutoModMatch,
  findNonWhitelistedLinks,
  hasExcessiveCaps,
  hasExcessiveSymbols,
  hasWordRepetition,
  toAutoModLevel,
} from "@ellie/database/shared";
import { isModeratorOrBroadcaster, type ChatMessage, type TwitchContext } from "./context.js";
import { postTwitchLogToDiscord } from "./discord-link.js";
import { countEmotes } from "./format.js";
import { logError } from "./log.js";

/**
 * Helix refuse (400 « fails moderation standards ») une raison contenant des grossièretés :
 * on n'envoie à Twitch qu'une raison générique, la raison détaillée reste en base et dans les logs Discord.
 */
const HELIX_REASON = "Violation des règles du chat (modération automatique)";
const TIMEOUT_SECONDS = 600;

interface Violation {
  reason: string;
  publicReason: string;
  /** `false` : le message est supprimé sans sanction (filtre « partiel »). */
  punish: boolean;
}

function detect(context: TwitchContext, message: ChatMessage): Violation | null {
  const { config } = context;
  const tags = message.tags as Record<string, unknown>;
  const sourceRoom = tags["source-room-id"];
  if (config.filterSharedChatEnabled && typeof sourceRoom === "string" && sourceRoom !== tags["room-id"]) {
    return { reason: "Message provenant du chat partagé", publicReason: "messages du chat partagé filtrés", punish: false };
  }
  const word = findAutoModMatch(toAutoModLevel(config.autoModLevel), message.text);
  if (word) return { reason: `Langage interdit (« ${word} »)`, publicReason: "langage inapproprié", punish: true };
  if (config.filterLinksEnabled && findNonWhitelistedLinks(message.text, parseDomainList(config.linkWhitelist)).length) {
    return { reason: "Lien non autorisé", publicReason: "les liens ne sont pas autorisés", punish: true };
  }
  if (config.filterRepetitionEnabled && hasWordRepetition(message.text)) {
    return { reason: "Répétitions abusives (spam)", publicReason: "pas de spam", punish: true };
  }
  if (config.filterCapsEnabled && hasExcessiveCaps(message.text)) {
    return { reason: "Abus de majuscules", publicReason: "trop de majuscules", punish: false };
  }
  if (config.filterEmotesEnabled && countEmotes(message.tags.emotes) > config.maxEmotes) {
    return { reason: `Plus de ${config.maxEmotes} émotes`, publicReason: "trop d'émotes", punish: false };
  }
  if (config.filterSymbolsEnabled && hasExcessiveSymbols(message.text)) {
    return { reason: "Abus de symboles", publicReason: "trop de symboles", punish: false };
  }
  return null;
}

async function escalate(context: TwitchContext, message: ChatMessage, violation: Violation): Promise<void> {
  const login = message.login;
  const userId = message.tags["user-id"];
  const previous = await prisma.twitchModerationCase.count({ where: { username: login } });

  let type: "AVERTISSEMENT" | "TIMEOUT" | "BAN";
  let chat: string;
  if (previous < 2) {
    type = "AVERTISSEMENT";
    chat = `⚠️ @${message.displayName}, ${violation.publicReason}. Avertissement ${previous + 1}/3 avant timeout.`;
    if (userId) {
      await context.helix
        .warnUser(context.broadcasterId, context.botUserId, userId, HELIX_REASON)
        .catch((error: unknown) => logError(`avertissement Helix de ${login}`, error));
    }
  } else if (previous === 2) {
    type = "TIMEOUT";
    chat = `⏱️ @${message.displayName} est exclu 10 minutes (${violation.publicReason}).`;
    if (userId) await context.helix.banUser(context.broadcasterId, context.botUserId, userId, HELIX_REASON, TIMEOUT_SECONDS);
    await incrementTwitchDailyStat("timeouts");
  } else {
    type = "BAN";
    chat = `🔨 @${message.displayName} est banni de la chaîne (${violation.publicReason}).`;
    if (userId) await context.helix.banUser(context.broadcasterId, context.botUserId, userId, HELIX_REASON);
  }

  await prisma.twitchModerationCase.create({ data: { username: login, type, reason: violation.reason } });
  await context.say(chat);
  await postTwitchLogToDiscord(context.config.linkedGuildId, {
    title: `Twitch – ${type === "AVERTISSEMENT" ? "Avertissement" : type === "TIMEOUT" ? "Timeout 10 min" : "Bannissement"}`,
    username: login,
    reason: violation.reason,
  });
}

/**
 * Automodération Twitch (hors modérateurs et streameuse).
 * @returns `true` si le message a été supprimé (il ne doit alors plus être traité).
 */
export async function moderateMessage(context: TwitchContext, message: ChatMessage): Promise<boolean> {
  if (isModeratorOrBroadcaster(context, message.tags)) return false;
  const violation = detect(context, message);
  if (!violation) return false;

  try {
    if (message.tags.id) await context.helix.deleteMessage(context.broadcasterId, context.botUserId, message.tags.id);
    if (violation.punish) await escalate(context, message, violation);
  } catch (error) {
    logError(`automodération Twitch (${message.login})`, error);
  }
  return true;
}
