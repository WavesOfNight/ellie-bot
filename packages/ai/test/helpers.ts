import type { AiUsageDelta } from "@ellie/database";
import type { EllieClaudeClient, EllieRequest, EllieResponse } from "../src/client.js";
import { silentLogger } from "../src/logger.js";
import type { UsageStore } from "../src/usage-store.js";

export interface FakeResponseOptions {
  text?: string;
  stopReason?: string;
  refusalCategory?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
}

/** Réponse simulée de l'API (même forme qu'un BetaMessage). */
export function fakeResponse(options: FakeResponseOptions = {}): EllieResponse {
  const content: unknown[] = [{ type: "thinking", thinking: "", signature: "sig" }];
  if (options.text !== undefined) content.push({ type: "text", text: options.text, citations: null });
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason: options.stopReason ?? "end_turn",
    stop_sequence: null,
    stop_details:
      options.stopReason === "refusal" ? { type: "refusal", category: options.refusalCategory ?? null, explanation: null } : null,
    usage: {
      input_tokens: options.inputTokens ?? 100,
      output_tokens: options.outputTokens ?? 20,
      cache_read_input_tokens: options.cacheReadTokens ?? 0,
      cache_creation_input_tokens: 0,
    },
  } as unknown as EllieResponse;
}

type Step = EllieResponse | Error | (() => EllieResponse | Promise<EllieResponse>);

/** Faux client Claude : enregistre les requêtes et rejoue une suite de réponses ou d'erreurs. */
export class FakeClaudeClient implements EllieClaudeClient {
  readonly requests: EllieRequest[] = [];
  private readonly steps: Step[];

  constructor(...steps: Step[]) {
    this.steps = steps;
  }

  async createMessage(request: EllieRequest): Promise<EllieResponse> {
    this.requests.push(structuredClone(request));
    const step = this.steps.length > 1 ? this.steps.shift() : this.steps[0];
    if (step === undefined) throw new Error("Aucune réponse simulée.");
    if (step instanceof Error) throw step;
    return typeof step === "function" ? step() : step;
  }
}

/** Compteur quotidien en mémoire. */
export class MemoryUsageStore implements UsageStore {
  replies = new Map<string, number>();
  notices = new Set<string>();
  recorded: Array<{ scope: string; date: string; delta: AiUsageDelta }> = [];

  async getReplies(scope: string, date: string): Promise<number> {
    return this.replies.get(`${scope}:${date}`) ?? 0;
  }

  async claimCapNotice(scope: string, date: string): Promise<boolean> {
    const key = `${scope}:${date}`;
    if (this.notices.has(key)) return false;
    this.notices.add(key);
    return true;
  }

  async record(scope: string, date: string, delta: AiUsageDelta): Promise<void> {
    this.recorded.push({ scope, date, delta });
    const key = `${scope}:${date}`;
    this.replies.set(key, (this.replies.get(key) ?? 0) + delta.replies);
  }
}

export const quietDeps = { logger: silentLogger, random: () => 0 };
