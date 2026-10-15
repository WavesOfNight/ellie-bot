import { Link2 } from "lucide-react";
import { prisma } from "@ellie/database";
import { saveInviteAction } from "@/actions/guild-content";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ChannelSelect } from "@/components/selects";
import { Card, Field, PageHeader } from "@/components/ui";
import { loadGuildData } from "@/lib/guild";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: { guildId: string } }) {
  const { guildId, channels } = await loadGuildData(params.guildId);
  const guild = await prisma.guild.findUniqueOrThrow({ where: { id: guildId } });
  const link = guild.permanentInviteCode ? `https://discord.gg/${guild.permanentInviteCode}` : null;

  return (
    <>
      <PageHeader icon={Link2} title="Invitation" subtitle="Un lien permanent, utilisé par /invite et par !discord sur Twitch." />
      <Card>
        {link ? (
          <p className="mb-4 break-all rounded-xl bg-white/70 px-3 py-2 font-mono text-sm text-lavender-900">{link}</p>
        ) : (
          <p className="mb-4 text-sm text-lavender-600">Aucun lien permanent pour l&apos;instant.</p>
        )}
        <ActionForm action={saveInviteAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="guildId" value={guildId} />
          <div className="min-w-0 flex-1">
            <Field label="Salon source" htmlFor="permanentInviteChannelId">
              <ChannelSelect id="permanentInviteChannelId" name="permanentInviteChannelId" channels={channels} defaultValue={guild.permanentInviteChannelId} required />
            </Field>
          </div>
          <SubmitButton>{link ? "Régénérer le lien" : "Créer le lien"}</SubmitButton>
        </ActionForm>
        <p className="hint mt-3">Le bot recrée automatiquement le lien s&apos;il est supprimé (vérification toutes les 10 minutes).</p>
      </Card>
    </>
  );
}
