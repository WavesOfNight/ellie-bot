const UNITS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  j: 86_400_000,
  w: 604_800_000,
};

/**
 * Convertit une durée courte en millisecondes : « 10m », « 2h », « 1d » (ou « 1j »), « 1h30m ».
 * @returns `null` si le format est invalide.
 */
export function parseDuration(input: string): number | null {
  const compact = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!/^(\d+[smhdjw])+$/.test(compact)) return null;
  let total = 0;
  for (const [, amount, unit] of compact.matchAll(/(\d+)([smhdjw])/g)) {
    total += Number(amount) * (UNITS[unit as string] ?? 0);
  }
  return total > 0 ? total : null;
}

/** Durée lisible en français, deux unités au maximum (« 2 h 15 min », « 3 j »). */
export function formatDuration(ms: number): string {
  const parts: string[] = [];
  let remaining = Math.max(0, Math.round(ms / 1000));
  const units: Array<[number, string]> = [
    [86_400, "j"],
    [3_600, "h"],
    [60, "min"],
    [1, "s"],
  ];
  for (const [seconds, label] of units) {
    if (remaining >= seconds) {
      parts.push(`${Math.floor(remaining / seconds)} ${label}`);
      remaining %= seconds;
    }
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(" ") : "0 s";
}
