import Link from "next/link";
import { Blocks } from "lucide-react";
import { prisma } from "@ellie/database";
import {
  addAutoResponseAction,
  deleteCustomCommandAction,
  saveCustomCommandAction,
  savePrefixAction,
  updateAutoResponseAction,
} from "@/actions/guild-content";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, Field, PageHeader } from "@/components/ui";
import { requireGuildAccess } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Commandes perso" };

const PLACEHOLDERS = "{user} {user.name} {user.mention} {server.name} {server.memberCount} {args} {arg1}…{arg9} {var:nom}";

export default async function CommandsPage({ params }: { params: { guildId: string } }) {
  const { guildId } = await requireGuildAccess(params.guildId);
  const [guild, commands, autoResponses] = await Promise.all([
    prisma.guild.findUniqueOrThrow({ where: { id: guildId } }),
    prisma.customCommand.findMany({ where: { guildId }, orderBy: { name: "asc" }, include: { _count: { select: { actions: true } } } }),
    prisma.autoResponse.findMany({ where: { guildId }, orderBy: { id: "asc" } }),
  ]);

  return (
    <>
      <PageHeader icon={Blocks} title="Commandes Perso" subtitle="Commandes texte simples ou chaînes d'actions construites avec l'éditeur visuel." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card title="Préfixe">
            <ActionForm action={savePrefixAction} className="flex items-end gap-3">
              <input type="hidden" name="guildId" value={guildId} />
              <input name="prefix" maxLength={5} defaultValue={guild.prefix} required className="field w-24" aria-label="Préfixe" />
              <SubmitButton>Enregistrer</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Nouvelle commande" description={<>Placeholders : <code className="text-xs">{PLACEHOLDERS}</code></>}>
            <ActionForm action={saveCustomCommandAction} className="space-y-3" resetOnSuccess>
              <input type="hidden" name="guildId" value={guildId} />
              <Field label="Nom (sans préfixe)" htmlFor="new-name">
                <input id="new-name" name="name" required maxLength={32} placeholder="regles" className="field" />
              </Field>
              <Field label="Réponse" htmlFor="new-response" hint="Ignorée si la commande a des blocs.">
                <textarea id="new-response" name="response" maxLength={2000} rows={3} className="field" />
              </Field>
              <Field label="Cooldown (secondes)" htmlFor="new-cooldown">
                <input id="new-cooldown" name="cooldownSeconds" type="number" min={0} max={86400} defaultValue={0} className="field" />
              </Field>
              <SubmitButton>Créer</SubmitButton>
            </ActionForm>
          </Card>
        </div>

        <Card title={`Commandes (${commands.length})`}>
          {commands.length ? (
            <ul className="space-y-4">
              {commands.map((command) => (
                <li key={command.id} className="rounded-2xl bg-white/60 p-4">
                  <ActionForm action={saveCustomCommandAction} className="grid gap-3 md:grid-cols-[160px_minmax(0,1fr)_110px]">
                    <input type="hidden" name="guildId" value={guildId} />
                    <input type="hidden" name="id" value={command.id} />
                    <Field label="Nom">
                      <input name="name" defaultValue={command.name} required maxLength={32} className="field" />
                    </Field>
                    <Field label="Réponse">
                      <textarea name="response" defaultValue={command.response} maxLength={2000} rows={2} className="field" />
                    </Field>
                    <Field label="Cooldown (s)">
                      <input name="cooldownSeconds" type="number" min={0} max={86400} defaultValue={command.cooldownSeconds} className="field" />
                    </Field>
                    <div className="flex flex-wrap items-center gap-2 md:col-span-3">
                      <SubmitButton variant="ghost">Enregistrer</SubmitButton>
                      <Link href={`/dashboard/${guildId}/commands/${command.id}`} className="bubble-btn rounded-full bg-lavender-400 px-4 py-2 text-sm font-semibold text-white shadow-glass">
                        Éditeur visuel
                      </Link>
                      {command._count.actions ? <Badge tone="lavender">{command._count.actions} bloc(s)</Badge> : <Badge tone="aqua">texte simple</Badge>}
                    </div>
                  </ActionForm>
                  <ActionForm action={deleteCustomCommandAction} className="mt-2">
                    <input type="hidden" name="guildId" value={guildId} />
                    <input type="hidden" name="id" value={command.id} />
                    <SubmitButton variant="danger" confirm={`Supprimer la commande ${guild.prefix}${command.name} ?`}>
                      Supprimer
                    </SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Aucune commande personnalisée pour l&apos;instant.</EmptyState>
          )}
        </Card>

        <Card title="Réponses automatiques" className="xl:col-span-2" description="Le bot répond quand un message contient (ou est exactement) le déclencheur, sans tenir compte de la casse.">
          {autoResponses.length ? (
            <ul className="mb-4 space-y-2">
              {autoResponses.map((response) => (
                <li key={response.id} className="rounded-xl bg-white/60 px-3 py-2 text-sm">
                  <ActionForm action={updateAutoResponseAction} className="flex flex-wrap items-center justify-between gap-3">
                    <input type="hidden" name="guildId" value={guildId} />
                    <input type="hidden" name="id" value={response.id} />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">« {response.trigger} »</span> <Badge>{response.matchType === "EXACT" ? "exact" : "contient"}</Badge>
                      <span className="block break-words text-xs text-lavender-600">→ {response.response}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="enabled" defaultChecked={response.enabled} className="accent-lavender-400" /> active
                      </label>
                      <SubmitButton variant="ghost" name="intent" value="update">
                        OK
                      </SubmitButton>
                      <SubmitButton variant="danger" name="intent" value="delete" confirm="Supprimer cette réponse automatique ?">
                        Supprimer
                      </SubmitButton>
                    </span>
                  </ActionForm>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mb-4">
              <EmptyState>Aucune réponse automatique.</EmptyState>
            </div>
          )}
          <ActionForm action={addAutoResponseAction} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_140px_auto] md:items-end" resetOnSuccess>
            <input type="hidden" name="guildId" value={guildId} />
            <Field label="Déclencheur" htmlFor="trigger">
              <input id="trigger" name="trigger" required maxLength={200} className="field" />
            </Field>
            <Field label="Réponse" htmlFor="response">
              <input id="response" name="response" required maxLength={2000} className="field" />
            </Field>
            <Field label="Type" htmlFor="matchType">
              <select id="matchType" name="matchType" className="field" defaultValue="CONTAINS">
                <option value="CONTAINS">contient</option>
                <option value="EXACT">exact</option>
              </select>
            </Field>
            <SubmitButton>Ajouter</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
