/**
 * Déploiement manuel des commandes slash (facultatif : le bot les déploie déjà à chaque démarrage).
 * Usage : npm run bot:deploy
 */
import "../env.js";
import { getDiscordCredentials, prisma } from "@ellie/database";
import { commands } from "../commands/index.js";
import { DEV_GUILD_ID } from "../env.js";
import { deployCommands } from "../lib/deploy.js";

try {
  const credentials = await getDiscordCredentials();
  if (!credentials) {
    console.error("Aucun token Discord configuré : saisis-le d'abord dans le panel (Paramètres).");
    process.exitCode = 1;
  } else {
    const scope = await deployCommands(credentials.token, credentials.clientId, commands, DEV_GUILD_ID);
    console.log(`${commands.length} commandes slash déployées (${scope}).`);
  }
} catch (error) {
  console.error("Déploiement impossible :", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
