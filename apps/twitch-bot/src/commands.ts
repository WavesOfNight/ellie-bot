import { getAppSettings, getTwitchChatterRank, getTwitchLeaderboard, incrementTwitchDailyStat, prisma } from "@ellie/database";
import { communityLabel, MAX_LEVEL, STREAMER_NAME } from "@ellie/database/shared";
import { isModeratorOrBroadcaster, type ChatMessage, type TwitchContext } from "./context.js";
import { getDiscordTopFive, getLinkedInviteCode } from "./discord-link.js";
import { formatLongDuration } from "./format.js";
import { logError, logWarn } from "./log.js";

const BUILTIN_COOLDOWN_MS = 5_000;
const builtinLastUse = new Map<string, number>();

type Builtin = (context: TwitchContext, message: ChatMessage, args: string[]) => Promise<string | null>;

function excluded(context: TwitchContext): string[] {
  return [context.channelLogin, context.botLogin];
}

const BUILTINS: Record<string, Builtin> = {
  async discord(context) {
    const code = await getLinkedInviteCode(context.config.linkedGuildId);
    if (!code) {
      // La marche à suivre est affichée dans le panel (Bot Twitch) ; le chat reçoit un message neutre.
      logWarn(
        context.config.linkedGuildId
          ? "!discord : aucun lien d'invitation permanent (panel → serveur Discord → Invitation)"
          : "!discord : aucun serveur Discord lié (panel → Bot Twitch → Paramètres)",
      );
      return "💜 Le lien du Discord n'est pas encore prêt, reviens très bientôt !";
    }
    const community = communityLabel((await getAppSettings()).communityName);
    return `💜 Rejoins ${community} sur Discord : https://discord.gg/${code}`;
  },

  async help(context) {
    const prefix = context.config.prefix;
    const custom = await prisma.twitchCommand.findMany({ select: { name: true }, orderBy: { name: "asc" } });
    const builtins = ["discord", "uptime", "followage", "leaderboard", "dleaderboard", "rank", "so"];
    const names = [...builtins, ...custom.map((command) => command.name)].map((name) => `${prefix}${name}`);
    return `📚 Commandes : ${names.join(" · ")}`;
  },

  async uptime(context) {
    const stream = await context.helix.getStream(context.broadcasterId);
    if (!stream) return `${STREAMER_NAME} n'est pas en live pour le moment.`;
    return `⏱️ ${STREAMER_NAME} est en live depuis ${formatLongDuration(Date.now() - new Date(stream.started_at).getTime())}.`;
  },

  async followage(context, message) {
    const userId = message.tags["user-id"];
    if (!userId) return null;
    if (message.login === context.channelLogin) return `@${message.displayName}, tu ne peux pas te suivre toi-même 😄`;
    const follow = await context.helix.getFollower(context.broadcasterId, userId);
    if (!follow) return `@${message.displayName}, tu ne suis pas encore la chaîne.`;
    return `@${message.displayName} suit ${STREAMER_NAME} depuis ${formatLongDuration(Date.now() - new Date(follow.followed_at).getTime())} 💜`;
  },

  async leaderboard(context) {
    const top = await getTwitchLeaderboard(5, excluded(context));
    if (!top.length) return "Le classement est encore vide !";
    return `🏆 Top 5 Twitch : ${top.map((entry, index) => `${index + 1}. ${entry.username} (niv. ${entry.level})`).join(" · ")}`;
  },

  async dleaderboard(context) {
    const guildId = context.config.linkedGuildId;
    if (!guildId) return "Le serveur Discord n'est pas encore lié au bot.";
    const top = await getDiscordTopFive(guildId);
    if (!top.length) return "Le classement Discord est encore vide !";
    return `🏆 Top 5 Discord : ${top.map((entry, index) => `${index + 1}. ${entry.name} (niv. ${entry.level})`).join(" · ")}`;
  },

  async rank(context, message) {
    const stats = await getTwitchChatterRank(message.login, excluded(context));
    if (!stats || stats.xp === 0) return `@${message.displayName}, tu n'as pas encore d'XP ici. Discute un peu !`;
    const progress =
      stats.progress.required === null ? "niveau max 🏆" : `${stats.progress.current}/${stats.progress.required} XP`;
    return `@${message.displayName} : niveau ${stats.level}/${MAX_LEVEL} · ${progress} · rang #${stats.rank} · ${formatLongDuration(stats.watchMinutes * 60_000)} de visionnage`;
  },

  async so(context, message, args) {
    if (!isModeratorOrBroadcaster(context, message.tags)) return null;
    const target = args[0]?.replace(/^@/, "").toLowerCase();
    if (!target || !/^[a-z0-9_]{3,25}$/.test(target)) return `Utilisation : ${context.config.prefix}so <pseudo>`;
    const [user] = await context.helix.getUsers([target]);
    if (!user) return `Je ne trouve pas la chaîne « ${target} ».`;
    await context.helix
      .shoutout(context.broadcasterId, user.id, context.botUserId)
      .catch((error: unknown) => logError(`shoutout officiel de ${target}`, error));
    const info = await context.helix.getChannelInfo(user.id).catch(() => null);
    return `📣 Allez suivre ${user.display_name} sur https://twitch.tv/${user.login}${info?.game_name ? ` (dernière catégorie : ${info.game_name})` : ""} !`;
  },
};
BUILTINS.fc = BUILTINS.followage as Builtin;

function render(template: string, message: ChatMessage, context: TwitchContext): string {
  return template.replaceAll("{user}", message.displayName).replaceAll("{channel}", context.channelLogin);
}

/** Commandes intégrées puis personnalisées. @returns `true` si le message était une commande. */
export async function handleCommand(context: TwitchContext, message: ChatMessage): Promise<boolean> {
  const prefix = context.config.prefix || "!";
  if (!message.text.startsWith(prefix)) return false;
  const [rawName, ...args] = message.text.slice(prefix.length).trim().split(/\s+/);
  const name = rawName?.toLowerCase();
  if (!name) return false;

  const builtin = BUILTINS[name];
  if (builtin) {
    const last = builtinLastUse.get(name) ?? 0;
    if (Date.now() - last < BUILTIN_COOLDOWN_MS) return true;
    builtinLastUse.set(name, Date.now());
    try {
      const response = await builtin(context, message, args);
      if (response) await context.say(response);
      await incrementTwitchDailyStat("commands");
    } catch (error) {
      logError(`commande ${prefix}${name}`, error);
    }
    return true;
  }

  const command = await prisma.twitchCommand.findUnique({ where: { name } });
  if (!command) return false;
  const now = Date.now();
  if (command.lastUsedAt && now - command.lastUsedAt.getTime() < command.cooldownSeconds * 1000) return true;
  await prisma.twitchCommand.update({ where: { id: command.id }, data: { uses: { increment: 1 }, lastUsedAt: new Date(now) } });
  await context.say(render(command.response, message, context));
  await incrementTwitchDailyStat("commands");
  return true;
}
