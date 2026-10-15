import type { ChatUserstate } from "tmi.js";
import type { HistoryEntry } from "@ellie/ai";
import type { TwitchBotConfig } from "@ellie/database";
import type { HelixClient } from "./helix.js";

/** Tout ce dont les modules du bot ont besoin pour agir sur la chaîne connectée. */
export interface TwitchContext {
  /** Dernière configuration lue en base (rafraîchie toutes les 5 s). */
  readonly config: TwitchBotConfig;
  readonly helix: HelixClient;
  /** Login de la chaîne (sans #). */
  readonly channelLogin: string;
  readonly broadcasterId: string;
  readonly botUserId: string;
  readonly botLogin: string;
  readonly chatBuffer: ChatBuffer;
  say(text: string): Promise<void>;
  /** Réponse liée au message d'origine (tag reply-parent-msg-id) quand c'est possible. */
  reply(parentMessageId: string | undefined, text: string): Promise<void>;
}

export interface ChatMessage {
  tags: ChatUserstate;
  text: string;
  login: string;
  displayName: string;
}

export function isModeratorOrBroadcaster(context: TwitchContext, tags: ChatUserstate): boolean {
  return Boolean(tags.mod || tags.badges?.broadcaster || tags.username?.toLowerCase() === context.channelLogin);
}

/** Tampon mémoire des derniers messages du chat (contexte fourni à Ellie : 8 messages / 10 minutes). */
export class ChatBuffer {
  private readonly entries: HistoryEntry[] = [];

  constructor(
    private readonly maxEntries = 8,
    private readonly windowMs = 10 * 60_000,
  ) {}

  push(entry: HistoryEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries * 2) this.entries.splice(0, this.entries.length - this.maxEntries);
  }

  recent(now = Date.now()): HistoryEntry[] {
    return this.entries.filter((entry) => now - entry.createdAt.getTime() <= this.windowMs).slice(-this.maxEntries);
  }
}
