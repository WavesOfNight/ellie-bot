import { CircleCheck, CircleX, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { CAT_CAFE, prisma } from "@ellie/database";
import {
  countChecks,
  diagnoseCommunity,
  splitIds,
  type ChannelUse,
  type CheckLevel,
  type DiagnosticSection,
  type GivenRole,
  type PermissionName,
} from "@ellie/database/shared";
import { applyCatCafeAction, refreshDiagnosticAction } from "@/actions/community";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { DiscordApiError, fetchAllGuildRoles, getBotRoleIds, getBotUser, getGuildChannels } from "@/lib/discord";
import { requireGuildAccess } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Diagnostic" };

const POST: readonly PermissionName[] = ["VIEW_CHANNEL", "SEND_MESSAGES", "EMBED_LINKS", "READ_MESSAGE_HISTORY"];
const NOTIFY: readonly PermissionName[] = ["VIEW_CHANNEL", "SEND_MESSAGES", "EMBED_LINKS"];

const LEVELS: Record<CheckLevel, { icon: LucideIcon; className: string }> = {
  ok: { icon: CircleCheck, className: "text-aqua-600" },
  warning: { icon: TriangleAlert, className: "text-blush-600" },
  error: { icon: CircleX, className: "text-coral-600" },
};

/** Configuration d'Ellie sur ce serveur : salons utilisés et rôles distribués. */
async function loadConfiguration(guildId: string) {
  const [guild, welcome, panels, rewards, alerts, ai] = await Promise.all([
    prisma.guild.findUnique({ where: { id: guildId } }),
    prisma.welcomeConfig.findUnique({ where: { guildId } }),
    prisma.reactionRoleMessage.findMany({ where: { guildId }, orderBy: { id: "asc" }, include: { groups: { include: { options: true } } } }),
    prisma.levelReward.findMany({ where: { guildId }, orderBy: { level: "asc" } }),
    prisma.socialAlert.findMany({ where: { guildId }, orderBy: { id: "asc" } }),
    prisma.guildAiConfig.findUnique({ where: { guildId } }),
  ]);

  const uses: ChannelUse[] = [];
  const use = (label: string, channelId: string | null | undefined, needs: readonly PermissionName[]) => {
    if (channelId) uses.push({ label, channelId, needs });
  };
  if (guild?.rulesContent || !guild?.verifyChannelId) use("Règlement", guild?.rulesChannelId, POST);
  use("Vérification", guild?.verifyChannelId, POST);
  for (const panel of panels) use(`Panneau de rôles « ${panel.title} »`, panel.channelId, POST);
  use("Panneau d'aide (tickets)", guild?.ticketPanelChannelId, POST);
  use("Catégorie des tickets", guild?.ticketCategoryId, ["VIEW_CHANNEL", "MANAGE_CHANNELS", "SEND_MESSAGES", "EMBED_LINKS", "ATTACH_FILES", "READ_MESSAGE_HISTORY"]);
  use("Archives des tickets", guild?.ticketArchiveChannelId, [...NOTIFY, "ATTACH_FILES"]);
  use("Signalements anonymes", guild?.reportChannelId, NOTIFY);
  use("Logs de modération", guild?.modLogChannelId, NOTIFY);
  use("Message de bienvenue", welcome?.channelId, [...NOTIFY, "ATTACH_FILES"]);
  for (const alert of alerts) use(`Alerte ${alert.platform === "TWITCH" ? "Twitch" : "YouTube"} (${alert.channelRef})`, alert.discordChannelId, NOTIFY);
  use("Starboard", guild?.starboardChannelId, NOTIFY);
  if (ai?.enabled) for (const channelId of splitIds(ai.allowedChannelIds)) use("Ellie (IA)", channelId, ["VIEW_CHANNEL", "SEND_MESSAGES", "READ_MESSAGE_HISTORY"]);
  use("Salon vocal « créer ton salon »", guild?.hubVoiceChannelId, ["VIEW_CHANNEL", "CONNECT", "MOVE_MEMBERS", "MANAGE_CHANNELS"]);
  use("Invitation permanente (/invite, !discord)", guild?.permanentInviteChannelId, ["VIEW_CHANNEL", "CREATE_INSTANT_INVITE"]);

  const given: GivenRole[] = [];
  if (guild?.rulesRoleId) given.push({ roleId: guild.rulesRoleId, source: "vérification" });
  for (const option of panels.flatMap((panel) => panel.groups.flatMap((group) => group.options))) given.push({ roleId: option.roleId, source: "panneau de rôles" });
  for (const reward of rewards) given.push({ roleId: reward.roleId, source: `niveau ${reward.level}` });
  const autoRoleId = welcome?.autoRoleEnabled ? welcome.autoRoleId : null;
  const joinButtonRoleId = welcome?.reactionRoleEnabled ? welcome.reactionRoleId : null;
  if (autoRoleId) given.push({ roleId: autoRoleId, source: "rôle automatique" });
  if (joinButtonRoleId) given.push({ roleId: joinButtonRoleId, source: "bouton « Rejoindre »" });

  return {
    accessRoleId: guild?.rulesRoleId ?? null,
    rulesChannelId: guild?.rulesChannelId ?? null,
    verifyChannelId: guild?.verifyChannelId ?? null,
    rolePanelChannelIds: panels.map((panel) => panel.channelId),
    autoRoleId,
    joinButtonRoleId,
    givenRoles: given,
    channelUses: uses,
  };
}

async function runDiagnostic(guildId: string): Promise<{ sections: DiagnosticSection[] } | { error: string }> {
  try {
    const [config, roles, channels, bot, botRoleIds] = await Promise.all([
      loadConfiguration(guildId),
      fetchAllGuildRoles(guildId),
      getGuildChannels(guildId),
      getBotUser(),
      getBotRoleIds(guildId),
    ]);
    return { sections: diagnoseCommunity({ guildId, bot: { userId: bot.id, roleIds: botRoleIds }, roles, channels, ...config }) };
  } catch (error) {
    return { error: error instanceof DiscordApiError ? error.message : "Impossible de lire le serveur sur Discord pour l'instant." };
  }
}

export default async function DiagnosticPage({ params }: { params: { guildId: string } }) {
  const { guildId } = await requireGuildAccess(params.guildId);
  const result = await runDiagnostic(guildId);
  const counts = "sections" in result ? countChecks(result.sections) : null;

  return (
    <>
      <PageHeader
        icon={ShieldCheck}
        title="Diagnostic"
        subtitle="Vérifie que le rôle d'Ellie est bien placé, qu'elle a les bonnes permissions dans chaque salon et que la vérification des nouveaux fonctionne."
        actions={
          <ActionForm action={refreshDiagnosticAction}>
            <input type="hidden" name="guildId" value={guildId} />
            <SubmitButton variant="ghost">Relancer le diagnostic</SubmitButton>
          </ActionForm>
        }
      />

      {guildId === CAT_CAFE.guildId ? <CatCafeCard guildId={guildId} /> : null}

      {"error" in result ? (
        <Notice tone="coral">{result.error}</Notice>
      ) : (
        <>
          {counts ? (
            <div className="mb-6 flex flex-wrap gap-2">
              <Badge tone="aqua">{counts.ok} OK</Badge>
              <Badge tone="blush">{counts.warning} à surveiller</Badge>
              <Badge tone="coral">{counts.error} à corriger</Badge>
            </div>
          ) : null}
          <div className="grid gap-6 xl:grid-cols-2">
            {result.sections.map((section) => (
              <Card key={section.title} title={section.title} className={section.title.startsWith("Salons") ? "xl:col-span-2" : undefined}>
                <ul className="space-y-2">
                  {section.checks.map((check, index) => {
                    const { icon: Icon, className } = LEVELS[check.level];
                    return (
                      <li key={index} className="flex gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm">
                        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} aria-label={check.level === "ok" ? "OK" : check.level === "warning" ? "À surveiller" : "À corriger"} />
                        <span className="min-w-0">
                          <span className="block break-words font-semibold text-lavender-900">{check.label}</span>
                          {check.detail ? <span className="block break-words text-lavender-600">{check.detail}</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function CatCafeCard({ guildId }: { guildId: string }) {
  return (
    <Card title="🐱 Configuration du Cat Café" className="mb-6">
      <div className="space-y-3 text-sm text-lavender-800">
        <p>Branche Ellie sur la structure créée par l&apos;ancien bot (rôles, salons et permissions du Cat Café) :</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>🎀 choisis-tes-rôles</strong> : 5 menus (Pronoms, Couleur, Notifications, Passions, Jeux) avec les rôles existants ;
          </li>
          <li>
            <strong>📜 règlement</strong> publié par Ellie, et le bouton « J&apos;ai lu le règlement, j&apos;entre ! » dans <strong>✅ vérification</strong>, qui donne
            🐾 Client·e du Café (l&apos;ancien bouton est remplacé) ;
          </li>
          <li>
            tickets dans <strong>🎫 TICKETS</strong> (panneau dans 🆘 aide-et-questions), signalements anonymes dans 🚨 signalements, transcriptions dans 📁
            preuves-et-archives, logs dans 📋 logs-modération ;
          </li>
          <li>rôles de niveau 🍼 Chaton (niv. 1) → 🐈 Chat de salon (10) → 😼 Chat de gouttière (20) → ✨ Neko légendaire (35), et alerte de live qui ping 🔴 Notif Lives ;</li>
          <li>lien d&apos;invitation permanent vers 📜 règlement (utilisé par /invite et par !discord sur Twitch), et bot Twitch relié au serveur ;</li>
          <li>Ellie reçoit le rôle 🤖 Robots du Café, qui lui ouvre les salons des bots.</li>
        </ul>
        <p>
          À faire une fois sur Discord (Ellie ne peut pas le faire elle-même) : glisser le rôle d&apos;Ellie <strong>juste au-dessus de 🤖 Robots du Café</strong>, et
          l&apos;ajouter aux permissions de <strong>🚨 signalements</strong> et <strong>📁 preuves-et-archives</strong> (voir, envoyer, intégrer des liens, joindre des
          fichiers). Le diagnostic ci-dessous confirme quand tout est vert.
        </p>
        <ActionForm action={applyCatCafeAction}>
          <input type="hidden" name="guildId" value={guildId} />
          <SubmitButton
            variant="secondary"
            confirm="Appliquer la configuration du Cat Café ? Les réglages tickets, règlement et vérification sont remplacés et les messages publiés sur Discord."
          >
            Appliquer la configuration du Cat Café
          </SubmitButton>
        </ActionForm>
      </div>
    </Card>
  );
}
