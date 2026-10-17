import { Hand } from "lucide-react";
import { prisma } from "@ellie/database";
import { saveRulesAction } from "@/actions/community";
import { saveWelcomeAction } from "@/actions/guild-settings";
import { ActionForm, CountedTextarea, ImageUrlField, SubmitButton, WelcomeTextColorField } from "@/components/forms";
import { ChannelSelect, RoleSelect } from "@/components/selects";
import { Card, Field, PageHeader, Toggle } from "@/components/ui";
import { getGuild } from "@/lib/discord";
import { loadGuildData } from "@/lib/guild";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bienvenue" };

const PLACEHOLDERS = "{user} {user.name} {user.tag} {user.mention} {server} {server.name} {server.memberCount}";
const COMMUNITY_PLACEHOLDERS = "{rules} (salon du règlement) {roles} (salon des rôles) {server}";

export default async function WelcomePage({ params }: { params: { guildId: string } }) {
  const { guildId, channels, roles } = await loadGuildData(params.guildId);
  const [config, guild, discordGuild] = await Promise.all([
    prisma.welcomeConfig.findUnique({ where: { guildId } }),
    prisma.guild.findUniqueOrThrow({ where: { id: guildId } }),
    getGuild(guildId),
  ]);

  return (
    <>
      <PageHeader icon={Hand} title="Bienvenue" subtitle="Accueille les nouveaux membres avec un message, une image et des rôles." />
      <ActionForm action={saveWelcomeAction} className="space-y-6">
        <input type="hidden" name="guildId" value={guildId} />
        <Card title="Message de bienvenue" description={<>Placeholders disponibles : <code className="text-xs">{PLACEHOLDERS}</code></>}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Salon" htmlFor="channelId" hint="Vide = pas de message public.">
              <ChannelSelect id="channelId" name="channelId" channels={channels} defaultValue={config?.channelId} />
            </Field>
            <Field label="Mode" htmlFor="mode" hint="Image : carte générée avec l'avatar du membre (repli sur le texte en cas d'échec).">
              <select id="mode" name="mode" defaultValue={(config?.imageEnabled ?? true) ? "image" : "text"} className="field">
                <option value="text">Texte</option>
                <option value="image">Image</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 space-y-4">
            <Field label="Message" htmlFor="message">
              <CountedTextarea id="message" name="message" maxLength={1500} rows={3} defaultValue={config?.message ?? "{user.mention} a rejoint le serveur {server.name} !"} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Texte de l'image" htmlFor="imageText">
                <input id="imageText" name="imageText" maxLength={100} defaultValue={config?.imageText ?? "Bienvenue {user} !"} className="field" />
              </Field>
              <Field label="Fond personnalisé (facultatif)" hint="URL https d'une image (vérifiée à l'enregistrement). Vide = fond pastel.">
                <ImageUrlField name="imageBackgroundUrl" defaultValue={config?.imageBackgroundUrl} />
              </Field>
            </div>
            <Field label="Couleur du texte de l'image" hint="Le cadre derrière le texte devient sombre pour une couleur claire, pour que le texte reste lisible.">
              <WelcomeTextColorField name="imageTextColor" defaultValue={config?.imageTextColor} sampleText={config?.imageText} serverName={discordGuild?.name} />
            </Field>
          </div>
        </Card>

        <Card title="Message privé">
          <div className="space-y-4">
            <Toggle name="dmEnabled" label="Envoyer un MP de bienvenue" defaultChecked={config?.dmEnabled ?? false} hint="Ignoré si le membre a fermé ses MP." />
            <Field label="Message privé" htmlFor="dmMessage">
              <CountedTextarea id="dmMessage" name="dmMessage" maxLength={1500} rows={3} defaultValue={config?.dmMessage ?? "Bienvenue sur {server.name}, {user.name} !"} />
            </Field>
          </div>
        </Card>

        <Card title="Rôles">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <Toggle name="autoRoleEnabled" label="Rôle automatique à l'arrivée" defaultChecked={config?.autoRoleEnabled ?? false} />
              <RoleSelect name="autoRoleId" roles={roles} defaultValue={config?.autoRoleId} />
            </div>
            <div className="space-y-3">
              <Toggle name="reactionRoleEnabled" label="Bouton « Rejoindre » 👋 sous le message" defaultChecked={config?.reactionRoleEnabled ?? false} hint="Donne ce rôle au membre qui clique." />
              <RoleSelect name="reactionRoleId" roles={roles} defaultValue={config?.reactionRoleId} />
            </div>
          </div>
        </Card>
        <SubmitButton>Enregistrer</SubmitButton>
      </ActionForm>

      <Card
        title="📜 Règlement et ✅ vérification"
        className="mt-6"
        description="Les nouveaux lisent le règlement puis cliquent sur le bouton de vérification, qui leur donne le rôle d'accès au serveur. Les anciens boutons de vérification encore présents dans ces salons sont retirés à la publication."
      >
        <ActionForm action={saveRulesAction} className="space-y-6">
          <input type="hidden" name="guildId" value={guildId} />
          <section className="space-y-4">
            <h3 className="font-display text-base font-bold text-lavender-900">Règlement</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Salon du règlement" htmlFor="rulesChannelId">
                <ChannelSelect id="rulesChannelId" name="rulesChannelId" channels={channels} defaultValue={guild.rulesChannelId} />
              </Field>
              <Field label="Titre" htmlFor="rulesTitle">
                <input id="rulesTitle" name="rulesTitle" required maxLength={256} defaultValue={guild.rulesTitle} className="field" />
              </Field>
            </div>
            <Field label="Règlement" htmlFor="rulesContent" hint="Mise en forme Discord acceptée (**gras**, *italique*, listes, <#salon>…). Vide = le règlement est écrit à la main par l'équipe.">
              <CountedTextarea id="rulesContent" name="rulesContent" maxLength={4000} rows={10} defaultValue={guild.rulesContent} />
            </Field>
          </section>

          <section className="space-y-4 border-t border-lavender-100 pt-5">
            <h3 className="font-display text-base font-bold text-lavender-900">Vérification</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Salon du bouton" htmlFor="verifyChannelId" hint="Vide = le bouton est placé sous le règlement.">
                <ChannelSelect id="verifyChannelId" name="verifyChannelId" channels={channels} defaultValue={guild.verifyChannelId} emptyLabel="— Sous le règlement —" />
              </Field>
              <Field label="Rôle donné en validant" htmlFor="rulesRoleId" hint="Le rôle qui ouvre l'accès au serveur.">
                <RoleSelect id="rulesRoleId" name="rulesRoleId" roles={roles} defaultValue={guild.rulesRoleId} />
              </Field>
              <Field label="Texte du bouton" htmlFor="rulesButtonLabel">
                <input id="rulesButtonLabel" name="rulesButtonLabel" required maxLength={80} defaultValue={guild.rulesButtonLabel} className="field" />
              </Field>
              <Field label="Émoji du bouton" htmlFor="verifyButtonEmoji">
                <input id="verifyButtonEmoji" name="verifyButtonEmoji" maxLength={64} defaultValue={guild.verifyButtonEmoji} placeholder="🐾" className="field" />
              </Field>
            </div>
            <Field label="Titre du message de vérification" htmlFor="verifyTitle" hint="Utilisé quand le bouton a son propre salon.">
              <input id="verifyTitle" name="verifyTitle" required maxLength={256} defaultValue={guild.verifyTitle} className="field" />
            </Field>
            <Field label="Texte du message de vérification" htmlFor="verifyContent" hint={<>Placeholders : <code className="text-xs">{COMMUNITY_PLACEHOLDERS}</code></>}>
              <CountedTextarea id="verifyContent" name="verifyContent" maxLength={2000} rows={3} defaultValue={guild.verifyContent} />
            </Field>
            <Field label="Réponse après la vérification" htmlFor="verifyReply" hint="Visible uniquement par le membre qui vient de valider. Mêmes placeholders.">
              <CountedTextarea id="verifyReply" name="verifyReply" maxLength={1500} rows={3} defaultValue={guild.verifyReply} />
            </Field>
          </section>

          <div className="flex flex-wrap gap-2">
            <SubmitButton name="intent" value="save">
              Enregistrer
            </SubmitButton>
            <SubmitButton variant="secondary" name="intent" value="publish">
              {guild.rulesMessageId || guild.verifyMessageId ? "Enregistrer et mettre à jour sur Discord" : "Enregistrer et publier sur Discord"}
            </SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
