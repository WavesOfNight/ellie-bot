import type { Guild, User } from "discord.js";

export interface PlaceholderContext {
  user: User;
  /** Pseudo affiché sur le serveur (surnom ou nom global). */
  displayName: string;
  guild: Guild;
  args?: readonly string[];
  variables?: ReadonlyMap<string, string>;
}

/**
 * Remplace les placeholders partagés :
 * {user} {user.name} {user.tag} {user.mention} {server} {server.name} {server.memberCount}
 * {args} {arg1}…{arg9} {var:nom}
 */
export function applyPlaceholders(text: string, context: PlaceholderContext): string {
  const args = context.args ?? [];
  const values: Record<string, string> = {
    user: context.displayName,
    "user.name": context.user.username,
    "user.tag": context.user.tag,
    "user.mention": `<@${context.user.id}>`,
    server: context.guild.name,
    "server.name": context.guild.name,
    "server.memberCount": context.guild.memberCount.toLocaleString("fr-FR"),
    args: args.join(" "),
  };
  for (let i = 1; i <= 9; i++) values[`arg${i}`] = args[i - 1] ?? "";

  return text.replace(/\{(var:[a-zA-Z0-9_-]{1,32}|[a-zA-Z0-9.]+)\}/g, (match, key: string) => {
    if (key.startsWith("var:")) return context.variables?.get(key.slice(4)) ?? "";
    return values[key] ?? match;
  });
}
