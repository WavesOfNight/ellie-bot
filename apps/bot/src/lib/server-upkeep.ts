import type { Client, Guild } from "discord.js";
import { prisma } from "@ellie/database";
import { getGuildSettings, invalidateGuildSettings } from "./cache.js";
import { DISCORD_ERRORS, discordErrorCode, logError, logWarn } from "./log.js";
import { logCase } from "./moderation.js";

/** Renomme le salon « statistiques » en `📊 Membres : N` (boucle de 10 min). */
export async function updateStatsChannels(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    const settings = await getGuildSettings(guild.id);
    if (!settings.statsChannelId) continue;
    const channel = guild.channels.cache.get(settings.statsChannelId);
    if (!channel) {
      logWarn(`salon de statistiques ${settings.statsChannelId} introuvable (serveur ${guild.id})`);
      continue;
    }
    const name = `📊 Membres : ${guild.memberCount.toLocaleString("fr-FR")}`;
    if (channel.name !== name) {
      await channel.setName(name, "Statistiques de membres").catch((error: unknown) => logError(`salon de statistiques (serveur ${guild.id})`, error));
    }
  }
}

/**
 * Crée (ou réutilise) une invitation permanente dans le salon source configuré.
 * @returns le code, ou `null` si aucun salon source n'est configuré.
 */
export async function ensurePermanentInvite(guild: Guild, options: { force?: boolean } = {}): Promise<string | null> {
  const settings = await getGuildSettings(guild.id);
  if (!settings.permanentInviteChannelId) return null;

  if (settings.permanentInviteCode && !options.force) {
    try {
      const invite = await guild.invites.fetch({ code: settings.permanentInviteCode, cache: false });
      if (invite.maxAge === 0) return invite.code;
    } catch (error) {
      if (discordErrorCode(error) !== DISCORD_ERRORS.UNKNOWN_INVITE) throw error;
    }
  }

  const channel = guild.channels.cache.get(settings.permanentInviteChannelId);
  if (!channel || !("createInvite" in channel)) {
    logWarn(`salon source d'invitation ${settings.permanentInviteChannelId} introuvable (serveur ${guild.id})`);
    return null;
  }
  const invite = await channel.createInvite({ maxAge: 0, maxUses: 0, unique: true, reason: "Invitation permanente" });
  await prisma.guild.update({ where: { id: guild.id }, data: { permanentInviteCode: invite.code } });
  invalidateGuildSettings(guild.id);
  return invite.code;
}

export async function syncPermanentInvites(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    await ensurePermanentInvite(guild).catch((error: unknown) => logError(`invitation permanente (serveur ${guild.id})`, error));
  }
}

/** Envoie les rappels échus (marqués envoyés seulement après succès, ou si la cible a disparu). */
export async function processReminders(client: Client): Promise<void> {
  const due = await prisma.reminder.findMany({ where: { sent: false, remindAt: { lte: new Date() } }, take: 50 });
  for (const reminder of due) {
    const content = `⏰ <@${reminder.userId}>, rappel : ${reminder.message}`.slice(0, 2000);
    const context = `rappel #${reminder.id} (serveur ${reminder.guildId}, salon ${reminder.channelId})`;
    try {
      const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
      if (channel?.isTextBased() && !channel.isDMBased()) {
        await channel.send({ content, allowedMentions: { users: [reminder.userId] } });
      } else {
        const user = await client.users.fetch(reminder.userId);
        await user.send({ content, allowedMentions: { parse: [] } });
      }
      await prisma.reminder.update({ where: { id: reminder.id }, data: { sent: true } });
    } catch (error) {
      const code = discordErrorCode(error);
      if (code === DISCORD_ERRORS.UNKNOWN_USER || code === DISCORD_ERRORS.CANNOT_DM) {
        logWarn(`${context} : destinataire injoignable, rappel abandonné`);
        await prisma.reminder.update({ where: { id: reminder.id }, data: { sent: true } });
      } else {
        logError(context, error);
      }
    }
  }
}

/** Lève les bannissements temporaires expirés. */
export async function processTempBans(client: Client): Promise<void> {
  const expired = await prisma.moderationCase.findMany({
    where: { type: "BAN", resolved: false, expiresAt: { lte: new Date() }, guildId: { in: [...client.guilds.cache.keys()] } },
  });
  for (const banCase of expired) {
    const guild = client.guilds.cache.get(banCase.guildId);
    if (!guild) continue;
    try {
      await guild.bans.remove(banCase.userId, "Ban temporaire expiré");
    } catch (error) {
      if (discordErrorCode(error) !== DISCORD_ERRORS.UNKNOWN_BAN) {
        logError(`levée du ban temporaire #${banCase.id} (serveur ${guild.id})`, error);
        continue;
      }
    }
    await prisma.moderationCase.update({ where: { id: banCase.id }, data: { resolved: true } });
    await logCase(guild, { userId: banCase.userId, moderatorId: client.user?.id ?? "0", type: "UNBAN", reason: "Ban temporaire expiré" });
  }
}
