import "server-only";
import { getDiscordCredentials } from "@ellie/database";

const API = "https://discord.com/api/v10";
const CACHE_MS = 30_000;
const cache = new Map<string, { value: unknown; expiresAt: number }>();

export class DiscordApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DiscordApiError";
  }
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  approximate_member_count?: number;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
  position: number;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

export const CHANNEL_TYPES = { TEXT: 0, VOICE: 2, CATEGORY: 4, ANNOUNCEMENT: 5, STAGE: 13 } as const;

async function botRequest<T>(method: string, path: string, body?: unknown, cacheMs = 0): Promise<T> {
  const cacheKey = `${method} ${path}`;
  if (method === "GET" && cacheMs > 0) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  }
  const credentials = await getDiscordCredentials();
  if (!credentials) throw new DiscordApiError(0, "Le token du bot n'est pas configuré (Paramètres).");
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bot ${credentials.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new DiscordApiError(response.status, `API Discord (${response.status}) : ${detail?.message ?? "erreur"}`);
  }
  const value = (response.status === 204 ? null : await response.json()) as T;
  if (method === "GET" && cacheMs > 0) cache.set(cacheKey, { value, expiresAt: Date.now() + cacheMs });
  return value;
}

export function invalidateDiscordCache(prefix: string): void {
  for (const key of cache.keys()) if (key.includes(prefix)) cache.delete(key);
}

/** Serveurs où le bot est présent. */
export async function getBotGuilds(): Promise<DiscordGuild[]> {
  return botRequest<DiscordGuild[]>("GET", "/users/@me/guilds?limit=200&with_counts=true", undefined, CACHE_MS);
}

export async function getGuild(guildId: string): Promise<DiscordGuild | null> {
  try {
    return await botRequest<DiscordGuild>("GET", `/guilds/${guildId}?with_counts=true`, undefined, CACHE_MS);
  } catch {
    return null;
  }
}

export async function getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
  try {
    const channels = await botRequest<DiscordChannel[]>("GET", `/guilds/${guildId}/channels`, undefined, CACHE_MS);
    return [...channels].sort((a, b) => a.position - b.position);
  } catch {
    return [];
  }
}

export async function getGuildRoles(guildId: string): Promise<DiscordRole[]> {
  try {
    const roles = await botRequest<DiscordRole[]>("GET", `/guilds/${guildId}/roles`, undefined, CACHE_MS);
    return roles.filter((role) => role.id !== guildId).sort((a, b) => b.position - a.position);
  } catch {
    return [];
  }
}

/** Pseudos d'affichage (mis en cache une heure). */
export async function getUserNames(userIds: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  await Promise.all(
    [...new Set(userIds)].map(async (id) => {
      try {
        const user = await botRequest<DiscordUser>("GET", `/users/${id}`, undefined, 3_600_000);
        names.set(id, user.global_name ?? user.username);
      } catch {
        names.set(id, `Utilisateur ${id.slice(-4)}`);
      }
    }),
  );
  return names;
}

export async function createChannelInvite(channelId: string): Promise<string> {
  const invite = await botRequest<{ code: string }>("POST", `/channels/${channelId}/invites`, { max_age: 0, max_uses: 0, unique: true });
  return invite.code;
}

export async function sendChannelMessage(channelId: string, body: unknown): Promise<{ id: string }> {
  return botRequest<{ id: string }>("POST", `/channels/${channelId}/messages`, body);
}

/**
 * Met à jour un message déjà publié, ou en publie un nouveau s'il n'existe plus ou s'il a été
 * publié par un autre bot (ex. l'ancien bot). @returns l'identifiant du message à conserver.
 */
export async function publishOrUpdateMessage(channelId: string, messageId: string | null, body: unknown): Promise<string> {
  if (messageId) {
    try {
      await botRequest("PATCH", `/channels/${channelId}/messages/${messageId}`, body);
      return messageId;
    } catch (error) {
      if (!(error instanceof DiscordApiError) || (error.status !== 404 && error.status !== 403)) throw error;
      if (error.status === 403) await deleteChannelMessage(channelId, messageId).catch(() => undefined); // message d'un autre bot : on tente de le retirer
    }
  }
  return (await sendChannelMessage(channelId, body)).id;
}

export async function deleteChannelMessage(channelId: string, messageId: string): Promise<void> {
  try {
    await botRequest("DELETE", `/channels/${channelId}/messages/${messageId}`);
  } catch (error) {
    if (!(error instanceof DiscordApiError) || error.status !== 404) throw error;
  }
}

export function guildIconUrl(guild: Pick<DiscordGuild, "id" | "icon">, size = 128): string | null {
  return guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=${size}` : null;
}

const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;

/** Serveurs où l'utilisateur connecté via Discord a la permission « Gérer le serveur ». */
export async function fetchManageableGuildIds(accessToken: string): Promise<string[]> {
  const response = await fetch(`${API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new DiscordApiError(response.status, "Liste des serveurs Discord indisponible.");
  const guilds = (await response.json()) as Array<{ id: string; owner: boolean; permissions: string }>;
  return guilds
    .filter((guild) => {
      const permissions = BigInt(guild.permissions);
      return guild.owner || (permissions & MANAGE_GUILD) === MANAGE_GUILD || (permissions & ADMINISTRATOR) === ADMINISTRATOR;
    })
    .map((guild) => guild.id);
}

/** Permissions demandées par le lien d'invitation (et non « toutes permissions »). */
export const BOT_INVITE_PERMISSIONS = [
  0x10n, // Gérer les salons
  0x10000000n, // Gérer les rôles
  0x10000000000n, // Modérer les membres
  0x2n, // Expulser
  0x4n, // Bannir
  0x2000n, // Gérer les messages
  0x800n, // Envoyer des messages
  0x4000n, // Intégrer des liens
  0x8000n, // Joindre des fichiers
  0x10000n, // Lire l'historique
  0x40n, // Ajouter des réactions
  0x400n, // Voir les salons
  0x8000000n, // Gérer les pseudos
  0x1000000n, // Déplacer des membres
  0x400000n, // Rendre muets des membres
  0x1n, // Créer des invitations
  0x100000n, // Se connecter au vocal
  0x1000000000000n, // Définir le statut des salons vocaux
]
  .reduce((total, flag) => total | flag, 0n)
  .toString();

export function botInviteUrl(clientId: string): string {
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${BOT_INVITE_PERMISSIONS}&scope=bot%20applications.commands`;
}
