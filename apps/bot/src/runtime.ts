import type { Client } from "discord.js";
import { startActivityRotation } from "./lib/activity.js";
import { processGiveaways } from "./lib/giveaways.js";
import { logError } from "./lib/log.js";
import { syncReactionRoleMessages } from "./lib/reaction-roles.js";
import { processReminders, processTempBans, syncPermanentInvites, updateStatsChannels } from "./lib/server-upkeep.js";
import { checkSocialAlerts } from "./lib/social-alerts.js";
import { cleanupTempVoiceChannels } from "./lib/temp-voice.js";

type Task = { name: string; run: (client: Client) => Promise<unknown> };

/** Lance une boucle périodique sans chevauchement : une exécution lente ne se superpose jamais à la suivante. */
function startLoop(client: Client, intervalMs: number, tasks: Task[], runImmediately = true): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    for (const task of tasks) {
      try {
        await task.run(client);
      } catch (error) {
        logError(`tâche périodique « ${task.name} »`, error);
      }
    }
    running = false;
  };
  if (runImmediately) void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  return () => clearInterval(timer);
}

const runtimes = new WeakMap<Client, Array<() => void>>();

/** Démarre les boucles de fond d'un client connecté (appelé au `ready`). */
export function startRuntime(client: Client): void {
  stopRuntime(client);
  runtimes.set(client, [
    startLoop(client, 15_000, [
      { name: "giveaways", run: processGiveaways },
      { name: "messages de rôles", run: syncReactionRoleMessages },
      { name: "bans temporaires", run: processTempBans },
      { name: "rappels", run: processReminders },
      { name: "salons vocaux personnalisés", run: cleanupTempVoiceChannels },
    ]),
    startLoop(client, 60_000, [{ name: "alertes YouTube/Twitch", run: (c) => checkSocialAlerts(c) }]),
    startLoop(client, 10 * 60_000, [
      { name: "salon de statistiques", run: updateStatsChannels },
      { name: "invitations permanentes", run: syncPermanentInvites },
    ]),
    startActivityRotation(client),
  ]);
}

export function stopRuntime(client: Client): void {
  for (const stop of runtimes.get(client) ?? []) stop();
  runtimes.delete(client);
}
