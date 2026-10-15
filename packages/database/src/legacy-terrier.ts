import { prisma } from "./client.js";
import { DEFAULT_ROLE_PANEL_DESCRIPTION } from "./panels.js";

/**
 * Reprise de la configuration de l'ancien bot du « Terrier de missTsune » : menus de rôles,
 * tickets, signalements anonymes et règlement, avec les identifiants des rôles et salons que
 * l'ancien bot avait créés sur le serveur. L'import est idempotent et ne supprime rien.
 */

interface LegacyOption {
  roleId: string;
  emoji: string;
  label: string;
  description?: string;
}

interface LegacyGroup {
  key: string;
  emoji: string;
  title: string;
  help: string;
  multiple: boolean;
  options: LegacyOption[];
}

export const LEGACY_TERRIER = {
  guildId: "1560225372052660224",
  channels: {
    rules: "1560237607198130267",
    roles: "1560237608624197632",
    help: "1560237612218847252",
    ticketCategory: "1560237719383314483",
    archives: "1560237714757124187",
    reports: "1560237712932343828",
  },
  /** Messages déjà publiés par l'ancien bot (repris tels quels si Ellie utilise la même application Discord). */
  messages: {
    rules: "1560237866590801932",
    roles: "1560237868289364041",
    help: "1560237869908365313",
  },
  roles: {
    member: "1560237550537416855",
    /** Miss Tsune, Bras droit, Gardien·ne, Petit·e Ange Gardien·ne */
    staff: ["1560237520984346674", "1560237522653683755", "1560237524209893496", "1560237525258211410"],
    /** Gardien·ne et Petit·e Ange Gardien·ne sont mentionné·es à l'ouverture d'un ticket */
    ticketPing: ["1560237524209893496", "1560237525258211410"],
  },
  panel: {
    title: "🎀 Customise ton petit renard !",
    description:
      "Clique sur un bouton, coche ce qui te ressemble, valide. C'est tout !\nTu peux revenir changer quand tu veux (on ne juge pas les crises d'identité capillaire 💇).",
    color: "#FF7EB6",
  },
  groups: [
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
        { roleId: "1560237569646788648", emoji: "💬", label: "demande-moi mes pronoms", description: "Pose-moi la question, je ne mords pas" },
      ],
    },
    {
      key: "notifs",
      emoji: "🔔",
      title: "Notifications",
      help: "Choisis pour quoi tu acceptes d'être ping.",
      multiple: true,
      options: [
        { roleId: "1560237571580235858", emoji: "🔴", label: "Notif Lives", description: "Ping quand Tsune lance un live" },
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
        { roleId: "1560237583961952366", emoji: "🐾", label: "Team animaux", description: "Tu dis bonjour à tous les chats" },
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
    {
      key: "couleurs",
      emoji: "🎨",
      title: "Couleur",
      help: "Une seule couleur à la fois (on n'est pas un arc-en-ciel… quoique).",
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
        { roleId: "1560237544061403167", emoji: "🌙", label: "Minuit", description: "Pour les oiseaux (renards ?) de nuit" },
      ],
    },
  ] satisfies LegacyGroup[],
  rules: {
    title: "📜 Le Règlement du Terrier",
    buttonLabel: "J'ai lu et j'accepte le règlement",
    content: [
      "Bienvenue chez **missTsune** ! 🦊💕",
      "Ici c'est une **safe place** : tout le monde doit pouvoir se sentir bien, peu importe son genre, son orientation, ses origines, son corps, son âge ou son niveau à Mario Kart.",
      "",
      "**1.** 💖 **Bienveillance obligatoire** — Le second degré c'est top, tant que *tout le monde* rigole. Si quelqu'un dit stop, c'est stop.",
      "**2.** 🚫 **Zéro discrimination** — Racisme, sexisme, LGBTQIA+phobie, validisme, grossophobie… = ban direct, sans passer par la case départ.",
      "**3.** 💄 **Pas de commentaires sur le physique** — On complimente, on ne critique pas. Les conseils make-up/mode : seulement si on les demande.",
      "**4.** 🔞 **Tout public** — Pas de NSFW, de gore ni de contenu choquant. Le terrier est un endroit doux.",
      "**5.** 🔐 **Ta vie privée est sacrée** — Pas d'infos perso (adresse, numéro, école, photos de quelqu'un…), ni les tiennes, ni celles des autres.",
      "**6.** 📩 **DM = consentement** — Demande avant d'écrire en privé. DM non désirés et drague insistante = sanction.",
      "**7.** 🏳️‍🌈 **Respecte les pronoms** — Ils sont dans les rôles de chacun·e. Une erreur, ça arrive : on s'excuse et on avance.",
      "**8.** 🤐 **Spoilers sous balise** — ||comme ça||. Spoiler la fin d'un anime est un crime contre l'humanité (presque).",
      "**9.** 📢 **Pas de pub** — Pas de lien vers d'autres serveurs, chaînes ou boutiques sans l'accord du staff.",
      "**10.** 🎮 **Pendant les lives** — Pas de backseat non demandé, pas de spoil du jeu, et on ne ramène pas les embrouilles du chat Twitch ici.",
      "**11.** 🛡️ **Le staff est là pour toi** — Un souci ? Ouvre un ticket dans 🆘・aide-et-signalements. Pas de vengeance perso, pas de drama public.",
      "**12.** 📱 **Règles de Discord** — 13 ans minimum et respect des [conditions d'utilisation de Discord](https://discord.com/terms).",
      "",
      "🍕 **Règle bonus** — Le débat « ananas sur la pizza » est autorisé, mais à vos risques et périls.",
      "",
      "**⚖️ Les sanctions** — Rappel → avertissement → exclusion temporaire → kick → ban. Selon la gravité, le staff peut sauter des étapes.",
    ].join("\n"),
  },
} as const;

export interface LegacyImportResult {
  panelCreated: boolean;
  groups: number;
  options: number;
}

/**
 * Importe la configuration de l'ancien bot sur son serveur. Les réglages tickets / règlement sont
 * écrasés par ceux de l'ancien bot ; le panneau de rôles n'est créé qu'une fois.
 */
export async function importLegacyTerrier(guildId: string): Promise<LegacyImportResult> {
  if (guildId !== LEGACY_TERRIER.guildId) throw new Error("Ce serveur n'est pas celui de l'ancien bot du Terrier.");
  const legacy = LEGACY_TERRIER;

  return prisma.$transaction(async (tx) => {
    await tx.guild.upsert({ where: { id: guildId }, create: { id: guildId }, update: {} });
    await tx.guild.update({
      where: { id: guildId },
      data: {
        ticketCategoryId: legacy.channels.ticketCategory,
        ticketStaffRoleIds: legacy.roles.staff.join(","),
        ticketPingRoleIds: legacy.roles.ticketPing.join(","),
        ticketPanelChannelId: legacy.channels.help,
        ticketPanelMessageId: legacy.messages.help,
        ticketArchiveChannelId: legacy.channels.archives,
        reportChannelId: legacy.channels.reports,
        rulesRoleId: legacy.roles.member,
        rulesChannelId: legacy.channels.rules,
        rulesMessageId: legacy.messages.rules,
        rulesTitle: legacy.rules.title,
        rulesContent: legacy.rules.content,
        rulesButtonLabel: legacy.rules.buttonLabel,
      },
    });

    const existing = await tx.reactionRoleGroup.findFirst({ where: { legacyKey: { not: null }, panel: { guildId } } });
    if (existing) return { panelCreated: false, groups: 0, options: 0 };

    let options = 0;
    await tx.reactionRoleMessage.create({
      data: {
        guildId,
        channelId: legacy.channels.roles,
        messageId: legacy.messages.roles,
        title: legacy.panel.title,
        description: legacy.panel.description || DEFAULT_ROLE_PANEL_DESCRIPTION,
        color: legacy.panel.color,
        groups: {
          create: legacy.groups.map((group, order) => {
            options += group.options.length;
            return {
              title: group.title,
              emoji: group.emoji,
              help: group.help,
              display: "MENU",
              multiple: group.multiple,
              order,
              legacyKey: group.key,
              options: {
                create: group.options.map((option, index) => ({
                  roleId: option.roleId,
                  label: option.label,
                  emoji: option.emoji,
                  description: "description" in option ? option.description : null,
                  order: index,
                })),
              },
            };
          }),
        },
      },
    });
    return { panelCreated: true, groups: legacy.groups.length, options };
  });
}
