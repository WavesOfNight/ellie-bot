import { EmbedBuilder } from "discord.js";
import { BOT_NAME, BRAND_COLORS } from "@ellie/database/shared";

export const COLORS = BRAND_COLORS;

/** Embed aux couleurs du bot, avec le footer « Ellie [BOT] ». */
export function brandEmbed(color: number = COLORS.lavender): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setFooter({ text: BOT_NAME }).setTimestamp();
}

/** Raccourcit un texte pour un champ d'embed (limites Discord). */
export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Barre de progression textuelle (ex. XP, sondages). */
export function progressBar(ratio: number, length = 12): string {
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}

/** Horodatage Discord (`<t:…:F>` = date complète, `R` = relatif). */
export function discordTimestamp(date: Date, style: "F" | "R" | "D" | "f" = "F"): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("fr-FR");
}
