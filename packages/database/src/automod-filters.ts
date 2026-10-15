/**
 * Filtres d'automodération complémentaires au filtre de mots : invitations Discord, liens,
 * majuscules, symboles, répétitions et spam. Fonctions pures (sans base de données) partagées
 * par le bot Discord, le bot Twitch et le nettoyage des réponses de l'IA.
 */

/** Domaines de premier niveau surveillés pour détecter les domaines « nus » (sans http). */
const TLDS = [
  "com", "net", "org", "fr", "io", "gg", "tv", "xyz", "me", "co", "uk", "de", "es", "it", "be", "ch",
  "ca", "eu", "info", "biz", "ru", "cn", "app", "dev", "site", "online", "shop", "store", "live",
  "link", "ly", "to", "sh", "cc", "club", "top", "fun", "pro", "ai", "gl", "ws", "us", "nl", "pl",
  "pt", "br", "jp", "art", "blog", "tech", "space", "page", "stream", "news", "one", "cloud", "lol",
  "click", "win", "bet", "vip", "icu", "su", "ga", "tk", "ml", "cf", "gq", "re", "lu", "ma", "tn", "dz",
];

/** Domaines de GIF autorisés même quand le filtre de liens est actif (bouton GIF natif de Discord). */
export const GIF_DOMAINS = ["tenor.com", "giphy.com", "klipy.com"] as const;
const GIF_EXTENSIONS = /\.(?:gif|mp4|webm|webp)$/i;
const TRAILING_PUNCTUATION = /[)\]}>.,!?;:'"»”’*_~|]+$/;

const URL_PATTERN = String.raw`\bhttps?:\/\/[^\s<>]+`;
// Seules les formes entre crochets/parenthèses sont reconnues : « un point de vue » ne doit
// jamais être lu comme le domaine « un.de ».
const OBFUSCATED_DOT = String.raw`\s*[([{]\s*(?:dot|point)\s*[)\]}]\s*`;
const DOMAIN_LABEL = String.raw`[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?`;
const BARE_DOMAIN_PATTERN =
  String.raw`(?<![a-z0-9._-])(?:${DOMAIN_LABEL}(?:\.|${OBFUSCATED_DOT}))+(?:${TLDS.join("|")})(?![a-z0-9-])(?:\/[^\s<>]*)?`;
const INVITE_PATTERN =
  String.raw`(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\s*(?:\.|${OBFUSCATED_DOT})\s*(?:gg|io|me|li|com)\s*\/\s*(?:invite\s*\/\s*)?|dsc\.gg\/|invite\.gg\/)[a-z0-9-]{2,}`;

const urlRegex = () => new RegExp(URL_PATTERN, "gi");
const bareDomainRegex = () => new RegExp(BARE_DOMAIN_PATTERN, "gi");
const inviteRegex = () => new RegExp(INVITE_PATTERN, "gi");

/** Invitation Discord (discord.gg/…, discord.com/invite/…, variantes obfusquées). */
export function matchesInvite(text: string): boolean {
  return inviteRegex().test(text);
}

/** Toutes les URLs et domaines nus trouvés dans le texte (dans l'ordre d'apparition). */
export function findLinks(text: string): string[] {
  const links: string[] = [];
  const withoutUrls = text.replace(urlRegex(), (url) => {
    links.push(url);
    return " ";
  });
  for (const match of withoutUrls.matchAll(bareDomainRegex())) links.push(match[0]);
  return links;
}

/** Hôte (en minuscules) d'un lien, avec ou sans protocole, obfuscations « (dot) » comprises. */
export function extractHost(link: string): string | null {
  const cleaned = link
    .toLowerCase()
    .replace(new RegExp(OBFUSCATED_DOT, "gi"), ".")
    .replace(/^https?:\/\//, "");
  const host = cleaned.split(/[/?#]/)[0]?.split("@").pop()?.split(":")[0];
  return host ? host.replace(TRAILING_PUNCTUATION, "") : null;
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Lien de GIF/clip autorisé : extension .gif/.mp4/.webm/.webp, ou domaine Tenor / Giphy / Klipy. */
export function isGifLink(link: string): boolean {
  const cleaned = link.replace(TRAILING_PUNCTUATION, "");
  const path = cleaned.split(/[?#]/)[0] ?? cleaned;
  if (GIF_EXTENSIONS.test(path)) return true;
  const host = extractHost(cleaned);
  return host !== null && GIF_DOMAINS.some((domain) => hostMatches(host, domain));
}

/** Vrai si le texte contient au moins un lien qui n'est pas un GIF/clip autorisé. */
export function matchesNonGifLink(text: string): boolean {
  return findLinks(text).some((link) => !isGifLink(link));
}

/** Domaines non autorisés par la liste blanche (Twitch). La liste accepte les sous-domaines. */
export function findNonWhitelistedLinks(text: string, whitelist: readonly string[]): string[] {
  const allowed = whitelist.map((domain) => domain.trim().toLowerCase().replace(/^\*\./, "")).filter(Boolean);
  return findLinks(text).filter((link) => {
    if (isGifLink(link)) return false;
    const host = extractHost(link);
    return !host || !allowed.some((domain) => hostMatches(host, domain));
  });
}

/** Supprime toutes les URLs, domaines nus et invitations Discord du texte. */
export function removeLinks(text: string): string {
  return text
    .replace(inviteRegex(), " ")
    .replace(urlRegex(), " ")
    .replace(bareDomainRegex(), " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

const DISCORD_TOKENS = /<a?:\w+:\d+>|<[@#][!&]?\d+>|<\/[\w -]+:\d+>/g;

/** Plus de 70 % de majuscules sur au moins 12 lettres (émojis, mentions et liens ignorés). */
export function hasExcessiveCaps(text: string, minLetters = 12, ratio = 0.7): boolean {
  const stripped = text.replace(DISCORD_TOKENS, " ").replace(urlRegex(), " ");
  const letters = stripped.match(/\p{L}/gu) ?? [];
  if (letters.length < minLetters) return false;
  const upper = letters.filter((char) => char !== char.toLowerCase() && char === char.toUpperCase()).length;
  return upper / letters.length > ratio;
}

/** Message composé majoritairement de symboles (hors lettres, chiffres, espaces et émojis). */
export function hasExcessiveSymbols(text: string, minLength = 10, ratio = 0.5): boolean {
  const chars = [...text.replace(DISCORD_TOKENS, "").replace(/\s+/g, "")];
  if (chars.length < minLength) return false;
  const symbols = chars.filter(
    (char) => !/[\p{L}\p{N}]/u.test(char) && !/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/u.test(char),
  ).length;
  return symbols / chars.length > ratio;
}

/**
 * Répétitions abusives : un même mot répété plus de 4 fois d'affilée, un mot qui représente
 * plus de 60 % d'un message d'au moins 8 mots, ou un caractère répété 15 fois d'affilée.
 */
export function hasWordRepetition(text: string): boolean {
  if (/(.)\1{14,}/su.test(text)) return true;
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
  if (words.length < 5) return false;
  let run = 1;
  for (let i = 1; i < words.length; i++) {
    run = words[i] === words[i - 1] ? run + 1 : 1;
    if (run > 4) return true;
  }
  if (words.length >= 8) {
    const counts = new Map<string, number>();
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
    const max = Math.max(...counts.values());
    if (max / words.length > 0.6) return true;
  }
  return false;
}

/**
 * Détecteur de spam : 3 messages identiques en 8 secondes pour une même clé (utilisateur + salon).
 * Une instance par process ; la mémoire est nettoyée au fil de l'eau.
 */
export class SpamTracker {
  private readonly history = new Map<string, { content: string; at: number }[]>();

  constructor(
    private readonly windowMs = 8_000,
    private readonly maxIdentical = 3,
  ) {}

  /** Enregistre le message et renvoie `true` s'il complète une série de spam. */
  check(key: string, content: string, now = Date.now()): boolean {
    const normalized = content.trim().toLowerCase();
    const recent = (this.history.get(key) ?? []).filter((entry) => now - entry.at <= this.windowMs);
    recent.push({ content: normalized, at: now });
    this.history.set(key, recent);
    if (this.history.size > 5_000) this.prune(now);
    return normalized.length > 0 && recent.filter((entry) => entry.content === normalized).length >= this.maxIdentical;
  }

  private prune(now: number): void {
    for (const [key, entries] of this.history) {
      if (entries.every((entry) => now - entry.at > this.windowMs)) this.history.delete(key);
    }
  }
}
