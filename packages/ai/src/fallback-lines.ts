/** Répliques de secours, dans le personnage, utilisées sans appel à l'API. */

export type FallbackCategory = "erreur" | "refus" | "plafond" | "mention_vide";

export const FALLBACK_LINES: Record<FallbackCategory, readonly string[]> = {
  erreur: [
    "Mon cerveau a planté deux secondes… redemande-moi ça dans un moment ?",
    "Attends, j'ai perdu le fil. Retente dans un instant ?",
    "Bug de mon côté, désolée. Laisse-moi souffler et redemande.",
    "Mon talkie-walkie grésille, j'ai rien capté. Réessaie un peu plus tard ?",
  ],
  refus: [
    "Nan, là je passe mon tour. Parle-moi d'un truc plus cool ?",
    "Ça, c'est non. Trouve-moi un autre sujet, je suis sûre que t'as mieux.",
    "Je vais faire comme si j'avais rien lu. Autre chose ?",
    "Pas question. Mais si tu veux parler jeux ou musique, je suis là.",
  ],
  plafond: [
    "J'ai trop parlé aujourd'hui, j'ai la voix cassée. On se retrouve demain !",
    "Batterie à plat pour aujourd'hui. Je reviens demain, promis.",
    "J'ai épuisé mon stock de vannes du jour. À demain !",
  ],
  mention_vide: [
    "Oui ? Je t'écoute.",
    "Tu m'as appelée ? Vas-y, je t'écoute.",
    "Présente. Qu'est-ce qu'il y a ?",
    "Hm ? Tu voulais me dire un truc ?",
  ],
};

export function pickFallbackLine(category: FallbackCategory, random: () => number = Math.random): string {
  const lines = FALLBACK_LINES[category];
  const index = Math.min(lines.length - 1, Math.floor(random() * lines.length));
  return lines[index] as string;
}
