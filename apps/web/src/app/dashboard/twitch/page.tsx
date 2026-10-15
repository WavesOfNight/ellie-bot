import Link from "next/link";
import { LayoutDashboard, MessageSquare, ShieldAlert, Terminal } from "lucide-react";
import { getTwitchBotSettings, getTwitchDailyStats } from "@ellie/database";
import { Badge, Card, Notice, PageHeader, StatCard, TableWrapper } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bot Twitch" };

export default async function TwitchDashboard() {
  const [settings, stats] = await Promise.all([getTwitchBotSettings(), getTwitchDailyStats(7)]);
  const totals = stats.reduce(
    (sum, day) => ({ messages: sum.messages + day.messages, commands: sum.commands + day.commands, timeouts: sum.timeouts + day.timeouts }),
    { messages: 0, commands: 0, timeouts: 0 },
  );
  const max = Math.max(1, ...stats.map((day) => day.messages));
  const ready = settings.enabled && settings.hasTokens && settings.channelName;

  return (
    <>
      <PageHeader
        icon={LayoutDashboard}
        title="Bot Twitch"
        subtitle={settings.channelName ? `Chaîne : ${settings.channelName}${settings.username ? ` · compte bot : ${settings.username}` : ""}` : "Aperçu des 7 derniers jours."}
        actions={ready ? <Badge tone="aqua">actif</Badge> : <Badge tone="coral">inactif</Badge>}
      />
      {!ready ? (
        <div className="mb-6">
          <Notice>
            Pour démarrer : renseigne l&apos;application et connecte le compte bot dans{" "}
            <Link href="/dashboard/twitch/settings" className="font-semibold underline">
              Paramètres
            </Link>
            , puis active le bot dans{" "}
            <Link href="/dashboard/twitch/moderation" className="font-semibold underline">
              Modération
            </Link>
            .
          </Notice>
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={MessageSquare} label="Messages (7 jours)" value={totals.messages.toLocaleString("fr-FR")} />
        <StatCard icon={Terminal} label="Commandes (7 jours)" value={totals.commands.toLocaleString("fr-FR")} />
        <StatCard icon={ShieldAlert} label="Timeouts (7 jours)" value={totals.timeouts.toLocaleString("fr-FR")} />
      </div>
      <Card title="Activité par jour" className="mt-6">
        <TableWrapper>
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="text-lavender-600">
              <tr>
                <th className="py-2">Jour</th>
                <th>Messages</th>
                <th>Commandes</th>
                <th>Timeouts</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((day) => (
                <tr key={day.date} className="border-t border-lavender-100">
                  <td className="py-2">{day.date.split("-").reverse().join("/")}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="h-2 rounded-full bg-lavender-400" style={{ width: `${Math.max(2, (day.messages / max) * 120)}px` }} aria-hidden />
                      {day.messages.toLocaleString("fr-FR")}
                    </span>
                  </td>
                  <td>{day.commands.toLocaleString("fr-FR")}</td>
                  <td>{day.timeouts.toLocaleString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>
      </Card>
    </>
  );
}
