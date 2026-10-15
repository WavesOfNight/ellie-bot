import { Sparkles } from "lucide-react";
import { EFFORT_LABELS, EFFORTS, formatUsd, MODELS } from "@ellie/ai/pricing";
import { AI_CONFIG_BOUNDS, getAiUsageHistory, getBotConfigStatus, getGuildAiSettings } from "@ellie/database";
import { saveEllieSettingsAction } from "@/actions/ellie";
import { EllieTestBox } from "@/components/EllieTestBox";
import { ActionForm, CountedTextarea, SubmitButton } from "@/components/forms";
import { filterChannels } from "@/components/selects";
import { Badge, Card, Field, Notice, PageHeader, TableWrapper, Toggle } from "@/components/ui";
import { loadGuildData } from "@/lib/guild";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ellie (IA)" };

const fr = (value: number) => value.toLocaleString("fr-FR");

export default async function EllieAiPage({ params }: { params: { guildId: string } }) {
  const { guildId, channels } = await loadGuildData(params.guildId);
  const [settings, status, usage] = await Promise.all([getGuildAiSettings(guildId), getBotConfigStatus(), getAiUsageHistory(guildId, 7)]);
  const textChannels = filterChannels(channels, "text");
  const today = usage.at(-1);
  const week = usage.reduce(
    (total, day) => ({
      replies: total.replies + day.replies,
      inputTokens: total.inputTokens + day.inputTokens + day.cacheWriteTokens,
      outputTokens: total.outputTokens + day.outputTokens,
      cacheReadTokens: total.cacheReadTokens + day.cacheReadTokens,
      costUsd: total.costUsd + day.costUsd,
    }),
    { replies: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0 },
  );
  const bounds = AI_CONFIG_BOUNDS;

  return (
    <>
      <PageHeader icon={Sparkles} title="Ellie (IA)" subtitle="Quand on la mentionne, Ellie répond en incarnant le personnage de The Last of Us." />
      <div className="mb-6 space-y-3">
        {status.anthropicConfigured ? (
          <Notice tone="aqua">Clé API configurée ✅</Notice>
        ) : (
          <Notice tone="coral">Clé API ❌ — configure-la dans Paramètres (compte administrateur).</Notice>
        )}
        <Notice tone="blush">
          Pour répondre, Ellie envoie les derniers messages du salon à l&apos;API d&apos;Anthropic. Active-la uniquement dans des salons publics et pense à le mentionner dans le
          règlement.
        </Notice>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <ActionForm action={saveEllieSettingsAction} className="space-y-6">
          <input type="hidden" name="guildId" value={guildId} />
          <Card title="Activation et modèle">
            <div className="space-y-4">
              <Toggle name="enabled" label="Activer Ellie sur ce serveur" defaultChecked={settings.enabled} />
              <Field label="Modèle" htmlFor="model">
                <select id="model" name="model" defaultValue={settings.model} className="field">
                  {MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label} — {model.description} ({String(model.inputUsdPerMTok).replace(".", ",")} $ / {String(model.outputUsdPerMTok).replace(".", ",")} $ par million de tokens)
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Effort" htmlFor="effort" hint="Plus l'effort est élevé, plus la réponse est lente et chère. « Faible » suffit pour discuter.">
                <select id="effort" name="effort" defaultValue={settings.effort} className="field">
                  {EFFORTS.map((effort) => (
                    <option key={effort} value={effort}>
                      {EFFORT_LABELS[effort]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <Card title="Où et qui" description="Aucun salon coché = Ellie ne répond nulle part.">
            <div className="space-y-4">
              <fieldset>
                <legend className="label">Salons autorisés</legend>
                <div className="grid max-h-64 gap-2 overflow-y-auto rounded-xl border border-lavender-100 bg-white/60 p-3 sm:grid-cols-2">
                  {textChannels.map((channel) => (
                    <label key={channel.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="allowedChannelIds" value={channel.id} defaultChecked={settings.allowedChannelIds.includes(channel.id)} className="accent-lavender-400" />
                      <span className="truncate"># {channel.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="Membres bloqués" htmlFor="blockedUserIds" hint="Identifiants Discord séparés par des virgules ou des retours à la ligne (clic droit → Copier l'identifiant).">
                <textarea id="blockedUserIds" name="blockedUserIds" rows={2} defaultValue={settings.blockedUserIds.join(", ")} className="field" />
              </Field>
              <Toggle name="replyToReplies" label="Répondre aussi quand on répond à un de ses messages" defaultChecked={settings.replyToReplies} />
              <Toggle name="keywordTrigger" label="Réagir au mot-clé « Ellie » en début de message" defaultChecked={settings.keywordTrigger} hint="Ex. « Ellie, tu fais quoi ? »" />
            </div>
          </Card>

          <Card title="Limites">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Cooldown par membre (${bounds.userCooldownSeconds.min}–${bounds.userCooldownSeconds.max} s)`} htmlFor="userCooldownSeconds">
                <input id="userCooldownSeconds" name="userCooldownSeconds" type="number" {...bounds.userCooldownSeconds} defaultValue={settings.userCooldownSeconds} className="field" />
              </Field>
              <Field label={`Réponses max par minute et par salon (${bounds.channelMaxPerMinute.min}–${bounds.channelMaxPerMinute.max})`} htmlFor="channelMaxPerMinute">
                <input id="channelMaxPerMinute" name="channelMaxPerMinute" type="number" {...bounds.channelMaxPerMinute} defaultValue={settings.channelMaxPerMinute} className="field" />
              </Field>
              <Field label={`Plafond quotidien (${bounds.dailyReplyCap.min}–${fr(bounds.dailyReplyCap.max)})`} htmlFor="dailyReplyCap">
                <input id="dailyReplyCap" name="dailyReplyCap" type="number" {...bounds.dailyReplyCap} defaultValue={settings.dailyReplyCap} className="field" />
              </Field>
              <Field label={`Messages de contexte (${bounds.contextMessages.min}–${bounds.contextMessages.max})`} htmlFor="contextMessages">
                <input id="contextMessages" name="contextMessages" type="number" {...bounds.contextMessages} defaultValue={settings.contextMessages} className="field" />
              </Field>
            </div>
          </Card>

          <Card title="Contexte du serveur" description="Infos fiables qu'Ellie peut utiliser (planning, règles, références de la communauté). Laisse vide si tu n'as rien à préciser.">
            <CountedTextarea
              name="serverLore"
              maxLength={bounds.serverLoreMaxLength}
              rows={6}
              defaultValue={settings.serverLore}
              placeholder="Notre streameuse stream le mardi et le jeudi soir…"
            />
          </Card>
          <SubmitButton>Enregistrer</SubmitButton>
        </ActionForm>

        <div className="space-y-6">
          <Card title="Tester une réponse" description="Même nettoyage et même modération que sur Discord. Ne compte pas dans le plafond, mais les tokens sont comptabilisés.">
            <EllieTestBox guildId={guildId} disabled={!status.anthropicConfigured} />
          </Card>
          <Card title="Utilisation" description="Coût indicatif calculé avec les tarifs publics (ce n'est pas une facture).">
            <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-white/60 p-3">
                <p className="text-lavender-600">Aujourd&apos;hui</p>
                <p className="font-display text-xl font-bold">{fr(today?.replies ?? 0)} réponses</p>
                <p className="text-xs text-lavender-600">{formatUsd(today?.costUsd ?? 0)}</p>
              </div>
              <div className="rounded-xl bg-white/60 p-3">
                <p className="text-lavender-600">7 jours</p>
                <p className="font-display text-xl font-bold">{fr(week.replies)} réponses</p>
                <p className="text-xs text-lavender-600">{formatUsd(week.costUsd)}</p>
              </div>
            </div>
            <TableWrapper>
              <table className="w-full min-w-[340px] text-left text-xs">
                <thead className="text-lavender-600">
                  <tr>
                    <th className="py-1">Jour</th>
                    <th>Rép.</th>
                    <th>Entrée</th>
                    <th>Sortie</th>
                    <th>Cache</th>
                    <th>Coût</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((day) => (
                    <tr key={day.date} className="border-t border-lavender-100">
                      <td className="py-1">{day.date.slice(5).split("-").reverse().join("/")}</td>
                      <td>{fr(day.replies)}</td>
                      <td>{fr(day.inputTokens + day.cacheWriteTokens)}</td>
                      <td>{fr(day.outputTokens)}</td>
                      <td>{fr(day.cacheReadTokens)}</td>
                      <td>{formatUsd(day.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
            <p className="hint mt-2">
              <Badge>Conseil</Badge> Opus 5.5 offre le meilleur personnage ; Sonnet 5.5 ou Haiku 5.5 réduisent fortement la facture — compare-les avec la boîte de test.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
