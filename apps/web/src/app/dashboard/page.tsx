import Link from "next/link";
import { ExternalLink, Server } from "lucide-react";
import { getBotConfigStatus } from "@ellie/database";
import { Shell } from "@/components/Shell";
import { EmptyState, Notice, PageHeader } from "@/components/ui";
import { botInviteUrl, getBotGuilds, guildIconUrl, type DiscordGuild } from "@/lib/discord";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choix du serveur" };

export default async function DashboardPage() {
  const user = await requireUser();
  const status = await getBotConfigStatus();
  let guilds: DiscordGuild[] = [];
  let error: string | null = null;
  if (status.discordConfigured) {
    try {
      guilds = await getBotGuilds();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "Impossible de joindre l'API Discord.";
    }
  }
  const visible = user.role === "owner" ? guilds : guilds.filter((guild) => user.guildIds.includes(guild.id));

  return (
    <Shell user={user}>
      <PageHeader icon={Server} title="Tes serveurs" subtitle="Choisis le serveur à configurer." />
      {!status.discordConfigured ? (
        <Notice>
          {user.role === "owner" ? (
            <>
              Le bot n&apos;est pas encore configuré. Va dans{" "}
              <Link href="/dashboard/settings" className="font-semibold underline">
                Paramètres
              </Link>{" "}
              pour coller le Client ID et le token du bot.
            </>
          ) : (
            "Le bot n'est pas encore configuré par l'administrateur."
          )}
        </Notice>
      ) : error ? (
        <Notice tone="coral">{error}</Notice>
      ) : visible.length === 0 ? (
        <EmptyState>
          {user.role === "owner" ? "Le bot n'est sur aucun serveur pour l'instant." : "Aucun serveur que tu gères n'utilise le bot."}
          {user.role === "owner" && status.clientId ? (
            <a href={botInviteUrl(status.clientId)} target="_blank" rel="noreferrer" className="ml-1 font-semibold underline">
              Inviter le bot
            </a>
          ) : null}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((guild) => {
            const icon = guildIconUrl(guild);
            return (
              <li key={guild.id}>
                <Link href={`/dashboard/${guild.id}`} className="glass-panel bubble-btn flex items-center gap-4 rounded-aero p-5 shadow-glass">
                  {icon ? (
                    // eslint-disable-next-line @next/next/no-img-element -- icône servie par le CDN Discord
                    <img src={icon} alt="" className="h-14 w-14 rounded-2xl" />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-lavender-200 font-display text-xl font-bold text-lavender-800">
                      {guild.name.slice(0, 1)}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-display text-lg font-bold text-lavender-900">{guild.name}</span>
                    {guild.approximate_member_count ? (
                      <span className="text-sm text-lavender-600">{guild.approximate_member_count.toLocaleString("fr-FR")} membres</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {user.role === "owner" && status.clientId ? (
        <p className="mt-6 text-sm text-lavender-600">
          <a href={botInviteUrl(status.clientId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold underline">
            Inviter le bot sur un autre serveur <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </p>
      ) : null}
    </Shell>
  );
}
