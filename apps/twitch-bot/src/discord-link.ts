import { getDiscordCredentials, getXpLeaderboard, prisma } from "@ellie/database";
import { BOT_NAME, BRAND_COLORS } from "@ellie/database/shared";
import { logError } from "./log.js";

const DISCORD_API = "https://discord.com/api/v10";

async function discordRequest<T>(method: string, path: string, body?: unknown): Promise<T | null> {
  const credentials = await getDiscordCredentials();
  if (!credentials) return null;
  const response = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: { Authorization: `Bot ${credentials.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`API Discord ${method} ${path} : HTTP ${response.status}`);
  return response.status === 204 ? null : ((await response.json()) as T);
}

export interface TwitchLogEntry {
  title: string;
  username: string;
  reason: string;
  color?: number;
}

/** Publie une sanction Twitch dans le salon de logs Discord du serveur lié. */
export async function postTwitchLogToDiscord(linkedGuildId: string | null, entry: TwitchLogEntry): Promise<void> {
  if (!linkedGuildId) return;
  try {
    const guild = await prisma.guild.findUnique({ where: { id: linkedGuildId }, select: { modLogChannelId: true } });
    if (!guild?.modLogChannelId) return;
    await discordRequest("POST", `/channels/${guild.modLogChannelId}/messages`, {
      embeds: [
        {
          title: entry.title,
          color: entry.color ?? BRAND_COLORS.lavender,
          fields: [
            { name: "Utilisateur Twitch", value: entry.username, inline: true },
            { name: "Raison", value: entry.reason.slice(0, 1000) },
          ],
          footer: { text: `${BOT_NAME} · Twitch` },
          timestamp: new Date().toISOString(),
        },
      ],
      allowed_mentions: { parse: [] },
    });
  } catch (error) {
    logError(`log Discord d'une sanction Twitch (serveur ${linkedGuildId})`, error);
  }
}

/** Code de l'invitation permanente du serveur Discord lié (synchronisée par le bot Discord). */
export async function getLinkedInviteCode(linkedGuildId: string | null): Promise<string | null> {
  if (!linkedGuildId) return null;
  const guild = await prisma.guild.findUnique({ where: { id: linkedGuildId }, select: { permanentInviteCode: true } });
  return guild?.permanentInviteCode ?? null;
}

const nameCache = new Map<string, { name: string; expiresAt: number }>();

async function memberName(guildId: string, userId: string): Promise<string> {
  const key = `${guildId}:${userId}`;
  const cached = nameCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.name;
  let name = "membre";
  try {
    const member = await discordRequest<{ nick: string | null; user: { username: string; global_name: string | null } }>(
      "GET",
      `/guilds/${guildId}/members/${userId}`,
    );
    if (member) name = member.nick ?? member.user.global_name ?? member.user.username;
  } catch {
    name = "ancien membre";
  }
  nameCache.set(key, { name, expiresAt: Date.now() + 3_600_000 });
  return name;
}

/** Top 5 XP du serveur Discord lié, avec les pseudos résolus. */
export async function getDiscordTopFive(linkedGuildId: string): Promise<Array<{ name: string; level: number }>> {
  const top = await getXpLeaderboard(linkedGuildId, 5);
  return Promise.all(top.map(async (member) => ({ name: await memberName(linkedGuildId, member.userId), level: member.level })));
}
