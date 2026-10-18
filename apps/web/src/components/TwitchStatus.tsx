import "server-only";
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { describeTwitchStatus, getServiceStatus, type ServiceStatusView } from "@ellie/database";
import { Badge, cn, formatDate } from "./ui";

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
