const PARIS_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Date du jour au fuseau Europe/Paris, au format AAAA-MM-JJ. */
export function parisDateString(date: Date = new Date()): string {
  return PARIS_DATE_FORMAT.format(date);
}

/** Les `days` derniers jours (du plus ancien au plus récent), au format AAAA-MM-JJ, fuseau Europe/Paris. */
export function lastParisDates(days: number, now: Date = new Date()): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dates.push(parisDateString(new Date(now.getTime() - i * 86_400_000)));
  }
  return [...new Set(dates)];
}
