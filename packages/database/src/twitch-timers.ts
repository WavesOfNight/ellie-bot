import { prisma } from "./client.js";

export const TWITCH_TIMER_BOUNDS = {
  intervalMinutes: { min: 1, max: 1440 },
  minMessages: { min: 0, max: 1000 },
  messageMaxLength: 450,
} as const;

export async function listTwitchTimers() {
  return prisma.twitchTimer.findMany({ orderBy: { createdAt: "asc" } });
}

export async function listEnabledTwitchTimers() {
  return prisma.twitchTimer.findMany({ where: { enabled: true }, orderBy: { createdAt: "asc" } });
}

export async function createTwitchTimer(data: {
  name: string;
  message: string;
  intervalMinutes: number;
  minMessages: number;
  enabled: boolean;
}) {
  return prisma.twitchTimer.create({ data });
}

export async function updateTwitchTimer(
  id: number,
  data: Partial<{ name: string; message: string; intervalMinutes: number; minMessages: number; enabled: boolean }>,
) {
  return prisma.twitchTimer.update({ where: { id }, data });
}

export async function deleteTwitchTimer(id: number): Promise<void> {
  await prisma.twitchTimer.deleteMany({ where: { id } });
}

export async function markTwitchTimerSent(id: number, at = new Date()): Promise<void> {
  await prisma.twitchTimer.updateMany({ where: { id }, data: { lastSentAt: at } });
}
