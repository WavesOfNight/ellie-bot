/** Carte de bienvenue : règles partagées par le bot (dessin de l'image) et le panel (aperçu). */

export const DEFAULT_WELCOME_TEXT_COLOR = "#3C3489";

/** Suggestions proposées dans le panel (la palette du Cat Café). */
export const WELCOME_TEXT_COLOR_PRESETS = [
  { name: "Lavande nuit", value: "#3C3489" },
  { name: "Fraise", value: "#D4537E" },
  { name: "Framboise", value: "#993556" },
  { name: "Matcha", value: "#0F6E56" },
  { name: "Caramel", value: "#A0522D" },
  { name: "Chocolat", value: "#4A2C20" },
  { name: "Sakura", value: "#FFB7D5" },
  { name: "Blanc", value: "#FFFFFF" },
] as const;

export const isHexColor = (value: string): boolean => /^#[0-9a-fA-F]{6}$/.test(value);

/**
 * Retire les émojis (pictogrammes, drapeaux, sélecteurs de variante, liaisons) des textes dessinés
 * sur l'image : les polices du serveur ne les ont pas, ils s'afficheraient en carrés vides.
 */
export function stripEmoji(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Luminance relative (WCAG) d'une couleur #RRVVBB : 0 = noir, 1 = blanc. */
export function relativeLuminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Luminances approximatives des deux cadres posés sur le fond pastel. */
const LIGHT_PANEL_LUMINANCE = 0.85;
const DARK_PANEL_LUMINANCE = 0.14;

/**
 * Cadre semi-transparent derrière le texte : clair pour un texte foncé, sombre pour un texte clair,
 * selon celui qui donne le meilleur contraste. Le texte reste lisible quelle que soit la couleur.
 */
export function welcomeCardPanel(textColor: string): { fill: string; dark: boolean } {
  const text = relativeLuminance(isHexColor(textColor) ? textColor : DEFAULT_WELCOME_TEXT_COLOR) + 0.05;
  const onLight = (LIGHT_PANEL_LUMINANCE + 0.05) / text;
  const onDark = text / (DARK_PANEL_LUMINANCE + 0.05);
  return onDark > onLight ? { fill: "rgba(28, 24, 64, 0.65)", dark: true } : { fill: "rgba(255, 255, 255, 0.55)", dark: false };
}
