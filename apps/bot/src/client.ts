import { Client, GatewayIntentBits, Partials } from "discord.js";
import { events } from "./events/index.js";

/** Client Discord avec les intents et partials nécessaires, et tous les événements branchés. */
export function createDiscordClient(): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.GuildMember, Partials.Reaction],
    // Par défaut, aucune mention de masse : chaque envoi qui doit pinger le précise explicitement.
    allowedMentions: { parse: ["users"], repliedUser: false },
  });
  for (const event of events) event.attach(client);
  return client;
}
