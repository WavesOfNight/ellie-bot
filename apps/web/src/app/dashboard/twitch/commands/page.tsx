import { Terminal } from "lucide-react";
import { prisma } from "@ellie/database";
import { deleteTwitchCommandAction, saveTwitchCommandAction } from "@/actions/twitch";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, EmptyState, Field, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Commandes Twitch" };

export default async function TwitchCommandsPage() {
  const commands = await prisma.twitchCommand.findMany({ orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader icon={Terminal} title="Commandes Twitch" subtitle="Placeholders : {user} (pseudo du viewer) et {channel} (chaîne)." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Card title="Nouvelle commande">
          <ActionForm action={saveTwitchCommandAction} className="space-y-3" resetOnSuccess>
            <Field label="Nom (sans !)" htmlFor="name">
              <input id="name" name="name" required maxLength={32} placeholder="planning" className="field" />
            </Field>
            <Field label="Réponse" htmlFor="response">
              <textarea id="response" name="response" required maxLength={450} rows={3} className="field" />
            </Field>
            <Field label="Cooldown (secondes)" htmlFor="cooldownSeconds">
              <input id="cooldownSeconds" name="cooldownSeconds" type="number" min={0} max={3600} defaultValue={5} className="field" />
            </Field>
            <SubmitButton>Créer</SubmitButton>
          </ActionForm>
        </Card>
        <Card title={`Commandes (${commands.length})`}>
          {commands.length ? (
            <ul className="space-y-3">
              {commands.map((command) => (
                <li key={command.id} className="rounded-2xl bg-white/60 p-3">
                  <ActionForm action={saveTwitchCommandAction} className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)_110px]">
                    <input type="hidden" name="id" value={command.id} />
                    <Field label="Nom">
                      <input name="name" defaultValue={command.name} required maxLength={32} className="field" />
                    </Field>
                    <Field label="Réponse">
                      <input name="response" defaultValue={command.response} required maxLength={450} className="field" />
                    </Field>
                    <Field label="Cooldown (s)">
                      <input name="cooldownSeconds" type="number" min={0} max={3600} defaultValue={command.cooldownSeconds} className="field" />
                    </Field>
                    <div className="flex flex-wrap items-center gap-3 md:col-span-3">
                      <SubmitButton variant="ghost">Enregistrer</SubmitButton>
                      <span className="text-xs text-lavender-600">{command.uses.toLocaleString("fr-FR")} utilisation(s)</span>
                    </div>
                  </ActionForm>
                  <ActionForm action={deleteTwitchCommandAction} className="mt-2">
                    <input type="hidden" name="id" value={command.id} />
                    <SubmitButton variant="danger" confirm={`Supprimer !${command.name} ?`}>
                      Supprimer
                    </SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Aucune commande personnalisée. Les commandes intégrées (!discord, !uptime, !followage…) fonctionnent déjà.</EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
