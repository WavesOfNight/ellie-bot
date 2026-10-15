import { getTwitchBotConfig, getTwitchBotSecrets, type TwitchBotConfig } from "@ellie/database";
import { TwitchBot } from "./bot.js";
import { logError, logInfo, logWarn } from "./log.js";

const POLL_INTERVAL_MS = 5_000;
const RETRY_COOLDOWN_MS = 30_000;

/** Ce qui impose une reconnexion (le rafraîchissement du jeton, lui, n'en impose pas). */
function connectionKey(config: TwitchBotConfig): string {
  return [config.username, config.channelName, config.clientId, config.refreshTokenEncrypted].join("|").toLowerCase();
}

/**
 * Supervision : relit la configuration toutes les 5 s. Attend tant que le bot est désactivé ou
 * incomplet, se (re)connecte automatiquement quand le compte, la chaîne ou l'application changent.
 */
export class TwitchSupervisor {
  private bot: TwitchBot | null = null;
  private currentKey: string | null = null;
  private failed: { key: string; at: number } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private lastWaitingReason: string | null = null;

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.disconnect("arrêt du service");
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
      else if (!config.channelName) reason = "chaîne à rejoindre à renseigner dans le panel";

      if (reason) {
        if (this.bot) await this.disconnect(reason);
        this.waiting(reason);
        return;
      }
      this.lastWaitingReason = null;

      const key = connectionKey(config);
      if (this.bot && key === this.currentKey) {
        this.bot.updateConfig(config);
        return;
      }
      if (this.failed?.key === key && Date.now() - this.failed.at < RETRY_COOLDOWN_MS) return;
      if (this.bot) await this.disconnect("nouvelle configuration détectée");

      const bot = new TwitchBot(config);
      try {
        await bot.connect();
        this.bot = bot;
        this.currentKey = key;
        this.failed = null;
      } catch (error) {
        this.failed = { key, at: Date.now() };
        await bot.disconnect();
        logError("connexion au chat Twitch impossible — nouvel essai dans 30 s", error);
      }
    } catch (error) {
      logError("supervision du bot Twitch", error);
    } finally {
      this.busy = false;
    }
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
