import { Gift } from "lucide-react";
import { getActiveTwitchGiveaway, listTwitchGiveawayHistory } from "@ellie/database";
import { finishTwitchGiveawayAction, startTwitchGiveawayAction } from "@/actions/twitch";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, Field, formatDate, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Giveaways Twitch" };

const STATUS = { ACTIVE: { label: "en cours", tone: "aqua" }, ENDED: { label: "terminé", tone: "lavender" }, CANCELLED: { label: "annulé", tone: "coral" } } as const;

export default async function TwitchGiveawaysPage() {
  const [active, history] = await Promise.all([getActiveTwitchGiveaway(), listTwitchGiveawayHistory(20)]);
  return (
    <>
      <PageHeader icon={Gift} title="Giveaways Twitch" subtitle="Les viewers participent en tapant le mot-clé dans le chat (une seule fois chacun)." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={active ? "Giveaway en cours" : "Lancer un giveaway"}>
          {active ? (
            <div className="space-y-4">
              <p className="text-sm">
                <strong>{active.prize}</strong> — mot-clé <code className="rounded bg-lavender-100 px-1">{active.keyword}</code> · {active._count.entries} participant(s)
              </p>
              <ActionForm action={finishTwitchGiveawayAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={active.id} />
                <SubmitButton name="intent" value="draw">
                  Tirer au sort
                </SubmitButton>
                <SubmitButton variant="danger" name="intent" value="cancel" confirm="Annuler ce giveaway ?">
                  Annuler
                </SubmitButton>
              </ActionForm>
            </div>
          ) : (
            <ActionForm action={startTwitchGiveawayAction} className="space-y-3" resetOnSuccess>
              <Field label="Mot-clé (un seul mot)" htmlFor="keyword">
                <input id="keyword" name="keyword" required maxLength={30} placeholder="!jeparticipe" className="field" />
              </Field>
              <Field label="Lot" htmlFor="prize">
                <input id="prize" name="prize" required maxLength={200} className="field" />
              </Field>
              <SubmitButton>Lancer</SubmitButton>
            </ActionForm>
          )}
        </Card>
        <Card title="Historique">
          {history.length ? (
            <ul className="space-y-2">
              {history.map((giveaway) => (
                <li key={giveaway.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold">{giveaway.prize}</span>
                    <span className="block text-xs text-lavender-600">
                      {formatDate(giveaway.createdAt)} · {giveaway._count.entries} participant(s)
                      {giveaway.winnerUsername ? ` · gagnant : ${giveaway.winnerUsername}` : ""}
                    </span>
                  </span>
                  <Badge tone={STATUS[giveaway.status as keyof typeof STATUS]?.tone ?? "lavender"}>
                    {STATUS[giveaway.status as keyof typeof STATUS]?.label ?? giveaway.status}
                  </Badge>
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
