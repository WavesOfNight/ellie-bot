import Anthropic from "@anthropic-ai/sdk";
import { atLeastLevel, findAutoModMatch, matchesInvite, STREAMER_NAME, type AutoModLevel } from "@ellie/database/shared";
import { getConfiguredClaudeClient, type EllieClaudeClient, type EllieRequest, type EllieResponse } from "./client.js";
import { buildUserPrompt, type HistoryEntry, type Platform } from "./context.js";
import { pickFallbackLine, type FallbackCategory } from "./fallback-lines.js";
import { consoleLogger, type EllieLogger } from "./logger.js";
import { buildSystemBlocks } from "./persona.js";
import {
  addUsage,
  DEFAULT_EFFORT,
  EMPTY_USAGE,
  estimateCostUsd,
  getModelInfo,
  isAllowedModel,
  isEffort,
  type Effort,
  type ModelId,
  type TokenUsage,
} from "./pricing.js";
import { DISCORD_MAX_LENGTH, sanitizeReply, TWITCH_MAX_LENGTH } from "./sanitize.js";

/** Active les replis côté serveur (`fallbacks: "default"`) sur les modèles qui le permettent. */
export const SERVER_SIDE_FALLBACKS_ENABLED = true;
export const SERVER_SIDE_FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** La réflexion (adaptative, toujours active) compte dans max_tokens : ne pas descendre sous ~1024. */
export const MAX_TOKENS = 1536;
export const MODERATION_RETRY_INSTRUCTION = "Reformule sans aucune grossièreté.";

export type ReplyCategory =
  | "ok"
  | "mention_vide"
  | "refus"
  | "moderation"
  | "erreur_api"
  | "cle_invalide"
  | "vide"
  | "modele_invalide"
  | "pas_de_cle";

export interface GenerateEllieReplyInput {
  platform: Platform;
  model: string;
  effort?: string;
  authorName: string;
  /** Texte du membre, mention du bot déjà retirée. */
  message: string;
  history?: readonly HistoryEntry[];
  referenced?: HistoryEntry | null;
  serverLore?: string;
  streamerName?: string;
  communityName?: string | null;
  /** Niveau du filtre de mots de la plateforme ; relevé au minimum à MEDIUM pour la sortie. */
  moderationLevel?: AutoModLevel;
  /** Préfixe des commandes Twitch, neutralisé dans la réponse. */
  commandPrefix?: string;
  /** Historique : fenêtre et nombre de messages (Discord : 20 min / contextMessages ; Twitch : 10 min / 8). */
  windowMinutes?: number;
  maxHistory?: number;
}

export interface EllieReplyResult {
  /** Texte prêt à envoyer (vide uniquement pour `pas_de_cle`). */
  text: string;
  category: ReplyCategory;
  model: string;
  usage: TokenUsage;
  costUsd: number;
  apiCalls: number;
  durationMs: number;
  /** Message d'erreur lisible (affiché dans la boîte de test du panel), sans aucun secret. */
  errorMessage?: string;
}

export interface GenerateDeps {
  /** Client injecté (tests). `undefined` = client construit depuis la clé du panel ; `null` = aucune clé. */
  client?: EllieClaudeClient | null;
  now?: () => Date;
  random?: () => number;
  logger?: EllieLogger;
}

/** Construit la requête. Haiku 5.5 n'a pas de repli serveur : ni `betas` ni `fallbacks` pour lui. */
export function buildRequest(
  model: ModelId,
  options: { system: Anthropic.Beta.Messages.BetaTextBlockParam[]; userPrompt: string; effort: Effort },
): EllieRequest {
  const request: EllieRequest = {
    model,
    max_tokens: MAX_TOKENS,
    system: options.system,
    messages: [{ role: "user", content: options.userPrompt }],
    output_config: { effort: options.effort },
  };
  if (SERVER_SIDE_FALLBACKS_ENABLED && getModelInfo(model).serverFallback) {
    request.betas = [SERVER_SIDE_FALLBACK_BETA];
    request.fallbacks = "default";
  }
  return request;
}

function usageFrom(response: EllieResponse): TokenUsage {
  return {
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}

/** Concatène uniquement les blocs texte (la réflexion et les blocs de repli ne sont jamais montrés). */
export function extractText(response: EllieResponse): string {
  return response.content
    .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

type CallOutcome =
  | { kind: "ok"; text: string; usage: TokenUsage }
  | { kind: "fallback"; fallback: FallbackCategory; category: ReplyCategory; usage: TokenUsage; errorMessage: string };

/** Traduit une erreur du SDK en catégorie, sans jamais journaliser l'objet brut (en-têtes, clé). */
function describeError(error: unknown): { category: ReplyCategory; message: string } {
  if (error instanceof Anthropic.AuthenticationError) {
    return { category: "cle_invalide", message: "Clé API Anthropic invalide (401)." };
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return { category: "erreur_api", message: "Accès refusé par l'API Anthropic (403) : vérifie les droits de la clé." };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { category: "erreur_api", message: "Limite de débit de l'API atteinte (429). Réessaie dans un moment." };
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { category: "erreur_api", message: "Délai de réponse de l'API dépassé." };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { category: "erreur_api", message: "Connexion à l'API Anthropic impossible." };
  }
  if (error instanceof Anthropic.InternalServerError) {
    return { category: "erreur_api", message: `Erreur temporaire côté Anthropic (${error.status}).` };
  }
  if (error instanceof Anthropic.BadRequestError) {
    return { category: "erreur_api", message: `Requête refusée par l'API (400) : ${error.message.slice(0, 200)}` };
  }
  if (error instanceof Anthropic.APIError) {
    return { category: "erreur_api", message: `Erreur de l'API Anthropic (${error.status ?? "?"}).` };
  }
  return { category: "erreur_api", message: "Erreur inattendue lors de l'appel à l'API." };
}

async function callClaude(client: EllieClaudeClient, request: EllieRequest, logger: EllieLogger): Promise<CallOutcome> {
  let response: EllieResponse;
  try {
    response = await client.createMessage(request);
  } catch (error) {
    const { category, message } = describeError(error);
    if (category === "cle_invalide") logger.error("clé API Anthropic invalide : mets-la à jour dans le panel (Paramètres).");
    else logger.error(`appel à l'API échoué — ${message}`);
    return { kind: "fallback", fallback: "erreur", category, usage: EMPTY_USAGE, errorMessage: message };
  }

  const usage = usageFrom(response);
  const text = extractText(response);
  switch (response.stop_reason) {
    case "end_turn":
      return { kind: "ok", text, usage };
    case "max_tokens":
      if (text) return { kind: "ok", text, usage };
      return { kind: "fallback", fallback: "erreur", category: "vide", usage, errorMessage: "Réponse vide (limite de tokens atteinte)." };
    case "refusal":
      logger.warn(`requête refusée par le modèle (catégorie : ${response.stop_details?.category ?? "inconnue"}).`);
      return { kind: "fallback", fallback: "refus", category: "refus", usage, errorMessage: "Le modèle a refusé de répondre." };
    default:
      return {
        kind: "fallback",
        fallback: "erreur",
        category: "erreur_api",
        usage,
        errorMessage: `Fin de réponse inattendue (${String(response.stop_reason)}).`,
      };
  }
}

/**
 * Point d'entrée unique (Discord, Twitch, boîte de test du panel) : génère une réponse d'Ellie,
 * la nettoie et la modère. Ne lève jamais d'exception : en cas de problème, renvoie une réplique
 * de secours dans le personnage.
 */
export async function generateEllieReply(input: GenerateEllieReplyInput, deps: GenerateDeps = {}): Promise<EllieReplyResult> {
  const started = Date.now();
  const now = deps.now ?? (() => new Date());
  const random = deps.random ?? Math.random;
  const logger = deps.logger ?? consoleLogger;
  let usage: TokenUsage = EMPTY_USAGE;
  let apiCalls = 0;
  let modelId: ModelId | null = null;

  const finish = (text: string, category: ReplyCategory, errorMessage?: string): EllieReplyResult => ({
    text,
    category,
    model: modelId ?? input.model,
    usage,
    costUsd: modelId ? estimateCostUsd(usage, modelId) : 0,
    apiCalls,
    durationMs: Date.now() - started,
    ...(errorMessage ? { errorMessage } : {}),
  });
  const fallback = (category: FallbackCategory, resultCategory: ReplyCategory, errorMessage?: string) =>
    finish(pickFallbackLine(category, random), resultCategory, errorMessage);

  try {
    const message = input.message.trim();
    if (!message) return fallback("mention_vide", "mention_vide");

    if (!isAllowedModel(input.model)) {
      logger.error(`modèle refusé (hors liste blanche) : ${input.model.slice(0, 60)}`);
      return fallback("erreur", "modele_invalide", "Modèle non autorisé.");
    }
    modelId = input.model;
    const effort: Effort = isEffort(input.effort) ? input.effort : DEFAULT_EFFORT;

    const client = deps.client !== undefined ? deps.client : await getConfiguredClaudeClient();
    if (!client) return finish("", "pas_de_cle", "Aucune clé API Anthropic n'est configurée (Paramètres).");

    const system = buildSystemBlocks({
      streamerName: input.streamerName ?? STREAMER_NAME,
      communityName: input.communityName ?? null,
      serverLore: input.serverLore ?? "",
    });
    const isTwitch = input.platform === "twitch";
    const promptBase = {
      platform: input.platform,
      authorName: input.authorName,
      message,
      history: input.history ?? [],
      referenced: input.referenced ?? null,
      now: now(),
      windowMinutes: input.windowMinutes ?? (isTwitch ? 10 : 20),
      maxEntries: input.maxHistory ?? (isTwitch ? 8 : 10),
    };
    const moderationLevel = atLeastLevel(input.moderationLevel ?? "MEDIUM", "MEDIUM");

    for (let attempt = 0; attempt < 2; attempt++) {
      const userPrompt = buildUserPrompt({
        ...promptBase,
        ...(attempt > 0 ? { extraInstruction: MODERATION_RETRY_INSTRUCTION } : {}),
      });
      const outcome = await callClaude(client, buildRequest(modelId, { system, userPrompt, effort }), logger);
      apiCalls++;
      usage = addUsage(usage, outcome.usage);
      if (outcome.kind === "fallback") return fallback(outcome.fallback, outcome.category, outcome.errorMessage);

      const clean = sanitizeReply(outcome.text, {
        platform: input.platform,
        maxLength: isTwitch ? TWITCH_MAX_LENGTH : DISCORD_MAX_LENGTH,
        commandPrefix: input.commandPrefix ?? "!",
      });
      if (!clean) return fallback("erreur", "vide", "Réponse vide après nettoyage.");

      const flagged = findAutoModMatch(moderationLevel, clean) !== null || matchesInvite(clean);
      if (!flagged) return finish(clean, "ok");
      if (attempt === 0) logger.warn("réponse filtrée par la modération : nouvelle génération demandée.");
    }
    return fallback("refus", "moderation", "Réponse bloquée par la modération après relance.");
  } catch (error) {
    logger.error(`erreur interne : ${error instanceof Error ? error.message.slice(0, 200) : "inconnue"}`);
    return fallback("erreur", "erreur_api", "Erreur interne.");
  }
}
