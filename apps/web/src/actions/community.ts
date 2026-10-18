"use server";

import { revalidatePath } from "next/cache";
import { applyCatCafeConfig, CAT_CAFE, prisma } from "@ellie/database";
import { countPanelComponents, isValidEmoji, ROLE_GROUP_DISPLAYS, ROLE_PANEL_LIMITS } from "@ellie/database/shared";
import { describePublication, publishRulesAndVerification, publishTicketPanel } from "@/lib/community";
import { addBotRole, createChannelInvite, deleteChannelMessage, getBotRoleIds, invalidateDiscordCache } from "@/lib/discord";
import { checkbox, fail, FormError, handle, integer, ok, oneOf, snowflake, text, type ActionState } from "@/lib/forms";
import { guildFromForm, guildIdSets } from "@/lib/guild";

const path = (guildId: string, page: string) => `/dashboard/${guildId}/${page}`;
const idOf = (form: FormData, key = "id") => integer(form, key, { min: 1, max: Number.MAX_SAFE_INTEGER });

function emojiOf(form: FormData, key = "emoji"): string | null {
  const emoji = text(form, key, { max: 64 });
  if (emoji && !isValidEmoji(emoji)) throw new FormError("Émoji invalide : utilise un émoji (😀) ou un émoji du serveur au format <:nom:id>.");
  return emoji || null;
}

function colorOf(form: FormData): string {
  const color = text(form, "color") || "#FF7EB6";
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new FormError("La couleur doit être au format #RRVVBB.");
  return color.toUpperCase();
}

/** Vérifie qu'un panneau reste dans les limites de Discord après modification. */
async function assertPanelFits(panelId: number, change: { groupId?: number; addOptions?: number; display?: string; newGroup?: boolean }): Promise<void> {
  const groups = await prisma.reactionRoleGroup.findMany({ where: { panelId }, include: { _count: { select: { options: true } } } });
  const layout = groups.map((group) => ({
    display: group.id === change.groupId && change.display ? change.display : group.display,
    optionCount: group._count.options + (group.id === change.groupId ? (change.addOptions ?? 0) : 0),
  }));
  if (change.newGroup) layout.push({ display: change.display ?? "MENU", optionCount: 0 });
  if (layout.length > ROLE_PANEL_LIMITS.MAX_GROUPS || countPanelComponents(layout) > ROLE_PANEL_LIMITS.MAX_COMPONENTS) {
    throw new FormError("Ce panneau dépasserait 25 boutons (limite de Discord) : passe un groupe en « menu à cocher » ou crée un autre panneau.");
  }
  if (layout.some((group) => group.optionCount > ROLE_PANEL_LIMITS.MAX_OPTIONS_PER_GROUP)) {
    throw new FormError("25 rôles maximum par groupe (limite de Discord).");
  }
}

async function panelOf(guildId: string, panelId: number) {
  const panel = await prisma.reactionRoleMessage.findFirst({ where: { id: panelId, guildId } });
  if (!panel) throw new FormError("Panneau introuvable.");
  return panel;
}

async function groupOf(guildId: string, groupId: number) {
  const group = await prisma.reactionRoleGroup.findFirst({ where: { id: groupId, panel: { guildId } } });
  if (!group) throw new FormError("Groupe introuvable.");
  return group;
}

const markDirty = (panelId: number) => prisma.reactionRoleMessage.update({ where: { id: panelId }, data: { dirty: true } });

// ---------------------------------------------------------------------------
// Panneaux de rôles
// ---------------------------------------------------------------------------

export async function createRolePanelAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const ids = await guildIdSets(guildId);
    const channelId = snowflake(form, "channelId", ids.text);
    if (!channelId) throw new FormError("Choisis un salon.");
    await prisma.reactionRoleMessage.create({
      data: {
        guildId,
        channelId,
        title: text(form, "title", { max: 200 }) || "🎀 Choisis tes rôles",
        groups: { create: { title: "Rôles", emoji: "✨", display: "MENU" } },
      },
    });
    revalidatePath(path(guildId, "reaction-roles"));
    return ok("Panneau créé avec un premier groupe : ajoute-lui des rôles. Il sera publié sous 15 secondes.");
  });
}

export async function updateRolePanelAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const panel = await panelOf(guildId, idOf(form));
    const ids = await guildIdSets(guildId);
    const channelId = snowflake(form, "channelId", ids.text) ?? panel.channelId;
    if (channelId !== panel.channelId && panel.messageId) await deleteChannelMessage(panel.channelId, panel.messageId).catch(() => undefined);
    await prisma.reactionRoleMessage.update({
      where: { id: panel.id },
      data: {
        channelId,
        messageId: channelId === panel.channelId ? panel.messageId : null,
        title: text(form, "title", { required: "Le titre est obligatoire.", max: 200 }),
        description: text(form, "description", { max: 3000 }),
        color: colorOf(form),
        dirty: true,
      },
    });
    revalidatePath(path(guildId, "reaction-roles"));
    return ok("Panneau enregistré (mise à jour sur Discord sous 15 secondes).");
  });
}

export async function deleteRolePanelAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const panel = await panelOf(guildId, idOf(form));
    if (panel.messageId) await deleteChannelMessage(panel.channelId, panel.messageId).catch(() => undefined); // déjà supprimé à la main : rien à faire
    await prisma.reactionRoleMessage.delete({ where: { id: panel.id } });
    revalidatePath(path(guildId, "reaction-roles"));
    return ok("Panneau supprimé.");
  });
}

export async function saveRoleGroupAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const display = oneOf(form, "display", ROLE_GROUP_DISPLAYS, "MENU");
    const data = {
      title: text(form, "title", { required: "Le nom du groupe est obligatoire.", max: 80 }),
      emoji: emojiOf(form),
      help: text(form, "help", { max: 200 }),
      display,
      multiple: checkbox(form, "multiple"),
      order: integer(form, "order", { min: 0, max: 99 }, "L'ordre"),
    };
    const groupId = String(form.get("groupId") ?? "");
    let panelId: number;
    if (groupId) {
      const group = await groupOf(guildId, Number(groupId));
      await assertPanelFits(group.panelId, { groupId: group.id, display });
      await prisma.reactionRoleGroup.update({ where: { id: group.id }, data });
      panelId = group.panelId;
    } else {
      panelId = (await panelOf(guildId, idOf(form, "panelId"))).id;
      await assertPanelFits(panelId, { newGroup: true, display });
      await prisma.reactionRoleGroup.create({ data: { panelId, ...data } });
    }
    await markDirty(panelId);
    revalidatePath(path(guildId, "reaction-roles"));
    return ok(groupId ? "Groupe enregistré." : "Groupe ajouté.");
  });
}

export async function deleteRoleGroupAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const group = await groupOf(guildId, idOf(form));
    await prisma.reactionRoleGroup.delete({ where: { id: group.id } });
    await markDirty(group.panelId);
    revalidatePath(path(guildId, "reaction-roles"));
    return ok("Groupe supprimé.");
  });
}

export async function addRoleOptionAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const ids = await guildIdSets(guildId);
    const group = await groupOf(guildId, idOf(form, "groupId"));
    const roleId = snowflake(form, "roleId", ids.roles);
    if (!roleId) throw new FormError("Choisis un rôle.");
    const exists = await prisma.reactionRoleOption.findUnique({ where: { groupId_roleId: { groupId: group.id, roleId } } });
    if (!exists) await assertPanelFits(group.panelId, { groupId: group.id, addOptions: 1 });
    const data = {
      label: text(form, "label", { required: "Le libellé est obligatoire.", max: 80 }),
      emoji: emojiOf(form),
      description: text(form, "description", { max: 100 }) || null,
    };
    const count = await prisma.reactionRoleOption.count({ where: { groupId: group.id } });
    await prisma.reactionRoleOption.upsert({
      where: { groupId_roleId: { groupId: group.id, roleId } },
      create: { groupId: group.id, roleId, order: count, ...data },
      update: data,
    });
    await markDirty(group.panelId);
    revalidatePath(path(guildId, "reaction-roles"));
    return ok(exists ? "Rôle mis à jour." : "Rôle ajouté.");
  });
}

export async function deleteRoleOptionAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const option = await prisma.reactionRoleOption.findFirst({ where: { id: idOf(form), group: { panel: { guildId } } }, include: { group: true } });
    if (!option) return fail("Rôle introuvable.");
    await prisma.reactionRoleOption.delete({ where: { id: option.id } });
    await markDirty(option.group.panelId);
    revalidatePath(path(guildId, "reaction-roles"));
    return ok("Rôle retiré du groupe.");
  });
}

// ---------------------------------------------------------------------------
// Tickets et signalements
// ---------------------------------------------------------------------------

function roleList(form: FormData, key: string, allowed: ReadonlySet<string>): string {
  const ids = form.getAll(key).map(String);
  if (ids.some((id) => !allowed.has(id))) throw new FormError("Un des rôles choisis n'existe pas sur ce serveur.");
  return [...new Set(ids)].join(",");
}

export async function saveTicketsAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const ids = await guildIdSets(guildId);
    await prisma.guild.update({
      where: { id: guildId },
      data: {
        ticketCategoryId: snowflake(form, "ticketCategoryId", ids.category),
        ticketStaffRoleIds: roleList(form, "ticketStaffRoleIds", ids.roles),
        ticketPingRoleIds: roleList(form, "ticketPingRoleIds", ids.roles),
        ticketPanelChannelId: snowflake(form, "ticketPanelChannelId", ids.text),
        ticketArchiveChannelId: snowflake(form, "ticketArchiveChannelId", ids.text),
        reportChannelId: snowflake(form, "reportChannelId", ids.text),
      },
    });
    revalidatePath(path(guildId, "tickets"));
    return ok("Tickets enregistrés.");
  });
}

export async function publishTicketPanelAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const { updated } = await publishTicketPanel(guildId);
    revalidatePath(path(guildId, "tickets"));
    return ok(updated ? "Panneau mis à jour ✅" : "Panneau publié ✅");
  });
}

// ---------------------------------------------------------------------------
// Règlement et vérification
// ---------------------------------------------------------------------------

/** Supprime un message publié quand son salon change (il sera republié dans le nouveau). */
async function movedMessage(previousChannelId: string | null, messageId: string | null, nextChannelId: string | null): Promise<boolean> {
  if (!previousChannelId || !messageId || previousChannelId === nextChannelId) return false;
  await deleteChannelMessage(previousChannelId, messageId).catch(() => undefined); // ancien salon : message peut-être déjà supprimé
  return true;
}

export async function saveRulesAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const ids = await guildIdSets(guildId);
    const intent = String(form.get("intent") ?? "save");
    const data = {
      rulesChannelId: snowflake(form, "rulesChannelId", ids.text),
      rulesRoleId: snowflake(form, "rulesRoleId", ids.roles),
      rulesTitle: text(form, "rulesTitle", { required: "Le titre du règlement est obligatoire.", max: 256 }),
      rulesContent: text(form, "rulesContent", { max: 4000 }),
      rulesButtonLabel: text(form, "rulesButtonLabel", { required: "Le texte du bouton est obligatoire.", max: 80 }),
      verifyChannelId: snowflake(form, "verifyChannelId", ids.text),
      verifyTitle: text(form, "verifyTitle", { required: "Le titre de la vérification est obligatoire.", max: 256 }),
      verifyContent: text(form, "verifyContent", { max: 2000 }),
      verifyButtonEmoji: emojiOf(form, "verifyButtonEmoji") ?? "",
      verifyReply: text(form, "verifyReply", { required: "Le message de bienvenue après la vérification est obligatoire.", max: 1500 }),
    };
    const previous = await prisma.guild.findUniqueOrThrow({ where: { id: guildId } });
    const rulesMoved = await movedMessage(previous.rulesChannelId, previous.rulesMessageId, data.rulesChannelId);
    const verifyMoved = await movedMessage(previous.verifyChannelId, previous.verifyMessageId, data.verifyChannelId);
    await prisma.guild.update({
      where: { id: guildId },
      data: { ...data, ...(rulesMoved ? { rulesMessageId: null } : {}), ...(verifyMoved ? { verifyMessageId: null } : {}) },
    });
    revalidatePath(path(guildId, "welcome"));
    if (intent !== "publish") return ok("Règlement et vérification enregistrés.");

    if (!data.rulesRoleId) return fail("Pour publier, choisis le rôle donné par le bouton.");
    if (!data.verifyChannelId && !(data.rulesChannelId && data.rulesContent)) {
      return fail("Pour publier, choisis un salon de vérification, ou le salon du règlement avec son texte (le bouton sera dessous).");
    }
    return ok(`${describePublication(await publishRulesAndVerification(guildId))}.`);
  });
}

// ---------------------------------------------------------------------------
// Configuration du Cat Café
// ---------------------------------------------------------------------------

const readableError = (error: unknown): string =>
  error instanceof FormError || (error instanceof Error && error.name === "DiscordApiError") ? error.message : "erreur inattendue";

/**
 * Branche Ellie sur la structure du Cat Café (rôles, menus, tickets, vérification, niveaux, live),
 * publie les messages, puis donne à Ellie le rôle 🤖 Robots du Café qui ouvre l'accès aux salons.
 */
export async function applyCatCafeAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    const result = await applyCatCafeConfig(guildId);
    const done = [`${result.groups} menus de rôles (${result.options} rôles)`, "règlement et vérification", "tickets et signalements"];
    if (result.levelRewards) done.push(`${result.levelRewards} rôles de niveau`);
    if (result.liveAlert) done.push("alerte de live Twitch");
    if (result.twitchLinked) done.push("bot Twitch relié au serveur");

    const problems: string[] = [];
    const summary = await publishRulesAndVerification(guildId).catch((error: unknown) => {
      problems.push(`publication du règlement et de la vérification : ${readableError(error)}`);
      return null;
    });
    await publishTicketPanel(guildId).catch((error: unknown) => problems.push(`panneau d'aide : ${readableError(error)}`));
    // Lien permanent utilisé par /invite et par !discord sur Twitch (sinon le bot Discord le crée sous 10 min).
    const invite = await prisma.guild.findUniqueOrThrow({ where: { id: guildId }, select: { permanentInviteChannelId: true, permanentInviteCode: true } });
    if (invite.permanentInviteChannelId && !invite.permanentInviteCode) {
      await createChannelInvite(invite.permanentInviteChannelId)
        .then(async (code) => {
          await prisma.guild.update({ where: { id: guildId }, data: { permanentInviteCode: code } });
          done.push(`lien d'invitation https://discord.gg/${code}`);
        })
        .catch((error: unknown) => problems.push(`lien d'invitation : ${readableError(error)}`));
    }
    const botRoles = await getBotRoleIds(guildId).catch(() => [] as string[]);
    if (!botRoles.includes(CAT_CAFE.roles.bots)) {
      await addBotRole(guildId, CAT_CAFE.roles.bots).catch((error: unknown) => problems.push(`rôle 🤖 Robots du Café pour Ellie : ${readableError(error)}`));
    }

    for (const page of ["diagnostic", "reaction-roles", "tickets", "welcome", "levels", "alerts", "moderation", "invite"]) revalidatePath(path(guildId, page));
    revalidatePath("/dashboard/twitch", "layout");
    const message = `Configuration du Cat Café appliquée : ${done.join(", ")}.${summary ? ` ${describePublication(summary)}.` : ""}`;
    return problems.length
      ? fail(`${message} À corriger : ${problems.join(" · ")}. Le diagnostic ci-dessous indique quoi régler.`)
      : ok(`${message} Le panneau de rôles sera publié sous 15 secondes.`);
  });
}

/** Relit les rôles et salons sur Discord (sans attendre l'expiration du cache de 30 s). */
export async function refreshDiagnosticAction(_state: ActionState, form: FormData): Promise<ActionState> {
  return handle(async () => {
    const guildId = await guildFromForm(form);
    invalidateDiscordCache(guildId);
    revalidatePath(path(guildId, "diagnostic"));
    return ok("Diagnostic relancé.");
  });
}
