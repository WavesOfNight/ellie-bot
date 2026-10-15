import { Bell, Blocks, Gift, LayoutDashboard, MessageSquare, Shield, Users } from "lucide-react";
import { prisma } from "@ellie/database";
import { Card, EmptyState, formatDate, PageHeader, StatCard } from "@/components/ui";
import { getUserNames } from "@/lib/discord";
import { requireGuildAccess } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tableau de bord" };

const CASE_LABELS: Record<string, string> = {
  WARN: "Avertissement",
  MUTE: "Mute",
  UNMUTE: "Fin du mute",
  KICK: "Expulsion",
  BAN: "Bannissement",
  UNBAN: "Débannissement",
  AUTOMOD: "Automodération",
};

export default async function GuildOverview({ params }: { params: { guildId: string } }) {
  const { guildId } = await requireGuildAccess(params.guildId);
  const [members, commands, giveaways, cases, autoResponses, alerts, top, recent] = await Promise.all([
    prisma.member.count({ where: { guildId, xp: { gt: 0 } } }),
    prisma.customCommand.count({ where: { guildId } }),
    prisma.giveaway.count({ where: { guildId, ended: false } }),
    prisma.moderationCase.count({ where: { guildId } }),
    prisma.autoResponse.count({ where: { guildId } }),
    prisma.socialAlert.count({ where: { guildId } }),
    prisma.member.findMany({ where: { guildId, xp: { gt: 0 } }, orderBy: { xp: "desc" }, take: 5 }),
    prisma.moderationCase.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const names = await getUserNames([...top.map((member) => member.userId), ...recent.map((entry) => entry.userId)]);

  return (
    <>
      <PageHeader icon={LayoutDashboard} title="Tableau de bord" subtitle="Vue d'ensemble du serveur." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard icon={Users} label="Membres avec de l'XP" value={members.toLocaleString("fr-FR")} />
        <StatCard icon={Blocks} label="Commandes perso" value={commands} />
        <StatCard icon={Gift} label="Giveaways actifs" value={giveaways} />
        <StatCard icon={Shield} label="Cas de modération" value={cases} />
        <StatCard icon={MessageSquare} label="Réponses automatiques" value={autoResponses} />
        <StatCard icon={Bell} label="Alertes sociales" value={alerts} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Top 5 membres (XP)">
          {top.length ? (
            <ol className="space-y-2">
              {top.map((member, index) => (
                <li key={member.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-semibold">
                    {["🥇", "🥈", "🥉"][index] ?? `${index + 1}.`} {names.get(member.userId)}
                  </span>
                  <span className="shrink-0 text-lavender-600">
                    niv. {member.level} · {member.xp.toLocaleString("fr-FR")} XP
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState>Personne n&apos;a encore gagné d&apos;XP.</EmptyState>
          )}
        </Card>
        <Card title="Activité de modération récente">
          {recent.length ? (
            <ul className="space-y-2">
              {recent.map((entry) => (
                <li key={entry.id} className="rounded-xl bg-white/60 px-3 py-2 text-sm">
                  <span className="font-semibold">
                    #{entry.id} · {CASE_LABELS[entry.type] ?? entry.type}
                  </span>{" "}
                  — {names.get(entry.userId)}
                  <span className="block truncate text-xs text-lavender-600">
                    {formatDate(entry.createdAt)} · {entry.reason ?? "Aucune raison"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Aucune sanction pour l&apos;instant. 🎉</EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
