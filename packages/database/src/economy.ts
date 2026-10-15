import { prisma } from "./client.js";

/**
 * Économie (pièces). Les pièces ne proviennent que des actions ADD_CURRENCY / REMOVE_CURRENCY
 * des commandes personnalisées et des transferts /pay entre membres. Un solde n'est jamais négatif.
 */

export class InsufficientFundsError extends Error {
  constructor(public readonly balance: number) {
    super("Solde insuffisant.");
    this.name = "InsufficientFundsError";
  }
}

export async function getBalance(guildId: string, userId: string): Promise<number> {
  const member = await prisma.member.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: { balance: true },
  });
  return member?.balance ?? 0;
}

/** Ajoute (ou retire si négatif) des pièces, avec un plancher à 0. Renvoie le nouveau solde. */
export async function adjustBalance(guildId: string, userId: string, delta: number): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const member = await tx.member.upsert({
      where: { guildId_userId: { guildId, userId } },
      create: { guildId, userId },
      update: {},
    });
    const balance = Math.max(0, member.balance + Math.trunc(delta));
    await tx.member.update({ where: { id: member.id }, data: { balance } });
    return balance;
  });
}

/** Transfert atomique entre deux membres. Lève `InsufficientFundsError` si le solde ne suffit pas. */
export async function transferBalance(
  guildId: string,
  fromUserId: string,
  toUserId: string,
  amount: number,
): Promise<{ fromBalance: number; toBalance: number }> {
  if (!Number.isInteger(amount) || amount <= 0) throw new RangeError("Le montant doit être un entier positif.");
  if (fromUserId === toUserId) throw new RangeError("Impossible de se transférer des pièces à soi-même.");

  return prisma.$transaction(async (tx) => {
    const from = await tx.member.findUnique({ where: { guildId_userId: { guildId, userId: fromUserId } } });
    const fromBalance = from?.balance ?? 0;
    if (!from || fromBalance < amount) throw new InsufficientFundsError(fromBalance);

    const debited = await tx.member.updateMany({
      where: { id: from.id, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (debited.count !== 1) throw new InsufficientFundsError(fromBalance);

    const to = await tx.member.upsert({
      where: { guildId_userId: { guildId, userId: toUserId } },
      create: { guildId, userId: toUserId, balance: amount },
      update: { balance: { increment: amount } },
    });
    return { fromBalance: fromBalance - amount, toBalance: to.balance };
  });
}

export async function getEconomyLeaderboard(guildId: string, limit = 10) {
  return prisma.member.findMany({
    where: { guildId, balance: { gt: 0 } },
    orderBy: [{ balance: "desc" }, { id: "asc" }],
    take: limit,
    select: { userId: true, balance: true },
  });
}
