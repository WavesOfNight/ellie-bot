import { Bell } from "lucide-react";
import { listTwitchTimers, TWITCH_TIMER_BOUNDS } from "@ellie/database";
import { deleteTwitchTimerAction, saveTwitchTimerAction } from "@/actions/twitch";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, EmptyState, Field, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Timers Twitch" };

function TimerFields({ timer }: { timer?: { name: string; message: string; intervalMinutes: number; minMessages: number; enabled: boolean } }) {
  return (
    <>
      <Field label="Nom">
        <input name="name" required maxLength={60} defaultValue={timer?.name} className="field" />
      </Field>
      <Field label="Message">
        <textarea name="message" required maxLength={TWITCH_TIMER_BOUNDS.messageMaxLength} rows={2} defaultValue={timer?.message} className="field" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Intervalle (min)">
          <input name="intervalMinutes" type="number" {...TWITCH_TIMER_BOUNDS.intervalMinutes} defaultValue={timer?.intervalMinutes ?? 15} className="field" />
        </Field>
        <Field label="Messages minimum">
          <input name="minMessages" type="number" {...TWITCH_TIMER_BOUNDS.minMessages} defaultValue={timer?.minMessages ?? 5} className="field" />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-lavender-800">
        <input type="checkbox" name="enabled" defaultChecked={timer?.enabled ?? true} className="accent-lavender-400" /> Activé
      </label>
    </>
  );
}

export default async function TwitchTimersPage() {
  const timers = await listTwitchTimers();
  return (
    <>
      <PageHeader icon={Bell} title="Timers" subtitle="Messages automatiques : envoyés quand l'intervalle est écoulé ET qu'assez de messages ont été échangés." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <Card title="Nouveau timer">
          <ActionForm action={saveTwitchTimerAction} className="space-y-3" resetOnSuccess>
            <TimerFields />
            <SubmitButton>Créer</SubmitButton>
          </ActionForm>
        </Card>
        <Card title={`Timers (${timers.length})`}>
          {timers.length ? (
            <ul className="grid gap-4 lg:grid-cols-2">
              {timers.map((timer) => (
                <li key={timer.id} className="rounded-2xl bg-white/60 p-4">
                  <ActionForm action={saveTwitchTimerAction} className="space-y-3">
                    <input type="hidden" name="id" value={timer.id} />
                    <TimerFields timer={timer} />
                    <SubmitButton variant="ghost">Enregistrer</SubmitButton>
                  </ActionForm>
                  <ActionForm action={deleteTwitchTimerAction} className="mt-2">
                    <input type="hidden" name="id" value={timer.id} />
                    <SubmitButton variant="danger" confirm="Supprimer ce timer ?">
                      Supprimer
                    </SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Aucun timer.</EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
