"use server";

import { revalidatePath } from "next/cache";
import { prisma, safeFetch, setSlashCommandEnabled, UnsafeUrlError } from "@ellie/database";
import { AUTOMOD_LEVELS, DEFAULT_WELCOME_TEXT_COLOR, isHexColor, SLASH_COMMAND_NAMES } from "@ellie/database/shared";
import { checkbox, FormError, handle, integer, ok, oneOf, optionalInteger, optionalText, snowflake, text, type ActionState } from "@/lib/forms";
import { guildFromForm, guildIdSets } from "@/lib/guild";

const path = (guildId: string, page: string) => `/dashboard/${guildId}/${page}`;

async function validateBackgroundUrl(url: string): Promise<void> {
  if (!/^https:\/\//i.test(url)) throw new FormError("L'image de fond doit être une URL en https://.");
  try {
    const response = await safeFetch(url, { method: "GET", timeoutMs: 8_000, maxBytes: 8 * 1024 * 1024 });
    if (response.status < 200 || response.status >= 300) throw new FormError(`Image inaccessible (HTTP ${response.status}).`);
    if (!response.contentType.startsWith("image/")) throw new FormError("Cette URL ne pointe pas vers une image.");
  } catch (error) {
    if (error instanceof FormError) throw error;
    if (error instanceof UnsafeUrlError) throw new FormError(error.message);
    throw new FormError("Impossible de charger l'image (trop lourde, trop lente ou introuvable).");
  }
}

export async function saveWelcomeAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const ids = await guildIdSets(guildId);
    const backgroundUrl = optionalText(form, "imageBackgroundUrl", 500);
    if (backgroundUrl) await validateBackgroundUrl(backgroundUrl);
    const imageTextColor = text(form, "imageTextColor") || DEFAULT_WELCOME_TEXT_COLOR;
    if (!isHexColor(imageTextColor)) throw new FormError("La couleur du texte doit être au format #RRVVBB.");
    const data = {
      channelId: snowflake(form, "channelId", ids.text),
      message: text(form, "message", { max: 1500 }),
      imageEnabled: form.get("mode") === "image",
      imageText: text(form, "imageText", { max: 100 }) || "Bienvenue {user} !",
      imageTextColor: imageTextColor.toUpperCase(),
      imageBackgroundUrl: backgroundUrl,
      dmEnabled: checkbox(form, "dmEnabled"),
      dmMessage: text(form, "dmMessage", { max: 1500 }),
      autoRoleEnabled: checkbox(form, "autoRoleEnabled"),
      autoRoleId: snowflake(form, "autoRoleId", ids.roles),
      reactionRoleEnabled: checkbox(form, "reactionRoleEnabled"),
      reactionRoleId: snowflake(form, "reactionRoleId", ids.roles),
    };
    if (data.autoRoleEnabled && !data.autoRoleId) throw new FormError("Choisis le rôle automatique.");
    if (data.reactionRoleEnabled && !data.reactionRoleId) throw new FormError("Choisis le rôle du bouton « Rejoindre ».");
    await prisma.welcomeConfig.upsert({ where: { guildId }, create: { guildId, ...data }, update: data });
    revalidatePath(path(guildId, "welcome"));
    return ok("Bienvenue enregistrée.");
  });
}

export async function saveModerationAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const ids = await guildIdSets(guildId);
    const threshold = (key: string, label: string) => optionalInteger(form, key, { min: 1, max: 100 }, label);
    await prisma.guild.update({
      where: { id: guildId },
      data: {
        modLogChannelId: snowflake(form, "modLogChannelId", ids.text),
        autoModLevel: oneOf(form, "autoModLevel", AUTOMOD_LEVELS, "OFF"),
        filterInvites: checkbox(form, "filterInvites"),
        filterLinks: checkbox(form, "filterLinks"),
        filterCaps: checkbox(form, "filterCaps"),
        filterSpam: checkbox(form, "filterSpam"),
        logMessageDelete: checkbox(form, "logMessageDelete"),
        logMessageEdit: checkbox(form, "logMessageEdit"),
        logMemberJoin: checkbox(form, "logMemberJoin"),
        logMemberLeave: checkbox(form, "logMemberLeave"),
        warnMuteThreshold: threshold("warnMuteThreshold", "Le seuil de mute"),
        warnKickThreshold: threshold("warnKickThreshold", "Le seuil d'expulsion"),
        warnBanThreshold: threshold("warnBanThreshold", "Le seuil de bannissement"),
      },
    });
    revalidatePath(path(guildId, "moderation"));
    return ok("Modération enregistrée.");
  });
}

export async function saveSlashTogglesAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    for (const name of SLASH_COMMAND_NAMES) await setSlashCommandEnabled(guildId, name, checkbox(form, `cmd:${name}`));
    revalidatePath(path(guildId, "slash-commands"));
    return ok("Commandes slash mises à jour (effet sous 5 secondes).");
  });
}

export async function saveStarboardAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const ids = await guildIdSets(guildId);
    const emoji = text(form, "starboardEmoji", { max: 64 }) || "⭐";
    await prisma.guild.update({
      where: { id: guildId },
      data: {
        starboardChannelId: snowflake(form, "starboardChannelId", ids.text),
        starboardEmoji: emoji,
        starboardThreshold: integer(form, "starboardThreshold", { min: 1, max: 100 }, "Le seuil"),
      },
    });
    revalidatePath(path(guildId, "starboard"));
    return ok("Starboard enregistré.");
  });
}

export async function saveVoiceAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const ids = await guildIdSets(guildId);
    const template = text(form, "hubChannelNameTemplate", { max: 100 }) || "🔊 Salon de {user}";
    await prisma.guild.update({
      where: { id: guildId },
      data: { hubVoiceChannelId: snowflake(form, "hubVoiceChannelId", ids.voice), hubChannelNameTemplate: template },
    });
    revalidatePath(path(guildId, "voice"));
    return ok("Salons vocaux enregistrés.");
  });
}

export async function saveStatsChannelAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const ids = await guildIdSets(guildId);
    await prisma.guild.update({ where: { id: guildId }, data: { statsChannelId: snowflake(form, "statsChannelId", ids.voice) } });
    revalidatePath(path(guildId, "alerts"));
    return ok("Salon de statistiques enregistré (mis à jour toutes les 10 minutes).");
  });
}

export async function addLevelRewardAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const ids = await guildIdSets(guildId);
    const level = integer(form, "level", { min: 1, max: 50 }, "Le niveau");
    const roleId = snowflake(form, "roleId", ids.roles);
    if (!roleId) throw new FormError("Choisis un rôle.");
    await prisma.levelReward.upsert({ where: { guildId_level: { guildId, level } }, create: { guildId, level, roleId }, update: { roleId } });
    revalidatePath(path(guildId, "levels"));
    return ok(`Récompense du niveau ${level} enregistrée.`);
  });
}

export async function deleteLevelRewardAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    await prisma.levelReward.deleteMany({ where: { guildId, id: integer(form, "id", { min: 1, max: Number.MAX_SAFE_INTEGER }) } });
    revalidatePath(path(guildId, "levels"));
    return ok("Récompense supprimée.");
  });
}
