import { randomInt } from "node:crypto";
import { prisma } from "./client.js";

export class TwitchGiveawayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwitchGiveawayError";
  }
}

export async function getActiveTwitchGiveaway() {
  return prisma.twitchGiveaway.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { entries: true } } },
  });
}

/** Lance un giveaway (un seul actif à la fois). Le bot annonce le lancement dans le chat. */
export async function startTwitchGiveaway(keyword: string, prize: string) {
  const cleanKeyword = keyword.trim().toLowerCase();
  if (!/^\S{1,30}$/.test(cleanKeyword)) {
    throw new TwitchGiveawayError("Le mot-clé doit être un seul mot (30 caractères maximum).");
  }
  if (!prize.trim()) throw new TwitchGiveawayError("Le lot est obligatoire.");
  return prisma.$transaction(async (tx) => {
    if (await tx.twitchGiveaway.findFirst({ where: { status: "ACTIVE" } })) {
      throw new TwitchGiveawayError("Un giveaway est déjà en cours : tire-le ou annule-le d'abord.");
    }
    return tx.twitchGiveaway.create({ data: { keyword: cleanKeyword, prize: prize.trim().slice(0, 200) } });
  });
}

/** Inscrit un viewer (une seule fois). @returns `true` si l'inscription est nouvelle. */
export async function enterTwitchGiveaway(giveawayId: number, username: string): Promise<boolean> {
  const existing = await prisma.twitchGiveawayEntry.findUnique({
    where: { giveawayId_username: { giveawayId, username: username.toLowerCase() } },
  });
  if (existing) return false;
  try {
    await prisma.twitchGiveawayEntry.create({ data: { giveawayId, username: username.toLowerCase() } });
    return true;
  } catch {
    // Course entre deux messages simultanés du même viewer : la contrainte unique a déjà inscrit l'entrée.
    return false;
  }
}

/** Tire un gagnant au hasard parmi les inscrits et termine le giveaway. */
export async function drawTwitchGiveaway(giveawayId: number) {
  return prisma.$transaction(async (tx) => {
    const giveaway = await tx.twitchGiveaway.findUnique({ where: { id: giveawayId }, include: { entries: true } });
    if (!giveaway || giveaway.status !== "ACTIVE") throw new TwitchGiveawayError("Ce giveaway n'est plus actif.");
    if (giveaway.entries.length === 0) throw new TwitchGiveawayError("Personne n'est inscrit pour l'instant.");
    const winner = giveaway.entries[randomInt(giveaway.entries.length)];
    return tx.twitchGiveaway.update({
      where: { id: giveawayId },
      data: { status: "ENDED", winnerUsername: winner?.username ?? null, endedAt: new Date(), endAnnounced: false },
    });
  });
}

export async function cancelTwitchGiveaway(giveawayId: number) {
  const result = await prisma.twitchGiveaway.updateMany({
    where: { id: giveawayId, status: "ACTIVE" },
    data: { status: "CANCELLED", endedAt: new Date(), endAnnounced: false },
  });
  if (result.count === 0) throw new TwitchGiveawayError("Ce giveaway n'est plus actif.");
}

export async function listTwitchGiveawayHistory(limit = 20) {
  return prisma.twitchGiveaway.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { _count: { select: { entries: true } } },
  });
}

/** Giveaways dont le lancement ou la fin n'a pas encore été annoncé dans le chat. */
export async function getPendingTwitchGiveawayAnnouncements() {
  const [starts, ends] = await Promise.all([
    prisma.twitchGiveaway.findMany({ where: { status: "ACTIVE", startAnnounced: false } }),
    prisma.twitchGiveaway.findMany({ where: { status: { in: ["ENDED", "CANCELLED"] }, endAnnounced: false } }),
  ]);
  return { starts, ends };
}

export async function markTwitchGiveawayAnnounced(id: number, kind: "start" | "end"): Promise<void> {
  await prisma.twitchGiveaway.updateMany({
    where: { id },
    data: kind === "start" ? { startAnnounced: true } : { endAnnounced: true },
  });
}
