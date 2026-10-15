import { ExternalLink, Settings } from "lucide-react";
import { ADMIN_PASSWORD_MIN_LENGTH, getAppSettings, getBotConfigStatus, prisma } from "@ellie/database";
import { Shell } from "@/components/Shell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, Field, PageHeader, TableWrapper } from "@/components/ui";
import { botInviteUrl } from "@/lib/discord";
import { requireOwner } from "@/lib/session";
import {
  addActivityAction,
  changePasswordAction,
  clearAnthropicKeyAction,
  clearDiscordSecretAction,
  saveAnthropicKeyAction,
  saveCommunityAction,
  saveDiscordAction,
  saveTwitchAppAction,
  updateActivityAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paramètres" };

const ACTIVITY_LABELS: Record<string, string> = {
  PLAYING: "Joue à",
  WATCHING: "Regarde",
  LISTENING: "Écoute",
  COMPETING: "Participe à",
};

const configured = (value: boolean) => (value ? <Badge tone="aqua">configuré ✅</Badge> : <Badge tone="coral">non configuré</Badge>);

export default async function SettingsPage() {
  const user = await requireOwner();
  const [status, app, activities] = await Promise.all([
    getBotConfigStatus(),
    getAppSettings(),
    prisma.botActivity.findMany({ orderBy: [{ order: "asc" }, { id: "asc" }] }),
  ]);

  return (
    <Shell user={user}>
      <PageHeader icon={Settings} title="Paramètres" subtitle="Configuration globale du bot : tout se règle ici, sans toucher au code." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Bot Discord"
          description={
            <>
              Identifiants du{" "}
              <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer" className="font-semibold underline">
                portail développeur Discord
              </a>
              . Les secrets sont chiffrés en base et ne sont jamais réaffichés. Active aussi les intents « Server Members » et « Message Content ».
            </>
          }
        >
          <div className="mb-4 flex flex-wrap gap-2">
            <span className="text-sm text-lavender-800">Token :</span> {configured(status.discordConfigured)}
            <span className="ml-2 text-sm text-lavender-800">Connexion Discord :</span> {configured(status.hasClientSecret)}
          </div>
          <ActionForm action={saveDiscordAction} className="space-y-4">
            <Field label="Client ID (Application ID)" htmlFor="clientId">
              <input id="clientId" name="clientId" defaultValue={status.clientId ?? ""} required inputMode="numeric" className="field" />
            </Field>
            <Field label="Token du bot" htmlFor="token" hint={status.discordConfigured ? "Laisse vide pour conserver le token actuel." : undefined}>
              <input id="token" name="token" type="password" autoComplete="off" placeholder={status.discordConfigured ? "••••••••" : ""} className="field" />
            </Field>
            <Field label="Client Secret (facultatif)" htmlFor="clientSecret" hint="Active le bouton « Se connecter avec Discord » pour les admins des serveurs.">
              <input id="clientSecret" name="clientSecret" type="password" autoComplete="off" placeholder={status.hasClientSecret ? "••••••••" : ""} className="field" />
            </Field>
            <SubmitButton>Enregistrer</SubmitButton>
          </ActionForm>
          {status.hasClientSecret ? (
            <ActionForm action={clearDiscordSecretAction} className="mt-3">
              <SubmitButton variant="danger" confirm="Supprimer le Client Secret ? La connexion avec Discord sera désactivée.">
                Supprimer le Client Secret
              </SubmitButton>
            </ActionForm>
          ) : null}
          {status.clientId ? (
            <p className="mt-4 text-sm">
              <a href={botInviteUrl(status.clientId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-discord-600 underline">
                Lien d&apos;invitation du bot (permissions nécessaires uniquement) <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            </p>
          ) : null}
        </Card>

        <Card
          title="Ellie (IA) — clé API Anthropic"
          description="Facultatif. Permet à Ellie de répondre quand on la mentionne. La clé est chiffrée, jamais réaffichée et jamais écrite dans un fichier .env."
        >
          <div className="mb-4">{status.anthropicConfigured ? <Badge tone="aqua">Clé API configurée ✅</Badge> : <Badge tone="coral">Aucune clé</Badge>}</div>
          <ActionForm action={saveAnthropicKeyAction} className="space-y-4" resetOnSuccess>
            <Field label="Clé API Anthropic" htmlFor="anthropicApiKey" hint="Console Anthropic → crée la clé dans un espace de travail (workspace) dédié, avec un plafond de dépenses.">
              <input id="anthropicApiKey" name="anthropicApiKey" type="password" autoComplete="off" placeholder="sk-ant-…" className="field" />
            </Field>
            <SubmitButton variant="secondary">Enregistrer la clé</SubmitButton>
          </ActionForm>
          {status.anthropicConfigured ? (
            <ActionForm action={clearAnthropicKeyAction} className="mt-3">
              <SubmitButton variant="danger" confirm="Supprimer la clé API ? Ellie ne pourra plus répondre.">
                Supprimer la clé
              </SubmitButton>
            </ActionForm>
          ) : null}
        </Card>

        <Card title="Application Twitch (alertes de live)" description="Client ID / Secret d'une application créée sur dev.twitch.tv, utilisée pour détecter les lives (alertes Discord).">
          <div className="mb-4">{configured(status.twitchAppConfigured)}</div>
          <ActionForm action={saveTwitchAppAction} className="space-y-4">
            <Field label="Client ID Twitch" htmlFor="twitchClientId">
              <input id="twitchClientId" name="twitchClientId" defaultValue={status.twitchClientId ?? ""} className="field" />
            </Field>
            <Field label="Client Secret Twitch" htmlFor="twitchClientSecret" hint={status.twitchAppConfigured ? "Laisse vide pour conserver le secret actuel." : undefined}>
              <input id="twitchClientSecret" name="twitchClientSecret" type="password" autoComplete="off" className="field" />
            </Field>
            <SubmitButton>Enregistrer</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Communauté" description="Surnom des fans de missTsune, utilisé par Ellie et par la commande !discord. Vide = « la communauté ».">
          <ActionForm action={saveCommunityAction} className="space-y-4">
            <Field label="Nom de la communauté" htmlFor="communityName">
              <input id="communityName" name="communityName" maxLength={60} defaultValue={app.communityName} placeholder="la communauté" className="field" />
            </Field>
            <SubmitButton>Enregistrer</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Mot de passe administrateur" description="Il est haché (bcrypt) : impossible à récupérer, seulement à remplacer.">
          <ActionForm action={changePasswordAction} className="space-y-4" resetOnSuccess>
            <Field label="Mot de passe actuel" htmlFor="currentPassword">
              <input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" className="field" />
            </Field>
            <Field label="Nouveau mot de passe" htmlFor="newPassword" hint={`${ADMIN_PASSWORD_MIN_LENGTH} caractères minimum.`}>
              <input id="newPassword" name="newPassword" type="password" required minLength={ADMIN_PASSWORD_MIN_LENGTH} autoComplete="new-password" className="field" />
            </Field>
            <Field label="Confirmation" htmlFor="confirmPassword">
              <input id="confirmPassword" name="confirmPassword" type="password" required minLength={ADMIN_PASSWORD_MIN_LENGTH} autoComplete="new-password" className="field" />
            </Field>
            <SubmitButton variant="secondary">Changer le mot de passe</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Rotation du statut" description="Placeholders : {randomMember}, {memberCount}, {serverCount}." className="xl:col-span-2">
          {activities.length ? (
            <TableWrapper>
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-lavender-600">
                  <tr>
                    <th className="py-2">Ordre</th>
                    <th>Statut</th>
                    <th>Durée</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((activity) => (
                    <tr key={activity.id} className="border-t border-lavender-100">
                      <td className="py-2">{activity.order}</td>
                      <td>
                        <span className="text-lavender-600">{ACTIVITY_LABELS[activity.type] ?? activity.type}</span> {activity.text}
                      </td>
                      <td>{activity.durationSeconds} s</td>
                      <td>
                        <ActionForm action={updateActivityAction} className="flex items-center justify-end gap-2">
                          <input type="hidden" name="id" value={activity.id} />
                          <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" name="enabled" defaultChecked={activity.enabled} className="accent-lavender-400" /> actif
                          </label>
                          <SubmitButton variant="ghost" name="intent" value="update">
                            OK
                          </SubmitButton>
                          <SubmitButton variant="danger" name="intent" value="delete" confirm="Supprimer ce statut ?">
                            Supprimer
                          </SubmitButton>
                        </ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          ) : (
            <EmptyState>Aucun statut : le bot affiche « Regarde la communauté de missTsune ».</EmptyState>
          )}
          <ActionForm action={addActivityAction} className="mt-4 grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)_110px_90px_auto] sm:items-end" resetOnSuccess>
            <Field label="Type" htmlFor="type">
              <select id="type" name="type" className="field" defaultValue="WATCHING">
                {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Texte" htmlFor="text">
              <input id="text" name="text" required maxLength={120} placeholder="les {memberCount} membres" className="field" />
            </Field>
            <Field label="Durée (s)" htmlFor="durationSeconds">
              <input id="durationSeconds" name="durationSeconds" type="number" min={10} max={3600} defaultValue={30} className="field" />
            </Field>
            <Field label="Ordre" htmlFor="order">
              <input id="order" name="order" type="number" min={0} max={999} defaultValue={activities.length} className="field" />
            </Field>
            <SubmitButton>Ajouter</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </Shell>
  );
}
