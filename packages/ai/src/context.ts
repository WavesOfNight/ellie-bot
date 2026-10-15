export type Platform = "discord" | "twitch";

/** Message du salon tel qu'il est transmis au modèle (pseudo d'affichage uniquement, aucun identifiant). */
export interface HistoryEntry {
  authorName: string;
  content: string;
  createdAt: Date;
  /** Message écrit par Ellie elle-même (étiqueté « Ellie »). */
  isEllie?: boolean;
  /** Message d'un autre bot (ignoré). */
  isBot?: boolean;
  attachments?: ReadonlyArray<"image" | "file">;
}

export interface UserPromptInput {
  platform: Platform;
  authorName: string;
  message: string;
  history?: readonly HistoryEntry[];
  /** Message auquel la personne répond (toujours inclus, même hors fenêtre). */
  referenced?: HistoryEntry | null;
  now?: Date;
  /** Fenêtre temporelle de l'historique (Discord : 20 min, Twitch : 10 min). */
  windowMinutes?: number;
  /** Nombre maximal de messages d'historique (Discord : 0-20, Twitch : 8). */
  maxEntries?: number;
  /** Consigne ajoutée à la fin (relance de modération). */
  extraInstruction?: string;
}

export const LINE_MAX_LENGTH = 300;
export const MESSAGE_MAX_LENGTH = 1000;
export const MAX_HISTORY_ENTRIES = 20;
export const ELLIE_LABEL = "Ellie";

/** Empêche un membre de fermer ou de forger une balise (`</contexte_salon>`, `<message …>`). */
export function escapeText(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Pseudo sur une seule ligne, échappé et raccourci. */
export function sanitizeName(name: string): string {
  const flat = name.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return escapeText(flat || "Anonyme").replace(/"/g, "&quot;").slice(0, 64);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function formatContent(entry: HistoryEntry): string {
  const attachments = (entry.attachments ?? []).map((kind) => (kind === "image" ? "[image]" : "[fichier]"));
  const text = [entry.content.replace(/\s+/g, " ").trim(), ...attachments].filter(Boolean).join(" ");
  return escapeText(truncate(text || "[message vide]", LINE_MAX_LENGTH));
}

function relativeTime(createdAt: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - createdAt.getTime()) / 60_000);
  return minutes < 1 ? "à l'instant" : `il y a ${minutes} min`;
}

function formatLine(entry: HistoryEntry, now: Date): string {
  const name = entry.isEllie ? ELLIE_LABEL : sanitizeName(entry.authorName);
  return `[${relativeTime(entry.createdAt, now)}] ${name} : ${formatContent(entry)}`;
}

/**
 * Construit l'UNIQUE message `user` envoyé au modèle : plateforme, contexte récent du salon,
 * puis le message auquel Ellie doit répondre. Aucun tour `assistant` n'est simulé.
 */
export function buildUserPrompt(input: UserPromptInput): string {
  const now = input.now ?? new Date();
  const windowMs = (input.windowMinutes ?? 20) * 60_000;
  const maxEntries = Math.min(Math.max(input.maxEntries ?? 10, 0), MAX_HISTORY_ENTRIES);

  const recent = (input.history ?? [])
    .filter((entry) => !entry.isBot || entry.isEllie)
    .filter((entry) => now.getTime() - entry.createdAt.getTime() <= windowMs)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(maxEntries === 0 ? (input.history?.length ?? 0) : -maxEntries);

  const lines = recent.map((entry) => formatLine(entry, now));
  if (input.referenced && !recent.includes(input.referenced)) {
    lines.push(`(en réponse à ce message) ${formatLine(input.referenced, now)}`);
  }

  const message = escapeText(truncate(input.message.trim(), MESSAGE_MAX_LENGTH));
  const parts = [
    `<plateforme>${input.platform}</plateforme>`,
    "<contexte_salon>",
    lines.length ? lines.join("\n") : "(aucun message récent)",
    "</contexte_salon>",
    `<message auteur="${sanitizeName(input.authorName)}">${message}</message>`,
  ];
  if (input.extraInstruction) parts.push(input.extraInstruction);
  return parts.join("\n");
}
