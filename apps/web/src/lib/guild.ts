import "server-only";
import { ensureGuild } from "@ellie/database";
import { CHANNEL_TYPES, getGuildChannels, getGuildRoles, type DiscordChannel, type DiscordRole } from "./discord";
import { requireGuildAccess } from "./session";

export interface GuildData {
  guildId: string;
  channels: DiscordChannel[];
  roles: DiscordRole[];
}

/** Données Discord d'un serveur (salons, rôles) après vérification de l'accès. */
export async function loadGuildData(guildId: string): Promise<GuildData> {
  await requireGuildAccess(guildId);
  const [channels, roles] = await Promise.all([getGuildChannels(guildId), getGuildRoles(guildId)]);
  return { guildId, channels, roles };
}

/** Pour les actions serveur : vérifie l'accès et garantit que la ligne du serveur existe. */
export async function guildFromForm(form: FormData): Promise<string> {
  const { guildId } = await requireGuildAccess(form.get("guildId"));
  await ensureGuild(guildId);
  return guildId;
}

const TEXT_TYPES: number[] = [CHANNEL_TYPES.TEXT, CHANNEL_TYPES.ANNOUNCEMENT];
const VOICE_TYPES: number[] = [CHANNEL_TYPES.VOICE, CHANNEL_TYPES.STAGE];

/** Identifiants réellement présents sur le serveur (validation côté serveur des sélections). */
export async function guildIdSets(guildId: string) {
  const [channels, roles] = await Promise.all([getGuildChannels(guildId), getGuildRoles(guildId)]);
  return {
    text: new Set(channels.filter((channel) => TEXT_TYPES.includes(channel.type)).map((channel) => channel.id)),
    voice: new Set(channels.filter((channel) => VOICE_TYPES.includes(channel.type)).map((channel) => channel.id)),
    category: new Set(channels.filter((channel) => channel.type === CHANNEL_TYPES.CATEGORY).map((channel) => channel.id)),
    roles: new Set(roles.filter((role) => !role.managed).map((role) => role.id)),
  };
}
