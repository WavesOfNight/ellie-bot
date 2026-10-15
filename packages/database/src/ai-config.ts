import type { GuildAiConfig } from "@prisma/client";
import { prisma } from "./client.js";
import { lastParisDates } from "./dates.js";
import { splitIds } from "./panels.js";

export const AI_DEFAULT_MODEL = "claude-opus-5-5";
export const AI_EFFORTS = ["low", "medium", "high"] as const;
export type AiEffort = (typeof AI_EFFORTS)[number];

/** Bornes appliquées côté serveur (panel et bot). */
export const AI_CONFIG_BOUNDS = {
  userCooldownSeconds: { min: 5, max: 300 },
  channelMaxPerMinute: { min: 1, max: 30 },
  dailyReplyCap: { min: 10, max: 5000 },
  contextMessages: { min: 0, max: 20 },
  serverLoreMaxLength: 1500,
} as const;

export const TWITCH_AI_BOUNDS = {
  aiUserCooldownSeconds: { min: 5, max: 600 },
  aiGlobalCooldownSeconds: { min: 0, max: 300 },
  aiDailyReplyCap: { min: 10, max: 5000 },
} as const;

export interface GuildAiSettings {
  guildId: string;
  enabled: boolean;
  model: string;
  effort: AiEffort;
  allowedChannelIds: string[];
  blockedUserIds: string[];
  replyToReplies: boolean;
  keywordTrigger: boolean;
  userCooldownSeconds: number;
  channelMaxPerMinute: number;
  dailyReplyCap: number;
  contextMessages: number;
  serverLore: string;
}

/** Liste d'identifiants Discord saisie dans le panel (séparés par des virgules, espaces ou retours à la ligne). */
export const parseIdList = splitIds;

export function clampInt(value: number, bounds: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return bounds.min;
  return Math.min(bounds.max, Math.max(bounds.min, Math.trunc(value)));
}

export function isAiEffort(value: unknown): value is AiEffort {
  return typeof value === "string" && (AI_EFFORTS as readonly string[]).includes(value);
}

function toSettings(guildId: string, row: GuildAiConfig | null): GuildAiSettings {
  return {
    guildId,
    enabled: row?.enabled ?? false,
    model: row?.model ?? AI_DEFAULT_MODEL,
    effort: isAiEffort(row?.effort) ? row.effort : "low",
    allowedChannelIds: parseIdList(row?.allowedChannelIds),
    blockedUserIds: parseIdList(row?.blockedUserIds),
    replyToReplies: row?.replyToReplies ?? true,
    keywordTrigger: row?.keywordTrigger ?? false,
    userCooldownSeconds: clampInt(row?.userCooldownSeconds ?? 20, AI_CONFIG_BOUNDS.userCooldownSeconds),
    channelMaxPerMinute: clampInt(row?.channelMaxPerMinute ?? 6, AI_CONFIG_BOUNDS.channelMaxPerMinute),
    dailyReplyCap: clampInt(row?.dailyReplyCap ?? 200, AI_CONFIG_BOUNDS.dailyReplyCap),
    contextMessages: clampInt(row?.contextMessages ?? 10, AI_CONFIG_BOUNDS.contextMessages),
    serverLore: (row?.serverLore ?? "").slice(0, AI_CONFIG_BOUNDS.serverLoreMaxLength),
  };
}

/** Configuration IA d'un serveur (valeurs par défaut si rien n'est enregistré : module désactivé). */
export async function getGuildAiSettings(guildId: string): Promise<GuildAiSettings> {
  return toSettings(guildId, await prisma.guildAiConfig.findUnique({ where: { guildId } }));
}

export async function saveGuildAiSettings(settings: GuildAiSettings): Promise<void> {
  const data = {
    enabled: settings.enabled,
    model: settings.model,
    effort: settings.effort,
    allowedChannelIds: settings.allowedChannelIds.join(","),
    blockedUserIds: settings.blockedUserIds.join(","),
    replyToReplies: settings.replyToReplies,
    keywordTrigger: settings.keywordTrigger,
    userCooldownSeconds: clampInt(settings.userCooldownSeconds, AI_CONFIG_BOUNDS.userCooldownSeconds),
    channelMaxPerMinute: clampInt(settings.channelMaxPerMinute, AI_CONFIG_BOUNDS.channelMaxPerMinute),
    dailyReplyCap: clampInt(settings.dailyReplyCap, AI_CONFIG_BOUNDS.dailyReplyCap),
    contextMessages: clampInt(settings.contextMessages, AI_CONFIG_BOUNDS.contextMessages),
    serverLore: settings.serverLore.slice(0, AI_CONFIG_BOUNDS.serverLoreMaxLength),
  };
  await prisma.guild.upsert({ where: { id: settings.guildId }, create: { id: settings.guildId }, update: {} });
  await prisma.guildAiConfig.upsert({
    where: { guildId: settings.guildId },
    create: { guildId: settings.guildId, ...data },
    update: data,
  });
}

// ---------------------------------------------------------------------------
// Consommation quotidienne
// ---------------------------------------------------------------------------

export const TWITCH_AI_SCOPE = "TWITCH";

export interface AiUsageDelta {
  replies: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicroUsd: number;
}

export async function getAiRepliesCount(scope: string, date: string): Promise<number> {
  const row = await prisma.aiDailyUsage.findUnique({ where: { scope_date: { scope, date } }, select: { replies: true } });
  return row?.replies ?? 0;
}

export async function recordAiUsage(scope: string, date: string, delta: AiUsageDelta): Promise<void> {
  const increments = {
    replies: { increment: delta.replies },
    inputTokens: { increment: delta.inputTokens },
    outputTokens: { increment: delta.outputTokens },
    cacheReadTokens: { increment: delta.cacheReadTokens },
    cacheWriteTokens: { increment: delta.cacheWriteTokens },
    costMicroUsd: { increment: delta.costMicroUsd },
  };
  await prisma.aiDailyUsage.upsert({
    where: { scope_date: { scope, date } },
    create: { scope, date, ...delta },
    update: increments,
  });
}

/**
 * Réserve l'envoi de la réplique « plafond atteint » pour la journée.
 * @returns `true` uniquement pour le premier appel du jour (opération atomique).
 */
export async function claimAiCapNotice(scope: string, date: string): Promise<boolean> {
  await prisma.aiDailyUsage.upsert({
    where: { scope_date: { scope, date } },
    create: { scope, date },
    update: {},
  });
  const result = await prisma.aiDailyUsage.updateMany({
    where: { scope, date, capNoticeSent: false },
    data: { capNoticeSent: true },
  });
  return result.count === 1;
}

export interface AiUsageDay {
  date: string;
  replies: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

/** Consommation des `days` derniers jours (jours sans activité inclus, à zéro). */
export async function getAiUsageHistory(scope: string, days = 7, now = new Date()): Promise<AiUsageDay[]> {
  const dates = lastParisDates(days, now);
  const rows = await prisma.aiDailyUsage.findMany({ where: { scope, date: { in: dates } } });
  return dates.map((date) => {
    const row = rows.find((candidate) => candidate.date === date);
    return {
      date,
      replies: row?.replies ?? 0,
      inputTokens: row?.inputTokens ?? 0,
      outputTokens: row?.outputTokens ?? 0,
      cacheReadTokens: row?.cacheReadTokens ?? 0,
      cacheWriteTokens: row?.cacheWriteTokens ?? 0,
      costUsd: (row?.costMicroUsd ?? 0) / 1_000_000,
    };
  });
}
