import { Gift } from "lucide-react";
import { prisma } from "@ellie/database";
import { createGiveawayAction, endGiveawayNowAction } from "@/actions/guild-content";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ChannelSelect } from "@/components/selects";
import { Badge, Card, EmptyState, Field, formatDate, PageHeader } from "@/components/ui";
import { loadGuildData } from "@/lib/guild";

export const dynamic = "force-dynamic";
export const metadata = { title: "Giveaways" };

const DURATIONS = [
  { minutes: 10, label: "10 minutes" },
  { minutes: 30, label: "30 minutes" },
  { minutes: 60, label: "1 heure" },
  { minutes: 120, label: "2 heures" },
  { minutes: 360, label: "6 heures" },
  { minutes: 720, label: "12 heures" },
  { minutes: 1440, label: "1 jour" },
  { minutes: 2880, label: "2 jours" },
  { minutes: 4320, label: "3 jours" },
  { minutes: 10080, label: "1 semaine" },
];

export default async function GiveawaysPage({ params }: { params: { guildId: string } }) {
  const { guildId, channels } = await loadGuildData(params.guildId);
  const giveaways = await prisma.giveaway.findMany({
    where: { guildId },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { _count: { select: { entries: true } } },
  });

  return (
    <>
      <PageHeader icon={Gift} title="Giveaways" subtitle="Les membres participent avec un bouton ; le tirage est automatique à la fin." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card title="Nouveau giveaway">
          <ActionForm action={createGiveawayAction} className="space-y-4" resetOnSuccess>
            <input type="hidden" name="guildId" value={guildId} />
            <Field label="Lot à gagner" htmlFor="prize">
              <input id="prize" name="prize" required maxLength={200} placeholder="Un jeu Steam au choix" className="field" />
            </Field>
            <Field label="Durée" htmlFor="durationMinutes">
              <select id="durationMinutes" name="durationMinutes" defaultValue={1440} className="field">
                {DURATIONS.map((duration) => (
                  <option key={duration.minutes} value={duration.minutes}>
                    {duration.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nombre de gagnants" htmlFor="winnerCount">
              <input id="winnerCount" name="winnerCount" type="number" min={1} max={20} defaultValue={1} className="field" />
            </Field>
            <Field label="Salon" htmlFor="channelId">
              <ChannelSelect id="channelId" name="channelId" channels={channels} required />
            </Field>
            <SubmitButton>Lancer le giveaway</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="Giveaways récents">
          {giveaways.length ? (
            <ul className="space-y-2">
              {giveaways.map((giveaway) => (
                <li key={giveaway.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold">
                      #{giveaway.id} · {giveaway.prize}
                    </span>
                    <span className="block text-xs text-lavender-600">
                      {giveaway.winnerCount} gagnant(s) · {giveaway._count.entries} participant(s) · fin {formatDate(giveaway.endsAt)}
                    </span>
                  </span>
                  {giveaway.ended ? (
                    <Badge tone="lavender">terminé</Badge>
                  ) : !giveaway.messageId ? (
                    <Badge tone="blush">publication en cours…</Badge>
                  ) : (
                    <ActionForm action={endGiveawayNowAction}>
                      <input type="hidden" name="guildId" value={guildId} />
                      <input type="hidden" name="id" value={giveaway.id} />
                      <SubmitButton variant="secondary" confirm="Terminer ce giveaway maintenant et tirer les gagnants ?">
                        Terminer maintenant
                      </SubmitButton>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Aucun giveaway pour l&apos;instant.</EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
