import { createServiceStatusReporter, getTwitchBotConfig, getTwitchBotSecrets, type TwitchBotConfig } from "@ellie/database";
import { TwitchBot } from "./bot.js";
import { HelixError } from "./helix.js";
import { logError, logInfo, logWarn } from "./log.js";

const POLL_INTERVAL_MS = 5_000;
const RETRY_COOLDOWN_MS = 30_000;

/** Ce qui impose une reconnexion (le rafraîchissement du jeton, lui, n'en impose pas). */
function connectionKey(config: TwitchBotConfig): string {
  return [config.username, config.channelName, config.clientId, config.refreshTokenEncrypted].join("|").toLowerCase();
}

/** Raison d'un échec de connexion, avec la marche à suivre quand on la connaît (affichée dans le panel). */
export function explainConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/login authentication failed|improperly formatted auth|invalid nick/i.test(message)) {
    return "Twitch refuse la connexion du compte bot : reconnecte-le avec « Se connecter avec Twitch » (Bot Twitch → Paramètres).";
  }
  if (error instanceof HelixError && error.status === 401) {
    return "Jeton Twitch refusé : vérifie le Client ID/Secret, puis reconnecte le compte bot (Bot Twitch → Paramètres).";
  }
  return message;
}

/**
 * Supervision : relit la configuration toutes les 5 s. Attend tant que le bot est désactivé ou
 * incomplet, se (re)connecte automatiquement quand le compte, la chaîne ou l'application changent,
 * et publie son état pour le panel.
 */
export class TwitchSupervisor {
  private bot: TwitchBot | null = null;
  private currentKey: string | null = null;
  private failed: { key: string; at: number; detail: string } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private lastWaitingReason: string | null = null;
  private readonly report = createServiceStatusReporter("twitch");

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.disconnect("arrêt du service");
    await this.report("STOPPED", "service arrêté");
  }

  private waiting(reason: string): void {
    if (this.lastWaitingReason !== reason) logInfo(`en attente : ${reason}`);
    this.lastWaitingReason = reason;
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const config = await getTwitchBotConfig();
      const secrets = await getTwitchBotSecrets();
      let reason: string | null = null;
      if (!config.enabled) reason = "bot Twitch désactivé (panel → Bot Twitch → Modération)";
      else if (!config.clientId || !secrets.clientSecret) reason = "Client ID/Secret de l'application Twitch à saisir dans le panel";
      else if (!secrets.accessToken || !config.username) reason = "compte bot à connecter avec « Se connecter avec Twitch » dans le panel";
      else if (!config.channelName) reason = "chaîne à rejoindre à renseigner dans le panel (Bot Twitch → Paramètres)";

      if (reason) {
        if (this.bot) await this.disconnect(reason);
        this.waiting(reason);
        await this.report("WAITING", reason);
        return;
      }
      this.lastWaitingReason = null;

      const key = connectionKey(config);
      if (this.bot && key === this.currentKey) {
        this.bot.updateConfig(config);
        await this.reportConnection(this.bot);
        return;
      }
      if (this.failed?.key === key && Date.now() - this.failed.at < RETRY_COOLDOWN_MS) {
        await this.report("ERROR", this.failed.detail);
        return;
      }
      if (this.bot) await this.disconnect("nouvelle configuration détectée");

      const bot = new TwitchBot(config);
      try {
        await bot.connect();
        this.bot = bot;
        this.currentKey = key;
        this.failed = null;
        await this.reportConnection(bot);
      } catch (error) {
        const detail = `${explainConnectionError(error)} — nouvel essai dans 30 s.`;
        this.failed = { key, at: Date.now(), detail };
        await bot.disconnect();
        logError("connexion au chat Twitch impossible — nouvel essai dans 30 s", error);
        await this.report("ERROR", detail);
      }
    } catch (error) {
      logError("supervision du bot Twitch", error);
      await this.report("ERROR", `supervision du bot : ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.busy = false;
    }
  }

  private async reportConnection(bot: TwitchBot): Promise<void> {
    if (bot.isConnected()) await this.report("CONNECTED");
    else await this.report("RECONNECTING", "tmi.js se reconnecte automatiquement au chat");
  }

  private async disconnect(reason: string): Promise<void> {
    const bot = this.bot;
    this.bot = null;
    this.currentKey = null;
    if (!bot) return;
    logWarn(`déconnexion du chat Twitch (${reason})`);
    await bot.disconnect();
  }
}
