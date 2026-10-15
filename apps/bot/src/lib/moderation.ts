import type { ChatInputCommandInteraction, EmbedBuilder, Guild, GuildMember, User } from "discord.js";
import { countWarnings, prisma, type ModerationCase } from "@ellie/database";
import { getGuildSettings } from "./cache.js";
import { brandEmbed, COLORS, discordTimestamp, truncate } from "./embeds.js";
import { logError, logWarn } from "./log.js";

export type CaseType = "WARN" | "MUTE" | "UNMUTE" | "KICK" | "BAN" | "UNBAN" | "AUTOMOD";

export const CASE_LABELS: Record<CaseType, string> = {
  WARN: "Avertissement",
  MUTE: "Mute",
  UNMUTE: "Fin du mute",
  KICK: "Expulsion",
  BAN: "Bannissement",
  UNBAN: "Débannissement",
  AUTOMOD: "Automodération",
};

const CASE_COLORS: Record<CaseType, number> = {
  WARN: 0xf0b232,
  MUTE: COLORS.lavender,
  UNMUTE: COLORS.aqua,
  KICK: COLORS.coral,
  BAN: 0xc0392b,
  UNBAN: COLORS.aqua,
  AUTOMOD: COLORS.blush,
};

export const MAX_TIMEOUT_MINUTES = 40_320;
const ESCALATION_MUTE_MS = 24 * 3_600_000;

/** Envoie un embed dans le salon de logs du serveur, s'il est configuré. */
export async function sendLogEmbed(guild: Guild, embed: EmbedBuilder): Promise<void> {
  const settings = await getGuildSettings(guild.id);
  const channelId = settings.modLogChannelId;
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased()) {
    logWarn(`salon de logs introuvable ou non textuel (serveur ${guild.id}, salon ${channelId})`);
    return;
  }
  try {
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
  } catch (error) {
    logError(`envoi d'un log (serveur ${guild.id}, salon ${channelId})`, error);
  }
}

export interface CaseInput {
  userId: string;
  moderatorId: string;
  type: CaseType;
  reason?: string | null;
  expiresAt?: Date | null;
}

/** Enregistre un cas de modération et le publie dans le salon de logs. */
export async function logCase(guild: Guild, input: CaseInput): Promise<ModerationCase> {
  const record = await prisma.moderationCase.create({
    data: {
      guildId: guild.id,
      userId: input.userId,
      moderatorId: input.moderatorId,
      type: input.type,
      reason: input.reason ? truncate(input.reason, 500) : null,
      expiresAt: input.expiresAt ?? null,
    },
  });
  const embed = brandEmbed(CASE_COLORS[input.type])
    .setTitle(`Cas #${record.id} – ${CASE_LABELS[input.type]}`)
    .addFields(
      { name: "Membre", value: `<@${input.userId}> (${input.userId})`, inline: true },
      { name: "Modérateur", value: `<@${input.moderatorId}>`, inline: true },
      { name: "Raison", value: input.reason ? truncate(input.reason, 1000) : "Aucune raison précisée" },
    );
  if (input.expiresAt) embed.addFields({ name: "Expire", value: discordTimestamp(input.expiresAt, "R"), inline: true });
  await sendLogEmbed(guild, embed);
  return record;
}

/**
 * Escalade automatique des avertissements (cas WARN + AUTOMOD) : applique le palier le plus élevé
 * atteint et possible (ban > kick > mute 24 h). @returns la sanction appliquée, ou `null`.
 */
export async function applyWarnEscalation(guild: Guild, userId: string): Promise<string | null> {
  try {
    const settings = await getGuildSettings(guild.id);
    const { warnBanThreshold: banAt, warnKickThreshold: kickAt, warnMuteThreshold: muteAt } = settings;
    if (!banAt && !kickAt && !muteAt) return null;

    const count = await countWarnings(guild.id, userId);
    const member = await guild.members.fetch(userId).catch(() => null);
    const botId = guild.client.user.id;
    const reason = `Escalade automatique : ${count} avertissement${count > 1 ? "s" : ""}`;

    if (banAt && count >= banAt && (!member || member.bannable)) {
      await guild.members.ban(userId, { reason });
      await logCase(guild, { userId, moderatorId: botId, type: "BAN", reason });
      return "banni";
    }
    if (kickAt && count >= kickAt && member?.kickable) {
      await member.kick(reason);
      await logCase(guild, { userId, moderatorId: botId, type: "KICK", reason });
      return "expulsé";
    }
    if (muteAt && count >= muteAt && member?.moderatable) {
      await member.timeout(ESCALATION_MUTE_MS, reason);
      await logCase(guild, {
        userId,
        moderatorId: botId,
        type: "MUTE",
        reason,
        expiresAt: new Date(Date.now() + ESCALATION_MUTE_MS),
      });
      return "rendu muet pendant 24 h";
    }
    return null;
  } catch (error) {
    logError(`escalade automatique (serveur ${guild.id}, membre ${userId})`, error);
    return null;
  }
}

export type ModerationCapability = "moderatable" | "kickable" | "bannable" | "manageable";

/**
 * Vérifie qu'une sanction est possible : pas soi-même, pas le bot, pas le propriétaire,
 * hiérarchie des rôles respectée pour l'auteur et pour le bot.
 * @returns un message d'erreur en français, ou `null` si tout est bon.
 */
export function checkModerationTarget(
  interaction: ChatInputCommandInteraction<"cached">,
  target: GuildMember,
  capability: ModerationCapability,
): string | null {
  if (target.id === interaction.user.id) return "Tu ne peux pas utiliser cette commande sur toi-même.";
  if (target.id === interaction.client.user.id) return "Je ne vais pas me sanctionner moi-même 😅";
  if (target.id === interaction.guild.ownerId) return "Impossible de sanctionner le propriétaire du serveur.";
  const invoker = interaction.member;
  if (interaction.guild.ownerId !== invoker.id && target.roles.highest.position >= invoker.roles.highest.position) {
    return "Ce membre a un rôle supérieur ou égal au tien.";
  }
  if (!target[capability]) {
    return "Je n'ai pas les permissions nécessaires : mon rôle doit être placé au-dessus de celui de ce membre.";
  }
  return null;
}

/** MP d'information au membre sanctionné. Les MP peuvent être fermés : renvoie `false` dans ce cas. */
export async function notifyUser(user: User, message: string): Promise<boolean> {
  try {
    await user.send({ content: message, allowedMentions: { parse: [] } });
    return true;
  } catch {
    return false;
  }
}
