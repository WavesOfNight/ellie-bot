import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, type GuildMember } from "discord.js";
import { prisma } from "@ellie/database";
import { getGuildSettings } from "./cache.js";
import { brandEmbed, COLORS, discordTimestamp } from "./embeds.js";
import { renderWelcomeImage } from "./images.js";
import { logError } from "./log.js";
import { sendLogEmbed } from "./moderation.js";
import { applyPlaceholders } from "./placeholders.js";

export const WELCOME_JOIN_PREFIX = "welcome";

export async function logMemberJoin(member: GuildMember): Promise<void> {
  const settings = await getGuildSettings(member.guild.id);
  if (!settings.logMemberJoin) return;
  await sendLogEmbed(
    member.guild,
    brandEmbed(COLORS.aqua)
      .setTitle("📥 Membre arrivé")
      .setThumbnail(member.displayAvatarURL({ size: 128 }))
      .setDescription(`<@${member.id}> (${member.user.tag})`)
      .addFields(
        { name: "Compte créé", value: discordTimestamp(member.user.createdAt, "R"), inline: true },
        { name: "Membres", value: member.guild.memberCount.toLocaleString("fr-FR"), inline: true },
      ),
  );
}

export async function logMemberLeave(member: GuildMember | { id: string; guild: GuildMember["guild"]; user: GuildMember["user"] }): Promise<void> {
  const settings = await getGuildSettings(member.guild.id);
  if (!settings.logMemberLeave) return;
  await sendLogEmbed(
    member.guild,
    brandEmbed(COLORS.coral)
      .setTitle("📤 Membre parti")
      .setDescription(`<@${member.id}> (${member.user.tag})`)
      .addFields({ name: "Membres", value: member.guild.memberCount.toLocaleString("fr-FR"), inline: true }),
  );
}

/** Accueil d'un nouveau membre : rôle automatique, message (texte ou image), bouton « Rejoindre », MP. */
export async function welcomeMember(member: GuildMember): Promise<void> {
  const config = await prisma.welcomeConfig.findUnique({ where: { guildId: member.guild.id } });
  if (!config) return;
  const context = `bienvenue (serveur ${member.guild.id}, membre ${member.id})`;
  const placeholders = { user: member.user, displayName: member.displayName, guild: member.guild };

  if (config.autoRoleEnabled && config.autoRoleId) {
    const role = member.guild.roles.cache.get(config.autoRoleId);
    if (!role) logError(context, new Error(`rôle automatique ${config.autoRoleId} introuvable`));
    else await member.roles.add(role, "Rôle automatique d'arrivée").catch((error: unknown) => logError(`${context} : rôle automatique`, error));
  }

  if (config.channelId) {
    const channel = member.guild.channels.cache.get(config.channelId);
    if (!channel?.isTextBased()) {
      logError(context, new Error(`salon de bienvenue ${config.channelId} introuvable ou non textuel`));
    } else {
      const content = applyPlaceholders(config.message, placeholders).slice(0, 2000);
      const components =
        config.reactionRoleEnabled && config.reactionRoleId
          ? [
              new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`${WELCOME_JOIN_PREFIX}:join:${config.reactionRoleId}`)
                  .setLabel("Rejoindre")
                  .setEmoji("👋")
                  .setStyle(ButtonStyle.Success),
              ),
            ]
          : [];

      let files: AttachmentBuilder[] = [];
      if (config.imageEnabled) {
        try {
          const image = await renderWelcomeImage({
            avatarUrl: member.displayAvatarURL({ extension: "png", size: 256 }),
            title: applyPlaceholders(config.imageText, placeholders),
            subtitle: `Membre n°${member.guild.memberCount.toLocaleString("fr-FR")} · ${member.guild.name}`,
            backgroundUrl: config.imageBackgroundUrl,
            textColor: config.imageTextColor,
          });
          files = [new AttachmentBuilder(image, { name: "bienvenue.png" })];
        } catch (error) {
          logError(`${context} : génération de l'image (repli sur le texte)`, error);
        }
      }

      await channel
        .send({ content: content || undefined, files, components, allowedMentions: { users: [member.id] } })
        .catch((error: unknown) => logError(`${context} : envoi du message`, error));
    }
  }

  if (config.dmEnabled) {
    const dm = applyPlaceholders(config.dmMessage, placeholders).slice(0, 2000);
    // Échec silencieux acceptable : le membre peut avoir fermé ses MP.
    if (dm) await member.send({ content: dm, allowedMentions: { parse: [] } }).catch(() => undefined);
  }
}
