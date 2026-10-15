import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Discord from "next-auth/providers/discord";
import { getDiscordOAuthCredentials, verifyAdminCredentials } from "@ellie/database";
import { fetchManageableGuildIds } from "@/lib/discord";

const GUILD_REFRESH_MS = 10 * 60_000;
const LOGIN_WINDOW_MS = 5 * 60_000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

/** Limite les tentatives de connexion (5 par tranche de 5 minutes, par compte et par adresse IP). */
function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > LOGIN_MAX_ATTEMPTS;
}

async function buildConfig(): Promise<NextAuthConfig> {
  const discord = await getDiscordOAuthCredentials().catch(() => null);
  const providers: NextAuthConfig["providers"] = [
    Credentials({
      id: "credentials",
      name: "Administrateur",
      credentials: { username: {}, password: {} },
      async authorize(credentials, request) {
        const username = typeof credentials?.username === "string" ? credentials.username.trim() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        if (!username || !password) return null;
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
        if (isRateLimited(`${username.toLowerCase()}|${ip}`)) return null;
        const admin = await verifyAdminCredentials(username, password);
        if (!admin) return null;
        loginAttempts.delete(`${username.toLowerCase()}|${ip}`);
        return { id: `admin:${admin.id}`, name: admin.username };
      },
    }),
  ];
  if (discord) {
    providers.push(
      Discord({
        clientId: discord.clientId,
        clientSecret: discord.clientSecret,
        authorization: { params: { scope: "identify guilds" } },
      }),
    );
  }

  return {
    secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
    trustHost: true,
    session: { strategy: "jwt", maxAge: 7 * 24 * 3600 },
    pages: { signIn: "/login", error: "/login" },
    providers,
    callbacks: {
      async jwt({ token, user, account }) {
        if (account?.provider === "credentials" && user?.id) {
          token.role = "owner";
          token.adminId = Number(user.id.replace("admin:", ""));
          token.guildIds = [];
        } else if (account?.provider === "discord" && account.access_token) {
          token.role = "guild-admin";
          token.discordId = account.providerAccountId;
          token.discordAccessToken = account.access_token;
          token.guildIds = await fetchManageableGuildIds(account.access_token).catch(() => []);
          token.guildsCheckedAt = Date.now();
        } else if (token.role === "guild-admin" && typeof token.discordAccessToken === "string") {
          const checkedAt = typeof token.guildsCheckedAt === "number" ? token.guildsCheckedAt : 0;
          if (Date.now() - checkedAt > GUILD_REFRESH_MS) {
            token.guildIds = await fetchManageableGuildIds(token.discordAccessToken).catch(() => []);
            token.guildsCheckedAt = Date.now();
          }
        }
        return token;
      },
      async session({ session, token }) {
        Object.assign(session.user, {
          role: token.role === "owner" ? "owner" : "guild-admin",
          adminId: typeof token.adminId === "number" ? token.adminId : null,
          discordId: typeof token.discordId === "string" ? token.discordId : null,
          guildIds: Array.isArray(token.guildIds) ? token.guildIds : [],
        });
        return session;
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => buildConfig());
