import { prisma } from "./client.js";
import { lastParisDates, parisDateString } from "./dates.js";
import { isXpCooldownOver, levelProgress, randomXpGain } from "./levels.js";

export type TwitchDailyStatField = "messages" | "commands" | "timeouts";

export async function incrementTwitchDailyStat(field: TwitchDailyStatField, now = new Date(), amount = 1): Promise<void> {
  const date = parisDateString(now);
  await prisma.twitchDailyStat.upsert({
    where: { date },
    create: { date, [field]: amount },
    update: { [field]: { increment: amount } },
  });
}

/** Statistiques des `days` derniers jours, jours vides compris. */
export async function getTwitchDailyStats(days = 7, now = new Date()) {
  const dates = lastParisDates(days, now);
  const rows = await prisma.twitchDailyStat.findMany({ where: { date: { in: dates } } });
  return dates.map((date) => {
    const row = rows.find((candidate) => candidate.date === date);
    return { date, messages: row?.messages ?? 0, commands: row?.commands ?? 0, timeouts: row?.timeouts ?? 0 };
  });
}

export interface TwitchXpResult {
  leveledUp: boolean;
  level: number;
}

/** Compte un message du chat Twitch et accorde de l'XP (cooldown de 60 s). */
export async function recordTwitchChatMessage(
  username: string,
  now = new Date(),
  random: () => number = Math.random,
): Promise<TwitchXpResult> {
  const login = username.toLowerCase();
  const stat = await prisma.twitchChatterStat.upsert({
    where: { username: login },
    create: { username: login, lastSeenAt: now },
    update: {},
  });
  if (!isXpCooldownOver(stat.lastXpAt, now)) {
    await prisma.twitchChatterStat.update({
      where: { id: stat.id },
      data: { messages: { increment: 1 }, lastSeenAt: now },
    });
    return { leveledUp: false, level: stat.level };
  }
  const xp = stat.xp + randomXpGain(random);
  const { level } = levelProgress(xp);
  await prisma.twitchChatterStat.update({
    where: { id: stat.id },
    data: { xp, level, lastXpAt: now, messages: { increment: 1 }, lastSeenAt: now },
  });
  return { leveledUp: level > stat.level, level };
}

/** Crédite du temps de visionnage aux spectateurs présents. */
export async function addTwitchWatchMinutes(usernames: readonly string[], minutes: number, now = new Date()): Promise<void> {
  const logins = [...new Set(usernames.map((name) => name.toLowerCase()))];
  for (let i = 0; i < logins.length; i += 200) {
    const batch = logins.slice(i, i + 200);
    await prisma.$transaction(
      batch.map((username) =>
        prisma.twitchChatterStat.upsert({
          where: { username },
          create: { username, watchMinutes: minutes, lastSeenAt: now },
          update: { watchMinutes: { increment: minutes }, lastSeenAt: now },
        }),
      ),
    );
  }
}

/**
 * Note la première présence de spectateurs pendant ce live (message dans le chat ou liste des
 * chatters), pour !myuptime. Ceux déjà notés pour ce live gardent leur heure d'arrivée.
 */
export async function markTwitchViewersPresent(usernames: readonly string[], streamId: string, now = new Date()): Promise<void> {
  const logins = [...new Set(usernames.map((name) => name.toLowerCase()))];
  for (let i = 0; i < logins.length; i += 500) {
    await prisma.twitchChatterStat.updateMany({
      // `not` exclut aussi les valeurs nulles en SQL : d'où le cas « aucun live noté » à part.
      where: { username: { in: logins.slice(i, i + 500) }, OR: [{ sessionStreamId: null }, { sessionStreamId: { not: streamId } }] },
      data: { sessionStreamId: streamId, sessionStartedAt: now },
    });
  }
}

/** Arrivée sur le live en cours et temps de visionnage total d'un spectateur. */
export async function getTwitchViewerTime(username: string) {
  return prisma.twitchChatterStat.findUnique({
    where: { username: username.toLowerCase() },
    select: { sessionStreamId: true, sessionStartedAt: true, watchMinutes: true },
  });
}

export async function getTwitchLeaderboard(limit = 5, excludeUsernames: readonly string[] = []) {
  return prisma.twitchChatterStat.findMany({
    where: { xp: { gt: 0 }, username: { notIn: excludeUsernames.map((name) => name.toLowerCase()) } },
    orderBy: [{ xp: "desc" }, { id: "asc" }],
    take: limit,
  });
}

export async function getTwitchChatterRank(username: string, excludeUsernames: readonly string[] = []) {
  const stat = await prisma.twitchChatterStat.findUnique({ where: { username: username.toLowerCase() } });
  if (!stat) return null;
  const rank =
    (await prisma.twitchChatterStat.count({
      where: { xp: { gt: stat.xp }, username: { notIn: excludeUsernames.map((name) => name.toLowerCase()) } },
    })) + 1;
  return { ...stat, rank, progress: levelProgress(stat.xp) };
}
