import { Sparkles } from "lucide-react";
import { getTwitchBotSettings, TWITCH_BOT_SCOPES } from "@ellie/database";
import { disconnectTwitchAccountAction, saveTwitchSettingsAction } from "@/actions/twitch";
import { ActionForm, SubmitButton } from "@/components/forms";
import { loadTwitchStatus, TwitchDiscordLink, TwitchStatusPanel } from "@/components/TwitchStatus";
import { Badge, Card, Field, Notice, PageHeader } from "@/components/ui";
import { getBotGuilds, type DiscordGuild } from "@/lib/discord";
import { appUrl } from "@/lib/url";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paramètres Twitch" };

const ERRORS: Record<string, string> = {
  state: "La connexion a expiré ou a été interrompue : réessaie.",
  client: "Renseigne et enregistre d'abord le Client ID et le Client Secret.",
  token: "Twitch a refusé l'échange du code : vérifie le Client Secret et l'URL de redirection.",
  user: "Impossible d'identifier le compte Twitch connecté.",
  network: "Twitch est injoignable pour le moment.",
};

export default async function TwitchSettingsPage({ searchParams }: { searchParams: { connected?: string; error?: string } }) {
  const settings = await getTwitchBotSettings();
  const status = await loadTwitchStatus(settings);
  const guilds: DiscordGuild[] = await getBotGuilds().catch(() => []);
  const redirectUri = appUrl("/api/twitch/callback");

  return (
    <>
      <PageHeader icon={Sparkles} title="Paramètres Twitch" subtitle="Application, compte bot, chaîne et serveur Discord lié." />
      <TwitchStatusPanel status={status} className="mb-4" />
      <div className="mb-4">
        <TwitchDiscordLink linkedGuildId={settings.linkedGuildId} />
      </div>
      {searchParams.connected ? (
        <div className="mb-4">
          <Notice tone="aqua">Compte Twitch connecté ✅</Notice>
        </div>
      ) : null}
      {searchParams.error ? (
        <div className="mb-4">
          <Notice tone="coral">{ERRORS[searchParams.error] ?? "La connexion a échoué."}</Notice>
        </div>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Application Twitch"
          description={
            <>
              Crée une application sur dev.twitch.tv (catégorie « Chat Bot ») avec l&apos;URL de redirection :
              <code className="mt-1 block break-all rounded-lg bg-white/70 px-2 py-1 text-xs">{redirectUri}</code>
            </>
          }
        >
          <ActionForm action={saveTwitchSettingsAction} className="space-y-4">
            <Field label="Client ID" htmlFor="clientId">
              <input id="clientId" name="clientId" required defaultValue={settings.clientId ?? ""} className="field" />
            </Field>
            <Field label="Client Secret" htmlFor="clientSecret" hint={settings.hasClientSecret ? "Configuré ✅ — laisse vide pour le conserver." : undefined}>
              <input id="clientSecret" name="clientSecret" type="password" autoComplete="off" className="field" />
            </Field>
            <Field label="Chaîne à rejoindre" htmlFor="channelName" hint="Pseudo Twitch de la streameuse.">
              <input id="channelName" name="channelName" defaultValue={settings.channelName ?? ""} placeholder="misstsune" className="field" />
            </Field>
            <Field label="Serveur Discord lié" htmlFor="linkedGuildId" hint="Logs des sanctions, lien !discord et classement !dleaderboard.">
              <select id="linkedGuildId" name="linkedGuildId" defaultValue={settings.linkedGuildId ?? ""} className="field">
                <option value="">— Aucun —</option>
                {guilds.map((guild) => (
                  <option key={guild.id} value={guild.id}>
                    {guild.name}
                  </option>
                ))}
              </select>
            </Field>
            <SubmitButton>Enregistrer</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Compte bot" description="Connecte le compte Twitch qui parlera dans le chat (il doit être modérateur de la chaîne).">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            {settings.hasTokens && settings.username ? (
              <>
                <Badge tone="aqua">connecté</Badge> en tant que <strong>{settings.username}</strong>
              </>
            ) : (
              <Badge tone="coral">non connecté</Badge>
            )}
          </div>
          <a
            href="/api/twitch/connect"
            className="bubble-btn inline-flex items-center gap-2 rounded-full bg-lavender-400 px-4 py-2 text-sm font-semibold text-white shadow-glass hover:bg-lavender-600"
          >
            Se connecter avec Twitch
          </a>
          {settings.hasTokens ? (
            <ActionForm action={disconnectTwitchAccountAction} className="mt-3">
              <SubmitButton variant="danger" confirm="Déconnecter le compte bot Twitch ?">
                Déconnecter le compte
              </SubmitButton>
            </ActionForm>
          ) : null}
          <p className="hint mt-4">Autorisations demandées : {TWITCH_BOT_SCOPES.join(", ")}.</p>
        </Card>
      </div>
    </>
  );
}
