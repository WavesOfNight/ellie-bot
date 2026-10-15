import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  OverwriteType,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type GuildMember,
  type GuildTextBasedChannel,
  type Message,
  type ModalSubmitInteraction,
  type OverwriteResolvable,
} from "discord.js";
import { prisma, type Guild as GuildSettings } from "@ellie/database";
import { COMPONENT_IDS, splitIds } from "@ellie/database/shared";
import { getGuildSettings } from "./cache.js";
import { brandEmbed } from "./embeds.js";
import { logError } from "./log.js";
import { replyEphemeral } from "./replies.js";

const CLOSE_DELAY_MS = 5_000;
const TRANSCRIPT_MAX_MESSAGES = 500;
const TICKET_COLOR = 0xa0c4ff;
const NOT_READY = "🛠️ Les tickets ne sont pas encore configurés sur ce serveur : l'équipe doit choisir une catégorie dans le panel.";

/** Nom du salon de ticket (comme l'ancien bot) : « 🎫・pseudo ». */
export function ticketChannelName(username: string): string {
  const slug = username
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `🎫・${slug || "membre"}`;
}

/** L'auteur·ice d'un ticket est noté·e dans le sujet du salon (format partagé avec l'ancien bot). */
export function ticketOwnerFromTopic(topic: string | null | undefined): string | null {
  return topic?.match(/ticket:(\d{17,20})/)?.[1] ?? null;
}

export function isTicketStaff(member: GuildMember, settings: GuildSettings): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  return splitIds(settings.ticketStaffRoleIds).some((roleId) => member.roles.cache.has(roleId));
}

async function findOpenTicketChannel(member: GuildMember, settings: GuildSettings): Promise<string | null> {
  const ticket = await prisma.ticket.findFirst({ where: { guildId: member.guild.id, userId: member.id, status: "OPEN" } });
  if (ticket) {
    if (member.guild.channels.cache.has(ticket.channelId)) return ticket.channelId;
    await prisma.ticket.update({ where: { id: ticket.id }, data: { status: "CLOSED", closedAt: new Date() } });
  }
  // Tickets ouverts par l'ancien bot : repérés par le sujet du salon.
  const legacy = member.guild.channels.cache.find(
    (channel) => channel.parentId === settings.ticketCategoryId && "topic" in channel && ticketOwnerFromTopic(channel.topic) === member.id,
  );
  return legacy?.id ?? null;
}

/** Bouton « Ouvrir un ticket » : salon privé (membre + staff), un seul ticket ouvert par membre. */
export async function openTicket(interaction: ButtonInteraction<"cached">): Promise<void> {
  const { guild, member, user } = interaction;
  const settings = await getGuildSettings(guild.id);
  const category = settings.ticketCategoryId ? guild.channels.cache.get(settings.ticketCategoryId) : null;
  if (category?.type !== ChannelType.GuildCategory) {
    await replyEphemeral(interaction, NOT_READY);
    return;
  }
  const already = await findOpenTicketChannel(member, settings);
  if (already) {
    await replyEphemeral(interaction, `📬 Tu as déjà un ticket ouvert : <#${already}>`);
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const access = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
  ];
  const staffRoles = splitIds(settings.ticketStaffRoleIds).filter((id) => guild.roles.cache.has(id));
  const overwrites: OverwriteResolvable[] = [
    ...category.permissionOverwrites.cache
      .filter((overwrite) => overwrite.id !== guild.roles.everyone.id && overwrite.id !== user.id)
      .map((overwrite) => ({ id: overwrite.id, type: overwrite.type, allow: overwrite.allow.toArray(), deny: overwrite.deny.toArray() })),
    { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id, type: OverwriteType.Member, allow: access },
    { id: interaction.client.user.id, type: OverwriteType.Member, allow: [...access, PermissionFlagsBits.ManageChannels] },
    ...staffRoles.map((id) => ({ id, type: OverwriteType.Role, allow: access })),
  ];

  try {
    const channel = await guild.channels.create({
      name: ticketChannelName(user.username),
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `Ticket de ${user.username} · ticket:${user.id}`,
      permissionOverwrites: overwrites,
      reason: `Ticket ouvert par ${user.tag}`,
    });
    await prisma.ticket.create({ data: { guildId: guild.id, channelId: channel.id, userId: user.id } });

    const pings = splitIds(settings.ticketPingRoleIds).filter((id) => guild.roles.cache.has(id));
    await channel.send({
      content: [`<@${user.id}>`, ...pings.map((id) => `<@&${id}>`)].join(" "),
      embeds: [
        brandEmbed(TICKET_COLOR)
          .setTitle("🎫 Ton ticket est ouvert")
          .setDescription(
            "Explique-nous ce qui se passe, à ton rythme. Tu peux ajouter des captures d'écran si tu veux 📸\n\n" +
              "Ici, **seul le staff et toi** voyez la conversation. Pas de jugement, promis 💕\n" +
              "Quand c'est réglé, clique sur 🔒 pour fermer le ticket.",
          ),
      ],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(COMPONENT_IDS.TICKET_CLOSE).setLabel("Fermer le ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger),
        ),
      ],
      allowedMentions: { users: [user.id], roles: pings },
    });
    await replyEphemeral(interaction, `💌 Ton ticket est ouvert : <#${channel.id}>`);
  } catch (error) {
    logError(`ouverture d'un ticket (serveur ${guild.id}, membre ${user.id})`, error);
    await replyEphemeral(interaction, "❌ Impossible de créer le ticket : vérifie que j'ai la permission « Gérer les salons » dans la catégorie des tickets.");
  }
}

/** Transcription texte d'un salon (500 derniers messages au maximum, du plus ancien au plus récent). */
export async function buildTranscript(channel: GuildTextBasedChannel): Promise<{ text: string; count: number }> {
  const messages: Message[] = [];
  let before: string | undefined;
  while (messages.length < TRANSCRIPT_MAX_MESSAGES) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    messages.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  messages.reverse();
  return { text: formatTranscript(messages), count: messages.length };
}

export function formatTranscript(
  messages: ReadonlyArray<Pick<Message, "createdAt" | "content" | "attachments" | "embeds"> & { author: { username: string } }>,
): string {
  return messages
    .map((message) => {
      const date = message.createdAt.toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
      const attachments = message.attachments.map((attachment) => attachment.url).join(" ");
      const content = message.content || (message.embeds.length ? "[embed]" : "");
      return `[${date}] ${message.author.username} : ${content} ${attachments}`.trim();
    })
    .join("\n");
}

/** Bouton « Fermer le ticket » : auteur·ice ou staff uniquement ; transcription archivée, puis suppression après 5 s. */
export async function closeTicket(interaction: ButtonInteraction<"cached">): Promise<void> {
  const channel = interaction.channel;
  if (!channel || channel.isDMBased() || !("topic" in channel)) return;
  const settings = await getGuildSettings(interaction.guildId);
  const ticket = await prisma.ticket.findFirst({ where: { channelId: channel.id, status: "OPEN" } });
  const ownerId = ticket?.userId ?? ticketOwnerFromTopic(channel.topic);
  if (!ownerId) {
    await replyEphemeral(interaction, "🤔 Ce salon ne ressemble pas à un ticket.");
    return;
  }
  if (interaction.user.id !== ownerId && !isTicketStaff(interaction.member, settings)) {
    await replyEphemeral(interaction, "🙅 Seul·e l'auteur·ice du ticket ou le staff peut le fermer.");
    return;
  }

  await interaction.reply({ content: "🔒 Fermeture du ticket dans 5 secondes… Merci d'avoir parlé au staff 💕", allowedMentions: { parse: [] } });
  const context = `fermeture du ticket ${channel.id} (serveur ${interaction.guildId})`;

  const archive = settings.ticketArchiveChannelId ? interaction.guild.channels.cache.get(settings.ticketArchiveChannelId) : null;
  if (archive?.isTextBased()) {
    try {
      const transcript = await buildTranscript(channel);
      await archive.send({
        embeds: [
          brandEmbed(0x8d99ae)
            .setTitle("🎫 Ticket fermé")
            .addFields(
              { name: "Ouvert par", value: `<@${ownerId}>`, inline: true },
              { name: "Fermé par", value: `<@${interaction.user.id}>`, inline: true },
              { name: "Messages", value: String(transcript.count), inline: true },
            ),
        ],
        files: [new AttachmentBuilder(Buffer.from(transcript.text, "utf8"), { name: `ticket-${ownerId}.txt` })],
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      logError(`${context} : archivage de la transcription`, error);
    }
  } else if (settings.ticketArchiveChannelId) {
    logError(context, new Error(`salon d'archives ${settings.ticketArchiveChannelId} introuvable`));
  }

  if (ticket) await prisma.ticket.update({ where: { id: ticket.id }, data: { status: "CLOSED", closedAt: new Date() } });
  setTimeout(() => {
    channel.delete(`Ticket fermé par ${interaction.user.tag}`).catch((error: unknown) => logError(`${context} : suppression du salon`, error));
  }, CLOSE_DELAY_MS).unref();
}

// ---------------------------------------------------------------------------
// Signalement anonyme
// ---------------------------------------------------------------------------

/** Bouton « Signalement anonyme » : formulaire en 3 champs. */
export async function openReportModal(interaction: ButtonInteraction<"cached">): Promise<void> {
  const settings = await getGuildSettings(interaction.guildId);
  if (!settings.reportChannelId) {
    await replyEphemeral(interaction, "Les signalements anonymes ne sont pas configurés sur ce serveur : ouvre plutôt un ticket 📩");
    return;
  }
  const field = (id: string, label: string, style: TextInputStyle, options: { required?: boolean; max: number; placeholder: string }) =>
    new LabelBuilder()
      .setLabel(label)
      .setTextInputComponent(
        new TextInputBuilder().setCustomId(id).setStyle(style).setRequired(options.required ?? false).setMaxLength(options.max).setPlaceholder(options.placeholder),
      );
  const modal = new ModalBuilder()
    .setCustomId(COMPONENT_IDS.REPORT_SUBMIT)
    .setTitle("🕵️ Signalement anonyme")
    .addLabelComponents(
      field("quoi", "Que s'est-il passé ?", TextInputStyle.Paragraph, { required: true, max: 1500, placeholder: "Raconte avec tes mots, même si ça te paraît petit." }),
      field("qui", "Qui est concerné·e ? (facultatif)", TextInputStyle.Short, { max: 200, placeholder: "Pseudo, salon…" }),
      field("preuve", "Lien vers un message (facultatif)", TextInputStyle.Short, { max: 300, placeholder: "Clic droit sur le message → Copier le lien" }),
    );
  await interaction.showModal(modal);
}

/** Envoi du signalement au staff. Volontairement : aucune trace de l'auteur·ice, ni en base ni dans les journaux. */
export async function submitReport(interaction: ModalSubmitInteraction<"cached">): Promise<void> {
  const settings = await getGuildSettings(interaction.guildId);
  const channel = settings.reportChannelId ? interaction.guild.channels.cache.get(settings.reportChannelId) : null;
  if (!channel?.isTextBased()) {
    await interaction.reply({ content: "Les signalements anonymes ne sont pas configurés : ouvre plutôt un ticket 📩", flags: MessageFlags.Ephemeral });
    return;
  }
  const value = (id: string) => interaction.fields.getTextInputValue(id)?.trim() || "—";
  try {
    await channel.send({
      embeds: [
        brandEmbed(0xff6b6b)
          .setTitle("🕵️ Nouveau signalement anonyme")
          .setDescription(value("quoi").slice(0, 4000))
          .addFields({ name: "Personne(s) concernée(s)", value: value("qui").slice(0, 1024) }, { name: "Lien / preuve", value: value("preuve").slice(0, 1024) })
          .setFooter({ text: "On vérifie avant d'agir · on ne cherche pas à savoir qui a signalé" }),
      ],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    logError(`signalement anonyme (serveur ${interaction.guildId})`, error);
    await interaction.reply({ content: "❌ Le signalement n'a pas pu être transmis. Réessaie ou ouvre un ticket.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({
    content: "💕 **Merci.** Ton signalement a été transmis au staff, sans ton pseudo.\nSi tu veux qu'on puisse te répondre, ouvre plutôt un ticket 📩",
    flags: MessageFlags.Ephemeral,
  });
}

// ---------------------------------------------------------------------------
// Règlement à accepter
// ---------------------------------------------------------------------------

/** Bouton « J'accepte le règlement » : donne le rôle d'accès au serveur. */
export async function acceptRules(interaction: ButtonInteraction<"cached">): Promise<void> {
  const settings = await getGuildSettings(interaction.guildId);
  const role = settings.rulesRoleId ? interaction.guild.roles.cache.get(settings.rulesRoleId) : null;
  if (!role) {
    await replyEphemeral(interaction, "🛠️ Le rôle du règlement n'est pas configuré : préviens l'équipe du serveur.");
    return;
  }
  if (interaction.member.roles.cache.has(role.id)) {
    await replyEphemeral(interaction, "🦊 Tu as déjà accepté le règlement ! (mais merci de l'avoir relu, c'est mignon 💕)");
    return;
  }
  if (!role.editable) {
    logError(`règlement (serveur ${interaction.guildId})`, new Error(`rôle « ${role.name} » au-dessus du rôle du bot`));
    await replyEphemeral(interaction, "😿 Je n'ai pas le droit de donner ce rôle : un·e admin doit placer mon rôle au-dessus.");
    return;
  }
  await interaction.member.roles.add(role, "A accepté le règlement");
  const rolesPanel = await prisma.reactionRoleMessage.findFirst({ where: { guildId: interaction.guildId }, orderBy: { id: "asc" } });
  await replyEphemeral(
    interaction,
    `🎉 **Bienvenue officiellement sur le serveur !** 🦊${rolesPanel ? `\n\n🎀 Prochaine étape : <#${rolesPanel.channelId}> pour choisir tes rôles.` : ""}`,
  );
}
