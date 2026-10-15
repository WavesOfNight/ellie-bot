/** Calculs de niveaux purs (sans base de données), partagés par Discord, Twitch et le panel. */

export const MAX_LEVEL = 50;
export const XP_COOLDOWN_MS = 60_000;
export const XP_MIN_GAIN = 15;
export const XP_MAX_GAIN = 25;

/** XP nécessaire pour passer du niveau `level` au niveau `level + 1`. */
export function xpToNextLevel(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

export interface LevelProgress {
  level: number;
  /** XP accumulée dans le niveau courant. */
  current: number;
  /** XP requise pour le niveau suivant (`null` au niveau maximum). */
  required: number | null;
}

/** Convertit une XP totale cumulée en niveau + progression. */
export function levelProgress(totalXp: number): LevelProgress {
  let level = 0;
  let remaining = Math.max(0, Math.floor(totalXp));
  while (level < MAX_LEVEL && remaining >= xpToNextLevel(level)) {
    remaining -= xpToNextLevel(level);
    level++;
  }
  return { level, current: remaining, required: level >= MAX_LEVEL ? null : xpToNextLevel(level) };
}

/** Gain d'XP aléatoire pour un message (15 à 25 inclus). */
export function randomXpGain(random: () => number = Math.random): number {
  return XP_MIN_GAIN + Math.floor(random() * (XP_MAX_GAIN - XP_MIN_GAIN + 1));
}

export function isXpCooldownOver(lastXpAt: Date | null, now: Date): boolean {
  return !lastXpAt || now.getTime() - lastXpAt.getTime() >= XP_COOLDOWN_MS;
}
