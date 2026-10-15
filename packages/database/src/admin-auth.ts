import { compare, hash } from "bcryptjs";
import { randomInt } from "node:crypto";
import { prisma } from "./client.js";

const BCRYPT_ROUNDS = 12;
export const ADMIN_USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;
export const ADMIN_PASSWORD_MIN_LENGTH = 10;
export const ADMIN_PASSWORD_MAX_LENGTH = 128;

/** Empreinte factice comparée quand le compte n'existe pas, pour garder un temps de réponse constant. */
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= hash("ellie-compte-inexistant", BCRYPT_ROUNDS);
  return dummyHash;
}

export class AdminAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAuthError";
  }
}

export interface AdminIdentity {
  id: number;
  username: string;
}

export function validateAdminPassword(password: string): string | null {
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit contenir au moins ${ADMIN_PASSWORD_MIN_LENGTH} caractères.`;
  }
  if (password.length > ADMIN_PASSWORD_MAX_LENGTH) {
    return `Le mot de passe ne doit pas dépasser ${ADMIN_PASSWORD_MAX_LENGTH} caractères.`;
  }
  return null;
}

export function validateAdminUsername(username: string): string | null {
  if (!ADMIN_USERNAME_PATTERN.test(username)) {
    return "Le nom d'utilisateur doit contenir 3 à 32 caractères (lettres, chiffres, point, tiret, tiret bas).";
  }
  return null;
}

export async function hasAdminUser(): Promise<boolean> {
  return (await prisma.adminUser.count()) > 0;
}

/**
 * Crée le compte administrateur initial. Refuse s'il existe déjà un compte : la page /setup
 * ne doit servir qu'une seule fois, même si deux requêtes arrivent en même temps.
 */
export async function createInitialAdminUser(username: string, password: string): Promise<AdminIdentity> {
  const usernameError = validateAdminUsername(username);
  if (usernameError) throw new AdminAuthError(usernameError);
  const passwordError = validateAdminPassword(password);
  if (passwordError) throw new AdminAuthError(passwordError);

  const passwordHash = await hash(password, BCRYPT_ROUNDS);
  return prisma.$transaction(async (tx) => {
    if ((await tx.adminUser.count()) > 0) {
      throw new AdminAuthError("Un compte administrateur existe déjà.");
    }
    const user = await tx.adminUser.create({ data: { username, passwordHash } });
    return { id: user.id, username: user.username };
  });
}

export async function verifyAdminCredentials(username: string, password: string): Promise<AdminIdentity | null> {
  const user = await prisma.adminUser.findUnique({ where: { username } });
  const valid = await compare(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !valid) return null;
  return { id: user.id, username: user.username };
}

export async function changeAdminPassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user) throw new AdminAuthError("Compte administrateur introuvable.");
  if (!(await compare(currentPassword, user.passwordHash))) {
    throw new AdminAuthError("Le mot de passe actuel est incorrect.");
  }
  const passwordError = validateAdminPassword(newPassword);
  if (passwordError) throw new AdminAuthError(passwordError);
  await prisma.adminUser.update({
    where: { id: userId },
    data: { passwordHash: await hash(newPassword, BCRYPT_ROUNDS) },
  });
}

/** Réinitialisation hors panel (script en ligne de commande) : aucun mot de passe actuel requis. */
export async function resetAdminPassword(username: string, newPassword: string): Promise<boolean> {
  const passwordError = validateAdminPassword(newPassword);
  if (passwordError) throw new AdminAuthError(passwordError);
  const result = await prisma.adminUser.updateMany({
    where: { username },
    data: { passwordHash: await hash(newPassword, BCRYPT_ROUNDS) },
  });
  return result.count > 0;
}

export async function listAdminUsernames(): Promise<string[]> {
  const users = await prisma.adminUser.findMany({ select: { username: true }, orderBy: { id: "asc" } });
  return users.map((user) => user.username);
}

/** Mot de passe aléatoire lisible (sans caractères ambigus), pour le script de réinitialisation. */
export function generateReadablePassword(length = 20): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < length; i++) password += alphabet[randomInt(alphabet.length)];
  return password;
}
