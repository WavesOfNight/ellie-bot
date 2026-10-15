import type { MessageReaction, PartialMessageReaction, PartialUser, User } from "discord.js";
import { prisma } from "@ellie/database";
import { getGuildSettings } from "./cache.js";
import { brandEmbed, truncate } from "./embeds.js";
import { logError } from "./log.js";

const STARBOARD_COLOR = 0xf5c542;

function emojiMatches(reaction: MessageReaction, configured: string): boolean {
  const custom = configured.match(/<a?:\w+:(\d+)>/);
  if (custom) return reaction.emoji.id === custom[1];
  if (/^\d{17,20}$/.test(configured)) return reaction.emoji.id === configured;
  return reaction.emoji.name === configured;
}

/** Publie (ou met à jour) un message dans le starboard quand le seuil de réactions est atteint. */
export async function handleStarboardReaction(
  partialReaction: MessageReaction | PartialMessageReaction,
  _user: User | PartialUser,
): Promise<void> {
  const reaction = partialReaction.partial ? await partialReaction.fetch() : partialReaction;
  const message = reaction.message.partial ? await reaction.message.fetch() : reaction.message;
  if (!message.inGuild() || message.author.bot) return;

  const settings = await getGuildSettings(message.guildId);
  if (!settings.starboardChannelId || message.channelId === settings.starboardChannelId) return;
  if (!emojiMatches(reaction, settings.starboardEmoji)) return;
  const count = reaction.count ?? 0;
  if (count < settings.starboardThreshold) return;

  const context = `starboard (serveur ${message.guildId}, message ${message.id})`;
  const channel = message.guild.channels.cache.get(settings.starboardChannelId);
  if (!channel?.isTextBased()) {
    logError(context, new Error(`salon starboard ${settings.starboardChannelId} introuvable`));
    return;
  }

  const image = message.attachments.find((attachment) => attachment.contentType?.startsWith("image/"));
  const embed = brandEmbed(STARBOARD_COLOR)
    .setAuthor({ name: message.member?.displayName ?? message.author.username, iconURL: message.author.displayAvatarURL() })
    .setDescription(truncate(message.content || "*(message sans texte)*", 4000))
    .addFields({ name: "Message d'origine", value: `[Aller au message](${message.url})` })
    .setTimestamp(message.createdAt);
  if (image) embed.setImage(image.url);
  const content = `${settings.starboardEmoji} ${count} | <#${message.channelId}>`;

  const existing = await prisma.starboardPost.findUnique({ where: { originalMessageId: message.id } });
  try {
    if (existing) {
      const posted = await channel.messages.fetch(existing.starboardMessageId).catch(() => null);
      if (posted) {
        await posted.edit({ content, embeds: [embed] });
        await prisma.starboardPost.update({ where: { id: existing.id }, data: { starCount: count } });
        return;
      }
    }
    const posted = await channel.send({ content, embeds: [embed], allowedMentions: { parse: [] } });
    await prisma.starboardPost.upsert({
      where: { originalMessageId: message.id },
      create: {
        guildId: message.guildId,
        originalMessageId: message.id,
        originalChannelId: message.channelId,
        starboardMessageId: posted.id,
        starCount: count,
      },
      update: { starboardMessageId: posted.id, starCount: count },
    });
  } catch (error) {
    logError(context, error);
  }
}
