import { randomInt } from "node:crypto";
import { ChannelType, EmbedBuilder, PermissionFlagsBits, type GuildMember, type Message } from "discord.js";
import {
  adjustBalance,
  loadGuildVariables,
  safeFetch,
  saveGuildVariables,
  type CustomCommandAction,
} from "@ellie/database";
import {
  ACTION_LIMITS,
  BOT_NAME,
  configNumber,
  configString,
  findAutoModMatch,
  isActionType,
  toAutoModLevel,
  type ActionNode,
  type AutoModLevel,
} from "@ellie/database/shared";
import { logError, logWarn } from "./log.js";
import { logCase } from "./moderation.js";
import { applyPlaceholders, type PlaceholderContext } from "./placeholders.js";

type ActionRow = Pick<CustomCommandAction, "id" | "parentId" | "branch" | "order" | "type" | "config">;

/** Reconstruit l'arbre d'actions à partir des lignes en base (`parentId` + `branch`, triées par `order`). */
export function buildActionTree(rows: readonly ActionRow[]): ActionNode[] {
  const byParent = new Map<string, ActionRow[]>();
  for (const row of rows) {
    const key = `${row.parentId ?? "root"}:${row.parentId ? (row.branch ?? "BODY") : "ROOT"}`;
    byParent.set(key, [...(byParent.get(key) ?? []), row]);
  }
  const build = (parentId: number | null, branch: string): ActionNode[] =>
    (byParent.get(`${parentId ?? "root"}:${parentId ? branch : "ROOT"}`) ?? [])
      .sort((a, b) => a.order - b.order)
      .filter((row) => isActionType(row.type))
      .map((row) => {
        let config: ActionNode["config"] = {};
        try {
          config = JSON.parse(row.config) as ActionNode["config"];
        } catch {
          logWarn(`configuration d'action illisible (action ${row.id})`);
        }
        const node: ActionNode = { type: row.type as ActionNode["type"], config };
        if (row.type === "IF") {
          node.then = build(row.id, "THEN");
          node.else = build(row.id, "ELSE");
        }
        if (row.type === "REPEAT") node.body = build(row.id, "BODY");
        return node;
      });
  return build(null, "ROOT");
}

interface RunState {
  executed: number;
  stopped: boolean;
}

interface RunContext {
  message: Message<true>;
  commandName: string;
  placeholders: PlaceholderContext;
  variables: Map<string, string>;
  changed: Map<string, string>;
  level: AutoModLevel;
  state: RunState;
  random: () => number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function render(ctx: RunContext, text: string): string {
  return applyPlaceholders(text, { ...ctx.placeholders, variables: ctx.variables });
}

/** Le texte produit ne doit pas contourner le filtre de mots du serveur. */
function isAllowedText(ctx: RunContext, text: string): boolean {
  const word = findAutoModMatch(ctx.level, text);
  if (word) logWarn(`commande !${ctx.commandName} (serveur ${ctx.message.guildId}) : texte bloqué par le filtre de mots`);
  return word === null;
}

async function resolveTarget(ctx: RunContext, config: ActionNode["config"]): Promise<GuildMember | null> {
  if (configString(config, "target", "AUTHOR") === "MENTIONED") {
    return ctx.message.mentions.members?.first() ?? null;
  }
  return ctx.message.member ?? (await ctx.message.guild.members.fetch(ctx.message.author.id).catch(() => null));
}

function setVariable(ctx: RunContext, name: string, value: string): void {
  const clipped = value.slice(0, 1000);
  ctx.variables.set(name, clipped);
  ctx.changed.set(name, clipped);
}

async function evaluateCondition(ctx: RunContext, config: ActionNode["config"]): Promise<boolean> {
  const value = configString(config, "value");
  const member = ctx.message.member;
  switch (configString(config, "condition")) {
    case "HAS_ROLE":
      return member?.roles.cache.has(value) ?? false;
    case "HAS_ANY_ROLE":
      return value.split(/[\s,]+/).some((roleId) => roleId && (member?.roles.cache.has(roleId) ?? false));
    case "IN_CHANNEL":
      return ctx.message.channelId === value;
    case "IS_ADMIN":
      return member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
    case "MESSAGE_CONTAINS":
      return value !== "" && ctx.message.content.toLowerCase().includes(render(ctx, value).toLowerCase());
    case "VARIABLE_EQUALS":
      return (ctx.variables.get(configString(config, "variable")) ?? "") === render(ctx, value);
    case "VARIABLE_GREATER": {
      const current = Number(ctx.variables.get(configString(config, "variable")) ?? 0);
      const threshold = Number(render(ctx, value));
      return Number.isFinite(current) && Number.isFinite(threshold) && current > threshold;
    }
    case "RANDOM_CHANCE":
      return ctx.random() * 100 < Math.min(100, Math.max(0, Number(value) || 0));
    default:
      return false;
  }
}

async function runNodes(ctx: RunContext, nodes: readonly ActionNode[] | undefined, depth: number): Promise<void> {
  if (!nodes || depth > ACTION_LIMITS.MAX_NESTING_DEPTH) return;
  for (const node of nodes) {
    if (ctx.state.stopped) return;
    if (++ctx.state.executed > ACTION_LIMITS.MAX_ACTIONS_PER_RUN) {
      ctx.state.stopped = true;
      logWarn(`commande !${ctx.commandName} (serveur ${ctx.message.guildId}) : limite de ${ACTION_LIMITS.MAX_ACTIONS_PER_RUN} actions atteinte`);
      return;
    }
    try {
      await runAction(ctx, node, depth);
    } catch (error) {
      logError(`action ${node.type} de !${ctx.commandName} (serveur ${ctx.message.guildId}, salon ${ctx.message.channelId})`, error);
    }
  }
}

async function runAction(ctx: RunContext, node: ActionNode, depth: number): Promise<void> {
  const { message } = ctx;
  const { config } = node;
  const auditReason = `Commande personnalisée !${ctx.commandName}`;

  switch (node.type) {
    case "SEND_MESSAGE": {
      const content = render(ctx, configString(config, "content")).slice(0, 2000);
      if (!content || !isAllowedText(ctx, content)) return;
      const channelId = configString(config, "channelId");
      const channel = channelId ? message.guild.channels.cache.get(channelId) : message.channel;
      if (!channel?.isTextBased()) throw new Error(`salon ${channelId} introuvable`);
      await channel.send({ content, allowedMentions: { parse: ["users"] } });
      return;
    }
    case "SEND_DM": {
      const content = render(ctx, configString(config, "content")).slice(0, 2000);
      if (!content || !isAllowedText(ctx, content)) return;
      await message.author.send({ content, allowedMentions: { parse: [] } });
      return;
    }
    case "SEND_EMBED": {
      const title = render(ctx, configString(config, "title")).slice(0, 256);
      const description = render(ctx, configString(config, "description")).slice(0, 4000);
      if (!isAllowedText(ctx, `${title} ${description}`)) return;
      const color = Number.parseInt(configString(config, "color", "#7F77DD").replace("#", ""), 16);
      const embed = new EmbedBuilder()
        .setColor(Number.isFinite(color) ? color : 0x7f77dd)
        .setDescription(description || "​")
        .setFooter({ text: BOT_NAME });
      if (title) embed.setTitle(title);
      const channelId = configString(config, "channelId");
      const channel = channelId ? message.guild.channels.cache.get(channelId) : message.channel;
      if (!channel?.isTextBased()) throw new Error(`salon ${channelId} introuvable`);
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      return;
    }
    case "ADD_ROLE":
    case "REMOVE_ROLE": {
      const role = message.guild.roles.cache.get(configString(config, "roleId"));
      const member = await resolveTarget(ctx, config);
      if (!role || !member) throw new Error("rôle ou membre introuvable");
      if (!role.editable || role.managed) throw new Error(`rôle « ${role.name} » non modifiable par le bot`);
      if (node.type === "ADD_ROLE") await member.roles.add(role, auditReason);
      else await member.roles.remove(role, auditReason);
      return;
    }
    case "ADD_REACTION":
      await message.react(configString(config, "emoji"));
      return;
    case "KICK":
    case "BAN":
    case "TIMEOUT": {
      const member = await resolveTarget(ctx, config);
      if (!member || member.id === message.guild.ownerId || member.id === message.client.user.id) {
        throw new Error("cible invalide pour une sanction");
      }
      const reason = `${auditReason}${configString(config, "reason") ? ` : ${render(ctx, configString(config, "reason"))}` : ""}`;
      const moderatorId = message.client.user.id;
      if (node.type === "KICK") {
        if (!member.kickable) throw new Error("membre non expulsable");
        await member.kick(reason);
        await logCase(message.guild, { userId: member.id, moderatorId, type: "KICK", reason });
      } else if (node.type === "BAN") {
        if (!member.bannable) throw new Error("membre non bannissable");
        const days = Math.min(7, Math.max(0, configNumber(config, "deleteMessageDays", 0)));
        await member.ban({ reason, deleteMessageSeconds: days * 86_400 });
        await logCase(message.guild, { userId: member.id, moderatorId, type: "BAN", reason });
      } else {
        if (!member.moderatable) throw new Error("membre non modérable");
        const minutes = Math.min(ACTION_LIMITS.MAX_TIMEOUT_MINUTES, Math.max(1, configNumber(config, "minutes", 10)));
        await member.timeout(minutes * 60_000, reason);
        await logCase(message.guild, {
          userId: member.id,
          moderatorId,
          type: "MUTE",
          reason,
          expiresAt: new Date(Date.now() + minutes * 60_000),
        });
      }
      return;
    }
    case "DELETE_MESSAGE":
      await message.delete();
      return;
    case "STOP":
      ctx.state.stopped = true;
      return;
    case "WAIT":
      await sleep(Math.min(ACTION_LIMITS.MAX_WAIT_SECONDS, Math.max(0, configNumber(config, "seconds", 1))) * 1000);
      return;
    case "SET_VARIABLE": {
      const name = configString(config, "name");
      if (!/^[a-zA-Z0-9_-]{1,32}$/.test(name)) throw new Error("nom de variable invalide");
      const value = render(ctx, configString(config, "value"));
      const operation = configString(config, "operation", "SET");
      if (operation === "SET") {
        setVariable(ctx, name, value);
      } else {
        const current = Number(ctx.variables.get(name) ?? 0) || 0;
        const delta = Number(value) || 0;
        setVariable(ctx, name, String(operation === "ADD" ? current + delta : current - delta));
      }
      return;
    }
    case "IF": {
      const branch = (await evaluateCondition(ctx, config)) ? node.then : node.else;
      await runNodes(ctx, branch, depth + 1);
      return;
    }
    case "REPEAT": {
      const count = Math.min(ACTION_LIMITS.MAX_REPEAT_COUNT, Math.max(0, configNumber(config, "count", 1)));
      for (let i = 0; i < count && !ctx.state.stopped; i++) await runNodes(ctx, node.body, depth + 1);
      return;
    }
    case "CREATE_CHANNEL": {
      const name = render(ctx, configString(config, "name")).slice(0, 100);
      if (!name || !isAllowedText(ctx, name)) return;
      const parent = configString(config, "categoryId");
      await message.guild.channels.create({
        name,
        type: configString(config, "kind") === "VOICE" ? ChannelType.GuildVoice : ChannelType.GuildText,
        ...(parent ? { parent } : {}),
        reason: auditReason,
      });
      return;
    }
    case "DELETE_CHANNEL": {
      const channel = message.guild.channels.cache.get(configString(config, "channelId"));
      if (!channel) throw new Error("salon introuvable");
      if ("deletable" in channel && !channel.deletable) throw new Error(`salon « ${channel.name} » non supprimable par le bot`);
      await channel.delete(auditReason);
      return;
    }
    case "CREATE_ROLE": {
      const name = render(ctx, configString(config, "name")).slice(0, 100);
      if (!name || !isAllowedText(ctx, name)) return;
      const color = Number.parseInt(configString(config, "color", "#AFA9EC").replace("#", ""), 16);
      await message.guild.roles.create({ name, colors: { primaryColor: Number.isFinite(color) ? color : 0xafa9ec }, reason: auditReason });
      return;
    }
    case "DELETE_ROLE": {
      const role = message.guild.roles.cache.get(configString(config, "roleId"));
      if (!role) throw new Error("rôle introuvable");
      if (!role.editable || role.managed) throw new Error(`rôle « ${role.name} » non supprimable par le bot`);
      await role.delete(auditReason);
      return;
    }
    case "MOVE_VOICE": {
      const member = await resolveTarget(ctx, config);
      const channel = message.guild.channels.cache.get(configString(config, "channelId"));
      if (!member?.voice.channelId) throw new Error("le membre n'est pas en vocal");
      if (!channel?.isVoiceBased()) throw new Error("salon vocal introuvable");
      await member.voice.setChannel(channel, auditReason);
      return;
    }
    case "HTTP_REQUEST": {
      const url = render(ctx, configString(config, "url"));
      const method = configString(config, "method", "GET") === "POST" ? "POST" : "GET";
      const body = method === "POST" ? render(ctx, configString(config, "body")) : undefined;
      const response = await safeFetch(url, {
        method,
        ...(body ? { body } : {}),
        timeoutMs: ACTION_LIMITS.HTTP_TIMEOUT_MS,
        maxBytes: ACTION_LIMITS.HTTP_MAX_RESPONSE_BYTES,
        maxRedirects: 0,
      });
      const variable = configString(config, "variable");
      if (variable && /^[a-zA-Z0-9_-]{1,32}$/.test(variable)) setVariable(ctx, variable, response.body.toString("utf8").trim());
      return;
    }
    case "ADD_CURRENCY":
    case "REMOVE_CURRENCY": {
      const member = await resolveTarget(ctx, config);
      if (!member || member.user.bot) throw new Error("cible invalide pour l'économie");
      const amount = Math.min(ACTION_LIMITS.MAX_CURRENCY_AMOUNT, Math.max(1, configNumber(config, "amount", 1)));
      await adjustBalance(message.guildId, member.id, node.type === "ADD_CURRENCY" ? amount : -amount);
      return;
    }
  }
}

/** Exécute la chaîne d'actions d'une commande personnalisée, avec budget et limites. */
export async function runActionChain(
  message: Message<true>,
  commandName: string,
  rows: readonly ActionRow[],
  args: readonly string[],
  autoModLevel: string,
): Promise<void> {
  const variables = await loadGuildVariables(message.guildId);
  const ctx: RunContext = {
    message,
    commandName,
    placeholders: {
      user: message.author,
      displayName: message.member?.displayName ?? message.author.displayName,
      guild: message.guild,
      args,
    },
    variables,
    changed: new Map(),
    level: toAutoModLevel(autoModLevel),
    state: { executed: 0, stopped: false },
    random: () => randomInt(1_000_000) / 1_000_000,
  };
  try {
    await runNodes(ctx, buildActionTree(rows), 1);
  } finally {
    await saveGuildVariables(message.guildId, ctx.changed).catch((error: unknown) =>
      logError(`sauvegarde des variables de !${commandName} (serveur ${message.guildId})`, error),
    );
  }
}
