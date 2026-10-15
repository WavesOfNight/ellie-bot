import "./env.js";
import { prisma } from "@ellie/database";
import { BOT_NAME } from "@ellie/database/shared";
import { logError, logInfo } from "./lib/log.js";
import { DiscordSupervisor } from "./supervisor.js";

logInfo(`démarrage de ${BOT_NAME} (bot Discord)`);
const supervisor = new DiscordSupervisor();
supervisor.start();

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logInfo(`arrêt demandé (${signal})`);
  await supervisor.stop();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => logError("promesse rejetée non gérée", reason));
process.on("uncaughtException", (error) => logError("exception non gérée", error));
