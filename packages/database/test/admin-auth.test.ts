import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Test fonctionnel sur une vraie base SQLite temporaire (créée avec `prisma db push`).
 * Il ne touche jamais à la base configurée dans .env.
 */
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(join(tmpdir(), "ellie-test-"));
const databaseUrl = `file:${join(tempDir, "test.db").replace(/\\/g, "/")}`;

describe("comptes administrateur (base temporaire)", () => {
  let auth: typeof import("../src/admin-auth.js");
  let client: typeof import("../src/client.js");

  before(async () => {
    process.env.DATABASE_URL = databaseUrl;
    execFileSync(process.execPath, [resolve(packageDir, "../../node_modules/prisma/build/index.js"), "db", "push", "--skip-generate"], {
      cwd: packageDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "ignore",
    });
    auth = await import("../src/admin-auth.js");
    client = await import("../src/client.js");
  });

  after(async () => {
    await client?.prisma.$disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("crée le compte initial puis refuse un second /setup", async () => {
    assert.equal(await auth.hasAdminUser(), false);
    const admin = await auth.createInitialAdminUser("misstsune", "motdepasse-solide");
    assert.equal(admin.username, "misstsune");
    assert.equal(await auth.hasAdminUser(), true);
    await assert.rejects(auth.createInitialAdminUser("autre", "motdepasse-solide"), auth.AdminAuthError);
  });

  it("vérifie les identifiants (bcrypt)", async () => {
    assert.ok(await auth.verifyAdminCredentials("misstsune", "motdepasse-solide"));
    assert.equal(await auth.verifyAdminCredentials("misstsune", "mauvais-mot-de-passe"), null);
    assert.equal(await auth.verifyAdminCredentials("inconnu", "motdepasse-solide"), null);
  });

  it("change et réinitialise le mot de passe", async () => {
    const admin = await auth.verifyAdminCredentials("misstsune", "motdepasse-solide");
    assert.ok(admin);
    await assert.rejects(auth.changeAdminPassword(admin.id, "faux", "nouveau-mot-de-passe"), auth.AdminAuthError);
    await auth.changeAdminPassword(admin.id, "motdepasse-solide", "nouveau-mot-de-passe");
    assert.ok(await auth.verifyAdminCredentials("misstsune", "nouveau-mot-de-passe"));

    const generated = auth.generateReadablePassword();
    assert.equal(await auth.resetAdminPassword("misstsune", generated), true);
    assert.ok(await auth.verifyAdminCredentials("misstsune", generated));
    assert.equal(await auth.resetAdminPassword("inconnu", generated), false);
  });

  it("refuse un mot de passe trop court", async () => {
    await assert.rejects(auth.resetAdminPassword("misstsune", "court"), auth.AdminAuthError);
  });
});
