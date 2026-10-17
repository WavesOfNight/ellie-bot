import "server-only";
import { prisma } from "@ellie/database";
import { channelMention, COMPONENT_IDS, rulesMessagePayload, ticketPanelContent, verificationMessagePayload } from "@ellie/database/shared";
import { deleteChannelMessage, findButtonMessages, getGuild, publishOrUpdateMessage } from "./discord";
import { FormError } from "./forms";

/** Ce qui a été fait sur Discord, pour le message affiché sous le formulaire. */
export interface PublishSummary {
  published: string[];
  /** Anciens boutons de vérification retirés (anciens bots, doublons) */
  removed: number;
}

/**
 * Publie (ou met à jour) le règlement et le message de vérification, puis retire les autres
 * boutons de vérification laissés dans ces salons par d'anciens bots : il n'en reste qu'un.
 */
export async function publishRulesAndVerification(guildId: string): Promise<PublishSummary> {
  const guild = await prisma.guild.findUniqueOrThrow({ where: { id: guildId } });
  const summary: PublishSummary = { published: [], removed: 0 };
  const kept = new Set<string>();

  if (guild.rulesChannelId && guild.rulesContent) {
    const messageId = await publishOrUpdateMessage(guild.rulesChannelId, guild.rulesMessageId, rulesMessagePayload(guild));
    await prisma.guild.update({ where: { id: guildId }, data: { rulesMessageId: messageId } });
    kept.add(messageId);
    summary.published.push("règlement");
  }

  if (guild.verifyChannelId) {
    const [discordGuild, rolesPanel, existing] = await Promise.all([
      getGuild(guildId),
      prisma.reactionRoleMessage.findFirst({ where: { guildId }, orderBy: { id: "asc" } }),
      guild.verifyMessageId ? Promise.resolve([]) : findButtonMessages(guild.verifyChannelId, COMPONENT_IDS.RULES_ACCEPT),
    ]);
    const payload = verificationMessagePayload(guild, {
      rules: channelMention(guild.rulesChannelId, "le règlement"),
      roles: channelMention(rolesPanel?.channelId, "le salon des rôles"),
      server: discordGuild?.name ?? "le serveur",
    });
    // Un bouton de vérification déjà publié par Ellie (même application que l'ancien bot) est réutilisé.
    const reusable = guild.verifyMessageId ?? existing.find((message) => message.own)?.id ?? null;
    const messageId = await publishOrUpdateMessage(guild.verifyChannelId, reusable, payload);
    await prisma.guild.update({ where: { id: guildId }, data: { verifyMessageId: messageId } });
    kept.add(messageId);
    summary.published.push("vérification");
  }

  for (const channelId of new Set([guild.rulesChannelId, guild.verifyChannelId].filter((id): id is string => Boolean(id)))) {
    for (const message of await findButtonMessages(channelId, COMPONENT_IDS.RULES_ACCEPT)) {
      if (kept.has(message.id)) continue;
      const removed = await deleteChannelMessage(channelId, message.id).then(
        () => true,
        () => false, // pas la permission « Gérer les messages » : le message reste, le diagnostic le signalera
      );
      if (removed) summary.removed++;
    }
  }
  return summary;
}

/** Publie (ou met à jour) le panneau « Besoin d'aide ? » : tickets + signalement anonyme. */
export async function publishTicketPanel(guildId: string): Promise<{ updated: boolean }> {
  const guild = await prisma.guild.findUniqueOrThrow({ where: { id: guildId } });
  if (!guild.ticketCategoryId || !guild.ticketPanelChannelId) {
    throw new FormError("Choisis d'abord la catégorie des tickets et le salon du panneau, puis enregistre.");
  }
  const content = ticketPanelContent(Boolean(guild.reportChannelId));
  const buttons = [
    { type: 2, style: 1, label: "Ouvrir un ticket", emoji: { name: "📩" }, custom_id: COMPONENT_IDS.TICKET_OPEN },
    ...(guild.reportChannelId ? [{ type: 2, style: 2, label: "Signalement anonyme", emoji: { name: "🕵️" }, custom_id: COMPONENT_IDS.REPORT_OPEN }] : []),
  ];
  const messageId = await publishOrUpdateMessage(guild.ticketPanelChannelId, guild.ticketPanelMessageId, {
    embeds: [{ title: content.title, description: content.description, color: content.color }],
    components: [{ type: 1, components: buttons }],
    allowed_mentions: { parse: [] },
  });
  await prisma.guild.update({ where: { id: guildId }, data: { ticketPanelMessageId: messageId } });
  return { updated: messageId === guild.ticketPanelMessageId };
}

export function describePublication(summary: PublishSummary): string {
  const parts = [summary.published.length ? `${summary.published.join(" et ")} à jour sur Discord ✅` : "rien à publier"];
  if (summary.removed) parts.push(`${summary.removed} ancien${summary.removed > 1 ? "s" : ""} bouton${summary.removed > 1 ? "s" : ""} de vérification retiré${summary.removed > 1 ? "s" : ""}`);
  return parts.join(" · ");
}
