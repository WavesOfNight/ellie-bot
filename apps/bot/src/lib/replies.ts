import { MessageFlags, type EmbedBuilder, type RepliableInteraction } from "discord.js";
import { logError } from "./log.js";

/** Réponse visible uniquement par l'auteur, qu'on ait déjà répondu (defer) ou non. */
export async function replyEphemeral(
  interaction: RepliableInteraction,
  content: string,
  embeds: EmbedBuilder[] = [],
): Promise<void> {
  const payload = { content, embeds, allowedMentions: { parse: [] } };
  if (interaction.deferred) {
    await interaction.editReply(payload);
  } else if (interaction.replied) {
    await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }
}

/** Message d'erreur générique : jamais d'échec silencieux pour l'utilisateur. */
export async function replyError(interaction: RepliableInteraction, context: string, error: unknown): Promise<void> {
  logError(context, error);
  try {
    await replyEphemeral(interaction, "❌ Oups, une erreur est survenue. Réessaie dans un instant ou préviens l'équipe du serveur.");
  } catch (replyErrorValue) {
    logError(`${context} (envoi du message d'erreur)`, replyErrorValue);
  }
}
