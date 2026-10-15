import { cleanContent, type Message } from "discord.js";
import {
  buildDiscordReplyOptions,
  EllieResponder,
  evaluateDiscordTrigger,
  isApiKeyConfigured,
  stripBotMention,
  type HistoryEntry,
} from "@ellie/ai";
import { toAutoModLevel } from "@ellie/database/shared";
import type { Guild as GuildSettings } from "@ellie/database";
import { getCachedAiSettings, getCommunityName } from "./cache.js";
import { logError } from "./log.js";

const responder = new EllieResponder();
const TYPING_RENEW_MS = 8_000;

function attachmentKinds(message: Message): Array<"image" | "file"> {
  return message.attachments.map((attachment) => (attachment.contentType?.startsWith("image/") ? "image" : "file"));
}

function toHistoryEntry(message: Message<true>, botUserId: string): HistoryEntry {
  return {
    authorName: message.member?.displayName ?? message.author.displayName,
    content: message.cleanContent,
    createdAt: message.createdAt,
    isEllie: message.author.id === botUserId,
    isBot: message.author.bot,
    attachments: attachmentKinds(message),
  };
}

/**
 * Personnalité IA « Ellie » sur Discord. Appelée en dernier dans messageCreate, de façon
 * asynchrone : ne bloque jamais les autres traitements et ne fait jamais planter le handler.
 */
export async function handleEllieMessage(message: Message<true>, settings: GuildSettings, handledElsewhere: boolean): Promise<void> {
  const client = message.client;
  const ai = await getCachedAiSettings(message.guildId);
  if (!ai.enabled || handledElsewhere) return;

  let referenced: Message | null = null;
  if (message.reference?.messageId) {
    referenced = await message.fetchReference().catch(() => null);
  }
  const decision = evaluateDiscordTrigger(
    {
      content: message.content,
      authorId: message.author.id,
      authorIsBot: message.author.bot,
      isDirectMessage: !message.inGuild(),
      channelId: message.channelId,
      botUserId: client.user.id,
      isReplyToEllie: referenced?.author.id === client.user.id,
      handledElsewhere,
    },
    { ...ai, apiKeyConfigured: await isApiKeyConfigured() },
  );
  if (!decision.triggered) return;

  const text =
    decision.kind === "mention"
      ? cleanContent(stripBotMention(message.content, client.user.id), message.channel)
      : cleanContent(message.content, message.channel);

  const blocked = new Set(ai.blockedUserIds);
  let history: HistoryEntry[] = [];
  if (ai.contextMessages > 0) {
    const fetched = await message.channel.messages.fetch({ limit: ai.contextMessages, before: message.id }).catch((error: unknown) => {
      logError(`Ellie : lecture de l'historique (serveur ${message.guildId}, salon ${message.channelId})`, error);
      return null;
    });
    history = (fetched ? [...fetched.values()] : [])
      .filter((entry) => !entry.system && !blocked.has(entry.author.id))
      .filter((entry): entry is Message<true> => entry.inGuild())
      .map((entry) => toHistoryEntry(entry, client.user.id));
  }
  const referencedEntry =
    referenced?.inGuild() && !blocked.has(referenced.author.id) ? toHistoryEntry(referenced, client.user.id) : null;

  let typingTimer: NodeJS.Timeout | null = null;
  const startTyping = () => {
    const sendTyping = () => void message.channel.sendTyping().catch(() => undefined); // indicateur purement cosmétique
    sendTyping();
    typingTimer = setInterval(sendTyping, TYPING_RENEW_MS);
  };

  try {
    const action = await responder.respond({
      scope: message.guildId,
      userKey: `${message.guildId}:${message.author.id}`,
      channelKey: message.channelId,
      limits: {
        userCooldownSeconds: ai.userCooldownSeconds,
        channelMaxPerMinute: ai.channelMaxPerMinute,
        dailyReplyCap: ai.dailyReplyCap,
      },
      canReact: true,
      logContext: `discord serveur=${message.guildId} salon=${message.channelId}`,
      onGenerate: startTyping,
      input: {
        platform: "discord",
        model: ai.model,
        effort: ai.effort,
        authorName: message.member?.displayName ?? message.author.displayName,
        message: text,
        history,
        referenced: referencedEntry,
        serverLore: ai.serverLore,
        communityName: await getCommunityName(),
        moderationLevel: toAutoModLevel(settings.autoModLevel),
        windowMinutes: 20,
        maxHistory: ai.contextMessages,
      },
    });

    if (action.kind === "reply") {
      await message.reply(buildDiscordReplyOptions(action.text)).catch((error: unknown) => {
        logError(`Ellie : envoi de la réponse (serveur ${message.guildId}, salon ${message.channelId})`, error);
      });
    } else if (action.kind === "react") {
      await message.react(action.emoji).catch((error: unknown) => {
        logError(`Ellie : réaction ${action.emoji} (serveur ${message.guildId}, salon ${message.channelId})`, error);
      });
    }
  } finally {
    if (typingTimer) clearInterval(typingTimer);
  }
}
