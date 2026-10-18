import type { ServiceStatus } from "@prisma/client";
import { prisma } from "./client.js";

/**
 * État des services (bot Twitch) : le service l'écrit au fil de l'eau, le panel l'affiche. Un
 * signe de vie trop ancien signifie que le service est arrêté ou planté.
 */

export type ServiceState = "CONNECTED" | "RECONNECTING" | "WAITING" | "ERROR" | "STOPPED";

/** Le service réécrit son état au moins à ce rythme, même s'il ne change pas. */
export const SERVICE_HEARTBEAT_MS = 30_000;
/** Au-delà, le service ne donne plus signe de vie. */
export const SERVICE_STALE_MS = 90_000;
const MAX_DETAIL_LENGTH = 500;

export async function writeServiceStatus(id: string, state: ServiceState, detail: string, changed: boolean): Promise<void> {
  const now = new Date();
  const data = { state, detail: detail.slice(0, MAX_DETAIL_LENGTH), heartbeatAt: now, ...(changed ? { since: now } : {}) };
  await prisma.serviceStatus.upsert({ where: { id }, create: { id, ...data, since: now }, update: data });
}

/**
 * Rapporteur d'état d'un service : écrit dès que l'état change, sinon au plus une fois toutes les
 * 30 s (signe de vie). Les échecs d'écriture sont ignorés : l'état reste informatif.
 */
export function createServiceStatusReporter(id: string, write: typeof writeServiceStatus = writeServiceStatus, now: () => number = Date.now) {
  let last: { state: ServiceState; detail: string; at: number } | null = null;
  return async (state: ServiceState, detail = ""): Promise<void> => {
    const changed = !last || last.state !== state || last.detail !== detail;
    if (!changed && last && now() - last.at < SERVICE_HEARTBEAT_MS) return;
    try {
      await write(id, state, detail, changed);
      last = { state, detail, at: now() };
    } catch {
      // Base momentanément indisponible : nouvel essai au prochain appel.
    }
  };
}

export async function getServiceStatus(id: string): Promise<ServiceStatus | null> {
  return prisma.serviceStatus.findUnique({ where: { id } });
}

export interface ServiceStatusView {
  level: "ok" | "warning" | "error";
  /** Libellé court (badge) */
  label: string;
  title: string;
  detail: string;
  since: Date | null;
}

/** État du bot Twitch tel qu'affiché dans le panel, avec la marche à suivre. */
export function describeTwitchStatus(
  status: Pick<ServiceStatus, "state" | "detail" | "since" | "heartbeatAt"> | null,
  bot: { username: string | null; channelName: string | null },
  now = new Date(),
): ServiceStatusView {
  if (!status) {
    return {
      level: "error",
      label: "hors ligne",
      title: "Le service Twitch n'a jamais démarré",
      detail: "Sur le serveur : systemctl status ellie-twitch (puis journalctl -u ellie-twitch -n 30 pour voir l'erreur).",
      since: null,
    };
  }
  if (status.state === "STOPPED" || now.getTime() - status.heartbeatAt.getTime() > SERVICE_STALE_MS) {
    return {
      level: "error",
      label: "hors ligne",
      title: "Le service Twitch est arrêté",
      detail: "Sur le serveur : systemctl restart ellie-twitch, puis journalctl -u ellie-twitch -n 30 si ça recommence.",
      since: status.heartbeatAt,
    };
  }
  switch (status.state) {
    case "CONNECTED": {
      const sameAccount = bot.username && bot.channelName && bot.username.toLowerCase() === bot.channelName.toLowerCase();
      return sameAccount
        ? {
            level: "warning",
            label: "connecté",
            title: `Connecté, mais avec le compte de la chaîne (${bot.username})`,
            detail: "Ellie parle alors au nom de la streameuse et ignore ses messages. Connecte un compte Twitch dédié au bot.",
            since: status.since,
          }
        : {
            level: "ok",
            label: "connecté",
            title: `Connecté au chat de ${bot.channelName ?? "la chaîne"}`,
            detail: `Ellie parle en tant que ${bot.username ?? "compte bot"} et ignore les messages de ce compte : teste les commandes depuis un autre compte.`,
            since: status.since,
          };
    }
    case "RECONNECTING":
      return { level: "warning", label: "reconnexion", title: "Connexion au chat perdue, reconnexion en cours…", detail: status.detail, since: status.since };
    case "WAITING":
      return { level: "warning", label: "en attente", title: "En attente", detail: status.detail, since: status.since };
    default:
      return { level: "error", label: "erreur", title: "Connexion impossible", detail: status.detail, since: status.since };
  }
}
