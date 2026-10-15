/**
 * Journalisation des erreurs : message et pile d'appels, jamais d'objet brut (qui pourrait contenir
 * des en-têtes ou un token). Le contexte précise toujours où l'erreur s'est produite (serveur, salon…).
 */
export function logError(context: string, error: unknown): void {
  if (error instanceof Error) {
    const code = "code" in error ? ` [code ${String((error as { code: unknown }).code)}]` : "";
    console.error(`[Ellie] ${context} : ${error.message}${code}`);
    if (error.stack && process.env.NODE_ENV !== "production") console.error(error.stack.split("\n").slice(1, 6).join("\n"));
  } else {
    console.error(`[Ellie] ${context} : ${String(error)}`);
  }
}

export function logInfo(message: string): void {
  console.log(`[Ellie] ${message}`);
}

export function logWarn(message: string): void {
  console.warn(`[Ellie] ${message}`);
}

/** Code d'erreur de l'API Discord (ex. 50013 = permissions manquantes), si disponible. */
export function discordErrorCode(error: unknown): number | null {
  if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "number") {
    return (error as { code: number }).code;
  }
  return null;
}

export const DISCORD_ERRORS = {
  UNKNOWN_CHANNEL: 10003,
  UNKNOWN_MESSAGE: 10008,
  UNKNOWN_INVITE: 10006,
  UNKNOWN_MEMBER: 10007,
  UNKNOWN_USER: 10013,
  UNKNOWN_BAN: 10026,
  MISSING_ACCESS: 50001,
  CANNOT_DM: 50007,
  MISSING_PERMISSIONS: 50013,
} as const;
