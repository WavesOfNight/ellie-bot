import { ChannelType, MessageFlags, PermissionFlagsBits } from "discord.js";
import { ensureGuild, prisma } from "@ellie/database";
import { countPanelComponents, isValidEmoji, ROLE_PANEL_LIMITS } from "@ellie/database/shared";
import { formatDuration, parseDuration } from "../lib/durations.js";
import { brandEmbed, COLORS, discordTimestamp, truncate } from "../lib/embeds.js";
import { endGiveaway, MAX_GIVEAWAY_WINNERS, publishGiveaway } from "../lib/giveaways.js";
import { replyEphemeral } from "../lib/replies.js";
import { checkSocialAlerts } from "../lib/social-alerts.js";
import type { SlashCommand } from "../types.js";
import { slash } from "./builder.js";

const MAX_GIVEAWAY_MS = 60 * 86_400_000;
const CUSTOM_COMMAND_NAME = /^[a-z0-9_-]{1,32}$/;

export const giveaway: SlashCommand = {
  data: slash("giveaway", "Gère les giveaways (lancer, terminer, relancer, lister).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Lance un giveaway.")
        .addStringOption((option) => option.setName("prix").setDescription("Le lot à gagner").setRequired(true).setMaxLength(200))
        .addStringOption((option) => option.setName("duree").setDescription("Durée : 10m, 2h, 1d…").setRequired(true))
        .addIntegerOption((option) =>
          option.setName("gagnants").setDescription(`Nombre de gagnants (1-${MAX_GIVEAWAY_WINNERS})`).setMinValue(1).setMaxValue(MAX_GIVEAWAY_WINNERS),
        )
        .addChannelOption((option) =>
          option.setName("salon").setDescription("Salon du giveaway (actuel par défaut)").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("end")
        .setDescription("Termine un giveaway maintenant.")
        .addIntegerOption((option) => option.setName("id").setDescription("Numéro du giveaway").setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reroll")
        .setDescription("Relance le tirage d'un giveaway terminé.")
        .addIntegerOption((option) => option.setName("id").setDescription("Numéro du giveaway").setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Liste les giveaways récents.")),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === "start") {
      const duration = parseDuration(interaction.options.getString("duree", true));
      if (!duration || duration < 60_000 || duration > MAX_GIVEAWAY_MS) {
        await replyEphemeral(interaction, "Durée invalide : utilise par exemple `10m`, `2h` ou `1d` (entre 1 minute et 60 jours).");
        return;
      }
      const channelId = interaction.options.getChannel("salon")?.id ?? interaction.channelId;
      await ensureGuild(interaction.guildId, interaction.guild.name);
      const record = await prisma.giveaway.create({
        data: {
          guildId: interaction.guildId,
          channelId,
          prize: interaction.options.getString("prix", true),
          winnerCount: interaction.options.getInteger("gagnants") ?? 1,
          hostId: interaction.user.id,
          endsAt: new Date(Date.now() + duration),
        },
      });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const published = await publishGiveaway(interaction.client, record);
      await replyEphemeral(
        interaction,
        published
          ? `🎉 Giveaway #${record.id} lancé dans <#${channelId}> pour ${formatDuration(duration)}.`
          : `Giveaway #${record.id} créé, mais je n'arrive pas à écrire dans <#${channelId}> : je réessaierai automatiquement.`,
      );
      return;
    }

    if (sub === "list") {
      const list = await prisma.giveaway.findMany({
        where: { guildId: interaction.guildId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { _count: { select: { entries: true } } },
      });
      const embed = brandEmbed(COLORS.blush)
        .setTitle("🎉 Giveaways récents")
        .setDescription(
          list.length
            ? list
                .map(
                  (entry) =>
                    `**#${entry.id}** · ${truncate(entry.prize, 80)} · ${entry.ended ? "terminé" : `fin ${discordTimestamp(entry.endsAt, "R")}`} · ${entry._count.entries} participant(s)`,
                )
                .join("\n")
            : "Aucun giveaway pour l'instant.",
        );
      await replyEphemeral(interaction, "", [embed]);
      return;
    }

    const id = interaction.options.getInteger("id", true);
    const record = await prisma.giveaway.findFirst({ where: { id, guildId: interaction.guildId } });
    if (!record) {
      await replyEphemeral(interaction, `Aucun giveaway #${id} sur ce serveur.`);
      return;
    }
    if (sub === "end" && record.ended) {
      await replyEphemeral(interaction, "Ce giveaway est déjà terminé (utilise `/giveaway reroll` pour un nouveau tirage).");
      return;
    }
    if (sub === "reroll" && !record.ended) {
      await replyEphemeral(interaction, "Ce giveaway n'est pas encore terminé.");
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const winners = await endGiveaway(interaction.client, id, { reroll: sub === "reroll" });
    await replyEphemeral(interaction, winners ? `✅ Tirage effectué (${winners.length} gagnant(s)).` : "Tirage impossible : le salon du giveaway est introuvable.");
  },
};

export const customcommand: SlashCommand = {
  data: slash("customcommand", "Gère les commandes texte personnalisées.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Ajoute ou modifie une commande texte.")
        .addStringOption((option) => option.setName("nom").setDescription("Nom (sans préfixe)").setRequired(true).setMaxLength(32))
        .addStringOption((option) => option.setName("reponse").setDescription("Réponse (placeholders acceptés)").setRequired(true).setMaxLength(2000))
        .addIntegerOption((option) => option.setName("cooldown").setDescription("Délai en secondes entre deux utilisations").setMinValue(0).setMaxValue(86_400)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Supprime une commande.")
        .addStringOption((option) => option.setName("nom").setDescription("Nom de la commande").setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName("list").setDescription("Liste les commandes personnalisées.")),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const settings = await ensureGuild(interaction.guildId, interaction.guild.name);

    if (sub === "list") {
      const commands = await prisma.customCommand.findMany({
        where: { guildId: interaction.guildId },
        orderBy: { name: "asc" },
        include: { _count: { select: { actions: true } } },
      });
      const embed = brandEmbed(COLORS.lavender)
        .setTitle("🧩 Commandes personnalisées")
        .setDescription(
          commands.length
            ? truncate(
                commands
                  .map((command) => `\`${settings.prefix}${command.name}\`${command._count.actions ? ` · ${command._count.actions} bloc(s)` : ""}${command.cooldownSeconds ? ` · ⏳ ${command.cooldownSeconds} s` : ""}`)
                  .join("\n"),
                4000,
              )
            : "Aucune commande pour l'instant. Crée-en avec `/customcommand add` ou depuis le panel.",
        );
      await replyEphemeral(interaction, "", [embed]);
      return;
    }

    const name = interaction.options.getString("nom", true).trim().toLowerCase().replace(/^[!?.$]/, "");
    if (!CUSTOM_COMMAND_NAME.test(name)) {
      await replyEphemeral(interaction, "Nom invalide : lettres minuscules, chiffres, - et _ uniquement (32 caractères max).");
      return;
    }
    if (sub === "remove") {
      const deleted = await prisma.customCommand.deleteMany({ where: { guildId: interaction.guildId, name } });
      await replyEphemeral(interaction, deleted.count ? `🗑️ Commande \`${settings.prefix}${name}\` supprimée.` : `Aucune commande \`${settings.prefix}${name}\`.`);
      return;
    }
    const response = interaction.options.getString("reponse", true);
    const cooldownSeconds = interaction.options.getInteger("cooldown") ?? 0;
    await prisma.customCommand.upsert({
      where: { guildId_name: { guildId: interaction.guildId, name } },
      create: { guildId: interaction.guildId, name, response, cooldownSeconds },
      update: { response, cooldownSeconds },
    });
    await replyEphemeral(interaction, `✅ Commande \`${settings.prefix}${name}\` enregistrée.`);
  },
};

export const reactionrole: SlashCommand = {
  data: slash("reactionrole", "Crée des panneaux de rôles (boutons ou menus à cocher).")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Crée un panneau de rôles dans un salon.")
        .addChannelOption((option) =>
          option.setName("salon").setDescription("Salon du panneau").setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addStringOption((option) => option.setName("titre").setDescription("Titre du panneau").setMaxLength(200)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("addrole")
        .setDescription("Ajoute un rôle au premier groupe d'un panneau.")
        .addIntegerOption((option) => option.setName("panneau").setDescription("Numéro du panneau de rôles").setRequired(true))
        .addRoleOption((option) => option.setName("role").setDescription("Le rôle").setRequired(true))
        .addStringOption((option) => option.setName("label").setDescription("Texte affiché").setRequired(true).setMaxLength(80))
        .addStringOption((option) => option.setName("emoji").setDescription("Émoji").setMaxLength(64)),
    ),
  async execute(interaction) {
    await ensureGuild(interaction.guildId, interaction.guild.name);
    if (interaction.options.getSubcommand() === "create") {
      const channel = interaction.options.getChannel("salon", true);
      const panel = await prisma.reactionRoleMessage.create({
        data: {
          guildId: interaction.guildId,
          channelId: channel.id,
          title: interaction.options.getString("titre")?.trim() || "🎀 Choisis tes rôles",
          groups: { create: { title: "Rôles", display: "BUTTONS" } },
        },
      });
      await replyEphemeral(
        interaction,
        `✅ Panneau de rôles **#${panel.id}** créé : ajoute des rôles avec \`/reactionrole addrole panneau:${panel.id}\` ou depuis le panel web (groupes, menus à cocher…). Il sera publié dans <#${channel.id}> sous 15 secondes.`,
      );
      return;
    }

    const panelId = interaction.options.getInteger("panneau", true);
    const panel = await prisma.reactionRoleMessage.findFirst({
      where: { id: panelId, guildId: interaction.guildId },
      include: { groups: { orderBy: [{ order: "asc" }, { id: "asc" }], include: { _count: { select: { options: true } } } } },
    });
    if (!panel) {
      await replyEphemeral(interaction, `Aucun panneau de rôles #${panelId} sur ce serveur.`);
      return;
    }
    const group =
      panel.groups[0] ??
      (await prisma.reactionRoleGroup.create({
        data: { panelId: panel.id, title: "Rôles", display: "BUTTONS" },
        include: { _count: { select: { options: true } } },
      }));
    const groups = panel.groups.length ? panel.groups : [group];
    const components = countPanelComponents(
      groups.map((candidate) => ({ display: candidate.display, optionCount: candidate._count.options + (candidate.id === group.id ? 1 : 0) })),
    );
    if (group._count.options >= ROLE_PANEL_LIMITS.MAX_OPTIONS_PER_GROUP || components > ROLE_PANEL_LIMITS.MAX_COMPONENTS) {
      await replyEphemeral(interaction, "Ce panneau est plein (limites de Discord) : crée un autre groupe ou un autre panneau depuis le panel web.");
      return;
    }
    const role = interaction.options.getRole("role", true);
    const guildRole = interaction.guild.roles.cache.get(role.id);
    if (!guildRole || guildRole.managed || guildRole.id === interaction.guildId) {
      await replyEphemeral(interaction, "Ce rôle ne peut pas être attribué par un panneau.");
      return;
    }
    if (!guildRole.editable) {
      await replyEphemeral(interaction, "Ce rôle est au-dessus du mien : place mon rôle plus haut dans la liste des rôles.");
      return;
    }
    const label = interaction.options.getString("label", true);
    const emoji = interaction.options.getString("emoji")?.trim() || null;
    if (emoji && !isValidEmoji(emoji)) {
      await replyEphemeral(interaction, "Émoji invalide : utilise un émoji (😀) ou un émoji du serveur.");
      return;
    }
    await prisma.reactionRoleOption.upsert({
      where: { groupId_roleId: { groupId: group.id, roleId: role.id } },
      create: { groupId: group.id, roleId: role.id, label, emoji, order: group._count.options },
      update: { label, emoji },
    });
    await prisma.reactionRoleMessage.update({ where: { id: panel.id }, data: { dirty: true } });
    await replyEphemeral(interaction, `✅ Rôle « ${label} » ajouté au panneau #${panel.id} (mise à jour sous 15 secondes).`);
  },
};

export const alertes: SlashCommand = {
  data: slash("alertes", "Force la vérification des alertes YouTube/Twitch.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) => sub.setName("verifier").setDescription("Vérifie maintenant et rattrape les notifications manquées.")),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sent = await checkSocialAlerts(interaction.client, interaction.guildId);
    await replyEphemeral(
      interaction,
      sent ? `✅ Vérification terminée : ${sent} notification${sent > 1 ? "s" : ""} envoyée${sent > 1 ? "s" : ""}.` : "✅ Vérification terminée : rien de nouveau.",
    );
  },
};

export const serverCommands: SlashCommand[] = [giveaway, customcommand, reactionrole, alertes];
