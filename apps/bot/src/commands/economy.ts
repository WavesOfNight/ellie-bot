import { getBalance, getEconomyLeaderboard, InsufficientFundsError, transferBalance } from "@ellie/database";
import { brandEmbed, formatNumber } from "../lib/embeds.js";
import { replyEphemeral } from "../lib/replies.js";
import type { SlashCommand } from "../types.js";
import { slash } from "./builder.js";

const COIN_COLOR = 0xf5c542;
const MAX_TRANSFER = 1_000_000;

export const balance: SlashCommand = {
  data: slash("balance", "Affiche le solde de pièces d'un membre.").addUserOption((option) =>
    option.setName("membre").setDescription("Le membre (toi par défaut)"),
  ),
  async execute(interaction) {
    const user = interaction.options.getUser("membre") ?? interaction.user;
    const amount = await getBalance(interaction.guildId, user.id);
    const owner = user.id === interaction.user.id ? "Tu as" : `<@${user.id}> a`;
    await interaction.reply({ content: `🪙 ${owner} **${formatNumber(amount)}** pièce${amount > 1 ? "s" : ""}.`, allowedMentions: { parse: [] } });
  },
};

export const pay: SlashCommand = {
  data: slash("pay", "Envoie des pièces à un autre membre.")
    .addUserOption((option) => option.setName("membre").setDescription("Le destinataire").setRequired(true))
    .addIntegerOption((option) => option.setName("montant").setDescription("Nombre de pièces").setRequired(true).setMinValue(1).setMaxValue(MAX_TRANSFER)),
  async execute(interaction) {
    const target = interaction.options.getUser("membre", true);
    const amount = interaction.options.getInteger("montant", true);
    if (target.bot) {
      await replyEphemeral(interaction, "Les bots n'ont pas besoin de pièces 😉");
      return;
    }
    if (target.id === interaction.user.id) {
      await replyEphemeral(interaction, "Tu ne peux pas t'envoyer des pièces à toi-même.");
      return;
    }
    try {
      const result = await transferBalance(interaction.guildId, interaction.user.id, target.id, amount);
      await interaction.reply({
        content: `💸 <@${interaction.user.id}> a envoyé **${formatNumber(amount)}** pièce${amount > 1 ? "s" : ""} à <@${target.id}>. Il te reste ${formatNumber(result.fromBalance)} pièce${result.fromBalance > 1 ? "s" : ""}.`,
        allowedMentions: { users: [target.id] },
      });
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        await replyEphemeral(interaction, `Solde insuffisant : tu n'as que ${formatNumber(error.balance)} pièce${error.balance > 1 ? "s" : ""}.`);
        return;
      }
      throw error;
    }
  },
};

export const classementPieces: SlashCommand = {
  data: slash("classement-pieces", "Classement des membres les plus riches."),
  async execute(interaction) {
    const top = await getEconomyLeaderboard(interaction.guildId, 10);
    if (!top.length) {
      await interaction.reply({ content: "Personne n'a encore de pièces sur ce serveur." });
      return;
    }
    const embed = brandEmbed(COIN_COLOR)
      .setTitle("🪙 Classement des pièces")
      .setDescription(top.map((member, index) => `**${index + 1}.** <@${member.userId}> — ${formatNumber(member.balance)} pièces`).join("\n"));
    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },
};

export const economyCommands: SlashCommand[] = [balance, pay, classementPieces];
