/**
 * Adaptations d'envoi propres à chaque plateforme (sans dépendre de discord.js ni de tmi.js).
 */

/**
 * Options d'envoi Discord : `allowedMentions` vide est la vraie barrière anti-ping
 * (@everyone, @here, rôles, membres), même si le texte a déjà été nettoyé.
 */
export function buildDiscordReplyOptions(content: string) {
  return {
    content,
    allowedMentions: { parse: [] as never[], repliedUser: false },
    failIfNotExists: false,
  };
}

export const TWITCH_MESSAGE_MAX_LENGTH = 500;

/** Réponse Twitch : une seule ligne, préfixée par `@pseudo`, 500 caractères maximum au total. */
export function formatTwitchReply(username: string, text: string): string {
  const line = `@${username} ${text.replace(/\s*[\r\n]+\s*/g, " ")}`.trim();
  return line.length <= TWITCH_MESSAGE_MAX_LENGTH ? line : `${line.slice(0, TWITCH_MESSAGE_MAX_LENGTH - 1)}…`;
}
