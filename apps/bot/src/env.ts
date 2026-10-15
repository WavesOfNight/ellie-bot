import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Charge apps/bot/.env (en production, systemd fournit déjà les variables via EnvironmentFile).
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: resolve(appDir, ".env"), quiet: true });

export const DEV_GUILD_ID = process.env.DISCORD_DEV_GUILD_ID?.trim() || null;
