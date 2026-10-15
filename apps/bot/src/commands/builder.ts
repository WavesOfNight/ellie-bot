import { InteractionContextType, SlashCommandBuilder } from "discord.js";

/** Commande slash utilisable uniquement sur un serveur (jamais en MP). */
export function slash(name: string, description: string): SlashCommandBuilder {
  return new SlashCommandBuilder().setName(name).setDescription(description).setContexts(InteractionContextType.Guild);
}
