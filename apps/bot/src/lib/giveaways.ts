import { randomInt } from "node:crypto";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type Client, type GuildTextBasedChannel } from "discord.js";
import { prisma, type Giveaway } from "@ellie/database";
import { brandEmbed, COLORS, discordTimestamp } from "./embeds.js";
import { DISCORD_ERRORS, discordErrorCode, logError, logWarn } from "./log.js";

export const GIVEAWAY_PREFIX = "giveaway";
export const MAX_GIVEAWAY_WINNERS = 20;

export function giveawayEmbed(giveaway: Giveaway, entries: number, winners: string[] | null = null) {
  const embed = brandEmbed(giveaway.ended ? COLORS.lavender : COLORS.blush).setTitle(`🎉 ${giveaway.prize}`);
  if (giveaway.ended) {
    embed.setDescription(
      winners && winners.length
        ? `Giveaway terminé !\n**Gagnant${winners.length > 1 ? "s" : ""} :** ${winners.map((id) => `<@${id}>`).join(", ")}`
        : "Giveaway terminé : aucun participant 😢",
    );
  } else {
    embed.setDescription(`Clique sur **Participer** pour tenter ta chance !\nFin ${discordTimestamp(giveaway.endsAt, "R")}`);
  }
  return embed.addFields(
    { name: "Gagnants", value: String(giveaway.winnerCount), inline: true },
    { name: "Participants", value: entries.toLocaleString("fr-FR"), inline: true },
    { name: "Organisé par", value: `<@${giveaway.hostId}>`, inline: true },
  );
}

export function giveawayButtons(giveawayId: number, disabled = false) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${GIVEAWAY_PREFIX}:join:${giveawayId}`)
        .setLabel(disabled ? "Terminé" : "Participer")
        .setEmoji("🎉")
        .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(disabled),
    ),
  ];
}

async function resolveChannel(client: Client, giveaway: Giveaway): Promise<GuildTextBasedChannel | null> {
  const channel = await client.channels.fetch(giveaway.channelId).catch((error: unknown) => {
    if (discordErrorCode(error) !== DISCORD_ERRORS.UNKNOWN_CHANNEL) logError(`giveaway #${giveaway.id} : accès au salon`, error);
    return null;
  });
  return channel && channel.isTextBased() && !channel.isDMBased() ? channel : null;
}

/** Publie un giveaway créé depuis le panel ou la commande (message + bouton). */
export async function publishGiveaway(client: Client, giveaway: Giveaway): Promise<boolean> {
  const channel = await resolveChannel(client, giveaway);
  if (!channel) {
    logWarn(`giveaway #${giveaway.id} : salon ${giveaway.channelId} introuvable, publication impossible`);
    return false;
  }
  const message = await channel.send({
    embeds: [giveawayEmbed(giveaway, 0)],
    components: giveawayButtons(giveaway.id),
    allowedMentions: { parse: [] },
  });
  await prisma.giveaway.update({ where: { id: giveaway.id }, data: { messageId: message.id } });
  return true;
}

/** Tire `count` gagnants distincts au hasard. */
export function drawWinners(userIds: readonly string[], count: number): string[] {
  const pool = [...userIds];
  const winners: string[] = [];
  while (pool.length && winners.length < count) winners.push(pool.splice(randomInt(pool.length), 1)[0] as string);
  return winners;
}

/**
 * Termine un giveaway (ou relance le tirage) : annonce les gagnants puis met à jour le message.
 * Le giveaway n'est marqué « terminé » qu'après une annonce réussie (sauf salon supprimé).
 */
export async function endGiveaway(client: Client, giveawayId: number, options: { reroll?: boolean } = {}): Promise<string[] | null> {
  const giveaway = await prisma.giveaway.findUnique({ where: { id: giveawayId }, include: { entries: true } });
  if (!giveaway) return null;
  const context = `giveaway #${giveaway.id} (serveur ${giveaway.guildId})`;
  const channel = await resolveChannel(client, giveaway);
  if (!channel) {
    logWarn(`${context} : salon introuvable, giveaway clôturé sans annonce`);
    await prisma.giveaway.update({ where: { id: giveaway.id }, data: { ended: true } });
    return null;
  }

  const winners = drawWinners(
    giveaway.entries.map((entry) => entry.userId),
    giveaway.winnerCount,
  );
  const announcement = winners.length
    ? `🎉 ${options.reroll ? "Nouveau tirage ! " : ""}Félicitations ${winners.map((id) => `<@${id}>`).join(", ")} : vous gagnez **${giveaway.prize}** !`
    : `😢 Personne n'a participé au giveaway **${giveaway.prize}**.`;
  await channel.send({ content: announcement, allowedMentions: { users: winners } });

  const ended = await prisma.giveaway.update({ where: { id: giveaway.id }, data: { ended: true } });
  if (giveaway.messageId) {
    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    await message
      ?.edit({ embeds: [giveawayEmbed(ended, giveaway.entries.length, winners)], components: giveawayButtons(giveaway.id, true) })
      .catch((error: unknown) => logError(`${context} : mise à jour du message`, error));
  }
  return winners;
}

/** Boucle de 15 s : publie les giveaways en attente et termine ceux qui sont échus. */
export async function processGiveaways(client: Client): Promise<void> {
  const guildIds = [...client.guilds.cache.keys()];
  const pending = await prisma.giveaway.findMany({ where: { ended: false, messageId: null, guildId: { in: guildIds } } });
  for (const giveaway of pending) {
    await publishGiveaway(client, giveaway).catch((error: unknown) => logError(`giveaway #${giveaway.id} : publication`, error));
  }
  const due = await prisma.giveaway.findMany({
    where: { ended: false, endsAt: { lte: new Date() }, guildId: { in: guildIds }, messageId: { not: null } },
  });
  for (const giveaway of due) {
    await endGiveaway(client, giveaway.id).catch((error: unknown) => logError(`giveaway #${giveaway.id} : clôture`, error));
  }
}
