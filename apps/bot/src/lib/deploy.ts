import { REST, Routes } from "discord.js";
import type { SlashCommand } from "../types.js";
import { logError, logInfo } from "./log.js";

/**
 * Déploie les commandes slash : instantanément sur le serveur de développement si
 * DISCORD_DEV_GUILD_ID est défini, sinon globalement. En mode global, les commandes
 * enregistrées serveur par serveur (ex. par l'ancien bot de la même application) sont
 * retirées pour ne pas laisser de commandes orphelines.
 * @returns la portée du déploiement (pour le journal).
 */
export async function deployCommands(
  token: string,
  clientId: string,
  commands: readonly SlashCommand[],
  devGuildId: string | null,
  guildIds: readonly string[] = [],
): Promise<string> {
  const rest = new REST({ version: "10" }).setToken(token);
  const body = commands.map((command) => command.data.toJSON());
  if (devGuildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, devGuildId), { body });
    return `serveur de développement ${devGuildId}`;
  }
  await rest.put(Routes.applicationCommands(clientId), { body });

  for (const guildId of guildIds) {
    try {
      const existing = (await rest.get(Routes.applicationGuildCommands(clientId, guildId))) as unknown[];
      if (existing.length) {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
        logInfo(`${existing.length} ancienne(s) commande(s) de serveur retirée(s) (serveur ${guildId})`);
      }
    } catch (error) {
      logError(`nettoyage des commandes du serveur ${guildId}`, error);
    }
  }
  return "global";
}
