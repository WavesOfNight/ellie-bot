import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey } from "@ellie/database";

export type EllieRequest = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
export type EllieResponse = Anthropic.Beta.Messages.BetaMessage;

/**
 * Interface minimale du client Claude utilisée par Ellie : elle permet d'injecter un faux
 * client dans les tests (aucun appel réseau, aucune dépense).
 */
export interface EllieClaudeClient {
  createMessage(request: EllieRequest): Promise<EllieResponse>;
}

/** Client officiel @anthropic-ai/sdk (timeout en millisecondes dans le SDK TypeScript). */
export function createClaudeClient(apiKey: string): EllieClaudeClient {
  const anthropic = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 2 });
  return { createMessage: (request) => anthropic.beta.messages.create(request) };
}

const KEY_CACHE_MS = 60_000;
let cache: { key: string | null; client: EllieClaudeClient | null; fetchedAt: number } | null = null;

/**
 * Client construit à partir de la clé stockée (chiffrée) dans le panel. La clé est relue au plus
 * toutes les 60 s, et le client est recréé quand elle change. `null` si aucune clé n'est configurée.
 */
export async function getConfiguredClaudeClient(now = Date.now()): Promise<EllieClaudeClient | null> {
  if (cache && now - cache.fetchedAt < KEY_CACHE_MS) return cache.client;
  const key = await getAnthropicApiKey();
  if (cache && cache.key === key) {
    cache.fetchedAt = now;
    return cache.client;
  }
  cache = { key, client: key ? createClaudeClient(key) : null, fetchedAt: now };
  return cache.client;
}

/** À appeler après une modification de la clé dans le panel (prise en compte immédiate). */
export function resetClaudeClientCache(): void {
  cache = null;
}

export async function isApiKeyConfigured(): Promise<boolean> {
  return (await getConfiguredClaudeClient()) !== null;
}
