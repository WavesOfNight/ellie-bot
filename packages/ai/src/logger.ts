export interface EllieLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/** Journal par défaut. Ne reçoit jamais de clé, d'en-tête ni de contenu complet de message. */
export const consoleLogger: EllieLogger = {
  info: (message) => console.log(`[Ellie IA] ${message}`),
  warn: (message) => console.warn(`[Ellie IA] ${message}`),
  error: (message) => console.error(`[Ellie IA] ${message}`),
};

export const silentLogger: EllieLogger = { info: () => {}, warn: () => {}, error: () => {} };
