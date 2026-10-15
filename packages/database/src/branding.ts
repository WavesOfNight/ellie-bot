/** Nom affiché dans le panel, les embeds, les footers et les messages du bot. */
export const BOT_NAME = "Ellie [BOT]";

/** Nom court utilisé par la personnalité IA. */
export const BOT_PERSONA_NAME = "Ellie";

/** Streameuse propriétaire de la communauté. */
export const STREAMER_NAME = "missTsune";

/** Couleurs des embeds Discord (palette pastel du panel). */
export const BRAND_COLORS = {
  lavender: 0x7f77dd,
  aqua: 0x5dcaa5,
  blush: 0xd4537e,
  coral: 0xd85a30,
  discord: 0x5865f2,
} as const;

/**
 * Libellé de la communauté : le surnom des fans s'il a été renseigné dans le panel,
 * sinon « la communauté ». Le surnom n'est jamais inventé.
 */
export function communityLabel(communityName: string | null | undefined): string {
  const trimmed = communityName?.trim();
  return trimmed ? trimmed : "la communauté";
}
