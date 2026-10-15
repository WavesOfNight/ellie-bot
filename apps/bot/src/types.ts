import type {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  ClientEvents,
  ModalSubmitInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
} from "discord.js";
import { logError } from "./lib/log.js";

export interface SlashCommand {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  execute(interaction: ChatInputCommandInteraction<"cached">): Promise<void>;
}

/** Bouton routé par le préfixe de son `customId` (format `prefixe:arg1:arg2`). */
export interface ButtonHandler {
  prefix: string;
  execute(interaction: ButtonInteraction<"cached">, args: string[]): Promise<void>;
}

export interface UserSelectHandler {
  prefix: string;
  execute(interaction: UserSelectMenuInteraction<"cached">, args: string[]): Promise<void>;
}

export interface StringSelectHandler {
  prefix: string;
  execute(interaction: StringSelectMenuInteraction<"cached">, args: string[]): Promise<void>;
}

export interface ModalHandler {
  prefix: string;
  execute(interaction: ModalSubmitInteraction<"cached">, args: string[]): Promise<void>;
}

export interface EventModule {
  name: keyof ClientEvents;
  attach(client: Client): void;
}

/**
 * Déclare un module d'événement. Chaque exécution est isolée : une erreur est journalisée
 * avec le nom de l'événement et ne fait jamais planter le process.
 */
export function defineEvent<K extends keyof ClientEvents>(
  name: K,
  execute: (...args: ClientEvents[K]) => Promise<void> | void,
  options: { once?: boolean } = {},
): EventModule {
  return {
    name,
    attach(client) {
      const handler = (...args: ClientEvents[K]) => {
        Promise.resolve()
          .then(() => execute(...args))
          .catch((error: unknown) => logError(`événement ${String(name)}`, error));
      };
      if (options.once) client.once(name, handler);
      else client.on(name, handler);
    },
  };
}
