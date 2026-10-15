import type { SlashCommand } from "../types.js";
import { economyCommands } from "./economy.js";
import { funCommands } from "./fun.js";
import { levelCommands } from "./levels.js";
import { moderationCommands } from "./moderation.js";
import { serverCommands } from "./server.js";
import { utilityCommands } from "./utility.js";
import { voiceCommands } from "./voice.js";

export const commands: SlashCommand[] = [
  ...utilityCommands,
  ...funCommands,
  ...levelCommands,
  ...economyCommands,
  ...moderationCommands,
  ...serverCommands,
  ...voiceCommands,
];

export const commandMap = new Map(commands.map((command) => [command.data.name, command]));
