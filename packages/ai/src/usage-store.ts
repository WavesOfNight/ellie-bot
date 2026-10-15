import { claimAiCapNotice, getAiRepliesCount, recordAiUsage, type AiUsageDelta } from "@ellie/database";

/** Accès au compteur quotidien (`AiDailyUsage`). Injectable pour les tests. */
export interface UsageStore {
  getReplies(scope: string, date: string): Promise<number>;
  /** `true` uniquement la première fois de la journée. */
  claimCapNotice(scope: string, date: string): Promise<boolean>;
  record(scope: string, date: string, delta: AiUsageDelta): Promise<void>;
}

export const prismaUsageStore: UsageStore = {
  getReplies: getAiRepliesCount,
  claimCapNotice: claimAiCapNotice,
  record: recordAiUsage,
};
