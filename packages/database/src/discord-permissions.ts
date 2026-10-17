/**
 * Permissions Discord calculées comme le fait Discord (rôles, puis exceptions des salons), et
 * diagnostic de la configuration communautaire d'Ellie : rang de son rôle, permissions dans chaque
 * salon qu'elle utilise et parcours de vérification des nouveaux membres.
 *
 * Module pur : le panel lui fournit les rôles, les salons et les rôles du bot lus via l'API Discord.
 */

export const DISCORD_PERMISSIONS = {
  KICK_MEMBERS: 1n << 1n,
  BAN_MEMBERS: 1n << 2n,
  ADMINISTRATOR: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  VIEW_CHANNEL: 1n << 10n,
  SEND_MESSAGES: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED_LINKS: 1n << 14n,
  ATTACH_FILES: 1n << 15n,
  READ_MESSAGE_HISTORY: 1n << 16n,
  CONNECT: 1n << 20n,
  MOVE_MEMBERS: 1n << 24n,
  MANAGE_ROLES: 1n << 28n,
  MODERATE_MEMBERS: 1n << 40n,
} as const;

export type PermissionName = keyof typeof DISCORD_PERMISSIONS;

/** Libellés de l'interface française de Discord. */
export const PERMISSION_LABELS: Record<PermissionName, string> = {
  KICK_MEMBERS: "Expulser des membres",
  BAN_MEMBERS: "Bannir des membres",
  ADMINISTRATOR: "Administrateur",
  MANAGE_CHANNELS: "Gérer les salons",
  VIEW_CHANNEL: "Voir les salons",
  SEND_MESSAGES: "Envoyer des messages",
  MANAGE_MESSAGES: "Gérer les messages",
  EMBED_LINKS: "Intégrer des liens",
  ATTACH_FILES: "Joindre des fichiers",
  READ_MESSAGE_HISTORY: "Voir les anciens messages",
  CONNECT: "Se connecter",
  MOVE_MEMBERS: "Déplacer des membres",
  MANAGE_ROLES: "Gérer les rôles",
  MODERATE_MEMBERS: "Exclure temporairement des membres",
};

const ALL_PERMISSIONS = (1n << 64n) - 1n;

/** Formes renvoyées par l'API Discord (champs utiles uniquement). */
export interface PermissionOverwriteData {
  id: string;
  /** 0 = rôle, 1 = membre */
  type: number;
  allow: string;
  deny: string;
}

export interface DiagnosticRole {
  id: string;
  name: string;
  position: number;
  permissions: string;
  managed: boolean;
}

export interface DiagnosticChannel {
  id: string;
  name: string;
  type: number;
  permission_overwrites?: PermissionOverwriteData[];
}

/** Membre dont on calcule les permissions (`userId` null : membre quelconque, sans exception personnelle). */
export interface PermissionSubject {
  userId: string | null;
  roleIds: readonly string[];
}

const bits = (value: string | undefined): bigint => {
  try {
    return BigInt(value ?? "0");
  } catch {
    return 0n;
  }
};

/** Permissions du serveur : celles de @everyone (rôle d'identifiant = serveur) et des rôles du membre. */
export function basePermissions(guildId: string, roles: readonly DiagnosticRole[], subject: PermissionSubject): bigint {
  let permissions = 0n;
  for (const role of roles) {
    if (role.id === guildId || subject.roleIds.includes(role.id)) permissions |= bits(role.permissions);
  }
  return permissions & DISCORD_PERMISSIONS.ADMINISTRATOR ? ALL_PERMISSIONS : permissions;
}

/** Permissions dans un salon : @everyone, puis rôles (refus puis autorisations), puis exception du membre. */
export function channelPermissions(guildId: string, roles: readonly DiagnosticRole[], channel: DiagnosticChannel, subject: PermissionSubject): bigint {
  const base = basePermissions(guildId, roles, subject);
  if (base === ALL_PERMISSIONS) return ALL_PERMISSIONS;
  const overwrites = channel.permission_overwrites ?? [];
  let permissions = base;

  const everyone = overwrites.find((overwrite) => overwrite.id === guildId);
  if (everyone) permissions = (permissions & ~bits(everyone.deny)) | bits(everyone.allow);

  let allow = 0n;
  let deny = 0n;
  for (const overwrite of overwrites) {
    if (overwrite.type === 0 && overwrite.id !== guildId && subject.roleIds.includes(overwrite.id)) {
      allow |= bits(overwrite.allow);
      deny |= bits(overwrite.deny);
    }
  }
  permissions = (permissions & ~deny) | allow;

  const member = subject.userId ? overwrites.find((overwrite) => overwrite.type === 1 && overwrite.id === subject.userId) : undefined;
  if (member) permissions = (permissions & ~bits(member.deny)) | bits(member.allow);

  // Sans « Voir le salon », Discord retire toutes les autres permissions du salon.
  return permissions & DISCORD_PERMISSIONS.VIEW_CHANNEL ? permissions : 0n;
}

export function missingPermissions(granted: bigint, needed: readonly PermissionName[]): PermissionName[] {
  return needed.filter((name) => (granted & DISCORD_PERMISSIONS[name]) !== DISCORD_PERMISSIONS[name]);
}

export const permissionList = (names: readonly PermissionName[]): string => names.map((name) => PERMISSION_LABELS[name]).join(", ");

// ---------------------------------------------------------------------------
// Diagnostic
// ---------------------------------------------------------------------------

export type CheckLevel = "ok" | "warning" | "error";

export interface DiagnosticCheck {
  level: CheckLevel;
  label: string;
  /** Ce qui ne va pas et comment le corriger */
  detail?: string;
}

export interface DiagnosticSection {
  title: string;
  checks: DiagnosticCheck[];
}

/** Salon utilisé par une fonctionnalité d'Ellie et permissions dont elle y a besoin. */
export interface ChannelUse {
  label: string;
  channelId: string;
  needs: readonly PermissionName[];
}

/** Rôle qu'Ellie distribue (vérification, panneaux, niveaux…). */
export interface GivenRole {
  roleId: string;
  source: string;
}

export interface CommunityDiagnosticInput {
  guildId: string;
  bot: { userId: string; roleIds: readonly string[] };
  /** Tous les rôles du serveur, @everyone compris */
  roles: readonly DiagnosticRole[];
  channels: readonly DiagnosticChannel[];
  /** Rôle donné par le bouton de vérification */
  accessRoleId: string | null;
  rulesChannelId: string | null;
  verifyChannelId: string | null;
  rolePanelChannelIds: readonly string[];
  /** Rôle donné automatiquement à l'arrivée (page Bienvenue), s'il est activé */
  autoRoleId: string | null;
  /** Rôle du bouton « Rejoindre » du message de bienvenue, s'il est activé */
  joinButtonRoleId: string | null;
  givenRoles: readonly GivenRole[];
  channelUses: readonly ChannelUse[];
}

/** Permissions générales dont Ellie a besoin, et pour quoi. */
const GUILD_NEEDS: ReadonlyArray<{ permission: PermissionName; usage: string }> = [
  { permission: "MANAGE_ROLES", usage: "donner les rôles (vérification, panneaux, niveaux)" },
  { permission: "MANAGE_CHANNELS", usage: "créer les tickets et les salons vocaux" },
  { permission: "MANAGE_MESSAGES", usage: "supprimer les messages bloqués par l'automodération" },
  { permission: "MODERATE_MEMBERS", usage: "les exclusions temporaires (mute)" },
  { permission: "KICK_MEMBERS", usage: "/kick" },
  { permission: "BAN_MEMBERS", usage: "/ban" },
];

export function diagnoseCommunity(input: CommunityDiagnosticInput): DiagnosticSection[] {
  const roleById = new Map(input.roles.map((role) => [role.id, role]));
  const channelById = new Map(input.channels.map((channel) => [channel.id, channel]));
  const botSubject: PermissionSubject = { userId: input.bot.userId, roleIds: input.bot.roleIds };
  const botRoles = input.bot.roleIds.map((id) => roleById.get(id)).filter((role): role is DiagnosticRole => Boolean(role));
  const botTopRole = botRoles.reduce<DiagnosticRole | null>((top, role) => (!top || role.position > top.position ? role : top), null);
  const botRoleName = botTopRole ? `« ${botTopRole.name} »` : "d'Ellie";
  const channelName = (id: string) => (channelById.has(id) ? `#${channelById.get(id)?.name}` : "salon supprimé");

  return [
    { title: "Rôle d'Ellie", checks: botRoleChecks() },
    { title: "Vérification et règlement", checks: verificationChecks() },
    { title: "Salons utilisés par Ellie", checks: channelChecks() },
  ];

  function botRoleChecks(): DiagnosticCheck[] {
    const checks: DiagnosticCheck[] = [];
    const base = basePermissions(input.guildId, input.roles, botSubject);
    const missing = GUILD_NEEDS.filter((need) => !(base & DISCORD_PERMISSIONS[need.permission]));
    checks.push(
      missing.length
        ? {
            level: missing.some((need) => need.permission === "MANAGE_ROLES") ? "error" : "warning",
            label: `Permissions manquantes : ${permissionList(missing.map((need) => need.permission))}`,
            detail: `Nécessaires pour ${missing.map((need) => need.usage).join(" ; ")}. Paramètres du serveur → Rôles → ${botRoleName} : coche-les (ou ré-invite Ellie avec le lien des Paramètres du panel).`,
          }
        : { level: "ok", label: base & DISCORD_PERMISSIONS.ADMINISTRATOR ? "Ellie est administratrice du serveur" : "Permissions générales complètes" },
    );

    const sources = new Map<string, string[]>();
    for (const given of input.givenRoles) sources.set(given.roleId, [...(sources.get(given.roleId) ?? []), given.source]);
    const deleted: string[] = [];
    const managed: string[] = [];
    const above: DiagnosticRole[] = [];
    for (const [roleId, from] of sources) {
      const role = roleById.get(roleId);
      if (!role) deleted.push([...new Set(from)].join(", "));
      else if (role.managed) managed.push(`@${role.name}`);
      else if (!botTopRole || role.position >= botTopRole.position) above.push(role);
    }
    if (above.length) {
      const highest = above.reduce((top, role) => (role.position > top.position ? role : top));
      checks.push({
        level: "error",
        label: `Ellie ne peut pas donner ${above.length} rôle${above.length > 1 ? "s" : ""} : ${above.map((role) => `@${role.name}`).join(", ")}`,
        detail: `Ces rôles sont au-dessus du sien. Paramètres du serveur → Rôles : glisse ${botRoleName} au-dessus de « ${highest.name} ».`,
      });
    } else if (sources.size) {
      checks.push({ level: "ok", label: `Rang du rôle : Ellie peut donner les ${sources.size} rôles configurés` });
    }
    if (managed.length) {
      checks.push({
        level: "error",
        label: `Rôles gérés par une intégration : ${managed.join(", ")}`,
        detail: "Discord interdit de les donner à la main (abonné·es Twitch, boosters, bots…) : retire-les des panneaux et des récompenses.",
      });
    }
    if (deleted.length) {
      checks.push({ level: "warning", label: `Rôles supprimés encore configurés (${deleted.join(" ; ")})`, detail: "Retire-les ou choisis-en d'autres dans le panel." });
    }
    return checks;
  }

  function verificationChecks(): DiagnosticCheck[] {
    const buttonChannelId = input.verifyChannelId ?? input.rulesChannelId;
    if (!buttonChannelId) {
      return [{ level: "warning", label: "Aucune vérification configurée", detail: "Page Bienvenue → Règlement et vérification." }];
    }
    const checks: DiagnosticCheck[] = [];
    const accessRole = input.accessRoleId ? roleById.get(input.accessRoleId) : undefined;
    checks.push(
      accessRole
        ? { level: "ok", label: `Le bouton donne @${accessRole.name}` }
        : { level: "error", label: "Le bouton de vérification ne donne aucun rôle", detail: "Page Bienvenue → choisis le rôle donné en validant." },
    );

    const newcomer: PermissionSubject = { userId: null, roleIds: [] };
    const canRead = (channelId: string, subject: PermissionSubject) => {
      const channel = channelById.get(channelId);
      return Boolean(channel) && missingPermissions(channelPermissions(input.guildId, input.roles, channel as DiagnosticChannel, subject), ["VIEW_CHANNEL", "READ_MESSAGE_HISTORY"]).length === 0;
    };
    checks.push(
      canRead(buttonChannelId, newcomer)
        ? { level: "ok", label: `Les nouveaux voient le bouton dans ${channelName(buttonChannelId)}` }
        : {
            level: "error",
            label: `Les nouveaux ne voient pas ${channelName(buttonChannelId)}`,
            detail: "Ils ne peuvent pas cliquer sur le bouton : autorise « Voir les salons » et « Voir les anciens messages » pour @everyone dans ce salon.",
          },
    );
    if (input.rulesChannelId && input.rulesChannelId !== buttonChannelId && !canRead(input.rulesChannelId, newcomer)) {
      checks.push({ level: "warning", label: `Les nouveaux ne voient pas le règlement (${channelName(input.rulesChannelId)})`, detail: "Autorise la lecture pour @everyone dans ce salon." });
    }
    if (accessRole) {
      const verified: PermissionSubject = { userId: null, roleIds: [accessRole.id] };
      for (const channelId of new Set(input.rolePanelChannelIds)) {
        if (channelById.has(channelId) && !canRead(channelId, verified)) {
          checks.push({ level: "warning", label: `Les membres vérifiés ne voient pas ${channelName(channelId)}`, detail: `Autorise la lecture pour @${accessRole.name} dans ce salon pour qu'ils choisissent leurs rôles.` });
        }
      }
      if (input.autoRoleId === accessRole.id) {
        checks.push({
          level: "error",
          label: "Le rôle d'accès est donné automatiquement à l'arrivée",
          detail: "La vérification ne sert alors à rien : page Bienvenue → désactive le rôle automatique ou choisis-en un autre.",
        });
      }
      if (input.joinButtonRoleId === accessRole.id) {
        checks.push({
          level: "warning",
          label: "Le bouton « Rejoindre » du message de bienvenue donne aussi le rôle d'accès",
          detail: "On peut alors entrer sans passer par le règlement : page Bienvenue → désactive ce bouton ou choisis un autre rôle.",
        });
      }
    }
    return checks;
  }

  function channelChecks(): DiagnosticCheck[] {
    if (!input.channelUses.length) return [{ level: "warning", label: "Aucun salon configuré pour l'instant" }];
    return input.channelUses.map((use) => {
      const channel = channelById.get(use.channelId);
      if (!channel) return { level: "error", label: `${use.label} : salon supprimé`, detail: "Choisis un autre salon dans le panel." };
      const missing = missingPermissions(channelPermissions(input.guildId, input.roles, channel, botSubject), use.needs);
      return missing.length
        ? {
            level: "error",
            label: `${use.label} · #${channel.name} : il manque ${permissionList(missing)}`,
            detail: `Modifier le salon → Permissions → ajoute le rôle ${botRoleName} et autorise : ${permissionList(missing)}.`,
          }
        : { level: "ok", label: `${use.label} · #${channel.name}` };
    });
  }
}

/** Nombre de vérifications par niveau, pour le résumé. */
export function countChecks(sections: readonly DiagnosticSection[]): Record<CheckLevel, number> {
  const counts: Record<CheckLevel, number> = { ok: 0, warning: 0, error: 0 };
  for (const check of sections.flatMap((section) => section.checks)) counts[check.level]++;
  return counts;
}
