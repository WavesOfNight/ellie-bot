import { MessageFlags } from "discord.js";
import { prisma } from "@ellie/database";
import { GIVEAWAY_PREFIX, giveawayButtons, giveawayEmbed } from "../lib/giveaways.js";
import { parsePollOptions, POLL_PREFIX, renderPoll } from "../lib/polls.js";
import {
  findLegacyRoleGroup,
  findRoleGroup,
  LEGACY_ROLES_PREFIX,
  openRoleMenu,
  ROLE_GROUP_PREFIX,
  ROLE_TOGGLE_PREFIX,
  toggleRoleButton,
} from "../lib/reaction-roles.js";
import { replyEphemeral } from "../lib/replies.js";
import { acceptRules, closeTicket, openReportModal, openTicket } from "../lib/tickets.js";
import { WELCOME_JOIN_PREFIX } from "../lib/welcome.js";
import type { ButtonHandler } from "../types.js";

/** giveaway:join:<id> — participer (ou se retirer en recliquant). */
const giveawayButton: ButtonHandler = {
  prefix: GIVEAWAY_PREFIX,
  async execute(interaction, [action, rawId]) {
    const id = Number(rawId);
    if (action !== "join" || !Number.isInteger(id)) return;
    const giveaway = await prisma.giveaway.findFirst({ where: { id, guildId: interaction.guildId } });
    if (!giveaway || giveaway.ended || giveaway.endsAt <= new Date()) {
      await replyEphemeral(interaction, "Ce giveaway est terminé.");
      return;
    }
    const existing = await prisma.giveawayEntry.findUnique({ where: { giveawayId_userId: { giveawayId: id, userId: interaction.user.id } } });
    if (existing) {
      await prisma.giveawayEntry.delete({ where: { id: existing.id } });
    } else {
      await prisma.giveawayEntry.upsert({
        where: { giveawayId_userId: { giveawayId: id, userId: interaction.user.id } },
        create: { giveawayId: id, userId: interaction.user.id },
        update: {},
      });
    }
    const entries = await prisma.giveawayEntry.count({ where: { giveawayId: id } });
    await interaction.update({ embeds: [giveawayEmbed(giveaway, entries)], components: giveawayButtons(id) });
    await interaction.followUp({
      content: existing ? "Tu ne participes plus à ce giveaway." : "🎉 Ta participation est enregistrée, bonne chance !",
      flags: MessageFlags.Ephemeral,
    });
  },
};

const ROLE_GONE = "Ce panneau de rôles n'existe plus : rafraîchis le salon ou préviens l'équipe.";

/** rrg:<groupe> — ouvre le menu à cocher d'un groupe de rôles. */
const roleGroupButton: ButtonHandler = {
  prefix: ROLE_GROUP_PREFIX,
  async execute(interaction, [rawGroupId]) {
    const group = await findRoleGroup(interaction.guildId, Number(rawGroupId));
    if (!group) return replyEphemeral(interaction, ROLE_GONE);
    await openRoleMenu(interaction, group);
  },
};

/** rr:<groupe>:<rôle> — ajoute ou retire le rôle (groupes affichés en boutons). */
const roleToggleButton: ButtonHandler = {
  prefix: ROLE_TOGGLE_PREFIX,
  async execute(interaction, [rawGroupId, roleId]) {
    const group = await findRoleGroup(interaction.guildId, Number(rawGroupId));
    if (!group || !roleId) return replyEphemeral(interaction, ROLE_GONE);
    await toggleRoleButton(interaction, group, roleId);
  },
};

/** roles:ouvrir:<clé> — boutons publiés par l'ancien bot (groupes importés avec leur clé). */
const legacyRolesButton: ButtonHandler = {
  prefix: LEGACY_ROLES_PREFIX,
  async execute(interaction, [action, key]) {
    if (action !== "ouvrir" || !key) return;
    const group = await findLegacyRoleGroup(interaction.guildId, key);
    if (!group) return replyEphemeral(interaction, ROLE_GONE);
    await openRoleMenu(interaction, group);
  },
};

/** welcome:join:<idRôle> — bouton « Rejoindre » du message de bienvenue. */
const welcomeButton: ButtonHandler = {
  prefix: WELCOME_JOIN_PREFIX,
  async execute(interaction, [action, roleId]) {
    if (action !== "join" || !roleId) return;
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role || !role.editable) {
      await replyEphemeral(interaction, "Ce rôle n'est plus disponible, préviens l'équipe du serveur.");
      return;
    }
    if (interaction.member.roles.cache.has(role.id)) {
      await replyEphemeral(interaction, `Tu as déjà le rôle **${role.name}** 👋`);
      return;
    }
    await interaction.member.roles.add(role, "Bouton « Rejoindre » de bienvenue");
    await replyEphemeral(interaction, `👋 Bienvenue ! Tu as maintenant le rôle **${role.name}**.`);
  },
};

/** ticket:ouvrir / ticket:fermer (mêmes identifiants que l'ancien bot). */
const ticketButton: ButtonHandler = {
  prefix: "ticket",
  async execute(interaction, [action]) {
    if (action === "ouvrir") await openTicket(interaction);
    else if (action === "fermer") await closeTicket(interaction);
  },
};

/** signalement:ouvrir — formulaire de signalement anonyme. */
const reportButton: ButtonHandler = {
  prefix: "signalement",
  async execute(interaction, [action]) {
    if (action === "ouvrir") await openReportModal(interaction);
  },
};

/** verifier — bouton « J'accepte le règlement ». */
const rulesButton: ButtonHandler = {
  prefix: "verifier",
  async execute(interaction) {
    await acceptRules(interaction);
  },
};

/** poll:<id>:<indice> — vote (modifiable). */
const pollButton: ButtonHandler = {
  prefix: POLL_PREFIX,
  async execute(interaction, [rawId, rawIndex]) {
    const poll = await prisma.poll.findFirst({ where: { id: Number(rawId), guildId: interaction.guildId } });
    const index = Number(rawIndex);
    const options = poll ? parsePollOptions(poll) : [];
    if (!poll || !Number.isInteger(index) || index < 0 || index >= options.length) {
      await replyEphemeral(interaction, "Ce sondage n'existe plus.");
      return;
    }
    const previous = await prisma.pollVote.findUnique({ where: { pollId_userId: { pollId: poll.id, userId: interaction.user.id } } });
    if (previous?.option === index) {
      await replyEphemeral(interaction, `Tu as déjà voté pour « ${options[index]} ».`);
      return;
    }
    await prisma.pollVote.upsert({
      where: { pollId_userId: { pollId: poll.id, userId: interaction.user.id } },
      create: { pollId: poll.id, userId: interaction.user.id, option: index },
      update: { option: index },
    });
    await interaction.update(await renderPoll(poll));
    await interaction.followUp({ content: `🗳️ Ton vote pour « ${options[index]} » est enregistré.`, flags: MessageFlags.Ephemeral });
  },
};

export const buttonHandlers = new Map<string, ButtonHandler>(
  [giveawayButton, roleGroupButton, roleToggleButton, legacyRolesButton, welcomeButton, ticketButton, reportButton, rulesButton, pollButton].map((handler) => [handler.prefix, handler]),
);
