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

export interface ViewerUptimeInput {
  displayName: string;
  streamerName: string;
  isBroadcaster: boolean;
  stream: { id: string; startedAt: Date } | null;
  viewer: { sessionStreamId: string | null; sessionStartedAt: Date | null; watchMinutes: number } | null;
  now: Date;
}

/** Réponse de !myuptime : depuis quand le spectateur regarde le live, et son temps total sur la chaîne. */
export function viewerUptimeLine(input: ViewerUptimeInput): string {
  const name = `@${input.displayName}`;
  const total = input.viewer?.watchMinutes ?? 0;
  const totalText = total > 0 ? `${formatLongDuration(total * 60_000)} au total sur la chaîne` : null;
  if (!input.stream) {
    return totalText
      ? `${name}, ${input.streamerName} n'est pas en live pour le moment… mais tu as déjà passé ${totalText} 💜`
      : `${name}, ${input.streamerName} n'est pas en live pour le moment. Reviens au prochain live 💜`;
  }
  if (input.isBroadcaster) return `${name}, c'est toi qui streames 😄 En live depuis ${formatLongDuration(input.now.getTime() - input.stream.startedAt.getTime())}.`;
  const viewer = input.viewer;
  const since = viewer?.sessionStreamId === input.stream.id ? viewer.sessionStartedAt : null;
  const suffix = totalText ? ` (${totalText})` : "";
  if (!since || input.now.getTime() - since.getTime() < 60_000) return `${name}, tu viens d'arriver sur le live, bienvenue 💜${suffix}`;
  return `${name}, tu regardes le live depuis ${formatLongDuration(input.now.getTime() - since.getTime())} 💜${suffix}`;
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
