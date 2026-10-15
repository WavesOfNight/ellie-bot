import { TrendingUp } from "lucide-react";
import { prisma } from "@ellie/database";
import { MAX_LEVEL } from "@ellie/database/shared";
import { addLevelRewardAction, deleteLevelRewardAction } from "@/actions/guild-settings";
import { ActionForm, SubmitButton } from "@/components/forms";
import { RoleSelect } from "@/components/selects";
import { Card, EmptyState, Field, PageHeader, TableWrapper } from "@/components/ui";
import { getUserNames } from "@/lib/discord";
import { loadGuildData } from "@/lib/guild";

export const dynamic = "force-dynamic";
export const metadata = { title: "Niveaux" };

export default async function LevelsPage({ params }: { params: { guildId: string } }) {
  const { guildId, roles } = await loadGuildData(params.guildId);
  const [top, rewards] = await Promise.all([
    prisma.member.findMany({ where: { guildId, xp: { gt: 0 } }, orderBy: { xp: "desc" }, take: 20 }),
    prisma.levelReward.findMany({ where: { guildId }, orderBy: { level: "asc" } }),
  ]);
  const names = await getUserNames(top.map((member) => member.userId));
  const roleName = (id: string) => roles.find((role) => role.id === id)?.name ?? "rôle supprimé";

  return (
    <>
      <PageHeader icon={TrendingUp} title={`Niveaux (1–${MAX_LEVEL})`} subtitle="15 à 25 XP par message, une fois par minute et par membre." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Classement du serveur">
          {top.length ? (
            <TableWrapper>
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="text-lavender-600">
                  <tr>
                    <th className="py-2">#</th>
                    <th>Membre</th>
                    <th>Niveau</th>
                    <th>XP</th>
                    <th>Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((member, index) => (
                    <tr key={member.id} className="border-t border-lavender-100">
                      <td className="py-2 font-semibold">{index + 1}</td>
                      <td className="max-w-[12rem] truncate">{names.get(member.userId)}</td>
                      <td>{member.level}</td>
                      <td>{member.xp.toLocaleString("fr-FR")}</td>
                      <td>{member.messages.toLocaleString("fr-FR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          ) : (
            <EmptyState>Personne n&apos;a encore gagné d&apos;XP.</EmptyState>
          )}
        </Card>
        <Card title="Récompenses de rôle" description="Le rôle est attribué automatiquement quand le membre atteint le niveau.">
          {rewards.length ? (
            <ul className="mb-4 space-y-2">
              {rewards.map((reward) => (
                <li key={reward.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm">
                  <span>
                    Niveau <strong>{reward.level}</strong> → @{roleName(reward.roleId)}
                  </span>
                  <ActionForm action={deleteLevelRewardAction}>
                    <input type="hidden" name="guildId" value={guildId} />
                    <input type="hidden" name="id" value={reward.id} />
                    <SubmitButton variant="danger" confirm="Supprimer cette récompense ?">
                      Supprimer
                    </SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mb-4">
              <EmptyState>Aucune récompense pour l&apos;instant.</EmptyState>
            </div>
          )}
          <ActionForm action={addLevelRewardAction} className="grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:items-end" resetOnSuccess>
            <input type="hidden" name="guildId" value={guildId} />
            <Field label="Niveau" htmlFor="level">
              <input id="level" name="level" type="number" min={1} max={MAX_LEVEL} required className="field" />
            </Field>
            <Field label="Rôle" htmlFor="roleId">
              <RoleSelect id="roleId" name="roleId" roles={roles} required />
            </Field>
            <SubmitButton>Ajouter</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
