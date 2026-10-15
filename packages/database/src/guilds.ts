import type { Guild } from "@prisma/client";
import { prisma } from "./client.js";

/** Crée la ligne du serveur si elle n'existe pas encore et met son nom à jour. */
export async function ensureGuild(guildId: string, name?: string | null): Promise<Guild> {
  return prisma.guild.upsert({
    where: { id: guildId },
    create: { id: guildId, name: name ?? null },
    update: name ? { name } : {},
  });
}

export async function getGuild(guildId: string): Promise<Guild> {
  return (await prisma.guild.findUnique({ where: { id: guildId } })) ?? ensureGuild(guildId);
}

export async function isSlashCommandEnabled(guildId: string, name: string): Promise<boolean> {
  const toggle = await prisma.slashCommandToggle.findUnique({ where: { guildId_name: { guildId, name } } });
  return toggle?.enabled ?? true;
}

export async function setSlashCommandEnabled(guildId: string, name: string, enabled: boolean): Promise<void> {
  await ensureGuild(guildId);
  await prisma.slashCommandToggle.upsert({
    where: { guildId_name: { guildId, name } },
    create: { guildId, name, enabled },
    update: { enabled },
  });
}

/** Nombre de cas d'avertissement (manuels + automatiques) d'un membre, utilisé pour l'escalade. */
export async function countWarnings(guildId: string, userId: string): Promise<number> {
  return prisma.moderationCase.count({ where: { guildId, userId, type: { in: ["WARN", "AUTOMOD"] } } });
}
