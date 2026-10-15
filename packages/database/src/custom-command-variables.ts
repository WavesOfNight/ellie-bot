import { prisma } from "./client.js";

export const VARIABLE_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/;
export const VARIABLE_VALUE_MAX_LENGTH = 1000;

/** Charge toutes les variables persistantes du serveur (utilisées par {var:nom}). */
export async function loadGuildVariables(guildId: string): Promise<Map<string, string>> {
  const rows = await prisma.customCommandVariable.findMany({ where: { guildId } });
  return new Map(rows.map((row) => [row.name, row.value]));
}

/** Persiste les variables modifiées pendant l'exécution d'une commande. */
export async function saveGuildVariables(guildId: string, changes: ReadonlyMap<string, string>): Promise<void> {
  if (changes.size === 0) return;
  await prisma.$transaction(
    [...changes].map(([name, value]) =>
      prisma.customCommandVariable.upsert({
        where: { guildId_name: { guildId, name } },
        create: { guildId, name, value: value.slice(0, VARIABLE_VALUE_MAX_LENGTH) },
        update: { value: value.slice(0, VARIABLE_VALUE_MAX_LENGTH) },
      }),
    ),
  );
}

export async function listGuildVariables(guildId: string) {
  return prisma.customCommandVariable.findMany({ where: { guildId }, orderBy: { name: "asc" } });
}

export async function deleteGuildVariable(guildId: string, name: string): Promise<void> {
  await prisma.customCommandVariable.deleteMany({ where: { guildId, name } });
}
