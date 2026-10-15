import { AttachmentBuilder } from "discord.js";
import { BOT_NAME, communityLabel, findAutoModMatch, STREAMER_NAME } from "@ellie/database/shared";
import { getCommunityName } from "../lib/cache.js";
import { brandEmbed, COLORS } from "../lib/embeds.js";
import { renderHugImage } from "../lib/images.js";
import { logError } from "../lib/log.js";
import { replyEphemeral } from "../lib/replies.js";
import type { SlashCommand } from "../types.js";
import { slash } from "./builder.js";

export const hello: SlashCommand = {
  data: slash("hello", "Dis bonjour à Ellie."),
  async execute(interaction) {
    const community = communityLabel(await getCommunityName());
    await interaction.reply({
      content: `Salut <@${interaction.user.id}> ! Moi c'est **${BOT_NAME}**, le bot de ${community} de ${STREAMER_NAME} 💜 Tape \`/help\` pour voir tout ce que je sais faire.`,
      allowedMentions: { users: [interaction.user.id] },
    });
  },
};

export const hug: SlashCommand = {
  data: slash("hug", "Fais un câlin à un membre (image générée).").addUserOption((option) =>
    option.setName("membre").setDescription("La personne à câliner").setRequired(true),
  ),
  async execute(interaction) {
    const target = interaction.options.getUser("membre", true);
    const fromMember = interaction.member;
    const toMember = await interaction.guild.members.fetch(target.id).catch(() => null);
    const fromName = fromMember.displayName;
    const toName = toMember?.displayName ?? target.username;
    const caption = target.id === interaction.user.id ? `${fromName} se fait un câlin, c'est important aussi !` : `${fromName} fait un câlin à ${toName} !`;

    await interaction.deferReply();
    try {
      const image = await renderHugImage({
        fromAvatarUrl: fromMember.displayAvatarURL({ extension: "png", size: 256 }),
        toAvatarUrl: (toMember ?? target).displayAvatarURL({ extension: "png", size: 256 }),
        caption,
      });
      await interaction.editReply({
        content: `🤗 <@${interaction.user.id}> fait un câlin à <@${target.id}> !`,
        files: [new AttachmentBuilder(image, { name: "calin.png" })],
        allowedMentions: { users: [target.id] },
      });
    } catch (error) {
      logError(`/hug (serveur ${interaction.guildId})`, error);
      await interaction.editReply({ content: `🤗 ${caption}`, allowedMentions: { parse: [] } });
    }
  },
};

const DEFAULT_SUBREDDITS = ["rance", "MemesFR", "france"];
const MAX_MEME_ATTEMPTS = 5;

interface MemeApiResponse {
  postLink: string;
  subreddit: string;
  title: string;
  url: string;
  nsfw: boolean;
  spoiler: boolean;
  author: string;
  ups: number;
}

export const meme: SlashCommand = {
  data: slash("meme", "Affiche un mème (sous-reddits francophones par défaut).").addStringOption((option) =>
    option.setName("subreddit").setDescription("Sous-reddit (sans r/)").setMaxLength(50),
  ),
  async execute(interaction) {
    const requested = interaction.options.getString("subreddit")?.trim().replace(/^r\//i, "");
    if (requested && !/^[A-Za-z0-9_]{2,50}$/.test(requested)) {
      await replyEphemeral(interaction, "Nom de sous-reddit invalide.");
      return;
    }
    await interaction.deferReply();

    for (let attempt = 0; attempt < MAX_MEME_ATTEMPTS; attempt++) {
      const subreddit = requested ?? DEFAULT_SUBREDDITS[Math.floor(Math.random() * DEFAULT_SUBREDDITS.length)];
      try {
        const response = await fetch(`https://meme-api.com/gimme/${encodeURIComponent(subreddit ?? "france")}`, {
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) continue;
        const data = (await response.json()) as Partial<MemeApiResponse>;
        if (!data.url || !data.title || data.nsfw || data.spoiler) continue;
        if (findAutoModMatch("MEDIUM", data.title)) continue;
        const embed = brandEmbed(COLORS.blush)
          .setTitle(data.title.slice(0, 256))
          .setURL(data.postLink ?? null)
          .setImage(data.url)
          .setFooter({ text: `r/${data.subreddit ?? subreddit} · 👍 ${data.ups ?? 0} · ${BOT_NAME}` });
        await interaction.editReply({ embeds: [embed] });
        return;
      } catch (error) {
        logError(`/meme (tentative ${attempt + 1}, r/${subreddit})`, error);
      }
    }
    await interaction.editReply({ content: "😕 Impossible de trouver un mème convenable pour l'instant, réessaie plus tard." });
  },
};

export const funCommands: SlashCommand[] = [hello, hug, meme];
