import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ButtonInteraction,
  type Client,
  type Role,
  type StringSelectMenuInteraction,
} from "discord.js";
import { prisma, type ReactionRoleGroup, type ReactionRoleMessage, type ReactionRoleOption } from "@ellie/database";
import { BOT_NAME, DEFAULT_ROLE_PANEL_DESCRIPTION, ROLE_PANEL_LIMITS } from "@ellie/database/shared";
import { brandEmbed } from "./embeds.js";
import { DISCORD_ERRORS, discordErrorCode, logError, logWarn } from "./log.js";
import { replyEphemeral } from "./replies.js";

/** rrg:<groupe> ouvre le menu d'un groupe · rrs:<groupe> valide le menu · rr:<groupe>:<rôle> bascule un rôle. */
export const ROLE_GROUP_PREFIX = "rrg";
export const ROLE_SELECT_PREFIX = "rrs";
export const ROLE_TOGGLE_PREFIX = "rr";
/** Boutons et menus publiés par l'ancien bot : roles:ouvrir:<clé> / roles:choisir:<clé>. */
export const LEGACY_ROLES_PREFIX = "roles";

const NO_ROLE_VALUE = "aucun";
const CANNOT_EDIT_OTHER_AUTHOR = 50005;
const MISSING_PERMISSION_MESSAGE =
  "😿 Je n'ai pas le droit de toucher à ce rôle. Un·e admin doit placer **mon rôle au-dessus** des rôles à distribuer.";

export type GroupWithOptions = ReactionRoleGroup & { options: ReactionRoleOption[] };
export type PanelWithGroups = ReactionRoleMessage & { groups: GroupWithOptions[] };

const byOrder = <T extends { order: number; id: number }>(a: T, b: T) => a.order - b.order || a.id - b.id;

function parseColor(color: string): number {
  const value = Number.parseInt(color.replace("#", ""), 16);
  return Number.isFinite(value) ? value : 0xff7eb6;
}

/** Message d'un panneau de rôles : embed + boutons (5 par rangée, 25 au maximum). */
export function buildRolePanelPayload(panel: PanelWithGroups) {
  const groups = [...panel.groups].sort(byOrder);
  const lines = groups.map((group) => `${group.emoji ? `${group.emoji} ` : ""}**${group.title}**${group.help ? ` — ${group.help}` : ""}`);
  const embed = brandEmbed(parseColor(panel.color))
    .setTitle(panel.title)
    .setDescription(`${panel.description || DEFAULT_ROLE_PANEL_DESCRIPTION}${lines.length ? `\n\n${lines.join("\n")}` : ""}`)
    .setFooter({ text: `${BOT_NAME} · seul·e toi vois tes choix 🤫` });

  const buttons: ButtonBuilder[] = [];
  for (const group of groups) {
    if (group.display === "BUTTONS") {
      for (const option of [...group.options].sort(byOrder)) {
        const button = new ButtonBuilder()
          .setCustomId(`${ROLE_TOGGLE_PREFIX}:${group.id}:${option.roleId}`)
          .setLabel(option.label.slice(0, 80))
          .setStyle(ButtonStyle.Secondary);
        if (option.emoji) button.setEmoji(option.emoji);
        buttons.push(button);
      }
    } else {
      const button = new ButtonBuilder()
        .setCustomId(`${ROLE_GROUP_PREFIX}:${group.id}`)
        .setLabel(group.title.slice(0, 80))
        .setStyle(ButtonStyle.Secondary);
      if (group.emoji) button.setEmoji(group.emoji);
      buttons.push(button);
    }
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  buttons.slice(0, ROLE_PANEL_LIMITS.MAX_COMPONENTS).forEach((button, index) => {
    if (index % 5 === 0) rows.push(new ActionRowBuilder<ButtonBuilder>());
    rows[rows.length - 1]?.addComponents(button);
  });
  return { embeds: [embed], components: rows, allowedMentions: { parse: [] as never[] } };
}

/** Boucle de 15 s : (re)publie ou édite les panneaux de rôles marqués « dirty ». */
export async function syncReactionRoleMessages(client: Client): Promise<void> {
  const panels = await prisma.reactionRoleMessage.findMany({
    where: { dirty: true, guildId: { in: [...client.guilds.cache.keys()] } },
    include: { groups: { include: { options: true } } },
  });

  for (const panel of panels) {
    const context = `panneau de rôles #${panel.id} (serveur ${panel.guildId}, salon ${panel.channelId})`;
    try {
      const channel = await client.channels.fetch(panel.channelId).catch(() => null);
      if (!channel?.isTextBased() || channel.isDMBased()) {
        logWarn(`${context} : salon introuvable`);
        continue;
      }
      const payload = buildRolePanelPayload(panel);
      let messageId = panel.messageId;
      if (messageId) {
        const existing = await channel.messages.fetch(messageId).catch(() => null);
        try {
          if (!existing) throw Object.assign(new Error("message introuvable"), { code: DISCORD_ERRORS.UNKNOWN_MESSAGE });
          await existing.edit(payload);
        } catch (error) {
          const code = discordErrorCode(error);
          if (code !== DISCORD_ERRORS.UNKNOWN_MESSAGE && code !== CANNOT_EDIT_OTHER_AUTHOR) throw error;
          // Message publié par un autre bot (ancien bot) : on le remplace pour que les boutons fonctionnent.
          if (existing && code === CANNOT_EDIT_OTHER_AUTHOR) {
            await existing.delete().catch((deleteError: unknown) => logError(`${context} : suppression de l'ancien message`, deleteError));
          }
          messageId = null;
        }
      }
      if (!messageId) messageId = (await channel.send(payload)).id;
      await prisma.reactionRoleMessage.update({ where: { id: panel.id }, data: { dirty: false, messageId } });
    } catch (error) {
      logError(context, error);
    }
  }
}

export async function findRoleGroup(guildId: string, groupId: number): Promise<GroupWithOptions | null> {
  if (!Number.isInteger(groupId)) return null;
  return prisma.reactionRoleGroup.findFirst({ where: { id: groupId, panel: { guildId } }, include: { options: true } });
}

export async function findLegacyRoleGroup(guildId: string, legacyKey: string): Promise<GroupWithOptions | null> {
  return prisma.reactionRoleGroup.findFirst({ where: { legacyKey, panel: { guildId } }, include: { options: true } });
}

/** Ouvre le menu à cocher d'un groupe (visible uniquement par le membre), rôles actuels pré-cochés. */
export async function openRoleMenu(interaction: ButtonInteraction<"cached">, group: GroupWithOptions): Promise<void> {
  const options = [...group.options]
    .sort(byOrder)
    .filter((option) => interaction.guild.roles.cache.has(option.roleId))
    .slice(0, ROLE_PANEL_LIMITS.MAX_OPTIONS_PER_GROUP)
    .map((option) => {
      const builder = new StringSelectMenuOptionBuilder()
        .setLabel(option.label.slice(0, 100))
        .setValue(option.roleId)
        .setDefault(interaction.member.roles.cache.has(option.roleId));
      if (option.emoji) builder.setEmoji(option.emoji);
      if (option.description) builder.setDescription(option.description.slice(0, 100));
      return builder;
    });
  if (!options.length) {
    await replyEphemeral(interaction, "Ce menu est vide pour l'instant : l'équipe doit y ajouter des rôles.");
    return;
  }
  if (!group.multiple && options.length < ROLE_PANEL_LIMITS.MAX_OPTIONS_PER_GROUP) {
    options.push(new StringSelectMenuOptionBuilder().setLabel("Aucun").setValue(NO_ROLE_VALUE).setEmoji("🚫").setDescription("Retirer le rôle de ce groupe"));
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${ROLE_SELECT_PREFIX}:${group.id}`)
    .setPlaceholder(`${group.emoji ? `${group.emoji} ` : ""}${group.title} : coche ce qui te ressemble`.slice(0, 150))
    .setMinValues(0)
    .setMaxValues(group.multiple ? options.length : 1)
    .addOptions(options);

  await interaction.reply({
    content: `${group.emoji ? `${group.emoji} ` : ""}**${group.title}**${group.help ? ` — ${group.help}` : ""}\n-# Ce qui est déjà coché, tu l'as déjà. Décoche pour retirer.`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

/** Applique les choix du menu : ajoute les rôles cochés, retire ceux décochés. */
export async function applyRoleMenu(interaction: StringSelectMenuInteraction<"cached">, group: GroupWithOptions): Promise<void> {
  const wanted = new Set(interaction.values.filter((value) => value !== NO_ROLE_VALUE));
  const add: Role[] = [];
  const remove: Role[] = [];
  for (const option of group.options) {
    const role = interaction.guild.roles.cache.get(option.roleId);
    if (!role) continue;
    const owned = interaction.member.roles.cache.has(role.id);
    if (wanted.has(role.id) && !owned) add.push(role);
    if (!wanted.has(role.id) && owned) remove.push(role);
  }
  if ([...add, ...remove].some((role) => !role.editable)) {
    await interaction.update({ content: MISSING_PERMISSION_MESSAGE, components: [] });
    return;
  }
  try {
    if (add.length) await interaction.member.roles.add(add, `Panneau de rôles : ${group.title}`);
    if (remove.length) await interaction.member.roles.remove(remove, `Panneau de rôles : ${group.title}`);
  } catch (error) {
    logError(`menu de rôles « ${group.title} » (serveur ${interaction.guildId})`, error);
    await interaction.update({ content: MISSING_PERMISSION_MESSAGE, components: [] });
    return;
  }
  const lines = [
    ...(add.length ? [`➕ ${add.map((role) => `<@&${role.id}>`).join(" ")}`] : []),
    ...(remove.length ? [`➖ ${remove.map((role) => `<@&${role.id}>`).join(" ")}`] : []),
  ];
  await interaction.update({
    content: lines.length ? `✅ **C'est enregistré !**\n${lines.join("\n")}` : "👌 Rien n'a changé… mais c'était un très joli clic.",
    components: [],
    allowedMentions: { parse: [] },
  });
}

/** Bouton d'un groupe « boutons » : ajoute ou retire le rôle. */
export async function toggleRoleButton(interaction: ButtonInteraction<"cached">, group: GroupWithOptions, roleId: string): Promise<void> {
  const option = group.options.find((candidate) => candidate.roleId === roleId);
  const role = option ? interaction.guild.roles.cache.get(roleId) : undefined;
  if (!option || !role) {
    await replyEphemeral(interaction, "Ce rôle n'est plus disponible.");
    return;
  }
  if (!role.editable) {
    logError(`bouton de rôle (serveur ${interaction.guildId})`, new Error(`rôle « ${role.name} » au-dessus du rôle du bot`));
    await replyEphemeral(interaction, MISSING_PERMISSION_MESSAGE);
    return;
  }
  if (interaction.member.roles.cache.has(role.id)) {
    await interaction.member.roles.remove(role, `Panneau de rôles : ${group.title}`);
    await replyEphemeral(interaction, `➖ Rôle **${role.name}** retiré.`);
    return;
  }
  if (!group.multiple) {
    const others = group.options.map((candidate) => candidate.roleId).filter((id) => id !== role.id && interaction.member.roles.cache.has(id));
    if (others.length) await interaction.member.roles.remove(others, `Panneau de rôles : ${group.title}`);
  }
  await interaction.member.roles.add(role, `Panneau de rôles : ${group.title}`);
  await replyEphemeral(interaction, `➕ Rôle **${role.name}** ajouté !`);
}
