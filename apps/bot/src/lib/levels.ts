import type { Message } from "discord.js";
import { awardMessageXp, prisma } from "@ellie/database";
import { logError } from "./log.js";

/** XP du message, annonce du passage de niveau et attribution des rôles de récompense. */
export async function handleMessageXp(message: Message<true>): Promise<void> {
  const result = await awardMessageXp(message.guildId, message.author.id);
  if (!result.leveledUp) return;

  const context = `passage de niveau (serveur ${message.guildId}, membre ${message.author.id})`;
  try {
    await message.channel.send({
      content: `GG <@${message.author.id}> ! Tu passes au niveau ${result.level} !`,
      allowedMentions: { users: [message.author.id] },
    });
  } catch (error) {
    logError(`${context} : annonce`, error);
  }

  const rewards = await prisma.levelReward.findMany({
    where: { guildId: message.guildId, level: { gt: result.previousLevel, lte: result.level } },
  });
  const member = message.member;
  if (!member) return;
  for (const reward of rewards) {
    const role = message.guild.roles.cache.get(reward.roleId);
    if (!role) {
      logError(context, new Error(`rôle de récompense ${reward.roleId} introuvable (niveau ${reward.level})`));
      continue;
    }
    if (!role.editable) {
      logError(context, new Error(`rôle « ${role.name} » au-dessus du rôle du bot : attribution impossible`));
      continue;
    }
    await member.roles.add(role, `Récompense du niveau ${reward.level}`).catch((error: unknown) => logError(context, error));
  }
}
