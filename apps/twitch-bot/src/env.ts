import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Charge apps/twitch-bot/.env (en production, systemd fournit déjà les variables via EnvironmentFile).
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: resolve(appDir, ".env"), quiet: true });
