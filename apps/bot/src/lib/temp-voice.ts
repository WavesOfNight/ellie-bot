import {
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  type Client,
  type DMChannel,
  type GuildBasedChannel,
  type GuildMember,
  type NonThreadGuildBasedChannel,
  type VoiceChannel,
  type VoiceState,
} from "discord.js";
import { prisma } from "@ellie/database";
import { atLeastLevel, findAutoModMatch, toAutoModLevel } from "@ellie/database/shared";
import { getGuildSettings } from "./cache.js";
import { DISCORD_ERRORS, discordErrorCode, logError, logWarn } from "./log.js";
import { applyWarnEscalation, logCase, notifyUser } from "./moderation.js";

const GENERIC_NAME = "🔊 Salon vocal";

/** Nom du salon à partir du modèle ; repli silencieux sur un nom générique si un mot est filtré. */
export async function buildHubChannelName(member: GuildMember, template: string): Promise<string> {
  const settings = await getGuildSettings(member.guild.id);
  const name = template.replaceAll("{user}", member.displayName).slice(0, 100).trim() || GENERIC_NAME;
  const level = atLeastLevel(toAutoModLevel(settings.autoModLevel), "LOW");
  return findAutoModMatch(level, name) ? GENERIC_NAME : name;
}

/** Supprime un salon vocal suivi (idempotent : appelable plusieurs fois sans erreur). */
async function deleteTrackedChannel(channel: GuildBasedChannel | null, channelId: string, reason: string): Promise<void> {
  if (channel) {
    try {
      await channel.delete(reason);
    } catch (error) {
      if (discordErrorCode(error) !== DISCORD_ERRORS.UNKNOWN_CHANNEL) {
        logError(`suppression du salon vocal ${channelId}`, error);
        return;
      }
    }
  }
  await prisma.tempVoiceChannel.deleteMany({ where: { channelId } });
}

/** Rejoindre le hub crée un salon personnel (même catégorie) dont le membre est propriétaire. */
async function createFromHub(member: GuildMember, hub: VoiceChannel): Promise<void> {
  const settings = await getGuildSettings(member.guild.id);
  const name = await buildHubChannelName(member, settings.hubChannelNameTemplate);
  const channel = await member.guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: hub.parentId,
    permissionOverwrites: [
      ...hub.permissionOverwrites.cache.map((overwrite) => ({
        id: overwrite.id,
        type: overwrite.type,
        allow: overwrite.allow.toArray(),
        deny: overwrite.deny.toArray(),
      })),
      {
        id: member.id,
        type: OverwriteType.Member,
        allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
      },
    ],
    reason: `Salon vocal personnel de ${member.user.tag}`,
  });
  await prisma.tempVoiceChannel.create({ data: { guildId: member.guild.id, channelId: channel.id, ownerId: member.id } });
  try {
    await member.voice.setChannel(channel, "Salon vocal personnel");
  } catch (error) {
    logError(`déplacement vers le salon vocal personnel (serveur ${member.guild.id})`, error);
    await deleteTrackedChannel(channel, channel.id, "Membre parti avant le déplacement");
  }
}

/** voiceStateUpdate : création depuis le hub et suppression immédiate des salons suivis devenus vides. */
export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const settings = await getGuildSettings(newState.guild.id);
  const member = newState.member;

  if (member && !member.user.bot && settings.hubVoiceChannelId && newState.channelId === settings.hubVoiceChannelId) {
    const hub = newState.channel;
    if (hub?.type === ChannelType.GuildVoice) {
      await createFromHub(member, hub).catch((error: unknown) =>
        logError(`création d'un salon vocal personnel (serveur ${newState.guild.id}, membre ${member.id})`, error),
      );
    }
  }

  const left = oldState.channel;
  if (left && left.id !== newState.channelId && left.id !== settings.hubVoiceChannelId && left.members.size === 0) {
    const tracked = await prisma.tempVoiceChannel.findUnique({ where: { channelId: left.id } });
    if (tracked) await deleteTrackedChannel(left, left.id, "Salon vocal personnel vide");
  }
}

/** Filet de sécurité (15 s) : supprime les salons suivis vides ou disparus (utile après un redémarrage). */
export async function cleanupTempVoiceChannels(client: Client): Promise<void> {
  const tracked = await prisma.tempVoiceChannel.findMany({ where: { guildId: { in: [...client.guilds.cache.keys()] } } });
  for (const record of tracked) {
    const guild = client.guilds.cache.get(record.guildId);
    const channel = guild?.channels.cache.get(record.channelId) ?? null;
    if (!channel) {
      await prisma.tempVoiceChannel.deleteMany({ where: { id: record.id } });
      continue;
    }
    if (channel.isVoiceBased() && channel.members.size === 0) {
      await deleteTrackedChannel(channel, record.channelId, "Salon vocal personnel vide");
    }
  }
}

/** channelUpdate : un salon suivi renommé avec un mot filtré (niveau minimum LOW) est sanctionné et supprimé. */
export async function handleTrackedChannelRename(
  oldChannel: DMChannel | NonThreadGuildBasedChannel,
  newChannel: DMChannel | NonThreadGuildBasedChannel,
): Promise<void> {
  if (newChannel.isDMBased() || oldChannel.isDMBased() || oldChannel.name === newChannel.name) return;
  const tracked = await prisma.tempVoiceChannel.findUnique({ where: { channelId: newChannel.id } });
  if (!tracked) return;
  const settings = await getGuildSettings(newChannel.guild.id);
  const word = findAutoModMatch(atLeastLevel(toAutoModLevel(settings.autoModLevel), "LOW"), newChannel.name);
  if (!word) return;

  const guild = newChannel.guild;
  const reason = `Nom de salon vocal interdit (« ${word} »)`;
  await logCase(guild, { userId: tracked.ownerId, moderatorId: guild.client.user.id, type: "AUTOMOD", reason });
  await applyWarnEscalation(guild, tracked.ownerId);
  const owner = await guild.client.users.fetch(tracked.ownerId).catch(() => null);
  if (owner) {
    const notified = await notifyUser(owner, `⚠️ Ton salon vocal sur **${guild.name}** a été supprimé : son nom contenait un mot interdit.`);
    if (!notified) logWarn(`MP impossible au propriétaire ${tracked.ownerId} (serveur ${guild.id})`);
  }
  await deleteTrackedChannel(newChannel, newChannel.id, reason);
}

/** Crée le salon de /creer-vocal (public par défaut) et y déplace le membre. */
export async function createPersonalVoiceChannel(
  member: GuildMember,
  options: { name: string; userLimit: number },
): Promise<VoiceChannel> {
  const current = member.voice.channel;
  const channel = await member.guild.channels.create({
    name: options.name,
    type: ChannelType.GuildVoice,
    parent: current?.parentId ?? null,
    userLimit: options.userLimit,
    permissionOverwrites: [
      {
        id: member.id,
        type: OverwriteType.Member,
        allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect, PermissionFlagsBits.ViewChannel],
      },
    ],
    reason: `Salon vocal personnel de ${member.user.tag} (/creer-vocal)`,
  });
  await prisma.tempVoiceChannel.create({ data: { guildId: member.guild.id, channelId: channel.id, ownerId: member.id } });
  await member.voice.setChannel(channel, "Salon vocal personnel").catch((error: unknown) => {
    logError(`déplacement vers le salon /creer-vocal (serveur ${member.guild.id})`, error);
  });
  return channel;
}

/** Statut du salon vocal (description), via l'API REST brute — best-effort. */
export async function setVoiceChannelStatus(channel: VoiceChannel, status: string): Promise<void> {
  try {
    await channel.client.rest.put(`/channels/${channel.id}/voice-status`, { body: { status } });
  } catch (error) {
    logWarn(`statut du salon vocal ${channel.id} non défini (${error instanceof Error ? error.message : "erreur"})`);
  }
}
