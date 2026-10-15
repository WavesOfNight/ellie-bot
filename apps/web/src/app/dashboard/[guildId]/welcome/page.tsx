import { Hand } from "lucide-react";
import { prisma } from "@ellie/database";
import { saveRulesAction } from "@/actions/community";
import { saveWelcomeAction } from "@/actions/guild-settings";
import { ActionForm, CountedTextarea, ImageUrlField, SubmitButton } from "@/components/forms";
import { ChannelSelect, RoleSelect } from "@/components/selects";
import { Card, Field, PageHeader, Toggle } from "@/components/ui";
import { loadGuildData } from "@/lib/guild";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bienvenue" };

const PLACEHOLDERS = "{user} {user.name} {user.tag} {user.mention} {server} {server.name} {server.memberCount}";

export default async function WelcomePage({ params }: { params: { guildId: string } }) {
  const { guildId, channels, roles } = await loadGuildData(params.guildId);
  const [config, guild] = await Promise.all([
    prisma.welcomeConfig.findUnique({ where: { guildId } }),
    prisma.guild.findUniqueOrThrow({ where: { id: guildId } }),
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
        title="📜 Règlement à accepter"
        className="mt-6"
        description="Un message avec un bouton « J'accepte » qui donne un rôle (par exemple l'accès au reste du serveur). Les anciens boutons du règlement continuent de fonctionner."
      >
        <ActionForm action={saveRulesAction} className="space-y-4">
          <input type="hidden" name="guildId" value={guildId} />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Salon du règlement" htmlFor="rulesChannelId">
              <ChannelSelect id="rulesChannelId" name="rulesChannelId" channels={channels} defaultValue={guild.rulesChannelId} />
            </Field>
            <Field label="Rôle donné en acceptant" htmlFor="rulesRoleId">
              <RoleSelect id="rulesRoleId" name="rulesRoleId" roles={roles} defaultValue={guild.rulesRoleId} />
            </Field>
          </div>
          <Field label="Titre" htmlFor="rulesTitle">
            <input id="rulesTitle" name="rulesTitle" required maxLength={256} defaultValue={guild.rulesTitle} className="field" />
          </Field>
          <Field label="Règlement" htmlFor="rulesContent" hint="Mise en forme Discord acceptée (**gras**, *italique*, listes…).">
            <CountedTextarea id="rulesContent" name="rulesContent" maxLength={4000} rows={10} defaultValue={guild.rulesContent} />
          </Field>
          <Field label="Texte du bouton" htmlFor="rulesButtonLabel">
            <input id="rulesButtonLabel" name="rulesButtonLabel" required maxLength={80} defaultValue={guild.rulesButtonLabel} className="field" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton name="intent" value="save">
              Enregistrer
            </SubmitButton>
            <SubmitButton variant="secondary" name="intent" value="publish">
              {guild.rulesMessageId ? "Enregistrer et mettre à jour sur Discord" : "Enregistrer et publier sur Discord"}
            </SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
