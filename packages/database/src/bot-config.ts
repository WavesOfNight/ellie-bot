import { prisma } from "./client.js";
import { encryptSecret, tryDecryptSecret } from "./crypto.js";

const SINGLETON_ID = 1;

export interface BotConfigStatus {
  discordConfigured: boolean;
  clientId: string | null;
  hasClientSecret: boolean;
  twitchAppConfigured: boolean;
  twitchClientId: string | null;
  anthropicConfigured: boolean;
  updatedAt: Date | null;
}

export interface DiscordCredentials {
  clientId: string;
  token: string;
}

export interface DiscordOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export interface TwitchAppCredentials {
  clientId: string;
  clientSecret: string;
}

/** État de la configuration, sans aucun secret : c'est la seule forme envoyée au navigateur. */
export async function getBotConfigStatus(): Promise<BotConfigStatus> {
  const config = await prisma.botConfig.findUnique({ where: { id: SINGLETON_ID } });
  return {
    discordConfigured: Boolean(config?.tokenEncrypted && config.clientId),
    clientId: config?.clientId || null,
    hasClientSecret: Boolean(config?.clientSecretEncrypted),
    twitchAppConfigured: Boolean(config?.twitchClientId && config.twitchClientSecretEncrypted),
    twitchClientId: config?.twitchClientId || null,
    anthropicConfigured: Boolean(config?.anthropicApiKeyEncrypted),
    updatedAt: config?.updatedAt ?? null,
  };
}

export async function getDiscordCredentials(): Promise<DiscordCredentials | null> {
  const config = await prisma.botConfig.findUnique({ where: { id: SINGLETON_ID } });
  if (!config?.clientId || !config.tokenEncrypted) return null;
  const token = tryDecryptSecret(config.tokenEncrypted);
  return token ? { clientId: config.clientId, token } : null;
}

export async function getDiscordOAuthCredentials(): Promise<DiscordOAuthCredentials | null> {
  const config = await prisma.botConfig.findUnique({ where: { id: SINGLETON_ID } });
  if (!config?.clientId || !config.clientSecretEncrypted) return null;
  const clientSecret = tryDecryptSecret(config.clientSecretEncrypted);
  return clientSecret ? { clientId: config.clientId, clientSecret } : null;
}

/**
 * Enregistre les identifiants Discord. Un champ secret laissé vide conserve la valeur existante,
 * ce qui permet de modifier le Client ID sans recoller le token.
 */
export async function saveDiscordCredentials(input: {
  clientId: string;
  token?: string | null;
  clientSecret?: string | null;
}): Promise<void> {
  const data: { clientId: string; tokenEncrypted?: string; clientSecretEncrypted?: string } = {
    clientId: input.clientId.trim(),
  };
  if (input.token?.trim()) data.tokenEncrypted = encryptSecret(input.token.trim());
  if (input.clientSecret?.trim()) data.clientSecretEncrypted = encryptSecret(input.clientSecret.trim());
  await prisma.botConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...data },
    update: data,
  });
}

export async function clearDiscordClientSecret(): Promise<void> {
  await prisma.botConfig.updateMany({ where: { id: SINGLETON_ID }, data: { clientSecretEncrypted: null } });
}

export async function getTwitchAppCredentials(): Promise<TwitchAppCredentials | null> {
  const config = await prisma.botConfig.findUnique({ where: { id: SINGLETON_ID } });
  if (!config?.twitchClientId || !config.twitchClientSecretEncrypted) return null;
  const clientSecret = tryDecryptSecret(config.twitchClientSecretEncrypted);
  return clientSecret ? { clientId: config.twitchClientId, clientSecret } : null;
}

export async function saveTwitchAppCredentials(input: { clientId: string; clientSecret?: string | null }): Promise<void> {
  const data: { twitchClientId: string; twitchClientSecretEncrypted?: string } = {
    twitchClientId: input.clientId.trim(),
  };
  if (input.clientSecret?.trim()) data.twitchClientSecretEncrypted = encryptSecret(input.clientSecret.trim());
  await prisma.botConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...data },
    update: data,
  });
}

/** Clé API Anthropic déchiffrée. Lue uniquement côté serveur, par `@ellie/ai`. */
export async function getAnthropicApiKey(): Promise<string | null> {
  const config = await prisma.botConfig.findUnique({
    where: { id: SINGLETON_ID },
    select: { anthropicApiKeyEncrypted: true },
  });
  return tryDecryptSecret(config?.anthropicApiKeyEncrypted);
}

export async function saveAnthropicApiKey(apiKey: string): Promise<void> {
  const anthropicApiKeyEncrypted = encryptSecret(apiKey.trim());
  await prisma.botConfig.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, anthropicApiKeyEncrypted },
    update: { anthropicApiKeyEncrypted },
  });
}

export async function clearAnthropicApiKey(): Promise<void> {
  await prisma.botConfig.updateMany({ where: { id: SINGLETON_ID }, data: { anthropicApiKeyEncrypted: null } });
}
