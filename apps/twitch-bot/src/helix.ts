import { getTwitchBotSecrets, saveTwitchBotTokens } from "@ellie/database";
import { logInfo } from "./log.js";

const HELIX = "https://api.twitch.tv/helix";
const REFRESH_MARGIN_MS = 10 * 60_000;
const TIMEOUT_MS = 10_000;

export class HelixError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HelixError";
  }
}

export interface HelixUser {
  id: string;
  login: string;
  display_name: string;
}

/**
 * Jeton OAuth du compte bot : rafraîchi automatiquement avant expiration (et après un 401),
 * puis enregistré chiffré en base.
 */
export class TwitchTokenManager {
  private refreshing: Promise<string> | null = null;

  async getAccessToken(): Promise<string> {
    const secrets = await getTwitchBotSecrets();
    if (!secrets.accessToken) throw new Error("aucun jeton Twitch : connecte le compte bot dans le panel (Bot Twitch → Paramètres)");
    const expiresAt = secrets.tokenExpiresAt?.getTime() ?? 0;
    if (expiresAt - Date.now() > REFRESH_MARGIN_MS) return secrets.accessToken;
    return this.refresh();
  }

  async getClientId(): Promise<string> {
    const secrets = await getTwitchBotSecrets();
    if (!secrets.clientId) throw new Error("Client ID de l'application Twitch manquant (panel → Bot Twitch → Paramètres)");
    return secrets.clientId;
  }

  /** Rafraîchit le jeton (un seul rafraîchissement simultané). */
  refresh(): Promise<string> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(): Promise<string> {
    const secrets = await getTwitchBotSecrets();
    if (!secrets.clientId || !secrets.clientSecret || !secrets.refreshToken) {
      throw new Error("rafraîchissement impossible : Client ID/Secret ou jeton de rafraîchissement manquant");
    }
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: secrets.clientId,
        client_secret: secrets.clientSecret,
        grant_type: "refresh_token",
        refresh_token: secrets.refreshToken,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`rafraîchissement du jeton Twitch refusé (HTTP ${response.status}) : reconnecte le compte bot dans le panel`);
    }
    const data = (await response.json()) as { access_token: string; refresh_token: string; expires_in: number };
    await saveTwitchBotTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    });
    logInfo("jeton Twitch rafraîchi");
    return data.access_token;
  }
}

/** Client minimal de l'API Helix, authentifié avec le compte bot. */
export class HelixClient {
  constructor(private readonly tokens: TwitchTokenManager) {}

  async request<T>(method: string, path: string, options: { query?: Record<string, string | string[]>; body?: unknown } = {}): Promise<T> {
    const url = new URL(`${HELIX}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, item);
    }
    const send = async (token: string) =>
      fetch(url, {
        method,
        headers: {
          "Client-Id": await this.tokens.getClientId(),
          Authorization: `Bearer ${token}`,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

    let response = await send(await this.tokens.getAccessToken());
    if (response.status === 401) response = await send(await this.tokens.refresh());
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let detail = text.slice(0, 200);
      try {
        detail = (JSON.parse(text) as { message?: string }).message ?? detail;
      } catch {
        // corps non JSON : on garde le texte brut tronqué
      }
      throw new HelixError(response.status, `Helix ${method} ${path} : HTTP ${response.status} ${detail}`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async getUsers(logins: readonly string[]): Promise<HelixUser[]> {
    if (!logins.length) return [];
    const data = await this.request<{ data: HelixUser[] }>("GET", "/users", { query: { login: logins.map((login) => login.toLowerCase()) } });
    return data.data;
  }

  async getStream(broadcasterId: string) {
    const data = await this.request<{ data: Array<{ id: string; started_at: string; game_name: string; title: string }> }>("GET", "/streams", {
      query: { user_id: broadcasterId },
    });
    return data.data[0] ?? null;
  }

  async getChannelInfo(broadcasterId: string) {
    const data = await this.request<{ data: Array<{ broadcaster_name: string; game_name: string; title: string }> }>("GET", "/channels", {
      query: { broadcaster_id: broadcasterId },
    });
    return data.data[0] ?? null;
  }

  async deleteMessage(broadcasterId: string, moderatorId: string, messageId: string): Promise<void> {
    await this.request("DELETE", "/moderation/chat", { query: { broadcaster_id: broadcasterId, moderator_id: moderatorId, message_id: messageId } });
  }

  async warnUser(broadcasterId: string, moderatorId: string, userId: string, reason: string): Promise<void> {
    await this.request("POST", "/moderation/warnings", {
      query: { broadcaster_id: broadcasterId, moderator_id: moderatorId },
      body: { data: { user_id: userId, reason } },
    });
  }

  /** Ban définitif, ou timeout si `durationSeconds` est fourni. */
  async banUser(broadcasterId: string, moderatorId: string, userId: string, reason: string, durationSeconds?: number): Promise<void> {
    await this.request("POST", "/moderation/bans", {
      query: { broadcaster_id: broadcasterId, moderator_id: moderatorId },
      body: { data: { user_id: userId, reason, ...(durationSeconds ? { duration: durationSeconds } : {}) } },
    });
  }

  async shoutout(fromBroadcasterId: string, toBroadcasterId: string, moderatorId: string): Promise<void> {
    await this.request("POST", "/chat/shoutouts", {
      query: { from_broadcaster_id: fromBroadcasterId, to_broadcaster_id: toBroadcasterId, moderator_id: moderatorId },
    });
  }

  async getFollower(broadcasterId: string, userId: string) {
    const data = await this.request<{ data: Array<{ followed_at: string }> }>("GET", "/channels/followers", {
      query: { broadcaster_id: broadcasterId, user_id: userId },
    });
    return data.data[0] ?? null;
  }

  async getLatestFollowers(broadcasterId: string) {
    const data = await this.request<{ data: Array<{ user_login: string; user_name: string; followed_at: string }> }>("GET", "/channels/followers", {
      query: { broadcaster_id: broadcasterId, first: "20" },
    });
    return data.data;
  }

  async getChatters(broadcasterId: string, moderatorId: string): Promise<string[]> {
    const logins: string[] = [];
    let cursor: string | undefined;
    do {
      const data = await this.request<{ data: Array<{ user_login: string }>; pagination?: { cursor?: string } }>("GET", "/chat/chatters", {
        query: { broadcaster_id: broadcasterId, moderator_id: moderatorId, first: "1000", ...(cursor ? { after: cursor } : {}) },
      });
      logins.push(...data.data.map((chatter) => chatter.user_login));
      cursor = data.pagination?.cursor;
    } while (cursor && logins.length < 20_000);
    return logins;
  }

  async getSubscriptionTotal(broadcasterId: string): Promise<number> {
    const data = await this.request<{ total: number }>("GET", "/subscriptions", { query: { broadcaster_id: broadcasterId, first: "1" } });
    return data.total;
  }
}
