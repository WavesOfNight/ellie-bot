import { parisDateString } from "@ellie/database";
import { getConfiguredClaudeClient, type EllieClaudeClient } from "./client.js";
import { pickFallbackLine } from "./fallback-lines.js";
import { BUSY, ConcurrencyLimiter, CooldownTracker, SlidingWindowLimiter } from "./limits.js";
import { consoleLogger, type EllieLogger } from "./logger.js";
import { generateEllieReply, type EllieReplyResult, type GenerateEllieReplyInput, type ReplyCategory } from "./reply.js";
import { prismaUsageStore, type UsageStore } from "./usage-store.js";

export interface ResponderLimits {
  userCooldownSeconds: number;
  /** Discord : réponses maximum par minute et par salon. */
  channelMaxPerMinute?: number;
  /** Twitch : cooldown global entre deux réponses. */
  globalCooldownSeconds?: number;
  dailyReplyCap: number;
}

export interface EllieRespondRequest {
  /** ID du serveur Discord, ou "TWITCH". */
  scope: string;
  userKey: string;
  channelKey?: string;
  limits: ResponderLimits;
  /** Discord peut réagir (⏳, 💤) ; Twitch reste silencieux. */
  canReact: boolean;
  /** Contexte de journalisation (IDs du serveur et du salon), jamais de contenu. */
  logContext: string;
  input: GenerateEllieReplyInput;
  /** Appelé juste avant la génération (ex. indicateur « en train d'écrire » sur Discord). */
  onGenerate?: () => void;
  /**
   * Twitch : en cas de panne technique (API, clé, réponse vide), rester silencieuse plutôt que de
   * publier une réplique « bug » dans le chat. L'erreur est journalisée.
   */
  silentOnError?: boolean;
}

export type EllieAction =
  | { kind: "reply"; text: string; result: EllieReplyResult | null }
  | { kind: "react"; emoji: "⏳" | "💤" }
  | { kind: "silent"; reason: "pas_de_cle" | "cooldown" | "plafond" | "occupe" | "erreur" };

export interface ResponderDeps {
  store?: UsageStore;
  getClient?: () => Promise<EllieClaudeClient | null>;
  now?: () => Date;
  random?: () => number;
  logger?: EllieLogger;
  maxConcurrent?: number;
  queueTimeoutMs?: number;
}

const NO_KEY_WARNING_INTERVAL_MS = 10 * 60_000;
/** Pannes techniques : la réplique de secours parle de « bug », sans rapport avec le message. */
const TECHNICAL_FAILURES: ReadonlySet<ReplyCategory> = new Set(["erreur_api", "cle_invalide", "vide", "modele_invalide"]);

/**
 * Orchestration commune à Discord et Twitch : cooldowns, plafond quotidien, concurrence,
 * appel à `generateEllieReply`, puis comptabilisation de la consommation.
 */
export class EllieResponder {
  private readonly store: UsageStore;
  private readonly getClient: () => Promise<EllieClaudeClient | null>;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly logger: EllieLogger;
  private readonly concurrency: ConcurrencyLimiter;
  private readonly userCooldowns = new CooldownTracker();
  private readonly globalCooldowns = new CooldownTracker();
  private readonly channelLimiter = new SlidingWindowLimiter(60_000);
  private lastNoKeyWarning = 0;

  constructor(deps: ResponderDeps = {}) {
    this.store = deps.store ?? prismaUsageStore;
    this.getClient = deps.getClient ?? (() => getConfiguredClaudeClient());
    this.now = deps.now ?? (() => new Date());
    this.random = deps.random ?? Math.random;
    this.logger = deps.logger ?? consoleLogger;
    this.concurrency = new ConcurrencyLimiter(deps.maxConcurrent ?? 3, deps.queueTimeoutMs ?? 30_000);
  }

  async respond(request: EllieRespondRequest): Promise<EllieAction> {
    const now = this.now();
    const nowMs = now.getTime();
    const client = await this.getClient();
    if (!client) {
      if (nowMs - this.lastNoKeyWarning > NO_KEY_WARNING_INTERVAL_MS) {
        this.lastNoKeyWarning = nowMs;
        this.logger.warn("aucune clé API Anthropic configurée : le module Ellie reste inactif.");
      }
      return { kind: "silent", reason: "pas_de_cle" };
    }

    const { limits } = request;
    if (this.userCooldowns.isActive(request.userKey, limits.userCooldownSeconds * 1000, nowMs)) {
      return this.throttled(request, () => this.userCooldowns.claimNotification(request.userKey));
    }
    if (
      request.channelKey &&
      limits.channelMaxPerMinute &&
      this.channelLimiter.isLimited(request.channelKey, limits.channelMaxPerMinute, nowMs)
    ) {
      const channelKey = request.channelKey;
      return this.throttled(request, () => this.channelLimiter.claimNotification(channelKey, nowMs));
    }
    if (limits.globalCooldownSeconds && this.globalCooldowns.isActive(request.scope, limits.globalCooldownSeconds * 1000, nowMs)) {
      return { kind: "silent", reason: "cooldown" };
    }

    const date = parisDateString(now);
    const replies = await this.store.getReplies(request.scope, date);
    if (replies >= limits.dailyReplyCap) {
      if (await this.store.claimCapNotice(request.scope, date)) {
        this.logger.info(`${request.logContext} résultat=plafond (${limits.dailyReplyCap} réponses aujourd'hui)`);
        return { kind: "reply", text: pickFallbackLine("plafond", this.random), result: null };
      }
      return request.canReact ? { kind: "react", emoji: "💤" } : { kind: "silent", reason: "plafond" };
    }

    this.userCooldowns.start(request.userKey, nowMs);
    if (request.channelKey) this.channelLimiter.hit(request.channelKey, nowMs);
    if (limits.globalCooldownSeconds) this.globalCooldowns.start(request.scope, nowMs);

    const result = await this.concurrency.run(() => {
      request.onGenerate?.();
      return generateEllieReply(request.input, { client, now: this.now, random: this.random, logger: this.logger });
    });
    if (result === BUSY) {
      this.logger.warn(`${request.logContext} résultat=occupe (file d'attente pleine)`);
      return { kind: "silent", reason: "occupe" };
    }
    if (result.category === "pas_de_cle" || !result.text) return { kind: "silent", reason: "pas_de_cle" };
    const silenced = Boolean(request.silentOnError) && TECHNICAL_FAILURES.has(result.category);

    if (result.apiCalls > 0) {
      await this.store.record(request.scope, date, {
        replies: silenced ? 0 : 1,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cacheReadTokens: result.usage.cacheReadTokens,
        cacheWriteTokens: result.usage.cacheWriteTokens,
        costMicroUsd: Math.round(result.costUsd * 1_000_000),
      });
    }
    this.logger.info(
      `${request.logContext} modèle=${result.model} durée=${result.durationMs}ms appels=${result.apiCalls} ` +
        `entrée=${result.usage.inputTokens} sortie=${result.usage.outputTokens} cache_lu=${result.usage.cacheReadTokens} ` +
        `cache_écrit=${result.usage.cacheWriteTokens} résultat=${result.category} ` +
        `longueur_message=${request.input.message.length} longueur_réponse=${result.text.length}${silenced ? " envoi=aucun (panne technique)" : ""}`,
    );
    if (silenced) return { kind: "silent", reason: "erreur" };
    return { kind: "reply", text: result.text, result };
  }

  private throttled(request: EllieRespondRequest, claim: () => boolean): EllieAction {
    if (request.canReact && claim()) return { kind: "react", emoji: "⏳" };
    return { kind: "silent", reason: "cooldown" };
  }
}
