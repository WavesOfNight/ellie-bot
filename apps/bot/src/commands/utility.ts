import { randomInt } from "node:crypto";
import { ChannelType, type PermissionsString } from "discord.js";
import { prisma } from "@ellie/database";
import { BOT_NAME, SLASH_COMMAND_CATALOG } from "@ellie/database/shared";
import { isCommandEnabledCached } from "../lib/cache.js";
import { formatDuration, parseDuration } from "../lib/durations.js";
import { brandEmbed, COLORS, discordTimestamp, truncate } from "../lib/embeds.js";
import { renderPoll } from "../lib/polls.js";
import { replyEphemeral } from "../lib/replies.js";
import { ensurePermanentInvite } from "../lib/server-upkeep.js";
import type { SlashCommand } from "../types.js";
import { slash } from "./builder.js";

export const ping: SlashCommand = {
  data: slash("ping", "Affiche la latence du bot."),
  async execute(interaction) {
    const roundTrip = Date.now() - interaction.createdTimestamp;
    await interaction.reply({
      content: `🏓 Pong ! Latence de la passerelle : **${Math.max(0, interaction.client.ws.ping)} ms** · réponse : **${Math.max(0, roundTrip)} ms**`,
    });
  },
};

export const userinfo: SlashCommand = {
  data: slash("userinfo", "Informations sur un membre.")
    .addUserOption((option) => option.setName("membre").setDescription("Le membre (toi par défaut)")),
  async execute(interaction) {
    const user = interaction.options.getUser("membre") ?? interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const embed = brandEmbed()
      .setTitle(`👤 ${member?.displayName ?? user.username}`)
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
        { name: "Nom d'utilisateur", value: user.tag, inline: true },
        { name: "Identifiant", value: user.id, inline: true },
        { name: "Bot", value: user.bot ? "Oui" : "Non", inline: true },
        { name: "Compte créé", value: `${discordTimestamp(user.createdAt)} (${discordTimestamp(user.createdAt, "R")})` },
      );
    if (member?.joinedAt) {
      embed.addFields({ name: "A rejoint le serveur", value: `${discordTimestamp(member.joinedAt)} (${discordTimestamp(member.joinedAt, "R")})` });
      const roles = member.roles.cache
        .filter((role) => role.id !== interaction.guild.id)
        .sort((a, b) => b.position - a.position)
        .map((role) => `<@&${role.id}>`);
      embed.addFields({
        name: `Rôles (${roles.length})`,
        value: roles.length ? truncate(roles.slice(0, 20).join(" "), 1024) : "Aucun",
      });
    }
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

export const serverinfo: SlashCommand = {
  data: slash("serverinfo", "Informations sur le serveur."),
  async execute(interaction) {
    const { guild } = interaction;
    const channels = guild.channels.cache;
    const embed = brandEmbed()
      .setTitle(`🏠 ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }))
    .addFields(
        { name: "Propriétaire", value: `<@${guild.ownerId}>`, inline: true },
        { name: "Membres", value: guild.memberCount.toLocaleString("fr-FR"), inline: true },
        { name: "Rôles", value: String(guild.roles.cache.size - 1), inline: true },
        { name: "Salons textuels", value: String(channels.filter((channel) => channel.type === ChannelType.GuildText).size), inline: true },
        { name: "Salons vocaux", value: String(channels.filter((channel) => channel.type === ChannelType.GuildVoice).size), inline: true },
        { name: "Boosts", value: `${guild.premiumSubscriptionCount ?? 0} (niveau ${guild.premiumTier})`, inline: true },
        { name: "Créé le", value: `${discordTimestamp(guild.createdAt)} (${discordTimestamp(guild.createdAt, "R")})` },
      )
      .setFooter({ text: `${BOT_NAME} · ID ${guild.id}` });
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

export const avatar: SlashCommand = {
  data: slash("avatar", "Affiche l'avatar d'un membre en grand.")
    .addUserOption((option) => option.setName("membre").setDescription("Le membre (toi par défaut)")),
  async execute(interaction) {
    const user = interaction.options.getUser("membre") ?? interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const url = (member ?? user).displayAvatarURL({ size: 1024 });
    const embed = brandEmbed().setTitle(`🖼️ Avatar de ${member?.displayName ?? user.username}`).setImage(url).setURL(url);
    await interaction.reply({ embeds: [embed] });
  },
};

const KEY_PERMISSIONS: Array<[PermissionsString, string]> = [
  ["Administrator", "Administrateur"],
  ["ManageGuild", "Gérer le serveur"],
  ["ManageRoles", "Gérer les rôles"],
  ["ManageChannels", "Gérer les salons"],
  ["ManageMessages", "Gérer les messages"],
  ["BanMembers", "Bannir"],
  ["KickMembers", "Expulser"],
  ["ModerateMembers", "Exclure temporairement"],
  ["MentionEveryone", "Mentionner @everyone"],
];

export const roleinfo: SlashCommand = {
  data: slash("roleinfo", "Informations sur un rôle.")
    .addRoleOption((option) => option.setName("role").setDescription("Le rôle").setRequired(true)),
  async execute(interaction) {
    const role = interaction.options.getRole("role", true);
    const permissions = KEY_PERMISSIONS.filter(([flag]) => role.permissions.has(flag)).map(([, label]) => label);
    const embed = brandEmbed(role.color || COLORS.lavender)
      .setTitle(`🏷️ ${role.name}`)
    .addFields(
        { name: "Identifiant", value: role.id, inline: true },
        { name: "Couleur", value: role.hexColor.toUpperCase(), inline: true },
        { name: "Membres", value: String(role.members.size), inline: true },
        { name: "Position", value: String(role.position), inline: true },
        { name: "Mentionnable", value: role.mentionable ? "Oui" : "Non", inline: true },
        { name: "Affiché séparément", value: role.hoist ? "Oui" : "Non", inline: true },
        { name: "Créé le", value: discordTimestamp(role.createdAt) },
        { name: "Permissions clés", value: permissions.length ? permissions.join(", ") : "Aucune" },
      );
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

export const poll: SlashCommand = {
  data: slash("poll", "Crée un sondage à boutons (2 à 4 choix).")
    .addStringOption((option) => option.setName("question").setDescription("La question").setRequired(true).setMaxLength(240))
    .addStringOption((option) => option.setName("option1").setDescription("Choix 1").setRequired(true).setMaxLength(70))
    .addStringOption((option) => option.setName("option2").setDescription("Choix 2").setRequired(true).setMaxLength(70))
    .addStringOption((option) => option.setName("option3").setDescription("Choix 3").setMaxLength(70))
    .addStringOption((option) => option.setName("option4").setDescription("Choix 4").setMaxLength(70)),
  async execute(interaction) {
    const options = ["option1", "option2", "option3", "option4"]
      .map((name) => interaction.options.getString(name)?.trim())
      .filter((value): value is string => Boolean(value));
    const record = await prisma.poll.create({
      data: {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        question: interaction.options.getString("question", true).trim(),
        options: JSON.stringify(options),
        authorId: interaction.user.id,
      },
    });
    await interaction.reply(await renderPoll(record));
    const message = await interaction.fetchReply();
    await prisma.poll.update({ where: { id: record.id }, data: { messageId: message.id } });
  },
};

const MAX_REMINDER_MS = 365 * 86_400_000;

export const remindme: SlashCommand = {
  data: slash("remindme", "Programme un rappel (ex. 10m, 2h, 1d).")
    .addStringOption((option) => option.setName("dans").setDescription("Délai : 10m, 2h, 1d, 1h30m…").setRequired(true))
    .addStringOption((option) => option.setName("message").setDescription("De quoi faut-il te rappeler ?").setRequired(true).setMaxLength(1000)),
  async execute(interaction) {
    const delay = parseDuration(interaction.options.getString("dans", true));
    if (!delay || delay < 60_000 || delay > MAX_REMINDER_MS) {
      await replyEphemeral(interaction, "Délai invalide : utilise par exemple `10m`, `2h` ou `1d` (entre 1 minute et 365 jours).");
      return;
    }
    const remindAt = new Date(Date.now() + delay);
    await prisma.reminder.create({
      data: {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        message: interaction.options.getString("message", true),
        remindAt,
      },
    });
    await replyEphemeral(interaction, `⏰ C'est noté ! Je te le rappelle ${discordTimestamp(remindAt, "R")} (dans ${formatDuration(delay)}).`);
  },
};

const EIGHT_BALL_ANSWERS = [
  "C'est certain.",
  "Sans aucun doute.",
  "Oui, carrément.",
  "Tu peux compter dessus.",
  "Très probablement.",
  "Les signes disent oui.",
  "C'est bien parti.",
  "Réessaie plus tard, c'est flou.",
  "Mieux vaut ne pas te le dire maintenant…",
  "Je ne peux pas prédire ça.",
  "Concentre-toi et redemande.",
  "N'y compte pas trop.",
  "Ma réponse est non.",
  "Mes sources disent non.",
  "Les perspectives ne sont pas terribles.",
  "Très peu probable.",
];

export const eightball: SlashCommand = {
  data: slash("8ball", "Pose une question à la boule magique.")
    .addStringOption((option) => option.setName("question").setDescription("Ta question").setRequired(true).setMaxLength(300)),
  async execute(interaction) {
    const embed = brandEmbed(COLORS.lavender)
      .setTitle("🎱 La boule magique a parlé")
    .addFields(
        { name: "Question", value: interaction.options.getString("question", true) },
        { name: "Réponse", value: EIGHT_BALL_ANSWERS[randomInt(EIGHT_BALL_ANSWERS.length)] ?? "…" },
      );
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

export const invite: SlashCommand = {
  data: slash("invite", "Donne le lien d'invitation permanent du serveur."),
  async execute(interaction) {
    const code = await ensurePermanentInvite(interaction.guild);
    if (!code) {
      await replyEphemeral(interaction, "Aucun lien permanent n'est configuré : l'équipe peut choisir un salon source dans le panel (page « Invitation »).");
      return;
    }
    await interaction.reply({ content: `🔗 Invite tes amis : https://discord.gg/${code}` });
  },
};

export const help: SlashCommand = {
  data: slash("help", "Liste toutes les commandes du bot."),
  async execute(interaction) {
    const embed = brandEmbed(COLORS.lavender)
      .setTitle(`📚 Commandes de ${BOT_NAME}`)
      .setDescription("Voici tout ce que je sais faire. Mentionne-moi pour discuter si Ellie est activée sur ce serveur !");
    for (const category of SLASH_COMMAND_CATALOG) {
      const lines = await Promise.all(
        category.commands.map(async (command) => {
          const enabled = await isCommandEnabledCached(interaction.guildId, command.name);
          return `\`/${command.name}\` — ${command.description}${enabled ? "" : " *(désactivée ici)*"}`;
        }),
      );
      embed.addFields({ name: `${category.emoji} ${category.label}`, value: truncate(lines.join("\n"), 1024) });
    }
    await replyEphemeral(interaction, "", [embed]);
  },
};

export const utilityCommands: SlashCommand[] = [ping, userinfo, serverinfo, avatar, roleinfo, poll, remindme, eightball, invite, help];

