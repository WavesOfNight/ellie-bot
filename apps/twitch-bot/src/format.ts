/** Durée lisible en français, deux unités au maximum (« 2 ans, 14 jours », « 3 h, 12 min »). */
export function formatLongDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const units: Array<[number, string, string]> = [
    [525_600, "an", "ans"],
    [43_200, "mois", "mois"],
    [1_440, "jour", "jours"],
    [60, "h", "h"],
    [1, "min", "min"],
  ];
  const parts: string[] = [];
  let remaining = totalMinutes;
  for (const [size, singular, plural] of units) {
    if (remaining >= size) {
      const value = Math.floor(remaining / size);
      parts.push(`${value} ${value > 1 ? plural : singular}`);
      remaining %= size;
    }
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(", ") : "moins d'une minute";
}

/** Nombre d'émotes dans un message à partir du tag `emotes` de Twitch ({ id: ["0-4", "6-10"] }). */
export function countEmotes(emotes: Record<string, string[]> | null | undefined): number {
  if (!emotes) return 0;
  return Object.values(emotes).reduce((total, ranges) => total + ranges.length, 0);
}

/** Texte de chat sur une ligne, 500 caractères maximum (limite Twitch). */
export function chatLine(text: string): string {
  const line = text.replace(/\s*[\r\n]+\s*/g, " ").trim();
  return line.length <= 500 ? line : `${line.slice(0, 499)}…`;
}
