import Link from "next/link";
import { Bell } from "lucide-react";
import { getBotConfigStatus, prisma } from "@ellie/database";
import { deleteSocialAlertAction, saveSocialAlertAction } from "@/actions/guild-content";
import { saveStatsChannelAction } from "@/actions/guild-settings";
import { ActionForm, CountedTextarea, SubmitButton } from "@/components/forms";
import { ChannelSelect } from "@/components/selects";
import { Badge, Card, EmptyState, Field, Notice, PageHeader } from "@/components/ui";
import { loadGuildData } from "@/lib/guild";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alertes" };

export default async function AlertsPage({ params, searchParams }: { params: { guildId: string }; searchParams: { edit?: string } }) {
  const { guildId, channels } = await loadGuildData(params.guildId);
  const [guild, alerts, status] = await Promise.all([
    prisma.guild.findUniqueOrThrow({ where: { id: guildId } }),
    prisma.socialAlert.findMany({ where: { guildId }, orderBy: { createdAt: "asc" } }),
    getBotConfigStatus(),
  ]);
  const editing = alerts.find((alert) => String(alert.id) === searchParams.edit) ?? null;
  const channelName = (id: string) => channels.find((channel) => channel.id === id)?.name ?? "salon supprimé";
  const base = `/dashboard/${guildId}/alerts`;

  return (
    <>
      <PageHeader icon={Bell} title="Alertes" subtitle="Statistiques de membres et annonces YouTube / Twitch." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Salon de statistiques" description="Salon vocal renommé en « 📊 Membres : N » toutes les 10 minutes.">
          <ActionForm action={saveStatsChannelAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="guildId" value={guildId} />
            <div className="min-w-0 flex-1">
              <ChannelSelect name="statsChannelId" channels={channels} kind="voice" defaultValue={guild.statsChannelId} />
            </div>
            <SubmitButton>Enregistrer</SubmitButton>
          </ActionForm>
        </Card>

        <Card title={editing ? `Modifier l'alerte #${editing.id}` : "Nouvelle alerte"} description="Placeholders du message : {channel} (nom de la chaîne) et {url} (lien).">
          {!status.twitchAppConfigured ? (
            <div className="mb-4">
              <Notice>Pour les alertes Twitch, renseigne d&apos;abord l&apos;application Twitch dans les Paramètres.</Notice>
            </div>
          ) : null}
          <ActionForm action={saveSocialAlertAction} className="space-y-4" resetOnSuccess={!editing}>
            <input type="hidden" name="guildId" value={guildId} />
            {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Plateforme" htmlFor="platform">
                <select id="platform" name="platform" defaultValue={editing?.platform ?? "YOUTUBE"} className="field">
                  <option value="YOUTUBE">YouTube</option>
                  <option value="TWITCH">Twitch</option>
                </select>
              </Field>
              <Field label="Chaîne" htmlFor="channelRef" hint="YouTube : ID « UC… » · Twitch : pseudo.">
                <input id="channelRef" name="channelRef" required defaultValue={editing?.channelRef ?? ""} className="field" />
              </Field>
            </div>
            <Field label="Salon Discord" htmlFor="discordChannelId">
              <ChannelSelect id="discordChannelId" name="discordChannelId" channels={channels} defaultValue={editing?.discordChannelId} required />
            </Field>
            <Field label="Message" htmlFor="message" hint="Tu peux y mettre @everyone ou une mention de rôle pour prévenir la communauté.">
              <CountedTextarea id="message" name="message" maxLength={1500} rows={3} defaultValue={editing?.message ?? "{channel} vient de publier du nouveau contenu ! {url}"} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <SubmitButton>{editing ? "Enregistrer les modifications" : "Ajouter l'alerte"}</SubmitButton>
              {editing ? (
                <Link href={base} className="bubble-btn rounded-full bg-white/70 px-4 py-2 text-sm font-semibold text-lavender-800 shadow-glass">
                  Annuler
                </Link>
              ) : null}
            </div>
          </ActionForm>
        </Card>

        <Card title="Alertes configurées" className="xl:col-span-2">
          {alerts.length ? (
            <ul className="space-y-2">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">
                      <Badge tone={alert.platform === "YOUTUBE" ? "blush" : "lavender"}>{alert.platform === "YOUTUBE" ? "YouTube" : "Twitch"}</Badge>
                      {alert.channelRef} → #{channelName(alert.discordChannelId)}
                    </span>
                    <span className="mt-1 block break-words text-xs text-lavender-600">{alert.message}</span>
                  </span>
                  <span className="flex gap-2">
                    <Link href={`${base}?edit=${alert.id}`} className="bubble-btn rounded-full bg-white px-4 py-2 text-sm font-semibold text-lavender-800 shadow-glass">
                      Modifier
                    </Link>
                    <ActionForm action={deleteSocialAlertAction}>
                      <input type="hidden" name="guildId" value={guildId} />
                      <input type="hidden" name="id" value={alert.id} />
                      <SubmitButton variant="danger" confirm="Supprimer cette alerte ?">
                        Supprimer
                      </SubmitButton>
                    </ActionForm>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Aucune alerte. Ajoute une chaîne YouTube ou Twitch ci-dessus.</EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
