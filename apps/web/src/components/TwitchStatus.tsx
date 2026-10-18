import "server-only";
import Link from "next/link";
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { describeTwitchStatus, getServiceStatus, prisma, type ServiceStatusView } from "@ellie/database";
import { Badge, cn, formatDate, Notice } from "./ui";

const LEVELS = {
  ok: { icon: CircleCheck, box: "border-aqua-200 bg-aqua-50 text-aqua-800", badge: "aqua" },
  warning: { icon: TriangleAlert, box: "border-blush-200 bg-blush-50 text-blush-800", badge: "blush" },
  error: { icon: CircleX, box: "border-coral-200 bg-coral-100 text-coral-600", badge: "coral" },
} as const;

export async function loadTwitchStatus(bot: { username: string | null; channelName: string | null }): Promise<ServiceStatusView> {
  return describeTwitchStatus(await getServiceStatus("twitch"), bot);
}

export function TwitchStatusBadge({ status }: { status: ServiceStatusView }) {
  return <Badge tone={LEVELS[status.level].badge}>{status.label}</Badge>;
}

/** État réel du bot Twitch, publié par le service lui-même (connecté, en attente avec la raison, erreur). */
export function TwitchStatusPanel({ status, className }: { status: ServiceStatusView; className?: string }) {
  const level = LEVELS[status.level];
  return (
    <div role="status" className={cn("flex gap-3 rounded-2xl border p-4 text-sm", level.box, className)}>
      <level.icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{status.title}</p>
        {status.detail ? <p className="break-words">{status.detail}</p> : null}
        {status.since ? <p className="mt-1 text-xs opacity-80">Depuis le {formatDate(status.since)}</p> : null}
      </div>
    </div>
  );
}

/** Liaison avec Discord, nécessaire pour !discord (lien d'invitation), !dleaderboard et les logs des sanctions. */
export async function TwitchDiscordLink({ linkedGuildId }: { linkedGuildId: string | null }) {
  if (!linkedGuildId) {
    return (
      <Notice tone="blush">
        Aucun serveur Discord lié : <strong>!discord</strong>, <strong>!dleaderboard</strong> et les logs des sanctions sont désactivés. Choisis-le dans{" "}
        <Link href="/dashboard/twitch/settings" className="font-semibold underline">
          Paramètres
        </Link>
        .
      </Notice>
    );
  }
  const guild = await prisma.guild.findUnique({ where: { id: linkedGuildId }, select: { permanentInviteCode: true } });
  if (!guild?.permanentInviteCode) {
    return (
      <Notice tone="blush">
        <strong>!discord</strong> n&apos;a pas encore de lien à donner : crée-le sur la page{" "}
        <Link href={`/dashboard/${linkedGuildId}/invite`} className="font-semibold underline">
          Invitation
        </Link>{" "}
        du serveur Discord.
      </Notice>
    );
  }
  return (
    <Notice tone="aqua">
      <strong>!discord</strong> donne le lien <span className="break-all font-mono">https://discord.gg/{guild.permanentInviteCode}</span>
    </Notice>
  );
}
