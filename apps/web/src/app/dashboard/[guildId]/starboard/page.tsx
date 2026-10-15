import { Star } from "lucide-react";
import { prisma } from "@ellie/database";
import { saveStarboardAction } from "@/actions/guild-settings";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ChannelSelect } from "@/components/selects";
import { Card, Field, PageHeader } from "@/components/ui";
import { loadGuildData } from "@/lib/guild";

export const dynamic = "force-dynamic";
export const metadata = { title: "Starboard" };

export default async function StarboardPage({ params }: { params: { guildId: string } }) {
  const { guildId, channels } = await loadGuildData(params.guildId);
  const guild = await prisma.guild.findUniqueOrThrow({ where: { id: guildId } });
  const posts = await prisma.starboardPost.count({ where: { guildId } });

  return (
    <>
      <PageHeader icon={Star} title="Starboard" subtitle={`Met en avant les messages les plus appréciés (${posts} message${posts > 1 ? "s" : ""} épinglé${posts > 1 ? "s" : ""}).`} />
      <Card>
        <ActionForm action={saveStarboardAction} className="grid gap-4 md:grid-cols-3">
          <input type="hidden" name="guildId" value={guildId} />
          <Field label="Salon du starboard" htmlFor="starboardChannelId" hint="Vide = désactivé.">
            <ChannelSelect id="starboardChannelId" name="starboardChannelId" channels={channels} defaultValue={guild.starboardChannelId} />
          </Field>
          <Field label="Émoji" htmlFor="starboardEmoji" hint="Émoji Unicode, ou <:nom:id> pour un émoji du serveur.">
            <input id="starboardEmoji" name="starboardEmoji" maxLength={64} defaultValue={guild.starboardEmoji} className="field" />
          </Field>
          <Field label="Seuil de réactions" htmlFor="starboardThreshold">
            <input id="starboardThreshold" name="starboardThreshold" type="number" min={1} max={100} defaultValue={guild.starboardThreshold} className="field" />
          </Field>
          <div className="md:col-span-3">
            <SubmitButton>Enregistrer</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
