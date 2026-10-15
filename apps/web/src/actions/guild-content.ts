"use server";

import { revalidatePath } from "next/cache";
import { getBotConfigStatus, prisma, type Prisma } from "@ellie/database";
import { BOT_NAME, validateActionTree, type ActionNode } from "@ellie/database/shared";
import { createChannelInvite, deleteChannelMessage, sendChannelMessage } from "@/lib/discord";
import { checkbox, fail, FormError, handle, integer, ok, oneOf, snowflake, text, type ActionState } from "@/lib/forms";
import { guildFromForm, guildIdSets } from "@/lib/guild";
import { requireUser } from "@/lib/session";

const path = (guildId: string, page: string) => `/dashboard/${guildId}/${page}`;
const idOf = (form: FormData, key = "id") => integer(form, key, { min: 1, max: Number.MAX_SAFE_INTEGER });
const COMMAND_NAME = /^[a-z0-9_-]{1,32}$/;

// ---------------------------------------------------------------------------
// Commandes personnalisées et réponses automatiques
// ---------------------------------------------------------------------------

export async function savePrefixAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const prefix = text(form, "prefix", { required: "Le préfixe est obligatoire.", max: 5 });
    if (/\s/.test(prefix)) throw new FormError("Le préfixe ne doit pas contenir d'espace.");
    await prisma.guild.update({ where: { id: guildId }, data: { prefix } });
    revalidatePath(path(guildId, "commands"));
    return ok(`Préfixe enregistré : ${prefix}`);
  });
}

export async function saveCustomCommandAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const name = text(form, "name", { required: "Le nom est obligatoire." }).toLowerCase().replace(/^[!?.$]/, "");
    if (!COMMAND_NAME.test(name)) throw new FormError("Nom invalide : lettres minuscules, chiffres, - et _ (32 caractères max).");
    const data = {
      name,
      response: text(form, "response", { max: 2000 }),
      cooldownSeconds: integer(form, "cooldownSeconds", { min: 0, max: 86_400 }, "Le cooldown"),
    };
    const id = String(form.get("id") ?? "");
    try {
      if (id) await prisma.customCommand.update({ where: { id: Number(id), guildId }, data });
      else await prisma.customCommand.create({ data: { guildId, ...data } });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") return fail(`La commande « ${name} » existe déjà.`);
      throw error;
    }
    revalidatePath(path(guildId, "commands"));
    return ok(`Commande « ${name} » enregistrée.`);
  });
}

export async function deleteCustomCommandAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    await prisma.customCommand.deleteMany({ where: { guildId, id: idOf(form) } });
    revalidatePath(path(guildId, "commands"));
    return ok("Commande supprimée.");
  });
}

/** Remplace entièrement l'arbre d'actions d'une commande (dans une transaction). */
export async function saveCommandActionsAction(guildIdInput: string, commandId: number, tree: unknown): Promise<ActionState> {
  return handle(async () => {
    const form = new FormData();
    form.set("guildId", guildIdInput);
    const guildId = await guildFromForm(form);
    const command = await prisma.customCommand.findFirst({ where: { id: commandId, guildId } });
    if (!command) return fail("Commande introuvable.");
    const validation = validateActionTree(tree);
    if (!validation.ok) return fail(validation.error);

    await prisma.$transaction(async (tx) => {
      await tx.customCommandAction.deleteMany({ where: { customCommandId: command.id } });
      const insert = async (nodes: ActionNode[], parentId: number | null, branch: string | null) => {
        for (const [order, node] of nodes.entries()) {
          const created = await tx.customCommandAction.create({
            data: { customCommandId: command.id, parentId, branch, order, type: node.type, config: JSON.stringify(node.config) },
          });
          if (node.then) await insert(node.then, created.id, "THEN");
          if (node.else) await insert(node.else, created.id, "ELSE");
          if (node.body) await insert(node.body, created.id, "BODY");
        }
      };
      await insert(validation.tree, null, null);
    });
    revalidatePath(path(guildId, "commands"));
    return ok(`${validation.count} bloc${validation.count > 1 ? "s" : ""} enregistré${validation.count > 1 ? "s" : ""}.`);
  });
}

export async function addAutoResponseAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    await prisma.autoResponse.create({
      data: {
        guildId,
        trigger: text(form, "trigger", { required: "Le déclencheur est obligatoire.", max: 200 }),
        response: text(form, "response", { required: "La réponse est obligatoire.", max: 2000 }),
        matchType: oneOf(form, "matchType", ["CONTAINS", "EXACT"] as const, "CONTAINS"),
      },
    });
    revalidatePath(path(guildId, "commands"));
    return ok("Réponse automatique ajoutée.");
  });
}

export async function updateAutoResponseAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const id = idOf(form);
    if (form.get("intent") === "delete") {
      await prisma.autoResponse.deleteMany({ where: { guildId, id } });
      revalidatePath(path(guildId, "commands"));
      return ok("Réponse automatique supprimée.");
    }
    await prisma.autoResponse.updateMany({ where: { guildId, id }, data: { enabled: checkbox(form, "enabled") } });
    revalidatePath(path(guildId, "commands"));
    return ok("Réponse automatique mise à jour.");
  });
}

// ---------------------------------------------------------------------------
// Giveaways
// ---------------------------------------------------------------------------

export async function createGiveawayAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const ids = await guildIdSets(guildId);
    const channelId = snowflake(form, "channelId", ids.text);
    if (!channelId) throw new FormError("Choisis le salon du giveaway.");
    const minutes = integer(form, "durationMinutes", { min: 1, max: 60 * 24 * 60 }, "La durée");
    const user = await requireUser();
    // Organisateur : le membre connecté via Discord, sinon le bot lui-même (son ID = Client ID).
    const hostId = user.discordId ?? (await getBotConfigStatus()).clientId ?? "0";
    await prisma.giveaway.create({
      data: {
        guildId,
        channelId,
        prize: text(form, "prize", { required: "Le lot est obligatoire.", max: 200 }),
        winnerCount: integer(form, "winnerCount", { min: 1, max: 20 }, "Le nombre de gagnants"),
        hostId,
        endsAt: new Date(Date.now() + minutes * 60_000),
      },
    });
    revalidatePath(path(guildId, "giveaways"));
    return ok("Giveaway créé : le bot le publie dans le salon sous 15 secondes.");
  });
}

export async function endGiveawayNowAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const updated = await prisma.giveaway.updateMany({ where: { guildId, id: idOf(form), ended: false }, data: { endsAt: new Date() } });
    revalidatePath(path(guildId, "giveaways"));
    return updated.count ? ok("Le tirage aura lieu sous 15 secondes.") : fail("Ce giveaway est déjà terminé.");
  });
}

// ---------------------------------------------------------------------------
// Alertes YouTube / Twitch
// ---------------------------------------------------------------------------

export async function saveSocialAlertAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const ids = await guildIdSets(guildId);
    const platform = oneOf(form, "platform", ["YOUTUBE", "TWITCH"] as const, "YOUTUBE");
    let channelRef = text(form, "channelRef", { required: "La chaîne est obligatoire.", max: 100 });
    if (platform === "YOUTUBE" && !/^UC[\w-]{22}$/.test(channelRef)) {
      throw new FormError("L'ID de chaîne YouTube commence par « UC » et fait 24 caractères (visible dans l'URL /channel/UC…).");
    }
    if (platform === "TWITCH") {
      channelRef = channelRef.toLowerCase().replace(/^https?:\/\/(www\.)?twitch\.tv\//, "");
      if (!/^[a-z0-9_]{3,25}$/.test(channelRef)) throw new FormError("Pseudo Twitch invalide.");
    }
    const discordChannelId = snowflake(form, "discordChannelId", ids.text);
    if (!discordChannelId) throw new FormError("Choisis le salon Discord des annonces.");
    const data: Prisma.SocialAlertUncheckedUpdateInput = {
      platform,
      channelRef,
      discordChannelId,
      message: text(form, "message", { max: 1500 }) || "{channel} vient de publier du nouveau contenu ! {url}",
    };
    const id = String(form.get("id") ?? "");
    try {
      if (id) {
        const existing = await prisma.socialAlert.findFirst({ where: { id: Number(id), guildId } });
        if (!existing) return fail("Alerte introuvable.");
        // Changer de chaîne réinitialise l'historique (nouvelle première passe silencieuse).
        const reset = existing.platform !== platform || existing.channelRef !== channelRef;
        await prisma.socialAlert.update({
          where: { id: existing.id },
          data: { ...data, ...(reset ? { lastSeenId: null, initializedAt: null, notifiedVideos: { deleteMany: {} } } : {}) },
        });
      } else {
        await prisma.socialAlert.create({ data: { guildId, platform, channelRef, discordChannelId, message: String(data.message) } });
      }
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") return fail("Une alerte existe déjà pour cette chaîne.");
      throw error;
    }
    revalidatePath(path(guildId, "alerts"));
    return ok(id ? "Alerte modifiée." : "Alerte ajoutée : la première vérification mémorise l'historique sans rien annoncer.");
  });
}

export async function deleteSocialAlertAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    await prisma.socialAlert.deleteMany({ where: { guildId, id: idOf(form) } });
    revalidatePath(path(guildId, "alerts"));
    return ok("Alerte supprimée.");
  });
}

// ---------------------------------------------------------------------------
// Invitation permanente
// ---------------------------------------------------------------------------

export async function saveInviteAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const ids = await guildIdSets(guildId);
    const channelId = snowflake(form, "permanentInviteChannelId", ids.text);
    if (!channelId) throw new FormError("Choisis le salon source de l'invitation.");
    const code = await createChannelInvite(channelId);
    await prisma.guild.update({ where: { id: guildId }, data: { permanentInviteChannelId: channelId, permanentInviteCode: code } });
    revalidatePath(path(guildId, "invite"));
    return ok(`Nouveau lien permanent : https://discord.gg/${code}`);
  });
}
