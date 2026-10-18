import {
  addTwitchWatchMinutes,
  getActiveTwitchGiveaway,
  getPendingTwitchGiveawayAnnouncements,
  listEnabledTwitchTimers,
  markTwitchGiveawayAnnounced,
  markTwitchViewersPresent,
  markTwitchTimerSent,
  updateTwitchBotSettings,
} from "@ellie/database";
import type { TwitchContext } from "./context.js";
import { HelixError } from "./helix.js";
import { logError, logWarn } from "./log.js";

/**
 * Tâches périodiques du bot Twitch (timers, temps de visionnage, follows/abonnés, annonces de giveaways).
 * Chaque tâche est isolée : une erreur est journalisée sans arrêter les autres.
 */
export class TwitchTasks {
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly messagesSinceTimer = new Map<number, number>();
  private readonly startedAt = Date.now();
  private subscriptionsUnavailableLogged = false;
  private activeGiveaway: { id: number; keyword: string } | null = null;
  private liveStream: { id: string; startedAt: Date } | null = null;

  constructor(private readonly getContext: () => TwitchContext | null) {}

  start(): void {
    this.every(30_000, "timers", () => this.runTimers());
    this.every(5 * 60_000, "temps de visionnage", () => this.creditWatchTime(), false);
    this.every(60_000, "follows et abonnés", () => this.pollFollowsAndSubs());
    this.every(5_000, "annonces de giveaways", () => this.announceGiveaways());
    this.every(60_000, "état du live", () => this.refreshLiveStream());
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers.length = 0;
  }

  /** Compte les messages du chat (condition « minimum de messages » des timers). */
  countMessage(): void {
    for (const [id, count] of this.messagesSinceTimer) this.messagesSinceTimer.set(id, count + 1);
  }

  /** Live en cours (rafraîchi toutes les minutes), `null` hors live. */
  getLiveStream(): { id: string; startedAt: Date } | null {
    return this.liveStream;
  }

  /** Mot-clé du giveaway actif (mis à jour toutes les 5 s). */
  getActiveGiveaway(): { id: number; keyword: string } | null {
    return this.activeGiveaway;
  }

  private every(intervalMs: number, name: string, task: () => Promise<void>, runNow = true): void {
    let running = false;
    const tick = async () => {
      if (running || !this.getContext()) return;
      running = true;
      try {
        await task();
      } catch (error) {
        logError(`tâche « ${name} »`, error);
      } finally {
        running = false;
      }
    };
    if (runNow) void tick();
    this.timers.push(setInterval(() => void tick(), intervalMs));
  }

  private async runTimers(): Promise<void> {
    const context = this.getContext();
    if (!context) return;
    const now = Date.now();
    for (const timer of await listEnabledTwitchTimers()) {
      if (!this.messagesSinceTimer.has(timer.id)) this.messagesSinceTimer.set(timer.id, 0);
      // Au démarrage, on attend un intervalle complet plutôt que d'envoyer tous les timers d'un coup.
      const last = Math.max(timer.lastSentAt?.getTime() ?? 0, this.startedAt);
      const due = now - last >= timer.intervalMinutes * 60_000;
      const enoughMessages = (this.messagesSinceTimer.get(timer.id) ?? 0) >= timer.minMessages;
      if (!due || !enoughMessages) continue;
      await context.say(timer.message);
      await markTwitchTimerSent(timer.id, new Date(now));
      this.messagesSinceTimer.set(timer.id, 0);
    }
  }

  private async refreshLiveStream(): Promise<void> {
    const context = this.getContext();
    if (!context) return;
    const stream = await context.helix.getStream(context.broadcasterId);
    this.liveStream = stream ? { id: stream.id, startedAt: new Date(stream.started_at) } : null;
  }

  /** Temps de visionnage des spectateurs présents, et heure d'arrivée sur le live pour !myuptime. */
  private async creditWatchTime(): Promise<void> {
    const context = this.getContext();
    if (!context) return;
    await this.refreshLiveStream();
    if (!this.liveStream) return;
    const chatters = await context.helix.getChatters(context.broadcasterId, context.botUserId);
    const viewers = chatters.filter((login) => login !== context.botLogin);
    await addTwitchWatchMinutes(viewers, 5);
    await markTwitchViewersPresent(viewers, this.liveStream.id);
  }

  private async pollFollowsAndSubs(): Promise<void> {
    const context = this.getContext();
    if (!context) return;
    const { config } = context;

    if (config.announceFollows) {
      const followers = (await context.helix.getLatestFollowers(context.broadcasterId)).sort(
        (a, b) => new Date(a.followed_at).getTime() - new Date(b.followed_at).getTime(),
      );
      const newest = followers.at(-1);
      if (newest) {
        const lastKnown = config.lastKnownFollowAt?.getTime();
        const fresh = lastKnown === undefined ? [] : followers.filter((follower) => new Date(follower.followed_at).getTime() > lastKnown);
        if (fresh.length) {
          const names = fresh.map((follower) => follower.user_name);
          await context.say(
            names.length === 1 ? `💜 Merci pour le follow, ${names[0]} !` : `💜 Merci pour les follows : ${names.join(", ")} !`,
          );
        }
        if (lastKnown === undefined || fresh.length) {
          await updateTwitchBotSettings({ lastKnownFollowAt: new Date(newest.followed_at) });
        }
      }
    }

    try {
      const total = await context.helix.getSubscriptionTotal(context.broadcasterId);
      if (total !== config.lastKnownSubCount) await updateTwitchBotSettings({ lastKnownSubCount: total });
    } catch (error) {
      if (error instanceof HelixError && (error.status === 401 || error.status === 403)) {
        if (!this.subscriptionsUnavailableLogged) {
          logWarn("nombre d'abonnés illisible : seul le compte de la streameuse peut lire ses abonnements (les annonces de subs utilisent le chat).");
          this.subscriptionsUnavailableLogged = true;
        }
      } else {
        throw error;
      }
    }
  }

  private async announceGiveaways(): Promise<void> {
    const context = this.getContext();
    if (!context) return;
    const active = await getActiveTwitchGiveaway();
    this.activeGiveaway = active ? { id: active.id, keyword: active.keyword } : null;

    const { starts, ends } = await getPendingTwitchGiveawayAnnouncements();
    for (const giveaway of starts) {
      await context.say(`🎁 Giveaway lancé : ${giveaway.prize} ! Tape « ${giveaway.keyword} » dans le chat pour participer.`);
      await markTwitchGiveawayAnnounced(giveaway.id, "start");
    }
    for (const giveaway of ends) {
      await context.say(
        giveaway.status === "CANCELLED"
          ? `❌ Le giveaway « ${giveaway.prize} » est annulé.`
          : `🎉 Bravo @${giveaway.winnerUsername}, tu remportes « ${giveaway.prize} » !`,
      );
      await markTwitchGiveawayAnnounced(giveaway.id, "end");
    }
  }
}
