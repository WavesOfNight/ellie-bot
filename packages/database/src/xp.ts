import { prisma } from "./client.js";
import { isXpCooldownOver, levelProgress, randomXpGain } from "./levels.js";

export interface XpAwardResult {
  awarded: number;
  previousLevel: number;
  level: number;
  leveledUp: boolean;
}

/**
 * Compte un message et accorde de l'XP si le cooldown de 60 s est écoulé.
 * Le compteur de messages progresse même pendant le cooldown.
 */
export async function awardMessageXp(
  guildId: string,
  userId: string,
  now = new Date(),
  random: () => number = Math.random,
): Promise<XpAwardResult> {
  const member = await prisma.member.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId },
    update: {},
  });

  if (!isXpCooldownOver(member.lastXpAt, now)) {
    await prisma.member.update({ where: { id: member.id }, data: { messages: { increment: 1 } } });
    return { awarded: 0, previousLevel: member.level, level: member.level, leveledUp: false };
  }

  const awarded = randomXpGain(random);
  const totalXp = member.xp + awarded;
  const { level } = levelProgress(totalXp);
  await prisma.member.update({
    where: { id: member.id },
    data: { xp: totalXp, level, lastXpAt: now, messages: { increment: 1 } },
  });
  return { awarded, previousLevel: member.level, level, leveledUp: level > member.level };
}

export async function getMemberStats(guildId: string, userId: string) {
  const member = await prisma.member.findUnique({ where: { guildId_userId: { guildId, userId } } });
  if (!member) return null;
  const rank = (await prisma.member.count({ where: { guildId, xp: { gt: member.xp } } })) + 1;
  return { ...member, rank, progress: levelProgress(member.xp) };
}

export async function getXpLeaderboard(guildId: string, limit = 10) {
  return prisma.member.findMany({
    where: { guildId, xp: { gt: 0 } },
    orderBy: [{ xp: "desc" }, { id: "asc" }],
    take: limit,
  });
}
