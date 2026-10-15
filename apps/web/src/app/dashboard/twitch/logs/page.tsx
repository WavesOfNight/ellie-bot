import { Blocks } from "lucide-react";
import { prisma } from "@ellie/database";
import { resetTwitchWarningsAction } from "@/actions/twitch";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyState, formatDate, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Logs Twitch" };

const TONES = { AVERTISSEMENT: "blush", TIMEOUT: "lavender", BAN: "coral" } as const;

export default async function TwitchLogsPage() {
  const cases = await prisma.twitchModerationCase.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  const byUser = new Map<string, typeof cases>();
  for (const entry of cases) byUser.set(entry.username, [...(byUser.get(entry.username) ?? []), entry]);

  return (
    <>
      <PageHeader icon={Blocks} title="Logs de modération Twitch" subtitle="Sanctions groupées par utilisateur." />
      {byUser.size ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {[...byUser].map(([username, entries]) => (
            <Card key={username} title={username}>
              <ul className="mb-3 space-y-1 text-sm">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-2">
                    <Badge tone={TONES[entry.type as keyof typeof TONES] ?? "lavender"}>{entry.type.toLowerCase()}</Badge>
                    <span className="text-lavender-600">{formatDate(entry.createdAt)}</span>
                    <span className="min-w-0 break-words">{entry.reason}</span>
                  </li>
                ))}
              </ul>
              <ActionForm action={resetTwitchWarningsAction}>
                <input type="hidden" name="username" value={username} />
                <SubmitButton variant="danger" confirm={`Réinitialiser les avertissements de ${username} ? Cela ne lève pas un ban Twitch.`}>
                  Réinitialiser les avertissements
                </SubmitButton>
              </ActionForm>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState>Aucune sanction enregistrée.</EmptyState>
      )}
    </>
  );
}
