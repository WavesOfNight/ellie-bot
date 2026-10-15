import tmi from "tmi.js";
import { isKnownChatBot } from "@ellie/ai";
import { enterTwitchGiveaway, incrementTwitchDailyStat, recordTwitchChatMessage, type TwitchBotConfig } from "@ellie/database";
import { BOT_PERSONA_NAME } from "@ellie/database/shared";
import { moderateMessage } from "./automod.js";
import { handleCommand } from "./commands.js";
import { ChatBuffer, type ChatMessage, type TwitchContext } from "./context.js";
import { handleEllieTwitch } from "./ellie.js";
import { chatLine } from "./format.js";
import { HelixClient, TwitchTokenManager } from "./helix.js";
import { logError, logInfo } from "./log.js";
import { TwitchTasks } from "./tasks.js";

/** Une connexion au chat d'une chaîne, avec ses identifiants Helix résolus. */
export class TwitchBot {
  private client: tmi.Client | null = null;
  private context: TwitchContext | null = null;
  private config: TwitchBotConfig;
  private readonly tokens = new TwitchTokenManager();
  private readonly helix = new HelixClient(this.tokens);
  private readonly tasks = new TwitchTasks(() => this.context);
  private readonly chatBuffer = new ChatBuffer();

  constructor(config: TwitchBotConfig) {
    this.config = config;
  }

  /** Remplace la configuration (changements du panel pris en compte sans reconnexion). */
  updateConfig(config: TwitchBotConfig): void {
    this.config = config;
  }

  async connect(): Promise<void> {
    const botLogin = (this.config.username ?? "").toLowerCase();
    const channelLogin = (this.config.channelName ?? "").toLowerCase().replace(/^#/, "");
    const users = await this.helix.getUsers([botLogin, channelLogin]);
    const botUser = users.find((user) => user.login === botLogin);
    const broadcaster = users.find((user) => user.login === channelLogin);
    if (!botUser || !broadcaster) throw new Error(`compte bot « ${botLogin} » ou chaîne « ${channelLogin} » introuvable sur Twitch`);

    const client = new tmi.Client({
      options: { skipUpdatingEmotesets: true },
      connection: { reconnect: true, secure: true },
      // Fonction : tmi.js redemande le jeton à chaque (re)connexion, donc toujours le jeton rafraîchi.
      identity: { username: botLogin, password: async () => `oauth:${await this.tokens.getAccessToken()}` },
      channels: [channelLogin],
    });
    const channel = `#${channelLogin}`;

    const bot = this;
    this.context = {
      get config() {
        return bot.config;
      },
      helix: this.helix,
      channelLogin,
      broadcasterId: broadcaster.id,
      botUserId: botUser.id,
      botLogin,
      chatBuffer: this.chatBuffer,
      say: async (text) => {
        const line = chatLine(text);
        await client.say(channel, line);
        this.rememberOwnMessage(line);
      },
      reply: async (parentId, text) => {
        const line = chatLine(text);
        if (parentId && /^[\w-]+$/.test(parentId)) await client.raw(`@reply-parent-msg-id=${parentId} PRIVMSG ${channel} :${line}`);
        else await client.say(channel, line);
        this.rememberOwnMessage(line);
      },
    };

    client.on("message", (_channel, tags, text, self) => {
      if (self) return;
      void this.onMessage({ tags, text, login: (tags.username ?? "").toLowerCase(), displayName: tags["display-name"] ?? tags.username ?? "viewer" });
    });
    client.on("raided", (_channel, username, viewers) => void this.onRaid(username, viewers));
    client.on("subscription", (_channel, username) => void this.announceSub(`🎉 Merci pour l'abonnement, ${username} !`));
    client.on("resub", (_channel, username, months) =>
      void this.announceSub(`🎉 ${username} se réabonne${months > 1 ? ` pour ${months} mois` : ""}, merci !`),
    );
    client.on("subgift", (_channel, username, _streak, recipient) => void this.announceSub(`🎁 ${username} offre un abonnement à ${recipient}, merci !`));
    client.on("submysterygift", (_channel, username, count) =>
      void this.announceSub(`🎁 ${username} offre ${count} abonnement${count > 1 ? "s" : ""} à la communauté, merci !`),
    );
    client.on("disconnected", (reason) => logInfo(`déconnecté du chat (${reason}) — reconnexion automatique`));

    await client.connect();
    this.client = client;
    this.tasks.start();
    logInfo(`connecté au chat de ${channelLogin} en tant que ${botLogin}`);
  }

  async disconnect(): Promise<void> {
    this.tasks.stop();
    const client = this.client;
    this.client = null;
    this.context = null;
    if (client) await client.disconnect().catch(() => undefined); // déjà déconnecté : rien à faire
  }

  private rememberOwnMessage(text: string): void {
    this.chatBuffer.push({ authorName: BOT_PERSONA_NAME, content: text, createdAt: new Date(), isEllie: true, isBot: true });
  }

  private async onMessage(message: ChatMessage): Promise<void> {
    const context = this.context;
    if (!context) return;
    try {
      await incrementTwitchDailyStat("messages");
      this.tasks.countMessage();
      if (await moderateMessage(context, message)) return;

      this.chatBuffer.push({ authorName: message.displayName, content: message.text, createdAt: new Date(), isBot: message.login === context.botLogin || isKnownChatBot(message.login) });

      if (message.login !== context.botLogin && !isKnownChatBot(message.login)) {
        const xp = await recordTwitchChatMessage(message.login);
        if (xp.leveledUp) await context.say(`🎉 GG @${message.displayName} ! Tu passes au niveau ${xp.level} sur Twitch !`);
      }

      const giveaway = this.tasks.getActiveGiveaway();
      if (giveaway && message.text.trim().toLowerCase() === giveaway.keyword) {
        await enterTwitchGiveaway(giveaway.id, message.login);
        return;
      }

      if (await handleCommand(context, message)) return;
      await handleEllieTwitch(context, message);
    } catch (error) {
      logError(`traitement d'un message de ${message.login}`, error);
    }
  }

  private async onRaid(username: string, viewers: number): Promise<void> {
    const context = this.context;
    if (!context || !this.config.raidShoutoutEnabled) return;
    try {
      const [raider] = await context.helix.getUsers([username]);
      if (raider) {
        await context.helix
          .shoutout(context.broadcasterId, raider.id, context.botUserId)
          .catch((error: unknown) => logError(`shoutout du raid de ${username}`, error));
      }
      await context.say(
        `💜 Merci ${raider?.display_name ?? username} pour le raid avec ${viewers} viewer${viewers > 1 ? "s" : ""} ! Allez faire un tour sur https://twitch.tv/${raider?.login ?? username}`,
      );
    } catch (error) {
      logError(`raid de ${username}`, error);
    }
  }

  private async announceSub(text: string): Promise<void> {
    if (!this.context || !this.config.announceSubs) return;
    await this.context.say(text).catch((error: unknown) => logError("annonce d'abonnement", error));
  }
}
