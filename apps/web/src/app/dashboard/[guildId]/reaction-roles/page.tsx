import { MousePointerClick } from "lucide-react";
import { LEGACY_TERRIER, prisma } from "@ellie/database";
import { countPanelComponents, DEFAULT_ROLE_PANEL_DESCRIPTION, ROLE_PANEL_LIMITS } from "@ellie/database/shared";
import {
  addRoleOptionAction,
  createRolePanelAction,
  deleteRoleGroupAction,
  deleteRoleOptionAction,
  deleteRolePanelAction,
  importLegacyAction,
  saveRoleGroupAction,
  updateRolePanelAction,
} from "@/actions/community";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ChannelSelect, RoleSelect } from "@/components/selects";
import { Badge, Card, EmptyState, Field, Notice, PageHeader } from "@/components/ui";
import type { DiscordRole } from "@/lib/discord";
import { loadGuildData } from "@/lib/guild";

export const dynamic = "force-dynamic";
export const metadata = { title: "Panneaux de rôles" };

const DISPLAY_LABELS = { MENU: "Menu à cocher (un bouton qui ouvre la liste)", BUTTONS: "Un bouton par rôle" } as const;

function GroupFields({ group }: { group?: { title: string; emoji: string | null; help: string; display: string; multiple: boolean; order: number } }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_90px]">
      <Field label="Nom du groupe">
        <input name="title" required maxLength={80} defaultValue={group?.title} placeholder="Pronoms" className="field" />
      </Field>
      <Field label="Émoji">
        <input name="emoji" maxLength={64} defaultValue={group?.emoji ?? ""} placeholder="💬" className="field" />
      </Field>
      <div className="sm:col-span-2">
        <Field label="Phrase d'aide">
          <input name="help" maxLength={200} defaultValue={group?.help} placeholder="Pour que tout le monde te genre correctement." className="field" />
        </Field>
      </div>
      <Field label="Affichage">
        <select name="display" defaultValue={group?.display ?? "MENU"} className="field">
          {Object.entries(DISPLAY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ordre">
        <input name="order" type="number" min={0} max={99} defaultValue={group?.order ?? 0} className="field" />
      </Field>
      <label className="flex items-center gap-2 text-sm font-semibold text-lavender-800 sm:col-span-2">
        <input type="checkbox" name="multiple" defaultChecked={group?.multiple ?? true} className="accent-lavender-400" />
        Plusieurs rôles possibles (décocher pour « un seul à la fois », ex. couleur de pseudo)
      </label>
    </div>
  );
}

export default async function RolePanelsPage({ params }: { params: { guildId: string } }) {
  const { guildId, channels, roles } = await loadGuildData(params.guildId);
  const panels = await prisma.reactionRoleMessage.findMany({
    where: { guildId },
    orderBy: { createdAt: "asc" },
    include: { groups: { orderBy: [{ order: "asc" }, { id: "asc" }], include: { options: { orderBy: [{ order: "asc" }, { id: "asc" }] } } } },
  });
  const roleName = (id: string, list: readonly DiscordRole[]) => list.find((role) => role.id === id)?.name ?? "rôle supprimé";
  const channelName = (id: string) => channels.find((channel) => channel.id === id)?.name ?? "salon supprimé";
  const isLegacyServer = guildId === LEGACY_TERRIER.guildId;
  const imported = panels.some((panel) => panel.groups.some((group) => group.legacyKey));

  return (
    <>
      <PageHeader icon={MousePointerClick} title="Panneaux de rôles" subtitle="Les membres choisissent leurs rôles eux-mêmes : menus à cocher ou boutons." />

      {isLegacyServer ? (
        <Card title="🦊 Reprendre l'ancien bot du Terrier" className="mb-6">
          <p className="mb-3 text-sm text-lavender-800">
            Importe les 5 menus (Pronoms, Notifications, Passions, Jeux, Couleur) avec tes rôles existants, ainsi que les réglages des tickets, des
            signalements anonymes et du règlement. Si Ellie utilise la même application Discord que l&apos;ancien bot, ses messages sont simplement
            mis à jour ; sinon, ils sont remplacés.
          </p>
          {imported ? (
            <div className="mb-3">
              <Badge tone="aqua">déjà importé</Badge>
            </div>
          ) : null}
          <ActionForm action={importLegacyAction}>
            <input type="hidden" name="guildId" value={guildId} />
            <SubmitButton variant="secondary" confirm="Reprendre la configuration de l'ancien bot ? Les réglages tickets et règlement seront remplacés.">
              {imported ? "Réimporter tickets et règlement" : "Importer la configuration de l'ancien bot"}
            </SubmitButton>
          </ActionForm>
        </Card>
      ) : null}

      <Card title="Nouveau panneau" className="mb-6">
        <ActionForm action={createRolePanelAction} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end" resetOnSuccess>
          <input type="hidden" name="guildId" value={guildId} />
          <Field label="Salon" htmlFor="channelId">
            <ChannelSelect id="channelId" name="channelId" channels={channels} required />
          </Field>
          <Field label="Titre" htmlFor="title">
            <input id="title" name="title" maxLength={200} placeholder="🎀 Choisis tes rôles" className="field" />
          </Field>
          <SubmitButton>Créer</SubmitButton>
        </ActionForm>
      </Card>

      {panels.length === 0 ? <EmptyState>Aucun panneau de rôles pour l&apos;instant.</EmptyState> : null}

      <div className="space-y-6">
        {panels.map((panel) => {
          const used = countPanelComponents(panel.groups.map((group) => ({ display: group.display, optionCount: group.options.length })));
          return (
            <Card
              key={panel.id}
              title={`#${panel.id} · ${panel.title}`}
              description={
                <span className="flex flex-wrap items-center gap-2">
                  dans #{channelName(panel.channelId)}
                  {panel.dirty ? <Badge tone="blush">publication en attente</Badge> : <Badge tone="aqua">publié</Badge>}
                  <Badge tone={used > ROLE_PANEL_LIMITS.MAX_COMPONENTS ? "coral" : "lavender"}>
                    {used} / {ROLE_PANEL_LIMITS.MAX_COMPONENTS} boutons
                  </Badge>
                </span>
              }
            >
              <details className="mb-4 rounded-2xl bg-white/60 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-lavender-800">Apparence du panneau</summary>
                <ActionForm action={updateRolePanelAction} className="mt-3 grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="guildId" value={guildId} />
                  <input type="hidden" name="id" value={panel.id} />
                  <Field label="Titre">
                    <input name="title" required maxLength={200} defaultValue={panel.title} className="field" />
                  </Field>
                  <Field label="Salon">
                    <ChannelSelect name="channelId" channels={channels} defaultValue={panel.channelId} required />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Texte d'introduction" hint="Vide = texte par défaut. La liste des groupes est ajoutée automatiquement en dessous.">
                      <textarea name="description" maxLength={3000} rows={3} defaultValue={panel.description} placeholder={DEFAULT_ROLE_PANEL_DESCRIPTION} className="field" />
                    </Field>
                  </div>
                  <Field label="Couleur">
                    <input name="color" type="color" defaultValue={panel.color} className="h-10 w-20 cursor-pointer rounded-xl border border-lavender-200 bg-white" />
                  </Field>
                  <div className="flex items-end">
                    <SubmitButton variant="ghost">Enregistrer</SubmitButton>
                  </div>
                </ActionForm>
                <ActionForm action={deleteRolePanelAction} className="mt-3 border-t border-lavender-100 pt-3">
                  <input type="hidden" name="guildId" value={guildId} />
                  <input type="hidden" name="id" value={panel.id} />
                  <SubmitButton variant="danger" confirm="Supprimer ce panneau (et son message Discord) ?">
                    Supprimer le panneau
                  </SubmitButton>
                </ActionForm>
              </details>

              <div className="grid gap-4 xl:grid-cols-2">
                {panel.groups.map((group) => (
                  <div key={group.id} className="rounded-2xl border border-lavender-100 bg-white/60 p-4">
                    <p className="mb-3 flex flex-wrap items-center gap-2 font-display text-base font-bold text-lavender-900">
                      {group.emoji} {group.title}
                      <Badge>{group.display === "MENU" ? "menu" : "boutons"}</Badge>
                      {group.multiple ? null : <Badge tone="blush">un seul</Badge>}
                    </p>
                    {group.options.length ? (
                      <ul className="mb-3 space-y-1">
                        {group.options.map((option) => (
                          <li key={option.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-1.5 text-sm">
                            <span className="min-w-0 truncate">
                              {option.emoji} <strong>{option.label}</strong> → @{roleName(option.roleId, roles)}
                              {option.description ? <span className="block truncate text-xs text-lavender-600">{option.description}</span> : null}
                            </span>
                            <ActionForm action={deleteRoleOptionAction}>
                              <input type="hidden" name="guildId" value={guildId} />
                              <input type="hidden" name="id" value={option.id} />
                              <SubmitButton variant="danger">Retirer</SubmitButton>
                            </ActionForm>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="mb-3">
                        <EmptyState>Aucun rôle dans ce groupe.</EmptyState>
                      </div>
                    )}
                    <details className="mb-2">
                      <summary className="cursor-pointer text-sm font-semibold text-lavender-800">Ajouter un rôle</summary>
                      <ActionForm action={addRoleOptionAction} className="mt-2 grid gap-2 sm:grid-cols-2" resetOnSuccess>
                        <input type="hidden" name="guildId" value={guildId} />
                        <input type="hidden" name="groupId" value={group.id} />
                        <Field label="Rôle">
                          <RoleSelect name="roleId" roles={roles} required />
                        </Field>
                        <Field label="Libellé">
                          <input name="label" required maxLength={80} placeholder="il/lui" className="field" />
                        </Field>
                        <Field label="Émoji">
                          <input name="emoji" maxLength={64} placeholder="💙" className="field" />
                        </Field>
                        <Field label="Description (menu)">
                          <input name="description" maxLength={100} placeholder="Genre-moi au masculin" className="field" />
                        </Field>
                        <div className="sm:col-span-2">
                          <SubmitButton>Ajouter</SubmitButton>
                        </div>
                      </ActionForm>
                    </details>
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-lavender-800">Modifier le groupe</summary>
                      <ActionForm action={saveRoleGroupAction} className="mt-2 space-y-3">
                        <input type="hidden" name="guildId" value={guildId} />
                        <input type="hidden" name="groupId" value={group.id} />
                        <GroupFields group={group} />
                        <SubmitButton variant="ghost">Enregistrer</SubmitButton>
                      </ActionForm>
                      <ActionForm action={deleteRoleGroupAction} className="mt-2">
                        <input type="hidden" name="guildId" value={guildId} />
                        <input type="hidden" name="id" value={group.id} />
                        <SubmitButton variant="danger" confirm={`Supprimer le groupe « ${group.title} » ?`}>
                          Supprimer le groupe
                        </SubmitButton>
                      </ActionForm>
                    </details>
                  </div>
                ))}
              </div>

              <details className="mt-4 rounded-2xl bg-white/60 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-lavender-800">Ajouter un groupe</summary>
                <ActionForm action={saveRoleGroupAction} className="mt-3 space-y-3" resetOnSuccess>
                  <input type="hidden" name="guildId" value={guildId} />
                  <input type="hidden" name="panelId" value={panel.id} />
                  <GroupFields />
                  <SubmitButton>Ajouter le groupe</SubmitButton>
                </ActionForm>
              </details>
            </Card>
          );
        })}
      </div>

      <div className="mt-6">
        <Notice>
          Le rôle d&apos;Ellie doit être placé <strong>au-dessus</strong> des rôles à distribuer (Paramètres du serveur → Rôles), sinon elle ne peut pas les
          donner.
        </Notice>
      </div>
    </>
  );
}
