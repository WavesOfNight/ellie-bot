import { getMemberStats, getXpLeaderboard } from "@ellie/database";
import { MAX_LEVEL } from "@ellie/database/shared";
import { brandEmbed, COLORS, formatNumber, progressBar } from "../lib/embeds.js";
import type { SlashCommand } from "../types.js";
import { slash } from "./builder.js";

const MEDALS = ["🥇", "🥈", "🥉"];

export const rank: SlashCommand = {
  data: slash("rank", "Affiche le niveau et l'XP d'un membre.").addUserOption((option) =>
    option.setName("membre").setDescription("Le membre (toi par défaut)"),
  ),
  async execute(interaction) {
    const user = interaction.options.getUser("membre") ?? interaction.user;
    const stats = await getMemberStats(interaction.guildId, user.id);
    if (!stats || stats.xp === 0) {
      await interaction.reply({ content: `${user.id === interaction.user.id ? "Tu n'as" : `<@${user.id}> n'a`} pas encore d'XP sur ce serveur.`, allowedMentions: { parse: [] } });
      return;
    }
    const { progress } = stats;
    const xpLine =
      progress.required === null
        ? "Niveau maximum atteint 🏆"
        : `${progressBar(progress.current / progress.required)} ${formatNumber(progress.current)} / ${formatNumber(progress.required)} XP`;
    const embed = brandEmbed(COLORS.lavender)
      .setAuthor({ name: user.displayName, iconURL: user.displayAvatarURL() })
      .setTitle("📈 Progression")
      .addFields(
        { name: "Rang", value: `#${stats.rank}`, inline: true },
        { name: "Niveau", value: `${progress.level} / ${MAX_LEVEL}`, inline: true },
        { name: "Messages", value: formatNumber(stats.messages), inline: true },
        { name: "XP", value: xpLine },
      );
    await interaction.reply({ embeds: [embed] });
  },
};

export const leaderboard: SlashCommand = {
  data: slash("leaderboard", "Classement XP du serveur."),
  async execute(interaction) {
    const top = await getXpLeaderboard(interaction.guildId, 10);
    if (!top.length) {
      await interaction.reply({ content: "Personne n'a encore gagné d'XP ici. À vos claviers !" });
      return;
    }
    const lines = top.map(
      (member, index) => `${MEDALS[index] ?? `**${index + 1}.**`} <@${member.userId}> — niveau ${member.level} · ${formatNumber(member.xp)} XP`,
    );
    const embed = brandEmbed(COLORS.lavender).setTitle(`🏆 Classement de ${interaction.guild.name}`).setDescription(lines.join("\n"));
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

export const levelCommands: SlashCommand[] = [rank, leaderboard];
