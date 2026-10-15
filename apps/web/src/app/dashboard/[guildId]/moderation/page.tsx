import { Shield } from "lucide-react";
import { prisma } from "@ellie/database";
import { AUTOMOD_LEVEL_DESCRIPTIONS, AUTOMOD_LEVELS, countAutoModWords } from "@ellie/database/shared";
import { saveModerationAction } from "@/actions/guild-settings";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ChannelSelect } from "@/components/selects";
import { Card, Field, PageHeader, Toggle } from "@/components/ui";
import { loadGuildData } from "@/lib/guild";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modération" };

const LEVEL_LABELS = { OFF: "Désactivé", LOW: "Faible", MEDIUM: "Moyen", HIGH: "Strict" } as const;

export default async function ModerationPage({ params }: { params: { guildId: string } }) {
  const { guildId, channels } = await loadGuildData(params.guildId);
  const guild = await prisma.guild.findUniqueOrThrow({ where: { id: guildId } });

  return (
    <>
      <PageHeader icon={Shield} title="Modération" subtitle="Filtres automatiques, journaux et escalade des avertissements." />
      <ActionForm action={saveModerationAction} className="space-y-6">
        <input type="hidden" name="guildId" value={guildId} />
        <Card title="Salon de logs" description="Toutes les sanctions et les journaux d'événements y sont publiés.">
          <ChannelSelect name="modLogChannelId" channels={channels} defaultValue={guild.modLogChannelId} />
        </Card>

        <Card title="Filtre de mots" description="Listes multilingues (FR, EN, DE, ES, IT), résistantes au leet speak. Les membres avec « Gérer les messages » sont exemptés.">
          <Field label="Niveau du filtre" htmlFor="autoModLevel">
            <select id="autoModLevel" name="autoModLevel" defaultValue={guild.autoModLevel} className="field md:max-w-xs">
              {AUTOMOD_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {LEVEL_LABELS[level]}
                  {level !== "OFF" ? ` (${countAutoModWords(level)} mots)` : ""}
                </option>
              ))}
            </select>
          </Field>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {AUTOMOD_LEVELS.map((level) => (
              <li key={level} className="rounded-xl bg-white/60 p-3 text-xs text-lavender-600">
                <strong className="text-lavender-800">{LEVEL_LABELS[level]}</strong> — {AUTOMOD_LEVEL_DESCRIPTIONS[level]}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Autres filtres">
          <div className="grid gap-3 md:grid-cols-2">
            <Toggle name="filterLinks" label="Liens" defaultChecked={guild.filterLinks} hint="Les GIF (Tenor, Giphy, Klipy, .gif/.mp4/.webm/.webp) restent autorisés." />
            <Toggle name="filterInvites" label="Invitations Discord" defaultChecked={guild.filterInvites} />
            <Toggle name="filterCaps" label="Majuscules" defaultChecked={guild.filterCaps} hint="Plus de 70 % de majuscules sur au moins 12 lettres." />
            <Toggle name="filterSpam" label="Spam" defaultChecked={guild.filterSpam} hint="3 messages identiques en 8 secondes." />
          </div>
        </Card>

        <Card title="Journaux d'événements">
          <div className="grid gap-3 md:grid-cols-2">
            <Toggle name="logMessageDelete" label="Message supprimé" defaultChecked={guild.logMessageDelete} />
            <Toggle name="logMessageEdit" label="Message modifié" defaultChecked={guild.logMessageEdit} />
            <Toggle name="logMemberJoin" label="Membre arrivé" defaultChecked={guild.logMemberJoin} />
            <Toggle name="logMemberLeave" label="Membre parti" defaultChecked={guild.logMemberLeave} />
          </div>
        </Card>

        <Card title="Escalade automatique" description="Compte les avertissements manuels et automatiques. Laisse vide pour désactiver un palier.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Mute 24 h après" htmlFor="warnMuteThreshold">
              <input id="warnMuteThreshold" name="warnMuteThreshold" type="number" min={1} max={100} defaultValue={guild.warnMuteThreshold ?? ""} placeholder="ex. 3" className="field" />
            </Field>
            <Field label="Expulsion après" htmlFor="warnKickThreshold">
              <input id="warnKickThreshold" name="warnKickThreshold" type="number" min={1} max={100} defaultValue={guild.warnKickThreshold ?? ""} placeholder="ex. 5" className="field" />
            </Field>
            <Field label="Bannissement après" htmlFor="warnBanThreshold">
              <input id="warnBanThreshold" name="warnBanThreshold" type="number" min={1} max={100} defaultValue={guild.warnBanThreshold ?? ""} placeholder="ex. 7" className="field" />
            </Field>
          </div>
        </Card>
        <SubmitButton>Enregistrer</SubmitButton>
      </ActionForm>
    </>
  );
}
