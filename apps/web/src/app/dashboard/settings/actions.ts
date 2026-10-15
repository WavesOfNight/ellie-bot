"use server";

import { revalidatePath } from "next/cache";
import {
  AdminAuthError,
  changeAdminPassword,
  clearAnthropicApiKey,
  clearDiscordClientSecret,
  prisma,
  saveAnthropicApiKey,
  saveCommunityName,
  saveDiscordCredentials,
  saveTwitchAppCredentials,
} from "@ellie/database";
import { resetClaudeClientCache } from "@ellie/ai";
import { checkbox, fail, FormError, handle, integer, ok, oneOf, optionalText, text, type ActionState } from "@/lib/forms";
import { requireOwner } from "@/lib/session";

const PATH = "/dashboard/settings";

export async function changePasswordAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const user = await requireOwner();
    if (!user.adminId) return fail("Seul un compte administrateur du panel peut changer ce mot de passe.");
    const next = String(form.get("newPassword") ?? "");
    if (next !== String(form.get("confirmPassword") ?? "")) return fail("Les deux nouveaux mots de passe ne correspondent pas.");
    try {
      await changeAdminPassword(user.adminId, String(form.get("currentPassword") ?? ""), next);
    } catch (error) {
      if (error instanceof AdminAuthError) return fail(error.message);
      throw error;
    }
    return ok("Mot de passe modifié.");
  });
}

export async function saveCommunityAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    await saveCommunityName(text(form, "communityName", { max: 60 }));
    revalidatePath(PATH);
    return ok("Nom de la communauté enregistré.");
  });
}

export async function saveDiscordAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    const clientId = text(form, "clientId", { required: "Le Client ID est obligatoire." });
    if (!/^\d{17,20}$/.test(clientId)) throw new FormError("Le Client ID doit être un identifiant Discord (17 à 20 chiffres).");
    const token = optionalText(form, "token", 200);
    if (token && !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw new FormError("Ce token ne ressemble pas à un token de bot Discord.");
    const existing = await prisma.botConfig.findUnique({ where: { id: 1 }, select: { tokenEncrypted: true } });
    if (!token && !existing?.tokenEncrypted) throw new FormError("Colle le token du bot (onglet « Bot » du portail développeur Discord).");
    await saveDiscordCredentials({ clientId, token, clientSecret: optionalText(form, "clientSecret", 200) });
    revalidatePath(PATH);
    return ok("Identifiants Discord enregistrés : le bot se connecte automatiquement d'ici quelques secondes.");
  });
}

export async function clearDiscordSecretAction(_state: ActionState, _form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    await clearDiscordClientSecret();
    revalidatePath(PATH);
    return ok("Client Secret supprimé : la connexion avec Discord est désactivée.");
  });
}

export async function saveTwitchAppAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    const clientId = text(form, "twitchClientId", { required: "Le Client ID Twitch est obligatoire.", max: 100 });
    await saveTwitchAppCredentials({ clientId, clientSecret: optionalText(form, "twitchClientSecret", 200) });
    revalidatePath(PATH);
    return ok("Application Twitch enregistrée (alertes de live).");
  });
}

export async function saveAnthropicKeyAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    const key = text(form, "anthropicApiKey", { required: "Colle la clé API Anthropic.", max: 300 });
    if (!/^sk-ant-[\w-]{20,}$/.test(key)) throw new FormError("Cette clé ne ressemble pas à une clé API Anthropic (sk-ant-…).");
    await saveAnthropicApiKey(key);
    resetClaudeClientCache();
    revalidatePath(PATH);
    return ok("Clé API Anthropic enregistrée ✅");
  });
}

export async function clearAnthropicKeyAction(_state: ActionState, _form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    await clearAnthropicApiKey();
    resetClaudeClientCache();
    revalidatePath(PATH);
    return ok("Clé API Anthropic supprimée : Ellie (IA) est désactivée partout.");
  });
}

const ACTIVITY_TYPES = ["PLAYING", "WATCHING", "LISTENING", "COMPETING"] as const;

export async function addActivityAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    await prisma.botActivity.create({
      data: {
        type: oneOf(form, "type", ACTIVITY_TYPES, "WATCHING"),
        text: text(form, "text", { required: "Le texte du statut est obligatoire.", max: 120 }),
        durationSeconds: integer(form, "durationSeconds", { min: 10, max: 3600 }, "La durée"),
        order: integer(form, "order", { min: 0, max: 999 }, "L'ordre"),
      },
    });
    revalidatePath(PATH);
    return ok("Statut ajouté à la rotation.");
  });
}

export async function updateActivityAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    await requireOwner();
    const id = integer(form, "id", { min: 1, max: Number.MAX_SAFE_INTEGER });
    if (form.get("intent") === "delete") {
      await prisma.botActivity.deleteMany({ where: { id } });
      revalidatePath(PATH);
      return ok("Statut supprimé.");
    }
    await prisma.botActivity.update({ where: { id }, data: { enabled: checkbox(form, "enabled") } });
    revalidatePath(PATH);
    return ok("Statut mis à jour.");
  });
}
