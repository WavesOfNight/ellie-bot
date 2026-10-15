import { EmbedBuilder, type Client, type GuildTextBasedChannel } from "discord.js";
import { getTwitchAppCredentials, prisma, type SocialAlert } from "@ellie/database";
import { BOT_NAME } from "@ellie/database/shared";
import { logError, logInfo, logWarn } from "./log.js";

const YOUTUBE_COLOR = 0xd4537e;
const TWITCH_COLOR = 0x7f77dd;
const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// YouTube (flux RSS)
// ---------------------------------------------------------------------------

export interface YoutubeVideo {
  id: string;
  title: string;
  url: string;
  publishedAt: Date;
  channelName: string;
}

function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

function tag(block: string, name: string): string | null {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return match?.[1] !== undefined ? decodeXml(match[1].trim()) : null;
}

/**
 * Analyse TOUTES les entrées d'un flux RSS YouTube, triées de la plus ancienne à la plus récente.
 * Lève une erreur si le flux est mal formé.
 */
export function parseYoutubeFeed(xml: string): YoutubeVideo[] {
  if (!xml.includes("<feed")) throw new Error("flux RSS YouTube mal formé (balise <feed> absente)");
  const feedAuthor = tag(xml.split("<entry>")[0] ?? "", "name") ?? "YouTube";
  const videos: YoutubeVideo[] = [];
  for (const [, block] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    if (!block) continue;
    const id = tag(block, "yt:videoId");
    if (!id) continue;
    const link = block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1];
    const published = tag(block, "published");
    videos.push({
      id,
      title: tag(block, "title") ?? "Nouvelle vidéo",
      url: link ? decodeXml(link) : `https://www.youtube.com/watch?v=${id}`,
      publishedAt: published ? new Date(published) : new Date(0),
      channelName: tag(block, "name") ?? feedAuthor,
    });
  }
  return videos.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
}

async function fetchYoutubeFeed(channelId: string): Promise<YoutubeVideo[]> {
  const response = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`flux RSS YouTube indisponible (HTTP ${response.status})`);
  return parseYoutubeFeed(await response.text());
}

function renderAlertMessage(template: string, channelName: string, url: string): string {
  return template.replaceAll("{channel}", channelName).replaceAll("{url}", url).slice(0, 2000);
}

async function resolveAlertChannel(client: Client, alert: SocialAlert): Promise<GuildTextBasedChannel | null> {
  const channel = await client.channels.fetch(alert.discordChannelId).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    logWarn(`alerte #${alert.id} (serveur ${alert.guildId}) : salon ${alert.discordChannelId} introuvable ou inaccessible`);
    return null;
  }
  return channel;
}

/** @returns le nombre d'annonces envoyées. */
async function checkYoutubeAlert(client: Client, alert: SocialAlert): Promise<number> {
  const videos = await fetchYoutubeFeed(alert.channelRef);
  const known = new Set(
    (await prisma.notifiedYoutubeVideo.findMany({ where: { alertId: alert.id }, select: { videoId: true } })).map((row) => row.videoId),
  );

  if (!alert.initializedAt) {
    // Première vérification : on mémorise l'historique sans rien annoncer.
    for (const video of videos) {
      if (known.has(video.id)) continue;
      await prisma.notifiedYoutubeVideo.upsert({
        where: { alertId_videoId: { alertId: alert.id, videoId: video.id } },
        create: { alertId: alert.id, videoId: video.id },
        update: {},
      });
    }
    await prisma.socialAlert.update({ where: { id: alert.id }, data: { initializedAt: new Date() } });
    logInfo(`alerte YouTube #${alert.id} initialisée (${videos.length} vidéo(s) mémorisée(s) sans annonce)`);
    return 0;
  }

  const missing = videos.filter((video) => !known.has(video.id));
  if (!missing.length) return 0;
  const channel = await resolveAlertChannel(client, alert);
  if (!channel) return 0;

  let sent = 0;
  for (const video of missing) {
    const embed = new EmbedBuilder()
      .setColor(YOUTUBE_COLOR)
      .setTitle(video.title.slice(0, 256))
      .setURL(video.url)
      .setAuthor({ name: video.channelName })
      .setImage(`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`)
      .setFooter({ text: `${BOT_NAME} · YouTube` })
      .setTimestamp(video.publishedAt);
    try {
      await channel.send({
        content: renderAlertMessage(alert.message, video.channelName, video.url),
        embeds: [embed],
        allowedMentions: { parse: ["everyone", "roles", "users"] },
      });
    } catch (error) {
      // Non enregistrée : elle sera retentée au prochain passage.
      logError(`alerte YouTube #${alert.id} (serveur ${alert.guildId}) : envoi de la vidéo ${video.id}`, error);
      continue;
    }
    await prisma.notifiedYoutubeVideo.upsert({
      where: { alertId_videoId: { alertId: alert.id, videoId: video.id } },
      create: { alertId: alert.id, videoId: video.id },
      update: {},
    });
    sent++;
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Twitch (lives)
// ---------------------------------------------------------------------------

interface TwitchStream {
  id: string;
  user_login: string;
  user_name: string;
  game_name: string;
  title: string;
  thumbnail_url: string;
  started_at: string;
}

let appToken: { value: string; clientId: string; expiresAt: number } | null = null;

async function getTwitchAppToken(): Promise<{ token: string; clientId: string } | null> {
  const credentials = await getTwitchAppCredentials();
  if (!credentials) return null;
  if (appToken && appToken.clientId === credentials.clientId && appToken.expiresAt > Date.now()) {
    return { token: appToken.value, clientId: appToken.clientId };
  }
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`token d'application Twitch refusé (HTTP ${response.status}) : vérifie le Client ID/Secret`);
  const data = (await response.json()) as { access_token: string; expires_in: number };
  appToken = { value: data.access_token, clientId: credentials.clientId, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return { token: data.access_token, clientId: credentials.clientId };
}

async function fetchTwitchStreams(logins: readonly string[]): Promise<Map<string, TwitchStream> | null> {
  const auth = await getTwitchAppToken();
  if (!auth) return null;
  const streams = new Map<string, TwitchStream>();
  for (let i = 0; i < logins.length; i += 100) {
    const query = new URLSearchParams(logins.slice(i, i + 100).map((login): [string, string] => ["user_login", login]));
    const response = await fetch(`https://api.twitch.tv/helix/streams?${query}`, {
      headers: { "Client-Id": auth.clientId, Authorization: `Bearer ${auth.token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status === 401) appToken = null;
    if (!response.ok) throw new Error(`API Twitch (streams) : HTTP ${response.status}`);
    const data = (await response.json()) as { data: TwitchStream[] };
    for (const stream of data.data) streams.set(stream.user_login.toLowerCase(), stream);
  }
  return streams;
}

async function announceTwitchLive(client: Client, alert: SocialAlert, stream: TwitchStream): Promise<boolean> {
  const channel = await resolveAlertChannel(client, alert);
  if (!channel) return false;
  const url = `https://www.twitch.tv/${stream.user_login}`;
  const embed = new EmbedBuilder()
    .setColor(TWITCH_COLOR)
    .setTitle((stream.title || `${stream.user_name} est en live !`).slice(0, 256))
    .setURL(url)
    .setAuthor({ name: `${stream.user_name} est en live sur Twitch` })
    .addFields({ name: "Catégorie", value: stream.game_name || "Non précisée", inline: true })
    .setImage(`${stream.thumbnail_url.replace("{width}", "1280").replace("{height}", "720")}?t=${Date.now()}`)
    .setFooter({ text: `${BOT_NAME} · Twitch` })
    .setTimestamp(new Date(stream.started_at));
  try {
    await channel.send({
      content: renderAlertMessage(alert.message, stream.user_name, url),
      embeds: [embed],
      allowedMentions: { parse: ["everyone", "roles", "users"] },
    });
  } catch (error) {
    logError(`alerte Twitch #${alert.id} (serveur ${alert.guildId}) : envoi de l'annonce`, error);
    return false;
  }
  await prisma.socialAlert.update({ where: { id: alert.id }, data: { lastSeenId: stream.id } });
  return true;
}

// ---------------------------------------------------------------------------
// Boucle
// ---------------------------------------------------------------------------

let missingTwitchCredentialsLogged = false;

/**
 * Vérifie les alertes (toutes, ou celles d'un serveur pour `/alertes verifier`).
 * @returns le nombre de notifications envoyées.
 */
export async function checkSocialAlerts(client: Client, guildId?: string): Promise<number> {
  const guildIds = guildId ? [guildId] : [...client.guilds.cache.keys()];
  const alerts = await prisma.socialAlert.findMany({ where: { guildId: { in: guildIds } } });
  let sent = 0;

  for (const alert of alerts.filter((candidate) => candidate.platform === "YOUTUBE")) {
    try {
      sent += await checkYoutubeAlert(client, alert);
    } catch (error) {
      logError(`alerte YouTube #${alert.id} (serveur ${alert.guildId}, chaîne ${alert.channelRef})`, error);
    }
  }

  const twitchAlerts = alerts.filter((candidate) => candidate.platform === "TWITCH");
  if (twitchAlerts.length) {
    try {
      const streams = await fetchTwitchStreams([...new Set(twitchAlerts.map((alert) => alert.channelRef.toLowerCase()))]);
      if (!streams) {
        if (!missingTwitchCredentialsLogged) {
          logWarn("alertes Twitch ignorées : Client ID/Secret de l'application Twitch non configurés (panel → Paramètres)");
          missingTwitchCredentialsLogged = true;
        }
      } else {
        missingTwitchCredentialsLogged = false;
        for (const alert of twitchAlerts) {
          const stream = streams.get(alert.channelRef.toLowerCase());
          if (stream && stream.id !== alert.lastSeenId && (await announceTwitchLive(client, alert, stream))) sent++;
        }
      }
    } catch (error) {
      logError("alertes Twitch", error);
    }
  }
  return sent;
}
