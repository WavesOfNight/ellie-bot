import type { Prisma, TwitchBotConfig } from "@prisma/client";
import { prisma } from "./client.js";
import { encryptSecret, tryDecryptSecret } from "./crypto.js";

const SINGLETON_ID = 1;

/** Scopes OAuth demandés au compte bot Twitch. */
export const TWITCH_BOT_SCOPES = [
  "chat:read",
  "chat:edit",
  "channel:moderate",
  "moderator:manage:banned_users",
  "moderator:manage:chat_messages",
  "moderator:manage:warnings",
  "moderator:manage:shoutouts",
  "moderator:read:followers",
  "moderator:read:chatters",
  "channel:read:subscriptions",
] as const;

/** Configuration Twitch sans aucun secret (forme envoyée au navigateur). */
export type TwitchBotSettings = Omit<
  TwitchBotConfig,
  "clientSecretEncrypted" | "accessTokenEncrypted" | "refreshTokenEncrypted"
> & {
  hasClientSecret: boolean;
  hasTokens: boolean;
};

export interface TwitchBotSecrets {
  clientId: string | null;
  clientSecret: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
}

export async function getTwitchBotConfig(): Promise<TwitchBotConfig> {
  return prisma.twitchBotConfig.upsert({ where: { id: SINGLETON_ID }, create: { id: SINGLETON_ID }, update: {} });
}

export async function getTwitchBotSettings(): Promise<TwitchBotSettings> {
  const { clientSecretEncrypted, accessTokenEncrypted, refreshTokenEncrypted, ...rest } = await getTwitchBotConfig();
  return {
    ...rest,
    hasClientSecret: Boolean(clientSecretEncrypted),
    hasTokens: Boolean(accessTokenEncrypted && refreshTokenEncrypted),
  };
}

export async function getTwitchBotSecrets(): Promise<TwitchBotSecrets> {
  const config = await getTwitchBotConfig();
  return {
    clientId: config.clientId,
    clientSecret: tryDecryptSecret(config.clientSecretEncrypted),
    accessToken: tryDecryptSecret(config.accessTokenEncrypted),
    refreshToken: tryDecryptSecret(config.refreshTokenEncrypted),
    tokenExpiresAt: config.tokenExpiresAt,
  };
}

export type TwitchBotSettingsUpdate = Partial<
  Omit<
    Prisma.TwitchBotConfigUpdateInput,
    "id" | "clientSecretEncrypted" | "accessTokenEncrypted" | "refreshTokenEncrypted" | "tokenExpiresAt"
  >
>;

export async function updateTwitchBotSettings(data: TwitchBotSettingsUpdate): Promise<void> {
  await prisma.twitchBotConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...(data as Prisma.TwitchBotConfigCreateInput) },
    update: data,
  });
}

export async function saveTwitchBotAppCredentials(clientId: string, clientSecret?: string | null): Promise<void> {
  const data: Prisma.TwitchBotConfigUpdateInput = { clientId: clientId.trim() || null };
  if (clientSecret?.trim()) data.clientSecretEncrypted = encryptSecret(clientSecret.trim());
  await prisma.twitchBotConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...(data as Prisma.TwitchBotConfigCreateInput) },
    update: data,
  });
}

export async function saveTwitchBotTokens(input: {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  username?: string;
}): Promise<void> {
  const data: Prisma.TwitchBotConfigUpdateInput = {
    accessTokenEncrypted: encryptSecret(input.accessToken),
    refreshTokenEncrypted: encryptSecret(input.refreshToken),
    tokenExpiresAt: input.expiresAt,
  };
  if (input.username) data.username = input.username.toLowerCase();
  await prisma.twitchBotConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...(data as Prisma.TwitchBotConfigCreateInput) },
    update: data,
  });
}

export async function clearTwitchBotTokens(): Promise<void> {
  await prisma.twitchBotConfig.updateMany({
    where: { id: SINGLETON_ID },
    data: { accessTokenEncrypted: null, refreshTokenEncrypted: null, tokenExpiresAt: null },
  });
}

/** Normalise une liste de domaines saisie dans le panel (un par ligne ou séparés par des virgules). */
export function parseDomainList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((domain) => domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
        .filter((domain) => /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)),
    ),
  ];
}
