import { ChannelType, MessageFlags, PermissionFlagsBits } from "discord.js";
import { prisma } from "@ellie/database";
import { formatDuration, parseDuration } from "../lib/durations.js";
import { brandEmbed, COLORS, discordTimestamp, truncate } from "../lib/embeds.js";
import { DISCORD_ERRORS, discordErrorCode } from "../lib/log.js";
import {
  applyWarnEscalation,
  CASE_LABELS,
  checkModerationTarget,
  logCase,
  MAX_TIMEOUT_MINUTES,
  notifyUser,
  sendLogEmbed,
  type CaseType,
} from "../lib/moderation.js";
import { replyEphemeral } from "../lib/replies.js";
import type { SlashCommand } from "../types.js";
import { slash } from "./builder.js";

const MAX_TEMP_BAN_MS = 365 * 86_400_000;
const reasonOf = (value: string | null) => value?.trim() || null;

export const warn: SlashCommand = {
  data: slash("warn", "Avertit un membre.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("membre").setDescription("Le membre à avertir").setRequired(true))
    .addStringOption((option) => option.setName("raison").setDescription("La raison").setRequired(true).setMaxLength(500)),
  async execute(interaction) {
    const target = interaction.options.getMember("membre");
    if (!target) {
      await replyEphemeral(interaction, "Ce membre n'est pas sur le serveur.");
      return;
    }
    const error = checkModerationTarget(interaction, target, "manageable");
    if (error) {
      await replyEphemeral(interaction, error);
      return;
    }
    const reason = interaction.options.getString("raison", true);
    const record = await logCase(interaction.guild, { userId: target.id, moderatorId: interaction.user.id, type: "WARN", reason });
    const notified = await notifyUser(target.user, `⚠️ Tu as reçu un avertissement sur **${interaction.guild.name}** : ${reason}`);
    const escalation = await applyWarnEscalation(interaction.guild, target.id);
    await interaction.reply({
      content: `⚠️ <@${target.id}> a reçu un avertissement (cas #${record.id}).${notified ? "" : " *(MP impossible : ses messages privés sont fermés.)*"}${
        escalation ? `\n🔨 Escalade automatique : le membre a été ${escalation}.` : ""
      }`,
      allowedMentions: { parse: [] },
    });
  },
};

export const warnings: SlashCommand = {
  data: slash("warnings", "Liste les sanctions d'un membre.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("membre").setDescription("Le membre").setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser("membre", true);
    const cases = await prisma.moderationCase.findMany({
      where: { guildId: interaction.guildId, userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
    const total = await prisma.moderationCase.count({ where: { guildId: interaction.guildId, userId: user.id } });
    const embed = brandEmbed(COLORS.coral)
      .setTitle(`📋 Sanctions de ${user.username}`)
      .setDescription(
        cases.length
          ? cases
              .map(
                (entry) =>
                  `**#${entry.id}** · ${CASE_LABELS[entry.type as CaseType] ?? entry.type} · ${discordTimestamp(entry.createdAt, "D")}\n${truncate(entry.reason ?? "Aucune raison", 150)}`,
              )
              .join("\n\n")
          : "Aucune sanction enregistrée. 🎉",
      )
      .setFooter({ text: `${total} cas au total${total > 15 ? " (15 plus récents affichés)" : ""}` });
    await replyEphemeral(interaction, "", [embed]);
  },
};

export const mute: SlashCommand = {
  data: slash("mute", "Rend un membre muet (timeout).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("membre").setDescription("Le membre").setRequired(true))
    .addIntegerOption((option) =>
      option.setName("minutes").setDescription(`Durée en minutes (max ${MAX_TIMEOUT_MINUTES})`).setRequired(true).setMinValue(1).setMaxValue(MAX_TIMEOUT_MINUTES),
    )
    .addStringOption((option) => option.setName("raison").setDescription("La raison").setMaxLength(500)),
  async execute(interaction) {
    const target = interaction.options.getMember("membre");
    if (!target) {
      await replyEphemeral(interaction, "Ce membre n'est pas sur le serveur.");
      return;
    }
    const error = checkModerationTarget(interaction, target, "moderatable");
    if (error) {
      await replyEphemeral(interaction, error);
      return;
    }
    const minutes = interaction.options.getInteger("minutes", true);
    const reason = reasonOf(interaction.options.getString("raison"));
    const durationMs = minutes * 60_000;
    await target.timeout(durationMs, reason ?? undefined);
    await logCase(interaction.guild, {
      userId: target.id,
      moderatorId: interaction.user.id,
      type: "MUTE",
      reason,
      expiresAt: new Date(Date.now() + durationMs),
    });
    await interaction.reply({ content: `🔇 <@${target.id}> est muet pendant ${formatDuration(durationMs)}.`, allowedMentions: { parse: [] } });
  },
};

export const unmute: SlashCommand = {
  data: slash("unmute", "Rend la parole à un membre.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((option) => option.setName("membre").setDescription("Le membre").setRequired(true)),
  async execute(interaction) {
    const target = interaction.options.getMember("membre");
    if (!target) {
      await replyEphemeral(interaction, "Ce membre n'est pas sur le serveur.");
      return;
    }
    if (!target.isCommunicationDisabled()) {
      await replyEphemeral(interaction, "Ce membre n'est pas muet.");
      return;
    }
    if (!target.moderatable) {
      await replyEphemeral(interaction, "Je n'ai pas les permissions nécessaires pour modifier ce membre.");
      return;
    }
    await target.timeout(null, `Fin du mute par ${interaction.user.tag}`);
    await logCase(interaction.guild, { userId: target.id, moderatorId: interaction.user.id, type: "UNMUTE", reason: null });
    await interaction.reply({ content: `🔊 <@${target.id}> peut de nouveau parler.`, allowedMentions: { parse: [] } });
  },
};

export const kick: SlashCommand = {
  data: slash("kick", "Expulse un membre.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((option) => option.setName("membre").setDescription("Le membre").setRequired(true))
    .addStringOption((option) => option.setName("raison").setDescription("La raison").setMaxLength(500)),
  async execute(interaction) {
    const target = interaction.options.getMember("membre");
    if (!target) {
      await replyEphemeral(interaction, "Ce membre n'est pas sur le serveur.");
      return;
    }
    const error = checkModerationTarget(interaction, target, "kickable");
    if (error) {
      await replyEphemeral(interaction, error);
      return;
    }
    const reason = reasonOf(interaction.options.getString("raison"));
    await notifyUser(target.user, `👢 Tu as été expulsé de **${interaction.guild.name}**.${reason ? ` Raison : ${reason}` : ""}`);
    await target.kick(reason ?? undefined);
    await logCase(interaction.guild, { userId: target.id, moderatorId: interaction.user.id, type: "KICK", reason });
    await interaction.reply({ content: `👢 **${target.user.tag}** a été expulsé.`, allowedMentions: { parse: [] } });
  },
};

export const ban: SlashCommand = {
  data: slash("ban", "Bannit un membre (définitivement ou temporairement).")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((option) => option.setName("membre").setDescription("Le membre ou l'utilisateur").setRequired(true))
    .addStringOption((option) => option.setName("raison").setDescription("La raison").setMaxLength(500))
    .addStringOption((option) => option.setName("duree").setDescription("Durée d'un ban temporaire (ex. 7d, 12h)"))
    .addIntegerOption((option) =>
      option.setName("jours_messages").setDescription("Supprimer ses messages des X derniers jours (0-7)").setMinValue(0).setMaxValue(7),
    ),
  async execute(interaction) {
    const user = interaction.options.getUser("membre", true);
    const member = interaction.options.getMember("membre");
    if (member) {
      const error = checkModerationTarget(interaction, member, "bannable");
      if (error) {
        await replyEphemeral(interaction, error);
        return;
      }
    } else if (user.id === interaction.user.id || user.id === interaction.client.user.id) {
      await replyEphemeral(interaction, "Cible invalide.");
      return;
    }

    const rawDuration = interaction.options.getString("duree");
    const durationMs = rawDuration ? parseDuration(rawDuration) : null;
    if (rawDuration && (!durationMs || durationMs < 60_000 || durationMs > MAX_TEMP_BAN_MS)) {
      await replyEphemeral(interaction, "Durée invalide : utilise par exemple `12h` ou `7d` (entre 1 minute et 365 jours).");
      return;
    }
    const reason = reasonOf(interaction.options.getString("raison"));
    const days = interaction.options.getInteger("jours_messages") ?? 0;
    const expiresAt = durationMs ? new Date(Date.now() + durationMs) : null;

    if (member) {
      await notifyUser(
        user,
        `🔨 Tu as été banni de **${interaction.guild.name}**${durationMs ? ` pour ${formatDuration(durationMs)}` : ""}.${reason ? ` Raison : ${reason}` : ""}`,
      );
    }
    await interaction.guild.members.ban(user.id, { reason: reason ?? undefined, deleteMessageSeconds: days * 86_400 });
    await logCase(interaction.guild, { userId: user.id, moderatorId: interaction.user.id, type: "BAN", reason, expiresAt });
    await interaction.reply({
      content: `🔨 **${user.tag}** a été banni${expiresAt ? ` jusqu'à ${discordTimestamp(expiresAt)}` : " définitivement"}.`,
      allowedMentions: { parse: [] },
    });
  },
};

export const unban: SlashCommand = {
  data: slash("unban", "Lève le bannissement d'un utilisateur.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addStringOption((option) => option.setName("id_utilisateur").setDescription("Identifiant de l'utilisateur").setRequired(true))
    .addStringOption((option) => option.setName("raison").setDescription("La raison").setMaxLength(500)),
  async execute(interaction) {
    const userId = interaction.options.getString("id_utilisateur", true).trim();
    if (!/^\d{17,20}$/.test(userId)) {
      await replyEphemeral(interaction, "Identifiant invalide (17 à 20 chiffres).");
      return;
    }
    const reason = reasonOf(interaction.options.getString("raison"));
    try {
      await interaction.guild.bans.remove(userId, reason ?? undefined);
    } catch (error) {
      if (discordErrorCode(error) === DISCORD_ERRORS.UNKNOWN_BAN) {
        await replyEphemeral(interaction, "Cet utilisateur n'est pas banni.");
        return;
      }
      throw error;
    }
    await prisma.moderationCase.updateMany({
      where: { guildId: interaction.guildId, userId, type: "BAN", resolved: false },
      data: { resolved: true },
    });
    await logCase(interaction.guild, { userId, moderatorId: interaction.user.id, type: "UNBAN", reason });
    await interaction.reply({ content: `✅ <@${userId}> a été débanni.`, allowedMentions: { parse: [] } });
  },
};

export const clear: SlashCommand = {
  data: slash("clear", "Supprime des messages en masse (1 à 100).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((option) => option.setName("nombre").setDescription("Nombre de messages (1-100)").setRequired(true).setMinValue(1).setMaxValue(100)),
  async execute(interaction) {
    const channel = interaction.channel;
    if (!channel || !("bulkDelete" in channel)) {
      await replyEphemeral(interaction, "Impossible de supprimer des messages dans ce salon.");
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const deleted = await channel.bulkDelete(interaction.options.getInteger("nombre", true), true);
    await sendLogEmbed(
      interaction.guild,
      brandEmbed(COLORS.coral)
        .setTitle("🧹 Messages supprimés en masse")
        .addFields(
          { name: "Salon", value: `<#${channel.id}>`, inline: true },
          { name: "Quantité", value: String(deleted.size), inline: true },
          { name: "Modérateur", value: `<@${interaction.user.id}>`, inline: true },
        ),
    );
    await replyEphemeral(interaction, `🧹 ${deleted.size} message${deleted.size > 1 ? "s" : ""} supprimé${deleted.size > 1 ? "s" : ""} (les messages de plus de 14 jours ne peuvent pas être supprimés en masse).`);
  },
};

export const slowmode: SlashCommand = {
  data: slash("slowmode", "Règle le mode lent d'un salon.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addIntegerOption((option) => option.setName("secondes").setDescription("Délai entre deux messages (0 = désactivé)").setRequired(true).setMinValue(0).setMaxValue(21_600))
    .addChannelOption((option) =>
      option.setName("salon").setDescription("Le salon (actuel par défaut)").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice),
    ),
  async execute(interaction) {
    const seconds = interaction.options.getInteger("secondes", true);
    const option = interaction.options.getChannel("salon");
    const channel = option ? interaction.guild.channels.cache.get(option.id) : interaction.channel;
    if (!channel || !("setRateLimitPerUser" in channel)) {
      await replyEphemeral(interaction, "Ce salon ne prend pas en charge le mode lent.");
      return;
    }
    await channel.setRateLimitPerUser(seconds, `Mode lent réglé par ${interaction.user.tag}`);
    await replyEphemeral(interaction, seconds ? `🐢 Mode lent réglé à ${formatDuration(seconds * 1000)} dans <#${channel.id}>.` : `⚡ Mode lent désactivé dans <#${channel.id}>.`);
  },
};

export const nickname: SlashCommand = {
  data: slash("nickname", "Change ou réinitialise le pseudo d'un membre.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption((option) => option.setName("membre").setDescription("Le membre").setRequired(true))
    .addStringOption((option) => option.setName("pseudo").setDescription("Nouveau pseudo (vide = réinitialiser)").setMaxLength(32)),
  async execute(interaction) {
    const target = interaction.options.getMember("membre");
    if (!target) {
      await replyEphemeral(interaction, "Ce membre n'est pas sur le serveur.");
      return;
    }
    if (!target.manageable || target.id === interaction.guild.ownerId) {
      await replyEphemeral(interaction, "Je ne peux pas modifier le pseudo de ce membre (hiérarchie des rôles).");
      return;
    }
    const value = interaction.options.getString("pseudo")?.trim() || null;
    await target.setNickname(value, `Pseudo modifié par ${interaction.user.tag}`);
    await replyEphemeral(interaction, value ? `✏️ Pseudo de <@${target.id}> changé en **${value}**.` : `✏️ Pseudo de <@${target.id}> réinitialisé.`);
  },
};

export const say: SlashCommand = {
  data: slash("say", "Fait parler le bot dans un salon.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((option) => option.setName("message").setDescription("Le message").setRequired(true).setMaxLength(2000))
    .addChannelOption((option) =>
      option.setName("salon").setDescription("Le salon (actuel par défaut)").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    ),
  async execute(interaction) {
    const option = interaction.options.getChannel("salon");
    const channel = option ? interaction.guild.channels.cache.get(option.id) : interaction.channel;
    if (!channel?.isTextBased()) {
      await replyEphemeral(interaction, "Salon invalide.");
      return;
    }
    await channel.send({ content: interaction.options.getString("message", true), allowedMentions: { parse: [] } });
    await replyEphemeral(interaction, `✅ Message envoyé dans <#${channel.id}>.`);
  },
};

export const moderationCommands: SlashCommand[] = [warn, warnings, mute, unmute, kick, ban, unban, clear, slowmode, nickname, say];
