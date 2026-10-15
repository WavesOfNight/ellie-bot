"use server";

import { revalidatePath } from "next/cache";
import { generateEllieReply, isAllowedModel, isEffort } from "@ellie/ai";
import {
  AI_CONFIG_BOUNDS,
  getAppSettings,
  getGuildAiSettings,
  parisDateString,
  parseIdList,
  prisma,
  recordAiUsage,
  saveGuildAiSettings,
} from "@ellie/database";
import { toAutoModLevel } from "@ellie/database/shared";
import { checkbox, FormError, handle, integer, ok, text, type ActionState } from "@/lib/forms";
import { guildFromForm, guildIdSets } from "@/lib/guild";
import { requireGuildAccess } from "@/lib/session";

export async function saveEllieSettingsAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const ids = await guildIdSets(guildId);
    const model = String(form.get("model") ?? "");
    if (!isAllowedModel(model)) throw new FormError("Modèle non autorisé.");
    const effort = String(form.get("effort") ?? "");
    if (!isEffort(effort)) throw new FormError("Niveau d'effort invalide.");

    const allowedChannelIds = form.getAll("allowedChannelIds").map(String);
    if (allowedChannelIds.some((id) => !ids.text.has(id))) throw new FormError("Un des salons choisis n'existe pas sur ce serveur.");
    const blockedUserIds = parseIdList(String(form.get("blockedUserIds") ?? ""));
    if (blockedUserIds.length > 200) throw new FormError("200 membres bloqués maximum.");

    const bounds = AI_CONFIG_BOUNDS;
    await saveGuildAiSettings({
      guildId,
      enabled: checkbox(form, "enabled"),
      model,
      effort,
      allowedChannelIds,
      blockedUserIds,
      replyToReplies: checkbox(form, "replyToReplies"),
      keywordTrigger: checkbox(form, "keywordTrigger"),
      userCooldownSeconds: integer(form, "userCooldownSeconds", bounds.userCooldownSeconds, "Le cooldown utilisateur"),
      channelMaxPerMinute: integer(form, "channelMaxPerMinute", bounds.channelMaxPerMinute, "Le maximum par minute"),
      dailyReplyCap: integer(form, "dailyReplyCap", bounds.dailyReplyCap, "Le plafond quotidien"),
      contextMessages: integer(form, "contextMessages", bounds.contextMessages, "Le nombre de messages de contexte"),
      serverLore: text(form, "serverLore", { max: bounds.serverLoreMaxLength }),
    });
    revalidatePath(`/dashboard/${guildId}/ellie`);
    return ok("Réglages d'Ellie enregistrés (pris en compte sous 5 secondes).");
  });
}

export interface EllieTestResult {
  ok: boolean;
  text: string;
  category: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  durationMs: number;
  errorMessage?: string;
}

/**
 * Boîte « Tester une réponse » : même pipeline que le vrai bot (nettoyage + modération).
 * Ne compte pas dans le plafond quotidien, mais ses tokens sont cumulés dans la consommation.
 */
export async function testEllieReplyAction(guildIdInput: string, message: string): Promise<EllieTestResult> {
  const { guildId } = await requireGuildAccess(guildIdInput);
  const trimmed = message.trim().slice(0, 1000);
  const empty: EllieTestResult = { ok: false, text: "", category: "erreur", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0, durationMs: 0 };
  if (!trimmed) return { ...empty, errorMessage: "Écris un message à envoyer à Ellie." };

  const [settings, guild, app] = await Promise.all([
    getGuildAiSettings(guildId),
    prisma.guild.findUnique({ where: { id: guildId }, select: { autoModLevel: true } }),
    getAppSettings(),
  ]);
  const result = await generateEllieReply({
    platform: "discord",
    model: settings.model,
    effort: settings.effort,
    authorName: "Testeur du panel",
    message: trimmed,
    serverLore: settings.serverLore,
    communityName: app.communityName,
    moderationLevel: toAutoModLevel(guild?.autoModLevel),
  });

  if (result.apiCalls > 0) {
    await recordAiUsage(guildId, parisDateString(), {
      replies: 0,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      costMicroUsd: Math.round(result.costUsd * 1_000_000),
    });
    revalidatePath(`/dashboard/${guildId}/ellie`);
  }
  return {
    ok: result.category === "ok",
    text: result.text,
    category: result.category,
    inputTokens: result.usage.inputTokens + result.usage.cacheWriteTokens,
    outputTokens: result.usage.outputTokens,
    cacheReadTokens: result.usage.cacheReadTokens,
    costUsd: result.costUsd,
    durationMs: result.durationMs,
    ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
  };
}
