import type { Message } from "discord.js";
import { prisma, type AutoResponse, type Guild as GuildSettings } from "@ellie/database";
import { findAutoModMatch, toAutoModLevel } from "@ellie/database/shared";
import { runActionChain } from "./action-chain.js";
import { formatDuration } from "./durations.js";
import { logError, logWarn } from "./log.js";
import { applyPlaceholders } from "./placeholders.js";

const COOLDOWN_NOTICE_DELETE_MS = 5_000;
const autoResponseCache = new Map<string, { value: AutoResponse[]; expiresAt: number }>();

async function getAutoResponses(guildId: string): Promise<AutoResponse[]> {
  const cached = autoResponseCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await prisma.autoResponse.findMany({ where: { guildId, enabled: true }, orderBy: { id: "asc" } });
  autoResponseCache.set(guildId, { value, expiresAt: Date.now() + 5_000 });
  return value;
}

/** Envoie un texte écrit par l'équipe (commande / réponse auto) après le filtre de mots du serveur. */
async function sendFilteredText(message: Message<true>, text: string, level: string, origin: string): Promise<void> {
  const content = text.slice(0, 2000).trim();
  if (!content) return;
  if (findAutoModMatch(toAutoModLevel(level), content)) {
    logWarn(`${origin} (serveur ${message.guildId}) : réponse bloquée par le filtre de mots`);
    return;
  }
  // Seules les mentions de membres sont autorisées : un membre ne doit pas pouvoir faire pinger @everyone via {args}.
  await message.channel.send({ content, allowedMentions: { parse: ["users"] } });
}

/** Commandes personnalisées (préfixe du serveur). @returns `true` si le message a été traité. */
export async function handleCustomCommand(message: Message<true>, settings: GuildSettings): Promise<boolean> {
  const prefix = settings.prefix || "!";
  if (!message.content.startsWith(prefix)) return false;
  const [rawName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
  const name = rawName?.toLowerCase();
  if (!name) return false;

  const command = await prisma.customCommand.findUnique({
    where: { guildId_name: { guildId: message.guildId, name } },
    include: { actions: { select: { id: true, parentId: true, branch: true, order: true, type: true, config: true } } },
  });
  if (!command) return false;

  const now = Date.now();
  if (command.cooldownSeconds > 0 && command.lastUsedAt) {
    const remaining = command.lastUsedAt.getTime() + command.cooldownSeconds * 1000 - now;
    if (remaining > 0) {
      const notice = await message.channel
        .send({ content: `⏳ La commande \`${prefix}${name}\` est en recharge (encore ${formatDuration(remaining)}).`, allowedMentions: { parse: [] } })
        .catch((error: unknown) => {
          logError(`cooldown de ${prefix}${name} (serveur ${message.guildId})`, error);
          return null;
        });
      if (notice) setTimeout(() => void notice.delete().catch(() => undefined), COOLDOWN_NOTICE_DELETE_MS).unref();
      return true;
    }
  }
  await prisma.customCommand.update({ where: { id: command.id }, data: { lastUsedAt: new Date(now) } });

  const origin = `commande ${prefix}${name}`;
  try {
    if (command.actions.length > 0) {
      await runActionChain(message, name, command.actions, args, settings.autoModLevel);
    } else {
      const text = applyPlaceholders(command.response, {
        user: message.author,
        displayName: message.member?.displayName ?? message.author.displayName,
        guild: message.guild,
        args,
      });
      await sendFilteredText(message, text, settings.autoModLevel, origin);
    }
  } catch (error) {
    logError(`${origin} (serveur ${message.guildId}, salon ${message.channelId})`, error);
  }
  return true;
}

/** Réponses automatiques (déclencheur EXACT ou CONTAINS, insensible à la casse). */
export async function handleAutoResponse(message: Message<true>, settings: GuildSettings): Promise<boolean> {
  const content = message.content.trim().toLowerCase();
  if (!content) return false;
  const responses = await getAutoResponses(message.guildId);
  const match = responses.find((response) => {
    const trigger = response.trigger.trim().toLowerCase();
    if (!trigger) return false;
    return response.matchType === "EXACT" ? content === trigger : content.includes(trigger);
  });
  if (!match) return false;

  const text = applyPlaceholders(match.response, {
    user: message.author,
    displayName: message.member?.displayName ?? message.author.displayName,
    guild: message.guild,
  });
  try {
    await sendFilteredText(message, text, settings.autoModLevel, `réponse automatique #${match.id}`);
  } catch (error) {
    logError(`réponse automatique #${match.id} (serveur ${message.guildId}, salon ${message.channelId})`, error);
  }
  return true;
}
