import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Blocks } from "lucide-react";
import { prisma } from "@ellie/database";
import { ACTION_LIMITS } from "@ellie/database/shared";
import { BlocklyEditor, type EditorChoices } from "@/components/BlocklyEditor";
import { filterChannels } from "@/components/selects";
import { Notice, PageHeader } from "@/components/ui";
import { rowsToTree } from "@/lib/blockly-convert";
import { loadGuildData } from "@/lib/guild";

export const dynamic = "force-dynamic";
export const metadata = { title: "Éditeur visuel" };

export default async function CommandEditorPage({ params }: { params: { guildId: string; commandId: string } }) {
  const { guildId, channels, roles } = await loadGuildData(params.guildId);
  const [guild, command] = await Promise.all([
    prisma.guild.findUniqueOrThrow({ where: { id: guildId } }),
    prisma.customCommand.findFirst({ where: { id: Number(params.commandId) || 0, guildId }, include: { actions: true } }),
  ]);
  if (!command) notFound();

  const choices: EditorChoices = {
    text: filterChannels(channels, "text").map((channel) => [`# ${channel.name}`, channel.id]),
    voice: filterChannels(channels, "voice").map((channel) => [`🔊 ${channel.name}`, channel.id]),
    category: filterChannels(channels, "category").map((channel) => [`📁 ${channel.name}`, channel.id]),
    roles: roles.filter((role) => !role.managed).map((role) => [`@${role.name}`, role.id]),
  };

  return (
    <>
      <PageHeader
        icon={Blocks}
        title={`${guild.prefix}${command.name}`}
        subtitle="Glisse des blocs depuis la palette et accroche-les sous « Quand la commande est utilisée »."
        actions={
          <Link href={`/dashboard/${guildId}/commands`} className="bubble-btn inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm font-semibold text-lavender-800 shadow-glass">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Retour
          </Link>
        }
      />
      <div className="mb-4">
        <Notice>
          Limites : {ACTION_LIMITS.MAX_ACTIONS_PER_RUN} actions par exécution, {ACTION_LIMITS.MAX_NESTING_DEPTH} niveaux d&apos;imbrication, {ACTION_LIMITS.MAX_REPEAT_COUNT} répétitions,
          attente de {ACTION_LIMITS.MAX_WAIT_SECONDS} s maximum. Attention : n&apos;importe quel membre peut lancer la commande — protège les sanctions avec un bloc
          « si l&apos;auteur est administrateur ».
        </Notice>
      </div>
      <BlocklyEditor guildId={guildId} commandId={command.id} initialTree={rowsToTree(command.actions)} choices={choices} />
    </>
  );
}
