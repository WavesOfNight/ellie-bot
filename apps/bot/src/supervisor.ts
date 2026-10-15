import { createHash } from "node:crypto";
import type { Client } from "discord.js";
import { getDiscordCredentials } from "@ellie/database";
import { createDiscordClient } from "./client.js";
import { logError, logInfo, logWarn } from "./lib/log.js";
import { stopRuntime } from "./runtime.js";

const POLL_INTERVAL_MS = 5_000;
const RETRY_COOLDOWN_MS = 30_000;

function fingerprint(clientId: string, token: string): string {
  return createHash("sha256").update(`${clientId}:${token}`).digest("hex");
}

/**
 * Boucle de supervision : relit la configuration toutes les 5 s. Sans token, attend en le signalant ;
 * si le token ou le Client ID change, se reconnecte automatiquement (cooldown de 30 s entre deux
 * tentatives échouées avec la même configuration). Aucun redémarrage manuel nécessaire.
 */
export class DiscordSupervisor {
  private client: Client | null = null;
  private currentFingerprint: string | null = null;
  private failed: { fingerprint: string; at: number } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private waitingLogged = false;

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.disconnect("arrêt du service");
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const credentials = await getDiscordCredentials();
      if (!credentials) {
        if (this.client) await this.disconnect("token supprimé du panel");
        if (!this.waitingLogged) {
          logInfo("en attente du token Discord : colle-le dans le panel (Paramètres) — connexion automatique ensuite.");
          this.waitingLogged = true;
        }
        return;
      }
      this.waitingLogged = false;

      const next = fingerprint(credentials.clientId, credentials.token);
      if (next === this.currentFingerprint) return;
      if (this.failed?.fingerprint === next && Date.now() - this.failed.at < RETRY_COOLDOWN_MS) return;

      if (this.client) await this.disconnect("nouvelle configuration détectée");
      await this.connect(credentials.token, next);
    } catch (error) {
      logError("supervision du bot Discord", error);
    } finally {
      this.busy = false;
    }
  }

  private async connect(token: string, nextFingerprint: string): Promise<void> {
    const client = createDiscordClient();
    try {
      await client.login(token);
      this.client = client;
      this.currentFingerprint = nextFingerprint;
      this.failed = null;
    } catch (error) {
      this.failed = { fingerprint: nextFingerprint, at: Date.now() };
      await client.destroy().catch(() => undefined);
      logError("connexion à Discord impossible (token invalide ? intents privilégiés non activés ?) — nouvel essai dans 30 s", error);
    }
  }

  private async disconnect(reason: string): Promise<void> {
    const client = this.client;
    this.client = null;
    this.currentFingerprint = null;
    if (!client) return;
    logWarn(`déconnexion de Discord (${reason})`);
    stopRuntime(client);
    await client.destroy().catch((error: unknown) => logError("fermeture du client Discord", error));
  }
}
