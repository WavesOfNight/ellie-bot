/**
 * Réinitialise le mot de passe d'un compte administrateur du panel.
 * Les mots de passe sont hachés (bcrypt) : il est impossible de les récupérer, seulement de les remplacer.
 *
 * Usage : npm run admin:reset-password -- <nom_utilisateur>
 * Un nouveau mot de passe aléatoire est généré et affiché une seule fois.
 */
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: resolve(packageDir, ".env"), quiet: true });

const { generateReadablePassword, listAdminUsernames, resetAdminPassword } = await import("../admin-auth.js");
const { prisma } = await import("../client.js");

async function main(): Promise<number> {
  const username = process.argv[2]?.trim();
  const admins = await listAdminUsernames();

  if (!username) {
    console.log("Usage : npm run admin:reset-password -- <nom_utilisateur>");
    console.log(admins.length ? `Comptes existants : ${admins.join(", ")}` : "Aucun compte administrateur : ouvre /setup dans le panel.");
    return 1;
  }

  const password = generateReadablePassword();
  if (!(await resetAdminPassword(username, password))) {
    console.error(`Aucun compte « ${username} ».`);
    if (admins.length) console.error(`Comptes existants : ${admins.join(", ")}`);
    return 1;
  }

  console.log(`Mot de passe de « ${username} » réinitialisé.`);
  console.log(`Nouveau mot de passe : ${password}`);
  console.log("Connecte-toi au panel puis change-le dans Paramètres.");
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error("Réinitialisation impossible :", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
