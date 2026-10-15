import { PermissionFlagsBits, type Message } from "discord.js";
import type { Guild as GuildSettings } from "@ellie/database";
import {
  findAutoModMatch,
  hasExcessiveCaps,
  matchesInvite,
  matchesNonGifLink,
  SpamTracker,
  toAutoModLevel,
} from "@ellie/database/shared";
import { logError } from "./log.js";
import { applyWarnEscalation, logCase } from "./moderation.js";

const spamTracker = new SpamTracker();
const WARNING_DELETE_DELAY_MS = 6_000;

interface Violation {
  /** Raison détaillée (cas de modération et logs). */
  reason: string;
  /** Raison affichée publiquement (sans répéter le mot interdit). */
  publicReason: string;
}

function detectViolation(message: Message<true>, settings: GuildSettings, checkSpam: boolean): Violation | null {
  const content = message.content;
  const isSpam =
    checkSpam && settings.filterSpam && spamTracker.check(`${message.guildId}:${message.author.id}:${message.channelId}`, content);

  const word = findAutoModMatch(toAutoModLevel(settings.autoModLevel), content);
  if (word) return { reason: `Langage interdit (« ${word} »)`, publicReason: "langage inapproprié" };
  if (settings.filterInvites && matchesInvite(content)) {
    return { reason: "Invitation Discord non autorisée", publicReason: "les invitations Discord sont interdites ici" };
  }
  if (settings.filterLinks && matchesNonGifLink(content)) {
    return { reason: "Lien non autorisé", publicReason: "les liens sont interdits ici (les GIF restent autorisés)" };
  }
  if (settings.filterCaps && hasExcessiveCaps(content)) {
    return { reason: "Abus de majuscules", publicReason: "trop de majuscules" };
  }
  if (isSpam) return { reason: "Spam (messages identiques répétés)", publicReason: "spam" };
  return null;
}

/**
 * Automodération d'un message (création ou modification). Les membres avec « Gérer les messages »
 * sont exemptés. @returns `true` si le message a été supprimé.
 */
export async function runAutoMod(
  message: Message<true>,
  settings: GuildSettings,
  options: { checkSpam: boolean } = { checkSpam: true },
): Promise<boolean> {
  const member = message.member;
  if (!member || member.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

  const violation = detectViolation(message, settings, options.checkSpam);
  if (!violation) return false;

  const context = `automodération (serveur ${message.guildId}, salon ${message.channelId})`;
  try {
    await message.delete();
  } catch (error) {
    logError(`${context} : suppression du message impossible`, error);
    return false;
  }

  await logCase(message.guild, {
    userId: message.author.id,
    moderatorId: message.client.user.id,
    type: "AUTOMOD",
    reason: violation.reason,
  }).catch((error: unknown) => logError(`${context} : enregistrement du cas`, error));
  const escalation = await applyWarnEscalation(message.guild, message.author.id);

  const warning = `⚠️ <@${message.author.id}>, ton message a été supprimé : ${violation.publicReason}.${
    escalation ? ` Suite à tes avertissements, tu as été ${escalation}.` : ""
  }`;
  try {
    const sent = await message.channel.send({ content: warning, allowedMentions: { users: [message.author.id] } });
    setTimeout(() => {
      sent.delete().catch(() => undefined); // nettoyage cosmétique : le message a peut-être déjà été supprimé
    }, WARNING_DELETE_DELAY_MS).unref();
  } catch (error) {
    logError(`${context} : envoi de l'avertissement`, error);
  }
  return true;
}
