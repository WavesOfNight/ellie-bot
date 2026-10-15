import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export interface AppUser {
  name: string;
  image: string | null;
  /** owner = compte administrateur du panel ; guild-admin = connexion Discord (« Gérer le serveur »). */
  role: "owner" | "guild-admin";
  adminId: number | null;
  /** Identifiant Discord (connexion via Discord uniquement). */
  discordId: string | null;
  /** Serveurs gérables (guild-admin uniquement). */
  guildIds: string[];
}

export async function getAppUser(): Promise<AppUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  const user = session.user as typeof session.user & Partial<AppUser>;
  return {
    name: user.name ?? "Administrateur",
    image: user.image ?? null,
    role: user.role === "owner" ? "owner" : "guild-admin",
    adminId: typeof user.adminId === "number" ? user.adminId : null,
    discordId: typeof user.discordId === "string" ? user.discordId : null,
    guildIds: Array.isArray(user.guildIds) ? user.guildIds : [],
  };
}

export async function requireUser(): Promise<AppUser> {
  const user = await getAppUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireOwner(): Promise<AppUser> {
  const user = await requireUser();
  if (user.role !== "owner") redirect("/dashboard");
  return user;
}

export function canManageGuild(user: AppUser, guildId: string): boolean {
  return user.role === "owner" || user.guildIds.includes(guildId);
}

/** Vérifie l'accès au serveur (identifiant Discord valide + droits). Redirige sinon. */
export async function requireGuildAccess(guildId: unknown): Promise<{ user: AppUser; guildId: string }> {
  const user = await requireUser();
  if (typeof guildId !== "string" || !/^\d{17,20}$/.test(guildId) || !canManageGuild(user, guildId)) redirect("/dashboard");
  return { user, guildId };
}
