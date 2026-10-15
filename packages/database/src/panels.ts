/**
 * Panneaux interactifs partagés par le bot et le panel web : identifiants des composants Discord,
 * limites des panneaux de rôles et textes par défaut.
 *
 * Les identifiants des boutons du règlement, des tickets et des signalements sont ceux de l'ancien
 * bot du Terrier : les messages qu'il a déjà publiés continuent de fonctionner avec Ellie.
 */

export const COMPONENT_IDS = {
  RULES_ACCEPT: "verifier",
  TICKET_OPEN: "ticket:ouvrir",
  TICKET_CLOSE: "ticket:fermer",
  REPORT_OPEN: "signalement:ouvrir",
  REPORT_SUBMIT: "signalement:envoyer",
} as const;

export const ROLE_PANEL_LIMITS = {
  /** Discord : 5 rangées de 5 composants par message. */
  MAX_COMPONENTS: 25,
  /** Discord : 25 options maximum dans un menu déroulant. */
  MAX_OPTIONS_PER_GROUP: 25,
  MAX_GROUPS: 25,
} as const;

export const ROLE_GROUP_DISPLAYS = ["MENU", "BUTTONS"] as const;
export type RoleGroupDisplay = (typeof ROLE_GROUP_DISPLAYS)[number];

/** Nombre de composants qu'occupe un panneau : 1 par groupe « menu », 1 par rôle d'un groupe « boutons ». */
export function countPanelComponents(groups: ReadonlyArray<{ display: string; optionCount: number }>): number {
  return groups.reduce((total, group) => total + (group.display === "BUTTONS" ? group.optionCount : 1), 0);
}

export const DEFAULT_ROLE_PANEL_DESCRIPTION =
  "Clique sur un bouton, coche ce qui te ressemble, valide. C'est tout !\nTu peux revenir changer quand tu veux.";

/** Panneau « Besoin d'aide ? » (repris de l'ancien bot) : tickets + signalement anonyme. */
export function ticketPanelContent(withReports: boolean): { title: string; description: string; color: number } {
  return {
    title: "🆘 Besoin d'aide ? Le staff est là.",
    description: [
      "Un problème avec quelqu'un, un message qui t'a mis mal à l'aise, une question, une idée ? Il n'y a **pas de petit souci** ici 💕",
      "",
      "📩 **Ouvrir un ticket** — un salon privé rien qu'entre toi et le staff.",
      ...(withReports
        ? ["🕵️ **Signalement anonyme** — préviens le staff sans que ton pseudo n'apparaisse. Le bot n'enregistre pas qui a envoyé le signalement."]
        : []),
      "",
      "🚨 **Danger immédiat ?** Appelle le **112** (ou le 15 / 17 en France).",
      "🧑‍⚖️ Contenu illégal en ligne : [internet-signalement.gouv.fr](https://www.internet-signalement.gouv.fr) · Signaler à Discord : [dis.gd/report](https://dis.gd/report)",
    ].join("\n"),
    color: 0xa0c4ff,
  };
}

/**
 * Émoji utilisable sur un bouton ou une option de menu : un émoji Unicode (séquences composées
 * comprises) ou un émoji du serveur `<:nom:id>` / `<a:nom:id>`. Un texte quelconque ferait échouer
 * la publication du message.
 */
export function isValidEmoji(value: string): boolean {
  const emoji = value.trim();
  if (/^<a?:\w{2,32}:\d{17,20}>$/.test(emoji) || /^[0-9#*]️?⃣$/u.test(emoji)) return true;
  if (!emoji || emoji.length > 32 || /[\p{L}\p{N}\s]/u.test(emoji.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ""))) return false;
  return /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]{2}/u.test(emoji);
}

/** Lignes d'identifiants Discord séparés par des virgules (rôles staff, rôles à mentionner…). */
export function splitIds(value: string | null | undefined): string[] {
  return [...new Set((value ?? "").split(/[\s,;]+/).filter((id) => /^\d{17,20}$/.test(id)))];
}
