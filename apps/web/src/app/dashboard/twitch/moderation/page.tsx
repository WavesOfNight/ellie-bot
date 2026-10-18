import { Shield } from "lucide-react";
import { formatUsd, MODELS } from "@ellie/ai/pricing";
import { getAiUsageHistory, getBotConfigStatus, getTwitchBotSettings, TWITCH_AI_BOUNDS, TWITCH_AI_SCOPE } from "@ellie/database";
import { AUTOMOD_LEVEL_DESCRIPTIONS, AUTOMOD_LEVELS } from "@ellie/database/shared";
import { saveTwitchModerationAction } from "@/actions/twitch";
import { ActionForm, SubmitButton } from "@/components/forms";
import { loadTwitchStatus, TwitchStatusPanel } from "@/components/TwitchStatus";
import { Card, Field, Notice, PageHeader, Toggle } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modération Twitch" };

const LEVEL_LABELS = { OFF: "Désactivé", LOW: "Faible", MEDIUM: "Moyen", HIGH: "Strict" } as const;

export default async function TwitchModerationPage() {
  const [settings, status, usage] = await Promise.all([getTwitchBotSettings(), getBotConfigStatus(), getAiUsageHistory(TWITCH_AI_SCOPE, 7)]);
  const twitchStatus = await loadTwitchStatus(settings);
  const today = usage.at(-1);
  const bounds = TWITCH_AI_BOUNDS;

  return (
    <>
      <PageHeader icon={Shield} title="Modération Twitch" subtitle="Escalade : 2 avertissements, puis timeout de 10 minutes, puis bannissement." />
      <ActionForm action={saveTwitchModerationAction} className="space-y-6">
        <Card title="Bot">
          <TwitchStatusPanel status={twitchStatus} className="mb-4" />
          <div className="grid gap-4 md:grid-cols-2">
            <Toggle name="enabled" label="Bot Twitch activé" defaultChecked={settings.enabled} hint="Le bot se connecte au chat sous 5 secondes." />
            <Field label="Préfixe des commandes" htmlFor="prefix">
              <input id="prefix" name="prefix" maxLength={3} defaultValue={settings.prefix} required className="field w-24" />
            </Field>
          </div>
        </Card>

        <Card title="Filtre de mots" description="Les modérateurs et la streameuse ne sont jamais filtrés.">
          <Field label="Niveau du filtre" htmlFor="autoModLevel">
            <select id="autoModLevel" name="autoModLevel" defaultValue={settings.autoModLevel} className="field md:max-w-xs">
              {AUTOMOD_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {LEVEL_LABELS[level]}
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

        <Card title="Filtres granulaires">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Toggle name="filterLinksEnabled" label="Liens (sanction)" defaultChecked={settings.filterLinksEnabled} />
              <Field label="Domaines autorisés" htmlFor="linkWhitelist" hint="Un par ligne (sous-domaines inclus), ex. twitch.tv, youtube.com.">
                <textarea id="linkWhitelist" name="linkWhitelist" rows={3} defaultValue={settings.linkWhitelist} className="field" />
              </Field>
            </div>
            <div className="space-y-3">
              <Toggle name="filterRepetitionEnabled" label="Répétitions / spam (sanction)" defaultChecked={settings.filterRepetitionEnabled} />
              <Toggle name="filterCapsEnabled" label="Majuscules (suppression seule)" defaultChecked={settings.filterCapsEnabled} />
              <Toggle name="filterSymbolsEnabled" label="Symboles (suppression seule)" defaultChecked={settings.filterSymbolsEnabled} />
              <Toggle name="filterSharedChatEnabled" label="Chat partagé (suppression seule)" defaultChecked={settings.filterSharedChatEnabled} />
              <div className="flex items-end gap-3">
                <Toggle name="filterEmotesEnabled" label="Émotes (suppression seule)" defaultChecked={settings.filterEmotesEnabled} />
                <Field label="Max" htmlFor="maxEmotes">
                  <input id="maxEmotes" name="maxEmotes" type="number" min={1} max={100} defaultValue={settings.maxEmotes} className="field w-20" />
                </Field>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Communauté">
          <div className="grid gap-3 md:grid-cols-3">
            <Toggle name="raidShoutoutEnabled" label="Shoutout automatique des raids" defaultChecked={settings.raidShoutoutEnabled} />
            <Toggle name="announceFollows" label="Annoncer les nouveaux follows" defaultChecked={settings.announceFollows} />
            <Toggle name="announceSubs" label="Annoncer les abonnements" defaultChecked={settings.announceSubs} />
          </div>
        </Card>

        <Card title="Ellie (IA) sur le chat Twitch" description="Ellie répond quand on écrit @nom_du_bot. Cooldowns et plafond : le bot reste silencieux.">
          {!status.anthropicConfigured ? (
            <div className="mb-4">
              <Notice tone="coral">Aucune clé API Anthropic : configure-la dans Paramètres.</Notice>
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <Toggle name="aiEnabled" label="Activer Ellie sur Twitch" defaultChecked={settings.aiEnabled} />
            <Field label="Modèle" htmlFor="aiModel">
              <select id="aiModel" name="aiModel" defaultValue={settings.aiModel} className="field">
                {MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label} ({String(model.inputUsdPerMTok).replace(".", ",")} $ / {String(model.outputUsdPerMTok).replace(".", ",")} $ par million de tokens)
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Cooldown par viewer (${bounds.aiUserCooldownSeconds.min}–${bounds.aiUserCooldownSeconds.max} s)`} htmlFor="aiUserCooldownSeconds">
              <input id="aiUserCooldownSeconds" name="aiUserCooldownSeconds" type="number" {...bounds.aiUserCooldownSeconds} defaultValue={settings.aiUserCooldownSeconds} className="field" />
            </Field>
            <Field label={`Cooldown global (${bounds.aiGlobalCooldownSeconds.min}–${bounds.aiGlobalCooldownSeconds.max} s)`} htmlFor="aiGlobalCooldownSeconds">
              <input id="aiGlobalCooldownSeconds" name="aiGlobalCooldownSeconds" type="number" {...bounds.aiGlobalCooldownSeconds} defaultValue={settings.aiGlobalCooldownSeconds} className="field" />
            </Field>
            <Field label={`Plafond quotidien (${bounds.aiDailyReplyCap.min}–${bounds.aiDailyReplyCap.max})`} htmlFor="aiDailyReplyCap">
              <input id="aiDailyReplyCap" name="aiDailyReplyCap" type="number" {...bounds.aiDailyReplyCap} defaultValue={settings.aiDailyReplyCap} className="field" />
            </Field>
            <p className="self-end text-sm text-lavender-600">
              Aujourd&apos;hui : {today?.replies ?? 0} réponse(s) · coût estimé {formatUsd(today?.costUsd ?? 0)}
            </p>
          </div>
        </Card>
        <SubmitButton>Enregistrer</SubmitButton>
      </ActionForm>
    </>
  );
}
