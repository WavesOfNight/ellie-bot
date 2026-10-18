"use server";

import { revalidatePath } from "next/cache";
import { isAllowedModel } from "@ellie/ai";
import {
  cancelTwitchGiveaway,
  clearTwitchBotTokens,
  createTwitchTimer,
  deleteTwitchTimer,
  drawTwitchGiveaway,
  parseDomainList,
  prisma,
  saveTwitchBotAppCredentials,
  startTwitchGiveaway,
  TWITCH_AI_BOUNDS,
  TWITCH_TIMER_BOUNDS,
  TwitchGiveawayError,
  updateTwitchBotSettings,
  updateTwitchTimer,
} from "@ellie/database";
import { AUTOMOD_LEVELS } from "@ellie/database/shared";
import { checkbox, fail, FormError, handle, integer, ok, oneOf, optionalText, text, type ActionState } from "@/lib/forms";
import { requireOwner } from "@/lib/session";

const BASE = "/dashboard/twitch";
const idOf = (form: FormData) => integer(form, "id", { min: 1, max: Number.MAX_SAFE_INTEGER });

export async function saveTwitchCommandAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    const name = text(form, "name", { required: "Le nom est obligatoire." }).toLowerCase().replace(/^!/, "");
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) throw new FormError("Nom invalide : lettres minuscules, chiffres, - et _.");
    const reserved = ["discord", "help", "uptime", "myuptime", "followage", "fc", "leaderboard", "dleaderboard", "rank", "so"];
    if (reserved.includes(name)) throw new FormError(`« ${name} » est une commande intégrée.`);
    const data = {
      name,
      response: text(form, "response", { required: "La réponse est obligatoire.", max: 450 }),
      cooldownSeconds: integer(form, "cooldownSeconds", { min: 0, max: 3600 }, "Le cooldown"),
    };
    const id = String(form.get("id") ?? "");
    try {
      if (id) await prisma.twitchCommand.update({ where: { id: Number(id) }, data });
      else await prisma.twitchCommand.create({ data });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") return fail(`La commande « ${name} » existe déjà.`);
      throw error;
    }
    revalidatePath(`${BASE}/commands`);
    return ok(`Commande !${name} enregistrée.`);
  });
}

export async function deleteTwitchCommandAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    await prisma.twitchCommand.deleteMany({ where: { id: idOf(form) } });
    revalidatePath(`${BASE}/commands`);
    return ok("Commande supprimée.");
  });
}

export async function saveTwitchTimerAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    const data = {
      name: text(form, "name", { required: "Le nom est obligatoire.", max: 60 }),
      message: text(form, "message", { required: "Le message est obligatoire.", max: TWITCH_TIMER_BOUNDS.messageMaxLength }),
      intervalMinutes: integer(form, "intervalMinutes", TWITCH_TIMER_BOUNDS.intervalMinutes, "L'intervalle"),
      minMessages: integer(form, "minMessages", TWITCH_TIMER_BOUNDS.minMessages, "Le minimum de messages"),
      enabled: checkbox(form, "enabled"),
    };
    const id = String(form.get("id") ?? "");
    if (id) await updateTwitchTimer(Number(id), data);
    else await createTwitchTimer(data);
    revalidatePath(`${BASE}/timers`);
    return ok("Timer enregistré.");
  });
}

export async function deleteTwitchTimerAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    await deleteTwitchTimer(idOf(form));
    revalidatePath(`${BASE}/timers`);
    return ok("Timer supprimé.");
  });
}

export async function startTwitchGiveawayAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    try {
      await startTwitchGiveaway(text(form, "keyword", { required: "Le mot-clé est obligatoire." }), text(form, "prize", { max: 200 }));
    } catch (error) {
      if (error instanceof TwitchGiveawayError) return fail(error.message);
      throw error;
    }
    revalidatePath(`${BASE}/giveaways`);
    return ok("Giveaway lancé : le bot l'annonce dans le chat.");
  });
}

export async function finishTwitchGiveawayAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    const id = idOf(form);
    try {
      if (form.get("intent") === "cancel") {
        await cancelTwitchGiveaway(id);
        revalidatePath(`${BASE}/giveaways`);
        return ok("Giveaway annulé.");
      }
      const result = await drawTwitchGiveaway(id);
      revalidatePath(`${BASE}/giveaways`);
      return ok(`Gagnant : ${result.winnerUsername} 🎉 (annoncé dans le chat).`);
    } catch (error) {
      if (error instanceof TwitchGiveawayError) return fail(error.message);
      throw error;
    }
  });
}

export async function saveTwitchModerationAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    const prefix = text(form, "prefix", { required: "Le préfixe est obligatoire.", max: 3 });
    if (/[\s/.]/.test(prefix)) throw new FormError("Le préfixe ne doit contenir ni espace, ni « / », ni « . ».");
    const aiModel = String(form.get("aiModel") ?? "");
    if (!isAllowedModel(aiModel)) throw new FormError("Modèle non autorisé.");
    await updateTwitchBotSettings({
      enabled: checkbox(form, "enabled"),
      prefix,
      autoModLevel: oneOf(form, "autoModLevel", AUTOMOD_LEVELS, "OFF"),
      filterLinksEnabled: checkbox(form, "filterLinksEnabled"),
      linkWhitelist: parseDomainList(String(form.get("linkWhitelist") ?? "")).join("\n"),
      filterCapsEnabled: checkbox(form, "filterCapsEnabled"),
      filterEmotesEnabled: checkbox(form, "filterEmotesEnabled"),
      maxEmotes: integer(form, "maxEmotes", { min: 1, max: 100 }, "Le maximum d'émotes"),
      filterSymbolsEnabled: checkbox(form, "filterSymbolsEnabled"),
      filterRepetitionEnabled: checkbox(form, "filterRepetitionEnabled"),
      filterSharedChatEnabled: checkbox(form, "filterSharedChatEnabled"),
      raidShoutoutEnabled: checkbox(form, "raidShoutoutEnabled"),
      announceFollows: checkbox(form, "announceFollows"),
      announceSubs: checkbox(form, "announceSubs"),
      aiEnabled: checkbox(form, "aiEnabled"),
      aiModel,
      aiUserCooldownSeconds: integer(form, "aiUserCooldownSeconds", TWITCH_AI_BOUNDS.aiUserCooldownSeconds, "Le cooldown par viewer"),
      aiGlobalCooldownSeconds: integer(form, "aiGlobalCooldownSeconds", TWITCH_AI_BOUNDS.aiGlobalCooldownSeconds, "Le cooldown global"),
      aiDailyReplyCap: integer(form, "aiDailyReplyCap", TWITCH_AI_BOUNDS.aiDailyReplyCap, "Le plafond quotidien"),
    });
    revalidatePath(`${BASE}/moderation`);
    return ok("Réglages Twitch enregistrés (pris en compte sous 5 secondes).");
  });
}

export async function resetTwitchWarningsAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    const username = text(form, "username", { required: "Utilisateur manquant." }).toLowerCase();
    const deleted = await prisma.twitchModerationCase.deleteMany({ where: { username } });
    revalidatePath(`${BASE}/logs`);
    return ok(`${deleted.count} cas supprimé(s) pour ${username}. (Un ban Twitch éventuel n'est pas levé.)`);
  });
}

export async function saveTwitchSettingsAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    const clientId = text(form, "clientId", { required: "Le Client ID est obligatoire.", max: 100 });
    await saveTwitchBotAppCredentials(clientId, optionalText(form, "clientSecret", 200));
    const channelName = text(form, "channelName", { max: 25 }).toLowerCase().replace(/^#|^https?:\/\/(www\.)?twitch\.tv\//g, "");
    if (channelName && !/^[a-z0-9_]{3,25}$/.test(channelName)) throw new FormError("Nom de chaîne Twitch invalide.");
    const linkedGuildId = text(form, "linkedGuildId");
    if (linkedGuildId && !/^\d{17,20}$/.test(linkedGuildId)) throw new FormError("Serveur Discord invalide.");
    await updateTwitchBotSettings({ channelName: channelName || null, linkedGuildId: linkedGuildId || null });
    revalidatePath(`${BASE}/settings`);
    return ok("Paramètres Twitch enregistrés.");
  });
}

export async function disconnectTwitchAccountAction(_state: ActionState, _form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    await clearTwitchBotTokens();
    revalidatePath(`${BASE}/settings`);
    return ok("Compte bot déconnecté.");
  });
}
