/**
 * Modèles autorisés (liste blanche) et tarifs indicatifs, en USD par million de tokens.
 * Ce sont les seuls chiffres à tenir à jour : https://platform.claude.com/docs/en/about-claude/pricing
 * Tarifs vérifiés en octobre 2026. Écriture en cache = 1,25 × le prix d'entrée (TTL de 5 minutes).
 */

export interface ModelInfo {
  id: string;
  label: string;
  description: string;
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  cacheReadUsdPerMTok: number;
  cacheWriteUsdPerMTok: number;
  /** Repli côté serveur (`fallbacks: "default"`) disponible pour ce modèle. */
  serverFallback: boolean;
}

export const MODELS = [
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    description: "Le plus capable — meilleure tenue du personnage (par défaut)",
    inputUsdPerMTok: 4,
    outputUsdPerMTok: 20,
    cacheReadUsdPerMTok: 0.2,
    cacheWriteUsdPerMTok: 5,
    serverFallback: true,
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    description: "Bon compromis qualité / prix",
    inputUsdPerMTok: 2,
    outputUsdPerMTok: 10,
    cacheReadUsdPerMTok: 0.2,
    cacheWriteUsdPerMTok: 2.5,
    serverFallback: true,
  },
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    description: "Le moins cher (tarif valable jusqu'à 100 K tokens de prompt)",
    inputUsdPerMTok: 0.1,
    outputUsdPerMTok: 0.5,
    cacheReadUsdPerMTok: 0.01,
    cacheWriteUsdPerMTok: 0.125,
    serverFallback: false,
  },
] as const satisfies readonly ModelInfo[];

export type ModelId = (typeof MODELS)[number]["id"];

export const DEFAULT_MODEL: ModelId = "claude-opus-5-5";

export const EFFORTS = ["low", "medium", "high"] as const;
export type Effort = (typeof EFFORTS)[number];
export const DEFAULT_EFFORT: Effort = "low";

export const EFFORT_LABELS: Record<Effort, string> = {
  low: "Faible — réponses rapides et économiques (recommandé pour le chat)",
  medium: "Moyen — un peu plus réfléchi, plus lent et plus cher",
  high: "Élevé — le plus réfléchi, le plus lent et le plus cher",
};

export function isAllowedModel(value: unknown): value is ModelId {
  return typeof value === "string" && MODELS.some((model) => model.id === value);
}

export function isEffort(value: unknown): value is Effort {
  return typeof value === "string" && (EFFORTS as readonly string[]).includes(value);
}

export function getModelInfo(id: ModelId): ModelInfo {
  return MODELS.find((model) => model.id === id) as ModelInfo;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const EMPTY_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

/**
 * Coût indicatif en USD. Si le serveur a basculé sur un modèle de repli, son tarif peut différer :
 * c'est une estimation, pas une facture.
 */
export function estimateCostUsd(usage: TokenUsage, modelId: ModelId): number {
  const model = getModelInfo(modelId);
  return (
    (usage.inputTokens * model.inputUsdPerMTok +
      usage.outputTokens * model.outputUsdPerMTok +
      usage.cacheReadTokens * model.cacheReadUsdPerMTok +
      usage.cacheWriteTokens * model.cacheWriteUsdPerMTok) /
    1_000_000
  );
}

export function formatUsd(amount: number): string {
  if (amount === 0) return "0 $";
  if (amount < 0.01) return `${amount.toFixed(4).replace(".", ",")} $`;
  return `${amount.toFixed(2).replace(".", ",")} $`;
}
