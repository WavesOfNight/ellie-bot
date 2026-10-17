import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { safeFetch } from "@ellie/database";
import { DEFAULT_WELCOME_TEXT_COLOR, isHexColor, stripEmoji, welcomeCardPanel } from "@ellie/database/shared";
import { logInfo } from "./log.js";

const FONT_STACK = '"Quicksand", "Baloo 2", "DejaVu Sans", "Noto Sans", "Liberation Sans", Arial, sans-serif';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

let fontsRegistered = false;

/** Enregistre les polices optionnelles déposées dans apps/bot/assets/fonts (.ttf / .otf). */
function registerFonts(): void {
  if (fontsRegistered) return;
  fontsRegistered = true;
  const fontsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../assets/fonts");
  if (!existsSync(fontsDir)) return;
  for (const file of readdirSync(fontsDir)) {
    if (/\.(ttf|otf)$/i.test(file)) GlobalFonts.registerFromPath(join(fontsDir, file));
  }
  logInfo(`polices chargées depuis ${fontsDir}`);
}

/** Télécharge une image distante via la protection SSRF (taille et délai limités). */
async function loadRemoteImage(url: string): Promise<Image> {
  const response = await safeFetch(url, { timeoutMs: 8_000, maxBytes: MAX_IMAGE_BYTES });
  if (response.status < 200 || response.status >= 300) throw new Error(`image indisponible (HTTP ${response.status})`);
  if (!response.contentType.startsWith("image/")) throw new Error("l'URL ne pointe pas vers une image");
  return loadImage(response.body);
}

function drawCover(ctx: SKRSContext2D, image: Image, width: number, height: number): void {
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

function drawPastelBackground(ctx: SKRSContext2D, width: number, height: number): void {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#F7F5FF");
  gradient.addColorStop(0.45, "#E1F5EE");
  gradient.addColorStop(1, "#FBEAF0");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.35;
  for (const [x, y, r, color] of [
    [width * 0.12, height * 0.2, 90, "#CECBF6"],
    [width * 0.88, height * 0.8, 120, "#9FE1CB"],
    [width * 0.8, height * 0.15, 60, "#F4C0D1"],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function roundedRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function drawAvatar(ctx: SKRSContext2D, url: string, cx: number, cy: number, radius: number): Promise<void> {
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  try {
    const avatar = await loadRemoteImage(url);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
  } catch {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = "#AFA9EC";
    ctx.fill();
  }
}

/** Écrit un texte centré (sans émojis) en réduisant la taille de police jusqu'à ce qu'il tienne dans `maxWidth`. */
function fitText(ctx: SKRSContext2D, rawText: string, x: number, y: number, maxWidth: number, startSize: number, weight = 700): void {
  const text = stripEmoji(rawText);
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    size -= 2;
  } while (ctx.measureText(text).width > maxWidth && size > 14);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y, maxWidth);
}

export interface WelcomeImageOptions {
  avatarUrl: string;
  title: string;
  subtitle: string;
  backgroundUrl?: string | null;
  /** Couleur du texte (#RRVVBB) ; le cadre derrière s'adapte pour rester lisible. */
  textColor?: string | null;
}

/** Image de bienvenue (PNG 1024 × 450) : fond pastel ou personnalisé, avatar rond, texte. */
export async function renderWelcomeImage(options: WelcomeImageOptions): Promise<Buffer> {
  registerFonts();
  const width = 1024;
  const height = 450;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawPastelBackground(ctx, width, height);
  if (options.backgroundUrl) {
    const background = await loadRemoteImage(options.backgroundUrl);
    drawCover(ctx, background, width, height);
  }

  const textColor = options.textColor && isHexColor(options.textColor) ? options.textColor : DEFAULT_WELCOME_TEXT_COLOR;
  ctx.fillStyle = welcomeCardPanel(textColor).fill;
  roundedRect(ctx, 40, 40, width - 80, height - 80, 32);
  ctx.fill();

  await drawAvatar(ctx, options.avatarUrl, width / 2, 165, 85);

  ctx.fillStyle = textColor;
  fitText(ctx, options.title, width / 2, 305, width - 160, 52);
  ctx.globalAlpha = 0.8;
  fitText(ctx, options.subtitle, width / 2, 360, width - 200, 28, 500);
  ctx.globalAlpha = 1;

  return canvas.toBuffer("image/png");
}

export interface HugImageOptions {
  fromAvatarUrl: string;
  toAvatarUrl: string;
  caption: string;
}

/** Image de câlin (PNG 800 × 320) : deux avatars et un cœur. */
export async function renderHugImage(options: HugImageOptions): Promise<Buffer> {
  registerFonts();
  const width = 800;
  const height = 320;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawPastelBackground(ctx, width, height);
  await drawAvatar(ctx, options.fromAvatarUrl, 230, 135, 85);
  await drawAvatar(ctx, options.toAvatarUrl, 570, 135, 85);

  ctx.font = `700 72px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#D4537E";
  ctx.fillText("♥", 400, 135);

  ctx.fillStyle = "#3C3489";
  fitText(ctx, options.caption, width / 2, 275, width - 80, 34);
  return canvas.toBuffer("image/png");
}

/** Vérifie qu'une URL de fond est utilisable (utilisé avant d'enregistrer la configuration). */
export async function validateImageUrl(url: string): Promise<void> {
  await loadRemoteImage(url);
}
