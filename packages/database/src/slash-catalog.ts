/**
 * Catalogue des commandes slash, partagé par /help (bot) et la page « Slash Commands » (panel).
 * Un test du bot vérifie que ce catalogue correspond exactement aux commandes enregistrées.
 */

export interface SlashCommandInfo {
  name: string;
  description: string;
}

export interface SlashCommandCategory {
  id: string;
  label: string;
  emoji: string;
  commands: readonly SlashCommandInfo[];
}

export const SLASH_COMMAND_CATALOG: readonly SlashCommandCategory[] = [
  {
    id: "utility",
    label: "Utilitaires",
    emoji: "🧰",
    commands: [
      { name: "ping", description: "Affiche la latence du bot." },
      { name: "userinfo", description: "Informations sur un membre." },
      { name: "serverinfo", description: "Informations sur le serveur." },
      { name: "avatar", description: "Affiche l'avatar d'un membre en grand." },
      { name: "roleinfo", description: "Informations sur un rôle." },
      { name: "poll", description: "Crée un sondage à boutons (2 à 4 choix)." },
      { name: "remindme", description: "Programme un rappel (ex. 10m, 2h, 1d)." },
      { name: "8ball", description: "Pose une question à la boule magique." },
      { name: "invite", description: "Donne le lien d'invitation permanent du serveur." },
      { name: "help", description: "Liste toutes les commandes du bot." },
    ],
  },
  {
    id: "fun",
    label: "Fun",
    emoji: "🎉",
    commands: [
      { name: "hello", description: "Dis bonjour à Ellie." },
      { name: "hug", description: "Fais un câlin à un membre (image générée)." },
      { name: "meme", description: "Affiche un mème (sous-reddits francophones par défaut)." },
    ],
  },
  {
    id: "levels",
    label: "Niveaux",
    emoji: "📈",
    commands: [
      { name: "rank", description: "Affiche le niveau et l'XP d'un membre." },
      { name: "leaderboard", description: "Classement XP du serveur." },
    ],
  },
  {
    id: "economy",
    label: "Économie",
    emoji: "🪙",
    commands: [
      { name: "balance", description: "Affiche le solde de pièces d'un membre." },
      { name: "pay", description: "Envoie des pièces à un autre membre." },
      { name: "classement-pieces", description: "Classement des membres les plus riches." },
    ],
  },
  {
    id: "moderation",
    label: "Modération",
    emoji: "🛡️",
    commands: [
      { name: "warn", description: "Avertit un membre." },
      { name: "warnings", description: "Liste les sanctions d'un membre." },
      { name: "mute", description: "Rend un membre muet (timeout)." },
      { name: "unmute", description: "Rend la parole à un membre." },
      { name: "kick", description: "Expulse un membre." },
      { name: "ban", description: "Bannit un membre (définitivement ou temporairement)." },
      { name: "unban", description: "Lève le bannissement d'un utilisateur." },
      { name: "clear", description: "Supprime des messages en masse (1 à 100)." },
      { name: "slowmode", description: "Règle le mode lent d'un salon." },
      { name: "nickname", description: "Change ou réinitialise le pseudo d'un membre." },
      { name: "say", description: "Fait parler le bot dans un salon." },
    ],
  },
  {
    id: "server",
    label: "Serveur",
    emoji: "⚙️",
    commands: [
      { name: "giveaway", description: "Gère les giveaways (lancer, terminer, relancer, lister)." },
      { name: "customcommand", description: "Gère les commandes texte personnalisées." },
      { name: "reactionrole", description: "Crée des panneaux de rôles (boutons ou menus à cocher)." },
      { name: "alertes", description: "Force la vérification des alertes YouTube/Twitch." },
    ],
  },
  {
    id: "voice",
    label: "Vocal",
    emoji: "🔊",
    commands: [{ name: "creer-vocal", description: "Crée ton salon vocal personnalisé." }],
  },
];

export const SLASH_COMMAND_NAMES: readonly string[] = SLASH_COMMAND_CATALOG.flatMap((category) =>
  category.commands.map((command) => command.name),
);
