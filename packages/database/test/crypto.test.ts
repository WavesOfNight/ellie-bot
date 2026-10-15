import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { before, describe, it } from "node:test";
import { decryptSecret, encryptSecret, EncryptionKeyError, tryDecryptSecret } from "../src/crypto.js";

describe("chiffrement AES-256-GCM", () => {
  before(() => {
    process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  });

  it("chiffre puis déchiffre un secret (aller-retour)", () => {
    const secret = "MTIzNDU2Nzg5.token-discord-très-secret";
    const encrypted = encryptSecret(secret);
    assert.notEqual(encrypted, secret);
    assert.ok(!encrypted.includes(secret));
    assert.equal(decryptSecret(encrypted), secret);
  });

  it("produit un chiffré différent à chaque appel (IV aléatoire)", () => {
    assert.notEqual(encryptSecret("abc"), encryptSecret("abc"));
  });

  it("refuse une donnée altérée (tag d'authentification)", () => {
    const encrypted = encryptSecret("valeur");
    const parts = encrypted.split(":");
    const data = Buffer.from(parts[3] ?? "", "base64");
    data[0] = (data[0] ?? 0) ^ 0xff;
    parts[3] = data.toString("base64");
    assert.throws(() => decryptSecret(parts.join(":")));
  });

  it("tryDecryptSecret renvoie null pour une valeur vide", () => {
    assert.equal(tryDecryptSecret(null), null);
    assert.equal(tryDecryptSecret(""), null);
  });

  it("signale clairement une clé absente ou mal formée", () => {
    const previous = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = "trop-courte";
    assert.throws(() => encryptSecret("x"), EncryptionKeyError);
    delete process.env.TOKEN_ENCRYPTION_KEY;
    assert.throws(() => encryptSecret("x"), EncryptionKeyError);
    process.env.TOKEN_ENCRYPTION_KEY = previous;
  });
});
