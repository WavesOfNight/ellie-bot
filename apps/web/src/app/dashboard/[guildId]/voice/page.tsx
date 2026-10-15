import { Volume2 } from "lucide-react";
import { prisma } from "@ellie/database";
import { saveVoiceAction } from "@/actions/guild-settings";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ChannelSelect } from "@/components/selects";
import { Card, Field, PageHeader } from "@/components/ui";
import { loadGuildData } from "@/lib/guild";

export const dynamic = "force-dynamic";
export const metadata = { title: "Salons vocaux" };

export default async function VoicePage({ params }: { params: { guildId: string } }) {
  const { guildId, channels } = await loadGuildData(params.guildId);
  const [guild, active] = await Promise.all([
    prisma.guild.findUniqueOrThrow({ where: { id: guildId } }),
    prisma.tempVoiceChannel.count({ where: { guildId } }),
  ]);

  return (
    <>
      <PageHeader icon={Volume2} title="Salons vocaux" subtitle={`Salons personnels créés à la demande (${active} actif${active > 1 ? "s" : ""}).`} />
      <Card
        title="Salon « rejoindre pour créer »"
        description="Quand un membre rejoint ce salon, le bot lui crée son propre salon vocal (supprimé dès qu'il est vide). Les membres peuvent aussi utiliser /creer-vocal."
      >
        <ActionForm action={saveVoiceAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="guildId" value={guildId} />
          <Field label="Salon hub" htmlFor="hubVoiceChannelId" hint="Vide = fonction désactivée.">
            <ChannelSelect id="hubVoiceChannelId" name="hubVoiceChannelId" channels={channels} kind="voice" defaultValue={guild.hubVoiceChannelId} />
          </Field>
          <Field label="Modèle de nom" htmlFor="hubChannelNameTemplate" hint="{user} = pseudo du membre. Un nom contenant un mot filtré est remplacé par un nom générique.">
            <input id="hubChannelNameTemplate" name="hubChannelNameTemplate" maxLength={100} defaultValue={guild.hubChannelNameTemplate} className="field" />
          </Field>
          <div className="md:col-span-2">
            <SubmitButton>Enregistrer</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
