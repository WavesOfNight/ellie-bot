import { Ticket } from "lucide-react";
import { prisma } from "@ellie/database";
import { splitIds } from "@ellie/database/shared";
import { publishTicketPanelAction, saveTicketsAction } from "@/actions/community";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ChannelSelect, RoleCheckboxes } from "@/components/selects";
import { Badge, Card, EmptyState, Field, formatDate, Notice, PageHeader } from "@/components/ui";
import { getUserNames } from "@/lib/discord";
import { loadGuildData } from "@/lib/guild";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tickets" };

export default async function TicketsPage({ params }: { params: { guildId: string } }) {
  const { guildId, channels, roles } = await loadGuildData(params.guildId);
  const [guild, tickets] = await Promise.all([
    prisma.guild.findUniqueOrThrow({ where: { id: guildId } }),
    prisma.ticket.findMany({ where: { guildId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const names = await getUserNames(tickets.map((ticket) => ticket.userId));

  return (
    <>
      <PageHeader icon={Ticket} title="Tickets et signalements" subtitle="Un salon privé par demande, et un formulaire de signalement anonyme." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Configuration">
          <ActionForm action={saveTicketsAction} className="space-y-4">
            <input type="hidden" name="guildId" value={guildId} />
            <Field label="Catégorie des tickets" htmlFor="ticketCategoryId" hint="Les salons « 🎫・pseudo » y sont créés (ils reprennent ses permissions).">
              <ChannelSelect id="ticketCategoryId" name="ticketCategoryId" channels={channels} kind="category" defaultValue={guild.ticketCategoryId} />
            </Field>
            <Field label="Rôles du staff" hint="Voient tous les tickets et peuvent les fermer (les administrateurs aussi).">
              <RoleCheckboxes name="ticketStaffRoleIds" roles={roles} selected={splitIds(guild.ticketStaffRoleIds)} />
            </Field>
            <Field label="Rôles mentionnés à l'ouverture" hint="Ex. les modos et helpers, pour qu'ils voient arriver la demande.">
              <RoleCheckboxes name="ticketPingRoleIds" roles={roles} selected={splitIds(guild.ticketPingRoleIds)} />
            </Field>
            <Field label="Salon du panneau « Besoin d'aide ? »" htmlFor="ticketPanelChannelId">
              <ChannelSelect id="ticketPanelChannelId" name="ticketPanelChannelId" channels={channels} defaultValue={guild.ticketPanelChannelId} />
            </Field>
            <Field label="Archives des tickets" htmlFor="ticketArchiveChannelId" hint="À la fermeture, la conversation y est envoyée en fichier texte. Réserve ce salon aux modos.">
              <ChannelSelect id="ticketArchiveChannelId" name="ticketArchiveChannelId" channels={channels} defaultValue={guild.ticketArchiveChannelId} emptyLabel="— Pas d'archives —" />
            </Field>
            <Field label="Signalements anonymes" htmlFor="reportChannelId" hint="Ajoute le bouton « Signalement anonyme » au panneau. Le pseudo de l'auteur·ice n'est jamais enregistré.">
              <ChannelSelect id="reportChannelId" name="reportChannelId" channels={channels} defaultValue={guild.reportChannelId} emptyLabel="— Désactivés —" />
            </Field>
            <SubmitButton>Enregistrer</SubmitButton>
          </ActionForm>
          <ActionForm action={publishTicketPanelAction} className="mt-4 border-t border-lavender-100 pt-4">
            <input type="hidden" name="guildId" value={guildId} />
            <SubmitButton variant="secondary">{guild.ticketPanelMessageId ? "Mettre à jour le panneau" : "Publier le panneau"}</SubmitButton>
            <p className="hint">Le panneau existant est modifié sur place (pas de doublon) ; s&apos;il vient de l&apos;ancien bot, il est remplacé.</p>
          </ActionForm>
          <div className="mt-4">
            <Notice>
              Seul·e l&apos;auteur·ice d&apos;un ticket ou le staff peut le fermer. Les administrateurs voient toujours tous les salons, tickets compris :
              c&apos;est le fonctionnement normal de Discord.
            </Notice>
          </div>
        </Card>
        <Card title="Tickets récents">
          {tickets.length ? (
            <ul className="space-y-2">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold">
                      #{ticket.id} · {names.get(ticket.userId)}
                    </span>
                    <span className="block text-xs text-lavender-600">
                      ouvert le {formatDate(ticket.createdAt)}
                      {ticket.closedAt ? ` · fermé le ${formatDate(ticket.closedAt)}` : ""}
                    </span>
                  </span>
                  <Badge tone={ticket.status === "OPEN" ? "aqua" : "lavender"}>{ticket.status === "OPEN" ? "ouvert" : "fermé"}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Aucun ticket pour l&apos;instant.</EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
