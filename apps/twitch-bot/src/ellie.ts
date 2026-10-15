import { EllieResponder, formatTwitchReply, isKnownChatBot, mentionsTwitchBot, stripTwitchMention } from "@ellie/ai";
import { getAppSettings, TWITCH_AI_SCOPE } from "@ellie/database";
import { toAutoModLevel } from "@ellie/database/shared";
import type { ChatMessage, TwitchContext } from "./context.js";
import { logError } from "./log.js";

const responder = new EllieResponder();

/**
 * Ellie sur le chat Twitch : seulement si l'option est activée et que le message mentionne
 * le compte du bot. Les cooldowns et le plafond se traduisent par du silence (pas de réaction possible).
 */
export async function handleEllieTwitch(context: TwitchContext, message: ChatMessage): Promise<void> {
  const { config } = context;
  if (!config.aiEnabled) return;
  if (message.login === context.botLogin || isKnownChatBot(message.login)) return;
  if (!mentionsTwitchBot(message.text, context.botLogin)) return;

  try {
    const action = await responder.respond({
      scope: TWITCH_AI_SCOPE,
      userKey: `twitch:${message.login}`,
      limits: {
        userCooldownSeconds: config.aiUserCooldownSeconds,
        globalCooldownSeconds: config.aiGlobalCooldownSeconds,
        dailyReplyCap: config.aiDailyReplyCap,
      },
      canReact: false,
      logContext: `twitch chaîne=${context.channelLogin}`,
      input: {
        platform: "twitch",
        model: config.aiModel,
        effort: "low",
        authorName: message.displayName,
        message: stripTwitchMention(message.text, context.botLogin),
        history: context.chatBuffer.recent(),
        communityName: (await getAppSettings()).communityName,
        moderationLevel: toAutoModLevel(config.autoModLevel),
        commandPrefix: config.prefix,
        windowMinutes: 10,
        maxHistory: 8,
      },
    });
    if (action.kind === "reply") await context.reply(message.tags.id, formatTwitchReply(message.displayName, action.text));
  } catch (error) {
    logError(`Ellie sur Twitch (${message.login})`, error);
  }
}
