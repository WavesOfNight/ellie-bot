/** Journalisation : jamais d'objet brut (qui pourrait contenir un token), toujours un contexte. */
export function logError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Ellie Twitch] ${context} : ${message}`);
}

export function logInfo(message: string): void {
  console.log(`[Ellie Twitch] ${message}`);
}

export function logWarn(message: string): void {
  console.warn(`[Ellie Twitch] ${message}`);
}
