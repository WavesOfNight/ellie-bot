import type { Prisma } from "@prisma/client";
import { prisma } from "./client.js";

/**
 * Le « Cat Café de missTsune » : le serveur a été reconstruit par l'ancien bot (commande /setup),
 * qui a créé les rôles, les salons et leurs permissions. Ce module branche Ellie sur cette
 * structure : panneau de rôles, règlement, vérification, tickets, signalements, logs, niveaux et
 * alerte de live. Les identifiants sont ceux enregistrés par l'ancien bot.
 *
 * L'application est idempotente : elle peut être relancée sans créer de doublons et ne supprime
 * rien sur Discord.
 */

interface PresetOption {
  roleId: string;
  emoji: string;
  label: string;
  description?: string;
}

interface PresetGroup {
  /** Clé stable du groupe (aussi utilisée par les boutons `roles:ouvrir:<clé>` des anciens bots) */
  key: string;
  emoji: string;
  title: string;
  help: string;
  multiple: boolean;
  options: PresetOption[];
}

const ROLES = {
  tsune: "1560953244317126736",
  gerant: "1560237522653683755",
  modo: "1560953247257329724",
  helper: "1560237525258211410",
  /** 🤖 Robots du Café : donne aux bots l'accès aux salons */
  bots: "1560953248657973280",
  /** 🐾 Client·e du Café : rôle obtenu avec le bouton de vérification */
  membre: "1560953262700761151",
  niv1: "1560953262109237312",
  niv2: "1560953252093362218",
  niv3: "1560953251044532224",
  niv4: "1560953249954136074",
  notifLives: "1560237571580235858",
} as const;

const CHANNELS = {
  rules: "1560237607198130267",
  verification: "1560953273228337252",
  roles: "1560953274369310852",
  help: "1560953277598802014",
  chat: "1560953280279093389",
  lives: "1560953291335008367",
  spoilers: "1560953333047496724",
  logs: "1560237711250694194",
  reports: "1560953383677067357",
  archives: "1560953384964591707",
  ticketCategory: "1560953389267947530",
} as const;

const GROUPS: PresetGroup[] = [
  {
    key: "pronoms",
    emoji: "💬",
    title: "Pronoms",
    help: "Pour que tout le monde te genre correctement.",
    multiple: true,
    options: [
      { roleId: "1560237551753895956", emoji: "💙", label: "il/lui", description: "Genre-moi au masculin" },
      { roleId: "1560237553163051008", emoji: "💗", label: "elle/la", description: "Genre-moi au féminin" },
      { roleId: "1560237563627835472", emoji: "💛", label: "iel", description: "Genre-moi au neutre" },
      { roleId: "1560237565817393172", emoji: "💜", label: "tous les pronoms", description: "Tant que c'est gentil, je prends tout" },
      { roleId: "1560237569646788648", emoji: "💬", label: "demande-moi mes pronoms", description: "Pose-moi la question, je ne griffe pas" },
    ],
  },
  {
    key: "couleurs",
    emoji: "🎨",
    title: "Couleur",
    help: "Une seule couleur de pseudo à la fois (version pâtisserie du café).",
    multiple: false,
    options: [
      { roleId: "1560237532363624458", emoji: "🍓", label: "Fraise", description: "Rose bonbon, énergie de magical girl" },
      { roleId: "1560237533370261544", emoji: "🍑", label: "Pêche", description: "Doux comme un blush bien estompé" },
      { roleId: "1560237534431281242", emoji: "🍋", label: "Citron", description: "Pétillant·e et un peu acide" },
      { roleId: "1560237535429656626", emoji: "🍵", label: "Matcha", description: "Zen, posé·e, latte à la main" },
      { roleId: "1560237536507338822", emoji: "🧊", label: "Menthe glacée", description: "Fraîcheur maximale" },
      { roleId: "1560237537497456680", emoji: "🫐", label: "Myrtille", description: "Bleu gourmand" },
      { roleId: "1560237539439288340", emoji: "🪻", label: "Lavande", description: "Mystérieux·se et apaisant·e" },
      { roleId: "1560237540487725117", emoji: "🌸", label: "Sakura", description: "Main character en avril" },
      { roleId: "1560237541716795444", emoji: "☁️", label: "Nuage", description: "Tout doux, tout léger" },
      { roleId: "1560237542878744648", emoji: "🍫", label: "Chocolat", description: "Réconfortant comme un goûter" },
      { roleId: "1560237544061403167", emoji: "🌙", label: "Minuit", description: "Pour les chats de nuit" },
    ],
  },
  {
    key: "notifs",
    emoji: "🔔",
    title: "Notifications",
    help: "Choisis pour quoi tu acceptes d'être ping.",
    multiple: true,
    options: [
      { roleId: ROLES.notifLives, emoji: "🔴", label: "Notif Lives", description: "Ping quand Tsune lance un live" },
      { roleId: "1560237572935122995", emoji: "📢", label: "Notif Annonces", description: "Ping pour les grosses annonces" },
      { roleId: "1560237573866000438", emoji: "🎬", label: "Notif Vidéos & TikTok", description: "Ping pour chaque nouveau contenu" },
      { roleId: "1560237575199789147", emoji: "🎉", label: "Notif Events", description: "Soirées jeux, watch parties, concours" },
      { roleId: "1560237576357543966", emoji: "🎮", label: "Dispo pour jouer", description: "Les autres peuvent te ping pour une partie" },
    ],
  },
  {
    key: "passions",
    emoji: "✨",
    title: "Passions",
    help: "Montre ce qui te fait vibrer.",
    multiple: true,
    options: [
      { roleId: "1560237577414381589", emoji: "🎮", label: "Gamer·euse", description: "Manette, clavier ou Game Boy de 1998" },
      { roleId: "1560237578618409071", emoji: "💄", label: "Make-up addict", description: "Ta palette préférée est un sujet sérieux" },
      { roleId: "1560237579830562886", emoji: "🍥", label: "Otaku", description: "Ta watchlist fait 400 lignes" },
      { roleId: "1560237580677677099", emoji: "☀️", label: "Team IRL", description: "Balades, food, lifestyle" },
      { roleId: "1560237581965336628", emoji: "🖌️", label: "Âme d'artiste", description: "Dessin, montage, musique, crochet…" },
      { roleId: "1560237582548471851", emoji: "🎵", label: "Mélomane", description: "Toujours un casque sur les oreilles" },
      { roleId: "1560953264055263263", emoji: "🐈", label: "Team chats", description: "Tu dis bonjour à tous les chats" },
      { roleId: "1560237584893083739", emoji: "🎎", label: "Cosplayeur·euse", description: "Perruques, couture et pistolet à colle" },
    ],
  },
  {
    key: "jeux",
    emoji: "🎮",
    title: "Jeux",
    help: "Pour trouver des potes de partie.",
    multiple: true,
    options: [
      { roleId: "1560237586276945922", emoji: "🎯", label: "Valorant" },
      { roleId: "1560237588646854706", emoji: "⚔️", label: "League of Legends" },
      { roleId: "1560237591469629514", emoji: "🪂", label: "Fortnite" },
      { roleId: "1560237592824516618", emoji: "⛏️", label: "Minecraft" },
      { roleId: "1560237594162368553", emoji: "🌠", label: "Gacha games", description: "Genshin, HSR, ZZZ… et nos pulls ratés" },
      { roleId: "1560237595366260807", emoji: "🍃", label: "Cozy games", description: "Animal Crossing, Stardew, Sims…" },
      { roleId: "1560237596653785139", emoji: "⚡", label: "Pokémon" },
      { roleId: "1560237597693841449", emoji: "🍄", label: "Mario Kart & Nintendo" },
      { roleId: "1560237598717251645", emoji: "👻", label: "Jeux d'horreur", description: "Pour crier ensemble en vocal" },
      { roleId: "1560237599426351177", emoji: "🎲", label: "Party games", description: "Among Us, Gartic Phone, Jackbox…" },
    ],
  },
];

const RULES_CONTENT = [
  "Bienvenue au **Cat Café de missTsune** ! 🐱☕",
  "Ici c'est une **safe place** : tout le monde doit pouvoir se sentir bien, peu importe son genre, son orientation, ses origines, son corps, son âge ou son niveau à Mario Kart.",
  "",
  "**1.** 💖 **Bienveillance obligatoire** — Le second degré c'est top, tant que *tout le monde* rigole. Si quelqu'un dit stop, c'est stop.",
  "**2.** 🚫 **Zéro discrimination** — Racisme, sexisme, LGBTQIA+phobie, validisme, grossophobie… = ban direct, sans passer par la case départ.",
  "**3.** 💄 **Pas de commentaires sur le physique** — On complimente, on ne critique pas. Les conseils make-up/mode : seulement si on les demande.",
  "**4.** 🔞 **Tout public** — Pas de NSFW, de gore ni de contenu choquant. Le café est un endroit doux.",
  "**5.** 🔐 **Ta vie privée est sacrée** — Pas d'infos perso (adresse, numéro, école, photos de quelqu'un…), ni les tiennes, ni celles des autres.",
  "**6.** 📩 **DM = consentement** — Demande avant d'écrire en privé. DM non désirés et drague insistante = sanction.",
  "**7.** 🏳️‍🌈 **Respecte les pronoms** — Ils sont dans les rôles de chacun·e. Une erreur, ça arrive : on s'excuse et on avance.",
  `**8.** 🤐 **Spoilers sous balise** — ||comme ça||, et les gros spoilers dans <#${CHANNELS.spoilers}>.`,
  "**9.** 📢 **Pas de pub** — Pas de lien vers d'autres serveurs, chaînes ou boutiques sans l'accord du staff.",
  "**10.** 🎮 **Pendant les lives** — Pas de backseat non demandé, pas de spoil du jeu, et on ne ramène pas les embrouilles du chat Twitch ici.",
  `**11.** 🛡️ **Le staff est là pour toi** — Un souci ? Ouvre un ticket dans <#${CHANNELS.help}>. Pas de vengeance perso, pas de drama public.`,
  "**12.** 📱 **Règles de Discord** — 13 ans minimum et respect des [conditions d'utilisation de Discord](https://discord.com/terms).",
  "",
  "🍕 **Règle bonus** — Le débat « ananas sur la pizza » est autorisé, mais à vos risques et périls.",
  "",
  "**⚖️ Les sanctions** — Rappel → avertissement → exclusion temporaire → kick → ban. Selon la gravité, le staff peut sauter des étapes.",
].join("\n");

export const CAT_CAFE = {
  guildId: "1560225372052660224",
  roles: ROLES,
  channels: CHANNELS,
  /** Règlement publié par le bot du Terrier dans le même salon : mis à jour (ou remplacé) au lieu d'être doublé. */
  legacyRulesMessageId: "1560237866590801932",
  /** Gestion des tickets : toute l'équipe ; mentionnés à l'ouverture : Gardien·nes et Anges gardien·nes. */
  ticketStaffRoleIds: [ROLES.tsune, ROLES.gerant, ROLES.modo, ROLES.helper],
  ticketPingRoleIds: [ROLES.modo, ROLES.helper],
  panel: {
    title: "🎀 Customise ton petit chaton !",
    description:
      "Pronoms, couleur, notifs, jeux… Customise-toi comme un perso de RPG 🎮\nClique sur un bouton, coche ce qui te ressemble, valide. Tu peux revenir changer quand tu veux !",
    color: "#FF7EB6",
  },
  groups: GROUPS,
  rules: {
    title: "📜 Le Règlement du Cat Café",
    content: RULES_CONTENT,
    buttonLabel: "J'ai lu le règlement, j'entre !",
  },
  verification: {
    title: "🐾 Bienvenue au Cat Café de missTsune !",
    content: "Avant d'entrer, lis le {rules} 📜\nQuand c'est fait, clique sur le bouton : tout le café s'ouvre à toi ☕🐱",
    buttonEmoji: "🐾",
    reply: `🎉 **Bienvenue au Cat Café !** Installe-toi, les chats t'attendent 🐱\n🎀 Choisis tes rôles dans {roles}, puis viens dire coucou dans <#${CHANNELS.chat}> !`,
  },
  /** 🍼 Chaton → ✨ Neko légendaire */
  levelRewards: [
    { level: 1, roleId: ROLES.niv1 },
    { level: 10, roleId: ROLES.niv2 },
    { level: 20, roleId: ROLES.niv3 },
    { level: 35, roleId: ROLES.niv4 },
  ],
  liveAlert: {
    twitchLogin: "misstsune",
    message: `🔴 <@&${ROLES.notifLives}> **{channel}** est en live ! Viens vite au café 🐱☕ {url}`,
  },
} as const;

export interface CatCafeResult {
  groups: number;
  options: number;
  /** Récompenses de niveau créées (0 si le serveur en avait déjà) */
  levelRewards: number;
  /** Alerte de live Twitch créée (false si une alerte Twitch existait déjà) */
  liveAlert: boolean;
}

/** Garde l'identifiant d'un message publié tant que son salon ne change pas. */
const keepMessage = (channelId: string | null, messageId: string | null, target: string): string | null => (channelId === target ? messageId : null);

/**
 * Applique la configuration du Cat Café. Les réglages tickets, règlement et vérification sont
 * remplacés ; le panneau de rôles est aligné sur la structure du serveur ; les récompenses de
 * niveau et l'alerte de live ne sont créées que si le serveur n'en a pas encore.
 */
export async function applyCatCafeConfig(guildId: string): Promise<CatCafeResult> {
  if (guildId !== CAT_CAFE.guildId) throw new Error("Ce serveur n'est pas le Cat Café de missTsune.");
  const preset = CAT_CAFE;

  return prisma.$transaction(async (tx) => {
    const previous = await tx.guild.upsert({ where: { id: guildId }, create: { id: guildId }, update: {} });
    await tx.guild.update({
      where: { id: guildId },
      data: {
        modLogChannelId: previous.modLogChannelId ?? preset.channels.logs,
        ticketCategoryId: preset.channels.ticketCategory,
        ticketStaffRoleIds: preset.ticketStaffRoleIds.join(","),
        ticketPingRoleIds: preset.ticketPingRoleIds.join(","),
        ticketPanelChannelId: preset.channels.help,
        ticketPanelMessageId: keepMessage(previous.ticketPanelChannelId, previous.ticketPanelMessageId, preset.channels.help),
        ticketArchiveChannelId: preset.channels.archives,
        reportChannelId: preset.channels.reports,
        rulesRoleId: preset.roles.membre,
        rulesChannelId: preset.channels.rules,
        rulesMessageId: keepMessage(previous.rulesChannelId, previous.rulesMessageId, preset.channels.rules) ?? preset.legacyRulesMessageId,
        rulesTitle: preset.rules.title,
        rulesContent: preset.rules.content,
        rulesButtonLabel: preset.rules.buttonLabel,
        verifyChannelId: preset.channels.verification,
        verifyMessageId: keepMessage(previous.verifyChannelId, previous.verifyMessageId, preset.channels.verification),
        verifyTitle: preset.verification.title,
        verifyContent: preset.verification.content,
        verifyButtonEmoji: preset.verification.buttonEmoji,
        verifyReply: preset.verification.reply,
      },
    });

    const panel = await syncRolePanel(tx, guildId);

    const levelRewards = (await tx.levelReward.count({ where: { guildId } }))
      ? 0
      : (await tx.levelReward.createMany({ data: preset.levelRewards.map((reward) => ({ guildId, ...reward })) })).count;

    let liveAlert = false;
    if (!(await tx.socialAlert.count({ where: { guildId, platform: "TWITCH" } }))) {
      const twitch = await tx.twitchBotConfig.findUnique({ where: { id: 1 } });
      await tx.socialAlert.create({
        data: {
          guildId,
          platform: "TWITCH",
          channelRef: (twitch?.channelName || preset.liveAlert.twitchLogin).toLowerCase(),
          discordChannelId: preset.channels.lives,
          message: preset.liveAlert.message,
        },
      });
      liveAlert = true;
    }

    return { ...panel, levelRewards, liveAlert };
  });
}

/** Aligne le panneau de rôles (reconnu à ses groupes à clé) sur la structure du Cat Café. */
async function syncRolePanel(tx: Prisma.TransactionClient, guildId: string): Promise<{ groups: number; options: number }> {
  const { panel: look, groups } = CAT_CAFE;
  const channelId = CAT_CAFE.channels.roles;
  const existing = await tx.reactionRoleMessage.findFirst({
    where: { guildId, groups: { some: { legacyKey: { not: null } } } },
    include: { groups: true },
  });
  const appearance = { channelId, title: look.title, description: look.description, color: look.color, dirty: true };
  const panel = existing
    ? await tx.reactionRoleMessage.update({
        where: { id: existing.id },
        data: { ...appearance, messageId: keepMessage(existing.channelId, existing.messageId, channelId) },
      })
    : await tx.reactionRoleMessage.create({ data: { guildId, ...appearance } });

  let options = 0;
  for (const [order, group] of groups.entries()) {
    const data = { title: group.title, emoji: group.emoji, help: group.help, display: "MENU", multiple: group.multiple, order };
    const current = existing?.groups.find((candidate) => candidate.legacyKey === group.key);
    const saved = current
      ? await tx.reactionRoleGroup.update({ where: { id: current.id }, data })
      : await tx.reactionRoleGroup.create({ data: { ...data, panelId: panel.id, legacyKey: group.key } });

    await tx.reactionRoleOption.deleteMany({ where: { groupId: saved.id, roleId: { notIn: group.options.map((option) => option.roleId) } } });
    for (const [index, option] of group.options.entries()) {
      const optionData = { label: option.label, emoji: option.emoji, description: option.description ?? null, order: index };
      await tx.reactionRoleOption.upsert({
        where: { groupId_roleId: { groupId: saved.id, roleId: option.roleId } },
        create: { groupId: saved.id, roleId: option.roleId, ...optionData },
        update: optionData,
      });
    }
    options += group.options.length;
  }
  return { groups: groups.length, options };
}
