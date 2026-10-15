import { ActivityType, type Client } from "discord.js";
import { prisma } from "@ellie/database";
import { STREAMER_NAME } from "@ellie/database/shared";
import { logError } from "./log.js";

const TYPES: Record<string, ActivityType.Playing | ActivityType.Watching | ActivityType.Listening | ActivityType.Competing> = {
  PLAYING: ActivityType.Playing,
  WATCHING: ActivityType.Watching,
  LISTENING: ActivityType.Listening,
  COMPETING: ActivityType.Competing,
};

function randomMemberName(client: Client): string {
  const members = client.guilds.cache.flatMap((guild) => guild.members.cache.filter((member) => !member.user.bot));
  return members.random()?.displayName ?? "la communauté";
}

function renderActivity(client: Client, text: string): string {
  const memberCount = client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0);
  return text
    .replaceAll("{randomMember}", randomMemberName(client))
    .replaceAll("{memberCount}", memberCount.toLocaleString("fr-FR"))
    .replaceAll("{serverCount}", client.guilds.cache.size.toLocaleString("fr-FR"))
    .slice(0, 128);
}

/** Rotation du statut (BotActivity, relu à chaque étape). @returns une fonction d'arrêt. */
export function startActivityRotation(client: Client): () => void {
  let index = 0;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const step = async () => {
    let delayMs = 60_000;
    try {
      const activities = await prisma.botActivity.findMany({ where: { enabled: true }, orderBy: [{ order: "asc" }, { id: "asc" }] });
      const activity = activities.length ? activities[index % activities.length] : null;
      index++;
      if (activity) {
        client.user?.setActivity(renderActivity(client, activity.text), { type: TYPES[activity.type] ?? ActivityType.Watching });
        delayMs = Math.max(10, activity.durationSeconds) * 1000;
      } else {
        client.user?.setActivity(`la communauté de ${STREAMER_NAME}`, { type: ActivityType.Watching });
      }
    } catch (error) {
      logError("rotation du statut", error);
    }
    if (!stopped) {
      timer = setTimeout(() => void step(), delayMs);
      timer.unref();
    }
  };
  void step();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
