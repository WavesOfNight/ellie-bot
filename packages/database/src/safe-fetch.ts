import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

/**
 * Requêtes HTTP sortantes vers des URL fournies par les utilisateurs (action HTTP_REQUEST,
 * image de fond de bienvenue) : refuse les adresses locales et privées (protection SSRF),
 * impose un délai maximal et une taille de réponse maximale.
 *
 * La vérification de l'adresse IP est faite au moment de la connexion (option `lookup`),
 * ce qui protège aussi contre le « DNS rebinding ».
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const BLOCKED_IPV4: ReadonlyArray<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isBlockedIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  return BLOCKED_IPV4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().split("%")[0] ?? "";
  if (lower === "::" || lower === "::1") return true;
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isBlockedIpv4(mapped[1]);
  const first = Number.parseInt(lower.split(":")[0] || "0", 16);
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 (adresses locales uniques)
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 (lien local)
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 (multicast)
  if (lower.startsWith("64:ff9b:")) return true; // NAT64 vers une adresse potentiellement privée
  return false;
}

/** Vrai si l'adresse IP est locale, privée, réservée ou multicast. */
export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true;
}

/** Vérifie la forme de l'URL (protocole, nom d'hôte) sans résolution DNS. */
export function assertSafeUrlShape(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("URL invalide.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Seules les URL http:// et https:// sont autorisées.");
  }
  if (url.username || url.password) throw new UnsafeUrlError("Les identifiants dans l'URL sont interdits.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    !host.includes(".") && isIP(host) === 0
  ) {
    throw new UnsafeUrlError("Les adresses locales sont interdites.");
  }
  if (isIP(host) !== 0 && isPrivateAddress(host)) {
    throw new UnsafeUrlError("Les adresses locales ou privées sont interdites.");
  }
  return url;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function guardedLookup(hostname: string, options: { all?: boolean }, callback: LookupCallback): void {
  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || list.some((entry) => isPrivateAddress(entry.address))) {
      const blocked = new UnsafeUrlError("Cette adresse pointe vers un réseau local ou privé.") as NodeJS.ErrnoException;
      blocked.code = "EBLOCKED";
      return callback(blocked, []);
    }
    if (options.all) return callback(null, list);
    const first = list[0] as LookupAddress;
    return callback(null, first.address, first.family);
  });
}

export interface SafeFetchOptions {
  method?: "GET" | "POST" | "HEAD";
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export interface SafeFetchResponse {
  status: number;
  contentType: string;
  body: Buffer;
  finalUrl: string;
}

export class ResponseTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Réponse trop volumineuse (maximum ${Math.round(maxBytes / 1000)} Ko).`);
    this.name = "ResponseTooLargeError";
  }
}

function requestOnce(url: URL, options: Required<Omit<SafeFetchOptions, "body" | "headers" | "maxRedirects">> & SafeFetchOptions, deadline: number) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const remaining = Math.max(1, deadline - Date.now());
    const request = transport.request(
      url,
      {
        method: options.method,
        lookup: guardedLookup as unknown as http.RequestOptions["lookup"],
        headers: {
          "user-agent": "EllieBot/1.0 (+https://discord.com)",
          accept: "*/*",
          ...(options.body ? { "content-type": "application/json", "content-length": Buffer.byteLength(options.body) } : {}),
          ...options.headers,
        },
        timeout: remaining,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            request.destroy(new ResponseTooLargeError(options.maxBytes));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }));
        response.on("error", reject);
      },
    );
    const timer = setTimeout(() => request.destroy(new Error("Délai de réponse dépassé.")), remaining);
    request.on("timeout", () => request.destroy(new Error("Délai de réponse dépassé.")));
    request.on("error", reject);
    request.on("close", () => clearTimeout(timer));
    if (options.body) request.write(options.body);
    request.end();
  });
}

/** Requête HTTP(S) protégée. Lève `UnsafeUrlError` pour une adresse interdite. */
export async function safeFetch(rawUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResponse> {
  const settings = {
    ...options,
    method: options.method ?? "GET",
    timeoutMs: options.timeoutMs ?? 5_000,
    maxBytes: options.maxBytes ?? 100_000,
  };
  const deadline = Date.now() + settings.timeoutMs;
  let url = assertSafeUrlShape(rawUrl);
  const maxRedirects = options.maxRedirects ?? 3;

  for (let redirects = 0; ; redirects++) {
    const response = await requestOnce(url, settings, deadline);
    const location = response.headers.location;
    if (response.status >= 300 && response.status < 400 && location && redirects < maxRedirects) {
      url = assertSafeUrlShape(new URL(location, url).toString());
      continue;
    }
    const contentType = String(response.headers["content-type"] ?? "");
    return { status: response.status, contentType, body: response.body, finalUrl: url.toString() };
  }
}
