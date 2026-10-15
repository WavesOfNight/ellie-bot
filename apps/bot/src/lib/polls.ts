import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { prisma, type Poll } from "@ellie/database";
import { brandEmbed, COLORS, progressBar, truncate } from "./embeds.js";

export const POLL_PREFIX = "poll";
const NUMBER_EMOJIS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];

export function parsePollOptions(poll: Poll): string[] {
  try {
    const parsed = JSON.parse(poll.options) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

/** Embed + boutons d'un sondage, avec le décompte actuel des votes. */
export async function renderPoll(poll: Poll) {
  const options = parsePollOptions(poll);
  const votes = await prisma.pollVote.groupBy({ by: ["option"], where: { pollId: poll.id }, _count: { _all: true } });
  const counts = options.map((_, index) => votes.find((vote) => vote.option === index)?._count._all ?? 0);
  const total = counts.reduce((sum, count) => sum + count, 0);

  const embed = brandEmbed(COLORS.aqua)
    .setTitle(`📊 ${truncate(poll.question, 240)}`)
    .setDescription(
      options
        .map((option, index) => {
          const count = counts[index] ?? 0;
          const ratio = total ? count / total : 0;
          return `${NUMBER_EMOJIS[index]} **${option}**\n${progressBar(ratio)} ${Math.round(ratio * 100)} % (${count} vote${count > 1 ? "s" : ""})`;
        })
        .join("\n\n"),
    )
    .setFooter({ text: `${total} vote${total > 1 ? "s" : ""} · tu peux changer ton vote à tout moment` });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    options.map((option, index) =>
      new ButtonBuilder()
        .setCustomId(`${POLL_PREFIX}:${poll.id}:${index}`)
        .setLabel(truncate(option, 70))
        .setEmoji(NUMBER_EMOJIS[index] ?? "🔘")
        .setStyle(ButtonStyle.Secondary),
    ),
  );
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] as never[] } };
}
