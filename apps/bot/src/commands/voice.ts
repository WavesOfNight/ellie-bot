import { ActionRowBuilder, MessageFlags, UserSelectMenuBuilder } from "discord.js";
import { prisma } from "@ellie/database";
import { atLeastLevel, findAutoModMatch, toAutoModLevel } from "@ellie/database/shared";
import { getGuildSettings } from "../lib/cache.js";
import { replyEphemeral } from "../lib/replies.js";
import { createPersonalVoiceChannel, setVoiceChannelStatus } from "../lib/temp-voice.js";
import type { SlashCommand } from "../types.js";
import { slash } from "./builder.js";

export const VOICE_ACCESS_PREFIX = "creer-vocal";

export const creerVocal: SlashCommand = {
  data: slash("creer-vocal", "Crée ton salon vocal personnalisé.")
    .addStringOption((option) => option.setName("nom").setDescription("Nom du salon").setMaxLength(100))
    .addIntegerOption((option) => option.setName("limite").setDescription("Nombre maximum de membres (0 = illimité)").setMinValue(0).setMaxValue(99))
    .addStringOption((option) => option.setName("description").setDescription("Statut affiché sous le salon").setMaxLength(500)),
  async execute(interaction) {
    const member = interaction.member;
    if (!member.voice.channelId) {
      await replyEphemeral(interaction, "Rejoins d'abord un salon vocal, puis relance la commande.");
      return;
    }
    const existing = await prisma.tempVoiceChannel.findFirst({ where: { guildId: interaction.guildId, ownerId: member.id } });
    if (existing && interaction.guild.channels.cache.has(existing.channelId)) {
      await replyEphemeral(interaction, `Tu as déjà un salon personnel actif : <#${existing.channelId}>`);
      return;
    }

    const settings = await getGuildSettings(interaction.guildId);
    const level = atLeastLevel(toAutoModLevel(settings.autoModLevel), "LOW");
    const name = interaction.options.getString("nom")?.trim() || `🔊 Salon de ${member.displayName}`;
    const description = interaction.options.getString("description")?.trim() ?? "";
    if (findAutoModMatch(level, name) || (description && findAutoModMatch(level, description))) {
      await replyEphemeral(interaction, "Ce nom ou cette description contient un mot interdit. Choisis autre chose 🙂");
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = await createPersonalVoiceChannel(member, { name: name.slice(0, 100), userLimit: interaction.options.getInteger("limite") ?? 0 });
    if (description) await setVoiceChannelStatus(channel, description);

    const select = new UserSelectMenuBuilder()
      .setCustomId(`${VOICE_ACCESS_PREFIX}:access:${channel.id}`)
      .setPlaceholder("Salon public — choisis des membres pour le rendre privé")
      .setMinValues(0)
      .setMaxValues(25);
    await interaction.editReply({
      content: `✅ Ton salon <#${channel.id}> est prêt (public). Sélectionne jusqu'à 25 membres ci-dessous pour le rendre privé ; une sélection vide le rend de nouveau public.`,
      components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(select)],
      allowedMentions: { parse: [] },
    });
  },
};

export const voiceCommands: SlashCommand[] = [creerVocal];
