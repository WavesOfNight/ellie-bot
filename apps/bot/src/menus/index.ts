import { OverwriteType, PermissionFlagsBits, type OverwriteResolvable } from "discord.js";
import { prisma } from "@ellie/database";
import { VOICE_ACCESS_PREFIX } from "../commands/voice.js";
import { applyRoleMenu, findRoleGroup, LEGACY_ROLES_PREFIX, ROLE_SELECT_PREFIX } from "../lib/reaction-roles.js";
import { replyEphemeral } from "../lib/replies.js";
import { submitReport } from "../lib/tickets.js";
import type { ModalHandler, StringSelectHandler, UserSelectHandler } from "../types.js";

const ACCESS = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect];

/**
 * creer-vocal:access:<idSalon> — sélection vide ⇒ salon public ; sinon @everyone est refusé
 * et seuls les membres choisis (+ le bot + le propriétaire) peuvent voir et rejoindre le salon.
 */
const voiceAccessMenu: UserSelectHandler = {
  prefix: VOICE_ACCESS_PREFIX,
  async execute(interaction, [action, channelId]) {
    if (action !== "access" || !channelId) return;
    const tracked = await prisma.tempVoiceChannel.findUnique({ where: { channelId } });
    const channel = interaction.guild.channels.cache.get(channelId);
    if (!tracked || !channel?.isVoiceBased()) {
      await replyEphemeral(interaction, "Ce salon n'existe plus.");
      return;
    }
    if (tracked.ownerId !== interaction.user.id) {
      await replyEphemeral(interaction, "Seul le propriétaire du salon peut modifier son accès.");
      return;
    }

    const ownerAllow = [...ACCESS, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers];
    const selected = interaction.users.filter((user) => !user.bot && user.id !== tracked.ownerId);
    const overwrites: OverwriteResolvable[] = [
      { id: tracked.ownerId, type: OverwriteType.Member, allow: ownerAllow },
      { id: interaction.client.user.id, type: OverwriteType.Member, allow: [...ACCESS, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] },
    ];
    if (selected.size > 0) {
      overwrites.push({ id: interaction.guild.roles.everyone.id, type: OverwriteType.Role, deny: ACCESS });
      for (const user of selected.values()) overwrites.push({ id: user.id, type: OverwriteType.Member, allow: ACCESS });
    }
    await channel.permissionOverwrites.set(overwrites, "Accès du salon vocal personnel");
    await interaction.update({
      content:
        selected.size > 0
          ? `🔒 <#${channel.id}> est maintenant privé : ${selected.map((user) => `<@${user.id}>`).join(", ")} peuvent le rejoindre.`
          : `🔓 <#${channel.id}> est de nouveau public.`,
      allowedMentions: { parse: [] },
    });
  },
};

export const userSelectHandlers = new Map<string, UserSelectHandler>([[voiceAccessMenu.prefix, voiceAccessMenu]]);

/** rrs:<groupe> — validation du menu à cocher d'un groupe de rôles. */
const roleSelectMenu: StringSelectHandler = {
  prefix: ROLE_SELECT_PREFIX,
  async execute(interaction, [rawGroupId]) {
    const group = await findRoleGroup(interaction.guildId, Number(rawGroupId));
    if (!group) {
      await interaction.update({ content: "Ce panneau de rôles n'existe plus.", components: [] });
      return;
    }
    await applyRoleMenu(interaction, group);
  },
};

/** roles:choisir:<clé> — menus éphémères ouverts avec l'ancien bot avant le changement. */
const legacyRoleSelectMenu: StringSelectHandler = {
  prefix: LEGACY_ROLES_PREFIX,
  async execute(interaction) {
    await interaction.update({ content: "⌛ Ce menu a expiré : rouvre-le depuis le salon des rôles.", components: [] });
  },
};

export const stringSelectHandlers = new Map<string, StringSelectHandler>(
  [roleSelectMenu, legacyRoleSelectMenu].map((handler) => [handler.prefix, handler]),
);

/** signalement:envoyer — formulaire de signalement anonyme. */
const reportModal: ModalHandler = {
  prefix: "signalement",
  async execute(interaction, [action]) {
    if (action === "envoyer") await submitReport(interaction);
  },
};

export const modalHandlers = new Map<string, ModalHandler>([[reportModal.prefix, reportModal]]);
