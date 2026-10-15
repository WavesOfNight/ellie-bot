import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __elliePrisma?: PrismaClient };

/**
 * Client Prisma unique par process. En développement (Next.js), le rechargement à chaud
 * réévalue les modules : on réutilise l'instance stockée sur `globalThis` pour ne pas
 * ouvrir une connexion SQLite à chaque modification de fichier.
 */
export const prisma: PrismaClient =
  globalForPrisma.__elliePrisma ?? new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__elliePrisma = prisma;
}

let walEnabled = false;

/**
 * Active le mode WAL de SQLite : trois process (bot Discord, bot Twitch, panel) partagent
 * le même fichier, et le WAL permet aux lectures de ne pas bloquer les écritures.
 * Le réglage est persistant dans le fichier ; l'appel est idempotent.
 */
export async function prepareDatabase(): Promise<void> {
  if (walEnabled) return;
  await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
  walEnabled = true;
}
