import { Terminal } from "lucide-react";
import { prisma } from "@ellie/database";
import { SLASH_COMMAND_CATALOG, SLASH_COMMAND_NAMES } from "@ellie/database/shared";
import { saveSlashTogglesAction } from "@/actions/guild-settings";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, PageHeader } from "@/components/ui";
import { requireGuildAccess } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Slash Commands" };

export default async function SlashCommandsPage({ params }: { params: { guildId: string } }) {
  const { guildId } = await requireGuildAccess(params.guildId);
  const toggles = await prisma.slashCommandToggle.findMany({ where: { guildId } });
  const enabled = (name: string) => toggles.find((toggle) => toggle.name === name)?.enabled ?? true;

  return (
    <>
      <PageHeader icon={Terminal} title={`Slash Commands (${SLASH_COMMAND_NAMES.length})`} subtitle="Désactive les commandes que tu ne veux pas sur ce serveur." />
      <ActionForm action={saveSlashTogglesAction} className="space-y-6">
        <input type="hidden" name="guildId" value={guildId} />
        <div className="grid gap-6 xl:grid-cols-2">
          {SLASH_COMMAND_CATALOG.map((category) => (
            <Card key={category.id} title={`${category.emoji} ${category.label} (${category.commands.length})`}>
              <ul className="space-y-2">
                {category.commands.map((command) => (
                  <li key={command.name}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/60 px-3 py-2">
                      <input type="checkbox" name={`cmd:${command.name}`} defaultChecked={enabled(command.name)} className="mt-1 h-4 w-4 accent-lavender-400" />
                      <span className="min-w-0">
                        <code className="text-sm font-semibold text-lavender-900">/{command.name}</code>
                        <span className="block text-xs text-lavender-600">{command.description}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <SubmitButton>Enregistrer</SubmitButton>
      </ActionForm>
    </>
  );
}
