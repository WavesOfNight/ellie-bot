import {
  ensureGuild,
  getAppSettings,
  getGuildAiSettings,
  isSlashCommandEnabled,
  prisma,
  type Guild,
  type GuildAiSettings,
} from "@ellie/database";

/**
 * Petits caches à durée de vie courte : le panel écrit en base et le bot relit au plus toutes les
 * 5 secondes, ce qui évite une requête SQLite par message tout en appliquant vite les changements.
 */
class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  async get(key: string, load: () => Promise<T>): Promise<T> {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.value;
    const value = await load();
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  invalidate(key: string): void {
    this.entries.delete(key);
  }
}

const guildCache = new TtlCache<Guild>(5_000);
const aiCache = new TtlCache<GuildAiSettings>(5_000);
const toggleCache = new TtlCache<boolean>(5_000);
const communityCache = new TtlCache<string>(60_000);
const knownGuilds = new Set<string>();

/** Paramètres du serveur (la ligne est créée au besoin). */
export function getGuildSettings(guildId: string, name?: string): Promise<Guild> {
  return guildCache.get(guildId, async () => {
    if (!knownGuilds.has(guildId) || name) {
      knownGuilds.add(guildId);
      return ensureGuild(guildId, name);
    }
    return (await prisma.guild.findUnique({ where: { id: guildId } })) ?? ensureGuild(guildId, name);
  });
}

export function invalidateGuildSettings(guildId: string): void {
  guildCache.invalidate(guildId);
}

export function getCachedAiSettings(guildId: string): Promise<GuildAiSettings> {
  return aiCache.get(guildId, () => getGuildAiSettings(guildId));
}

export function isCommandEnabledCached(guildId: string, name: string): Promise<boolean> {
  return toggleCache.get(`${guildId}:${name}`, () => isSlashCommandEnabled(guildId, name));
}

export function getCommunityName(): Promise<string> {
  return communityCache.get("community", async () => (await getAppSettings()).communityName);
}
