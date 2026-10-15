import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const FORMAT_VERSION = "v1";

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionKeyError";
  }
}

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!hex) {
    throw new EncryptionKeyError(
      "TOKEN_ENCRYPTION_KEY est absente : ajoute-la dans le fichier .env (32 octets en hexadécimal).",
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new EncryptionKeyError(
      "TOKEN_ENCRYPTION_KEY doit contenir exactement 64 caractères hexadécimaux (32 octets).",
    );
  }
  return Buffer.from(hex, "hex");
}

/** Chiffre un secret en AES-256-GCM. Format : `v1:<iv>:<tag>:<données>` (base64). */
export function encryptSecret(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT_VERSION, iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

/** Déchiffre un secret produit par `encryptSecret`. Lève une erreur si la donnée a été altérée. */
export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new Error("Format de secret chiffré inconnu.");
  }
  const [, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}

/** Variante tolérante : renvoie `null` si la valeur est vide ou indéchiffrable (clé changée…). */
export function tryDecryptSecret(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    return decryptSecret(payload);
  } catch (error) {
    if (error instanceof EncryptionKeyError) throw error;
    console.error("[Ellie] Impossible de déchiffrer un secret stocké (TOKEN_ENCRYPTION_KEY a-t-elle changé ?).");
    return null;
  }
}

export function generateEncryptionKey(): string {
  return randomBytes(32).toString("hex");
}
