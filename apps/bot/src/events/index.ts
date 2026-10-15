import { Events, MessageFlags } from "discord.js";
import { prepareDatabase } from "@ellie/database";
import { buttonHandlers } from "../buttons/index.js";
import { commandMap } from "../commands/index.js";
import { DEV_GUILD_ID } from "../env.js";
import { runAutoMod } from "../lib/automod-handler.js";
import { getGuildSettings, isCommandEnabledCached } from "../lib/cache.js";
import { handleCustomCommand, handleAutoResponse } from "../lib/custom-commands.js";
import { deployCommands } from "../lib/deploy.js";
import { handleEllieMessage } from "../lib/ellie.js";
import { brandEmbed, COLORS, truncate } from "../lib/embeds.js";
import { handleMessageXp } from "../lib/levels.js";
import { logError, logInfo } from "../lib/log.js";
import { sendLogEmbed } from "../lib/moderation.js";
import { replyEphemeral, replyError } from "../lib/replies.js";
import { handleStarboardReaction } from "../lib/starboard.js";
import { handleTrackedChannelRename, handleVoiceStateUpdate } from "../lib/temp-voice.js";
import { logMemberJoin, logMemberLeave, welcomeMember } from "../lib/welcome.js";
import { modalHandlers, stringSelectHandlers, userSelectHandlers } from "../menus/index.js";
import { startRuntime } from "../runtime.js";
import { defineEvent, type EventModule } from "../types.js";
import { commands } from "../commands/index.js";

const ready = defineEvent(
  Events.ClientReady,
  async (client) => {
    logInfo(`connecté en tant que ${client.user.tag} sur ${client.guilds.cache.size} serveur(s)`);
    await prepareDatabase();
    for (const guild of client.guilds.cache.values()) await getGuildSettings(guild.id, guild.name);
    try {
      const scope = await deployCommands(client.token, client.user.id, commands, DEV_GUILD_ID, [...client.guilds.cache.keys()]);
      logInfo(`${commands.length} commandes slash déployées (${scope})`);
    } catch (error) {
      logError("déploiement des commandes slash", error);
    }
    startRuntime(client);
  },
  { once: true },
);

const guildCreate = defineEvent(Events.GuildCreate, async (guild) => {
  await getGuildSettings(guild.id, guild.name);
  logInfo(`ajouté au serveur « ${guild.name} » (${guild.id})`);
});

const interactionCreate = defineEvent(Events.InteractionCreate, async (interaction) => {
  if (!interaction.inCachedGuild()) {
    if (interaction.isRepliable()) await interaction.reply({ content: "Mes commandes s'utilisent sur un serveur.", flags: MessageFlags.Ephemeral }).catch(() => undefined);
    return;
  }

  if (interaction.isChatInputCommand()) {
    const command = commandMap.get(interaction.commandName);
    if (!command) return;
    try {
      if (!(await isCommandEnabledCached(interaction.guildId, interaction.commandName))) {
        await replyEphemeral(interaction, "Cette commande est désactivée sur ce serveur.");
        return;
      }
      await command.execute(interaction);
    } catch (error) {
      await replyError(interaction, `commande /${interaction.commandName} (serveur ${interaction.guildId}, salon ${interaction.channelId})`, error);
    }
    return;
  }

  if (interaction.isButton()) {
    const [prefix, ...args] = interaction.customId.split(":");
    const handler = buttonHandlers.get(prefix ?? "");
    if (!handler) return;
    try {
      await handler.execute(interaction, args);
    } catch (error) {
      await replyError(interaction, `bouton ${interaction.customId} (serveur ${interaction.guildId})`, error);
    }
    return;
  }

  if (interaction.isUserSelectMenu() || interaction.isStringSelectMenu()) {
    const [prefix, ...args] = interaction.customId.split(":");
    try {
      if (interaction.isUserSelectMenu()) await userSelectHandlers.get(prefix ?? "")?.execute(interaction, args);
      else await stringSelectHandlers.get(prefix ?? "")?.execute(interaction, args);
    } catch (error) {
      await replyError(interaction, `menu ${interaction.customId} (serveur ${interaction.guildId})`, error);
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    const [prefix, ...args] = interaction.customId.split(":");
    try {
      await modalHandlers.get(prefix ?? "")?.execute(interaction, args);
    } catch (error) {
      await replyError(interaction, `formulaire ${interaction.customId} (serveur ${interaction.guildId})`, error);
    }
  }
});

/**
 * Ordre : bots/MP ignorés → automodération → XP → commandes personnalisées → réponses automatiques
 * → IA Ellie (asynchrone, isolée, jamais si le message a déjà été traité ou supprimé).
 */
const messageCreate = defineEvent(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.inGuild()) return;
  const settings = await getGuildSettings(message.guildId, message.guild.name);

  if (await runAutoMod(message, settings)) return;

  await handleMessageXp(message).catch((error: unknown) => logError(`XP (serveur ${message.guildId}, membre ${message.author.id})`, error));

  const handled = (await handleCustomCommand(message, settings)) || (await handleAutoResponse(message, settings));

  void handleEllieMessage(message, settings, handled).catch((error: unknown) =>
    logError(`Ellie (serveur ${message.guildId}, salon ${message.channelId})`, error),
  );
});

const messageUpdate = defineEvent(Events.MessageUpdate, async (oldMessage, newMessage) => {
  const message = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
  if (!message || !message.inGuild() || message.author.bot) return;
  if (oldMessage.content === message.content) return;
  const settings = await getGuildSettings(message.guildId);

  if (await runAutoMod(message, settings, { checkSpam: false })) return;

  if (settings.logMessageEdit) {
    await sendLogEmbed(
      message.guild,
      brandEmbed(COLORS.lavender)
        .setTitle("✏️ Message modifié")
        .setDescription(`<@${message.author.id}> dans <#${message.channelId}> · [voir le message](${message.url})`)
        .addFields(
          { name: "Avant", value: truncate(oldMessage.content || "*(contenu indisponible)*", 1000) },
          { name: "Après", value: truncate(message.content || "*(vide)*", 1000) },
        ),
    );
  }
});

const messageDelete = defineEvent(Events.MessageDelete, async (message) => {
  if (!message.inGuild() || message.author?.bot) return;
  const settings = await getGuildSettings(message.guildId);
  if (!settings.logMessageDelete) return;
  await sendLogEmbed(
    message.guild,
    brandEmbed(COLORS.coral)
      .setTitle("🗑️ Message supprimé")
      .setDescription(`${message.author ? `<@${message.author.id}>` : "Auteur inconnu"} dans <#${message.channelId}>`)
      .addFields({ name: "Contenu", value: truncate(message.content || "*(contenu indisponible : message trop ancien ou sans texte)*", 1000) }),
  );
});

const guildMemberAdd = defineEvent(Events.GuildMemberAdd, async (member) => {
  await logMemberJoin(member);
  await welcomeMember(member);
});

const guildMemberRemove = defineEvent(Events.GuildMemberRemove, async (member) => {
  const full = member.partial ? null : member;
  if (full) await logMemberLeave(full);
  else await logMemberLeave({ id: member.id, guild: member.guild, user: member.user });
});

const messageReactionAdd = defineEvent(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  await handleStarboardReaction(reaction, user);
});

const voiceStateUpdate = defineEvent(Events.VoiceStateUpdate, async (oldState, newState) => {
  await handleVoiceStateUpdate(oldState, newState);
});

const channelUpdate = defineEvent(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  await handleTrackedChannelRename(oldChannel, newChannel);
});

export const events: EventModule[] = [
  ready,
  guildCreate,
  interactionCreate,
  messageCreate,
  messageUpdate,
  messageDelete,
  guildMemberAdd,
  guildMemberRemove,
  messageReactionAdd,
  voiceStateUpdate,
  channelUpdate,
];
