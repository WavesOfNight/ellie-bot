/**
 * Définition partagée (bot + panel) des actions des commandes personnalisées : types, champs,
 * limites et validation de l'arbre d'actions construit dans l'éditeur visuel.
 */

export const ACTION_TYPES = [
  "SEND_MESSAGE",
  "SEND_DM",
  "SEND_EMBED",
  "ADD_ROLE",
  "REMOVE_ROLE",
  "ADD_REACTION",
  "KICK",
  "BAN",
  "TIMEOUT",
  "DELETE_MESSAGE",
  "STOP",
  "WAIT",
  "SET_VARIABLE",
  "IF",
  "REPEAT",
  "CREATE_CHANNEL",
  "DELETE_CHANNEL",
  "CREATE_ROLE",
  "DELETE_ROLE",
  "MOVE_VOICE",
  "HTTP_REQUEST",
  "ADD_CURRENCY",
  "REMOVE_CURRENCY",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const CONDITION_TYPES = [
  "HAS_ROLE",
  "HAS_ANY_ROLE",
  "IN_CHANNEL",
  "IS_ADMIN",
  "MESSAGE_CONTAINS",
  "VARIABLE_EQUALS",
  "VARIABLE_GREATER",
  "RANDOM_CHANCE",
] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export const ACTION_BRANCHES = ["THEN", "ELSE", "BODY"] as const;
export type ActionBranch = (typeof ACTION_BRANCHES)[number];

export const ACTION_LIMITS = {
  MAX_ACTIONS_PER_RUN: 200,
  MAX_NESTING_DEPTH: 8,
  MAX_REPEAT_COUNT: 20,
  MAX_WAIT_SECONDS: 30,
  MAX_TIMEOUT_MINUTES: 40_320,
  /** Nombre maximal de blocs enregistrés pour une commande. */
  MAX_TREE_NODES: 300,
  HTTP_TIMEOUT_MS: 5_000,
  HTTP_MAX_RESPONSE_BYTES: 100_000,
  MAX_CURRENCY_AMOUNT: 1_000_000,
} as const;

export type ActionConfigValue = string | number;
export type ActionConfig = Record<string, ActionConfigValue>;

export interface ActionNode {
  type: ActionType;
  config: ActionConfig;
  then?: ActionNode[];
  else?: ActionNode[];
  body?: ActionNode[];
}

export type FieldKind =
  | "text"
  | "longtext"
  | "number"
  | "select"
  | "channel"
  | "voiceChannel"
  | "category"
  | "role"
  | "emoji"
  | "color"
  | "url"
  | "variable";

export interface ActionFieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  options?: ReadonlyArray<{ value: string; label: string }>;
  defaultValue: ActionConfigValue;
}

export interface ActionDef {
  type: ActionType;
  label: string;
  category: "Messages" | "Rôles" | "Modération" | "Logique" | "Salons" | "Variables" | "Économie" | "Avancé";
  fields: readonly ActionFieldDef[];
  branches?: readonly ActionBranch[];
}

const TARGET_FIELD: ActionFieldDef = {
  key: "target",
  label: "Cible",
  kind: "select",
  options: [
    { value: "AUTHOR", label: "l'auteur du message" },
    { value: "MENTIONED", label: "le premier membre mentionné" },
  ],
  defaultValue: "AUTHOR",
};

const REASON_FIELD: ActionFieldDef = { key: "reason", label: "Raison", kind: "text", maxLength: 300, defaultValue: "" };
const OPTIONAL_CHANNEL_FIELD: ActionFieldDef = {
  key: "channelId",
  label: "Salon (vide = salon actuel)",
  kind: "channel",
  defaultValue: "",
};

export const ACTION_DEFINITIONS: Record<ActionType, ActionDef> = {
  SEND_MESSAGE: {
    type: "SEND_MESSAGE",
    label: "Envoyer un message",
    category: "Messages",
    fields: [
      { key: "content", label: "Message", kind: "longtext", required: true, maxLength: 2000, defaultValue: "Salut {user} !" },
      OPTIONAL_CHANNEL_FIELD,
    ],
  },
  SEND_DM: {
    type: "SEND_DM",
    label: "Envoyer un MP à l'auteur",
    category: "Messages",
    fields: [{ key: "content", label: "Message", kind: "longtext", required: true, maxLength: 2000, defaultValue: "Coucou {user.name} !" }],
  },
  SEND_EMBED: {
    type: "SEND_EMBED",
    label: "Envoyer un embed",
    category: "Messages",
    fields: [
      { key: "title", label: "Titre", kind: "text", maxLength: 256, defaultValue: "Titre" },
      { key: "description", label: "Description", kind: "longtext", required: true, maxLength: 4000, defaultValue: "Description" },
      { key: "color", label: "Couleur", kind: "color", defaultValue: "#7F77DD" },
      OPTIONAL_CHANNEL_FIELD,
    ],
  },
  ADD_ROLE: {
    type: "ADD_ROLE",
    label: "Ajouter un rôle",
    category: "Rôles",
    fields: [{ key: "roleId", label: "Rôle", kind: "role", required: true, defaultValue: "" }, TARGET_FIELD],
  },
  REMOVE_ROLE: {
    type: "REMOVE_ROLE",
    label: "Retirer un rôle",
    category: "Rôles",
    fields: [{ key: "roleId", label: "Rôle", kind: "role", required: true, defaultValue: "" }, TARGET_FIELD],
  },
  ADD_REACTION: {
    type: "ADD_REACTION",
    label: "Réagir au message",
    category: "Messages",
    fields: [{ key: "emoji", label: "Émoji", kind: "emoji", required: true, maxLength: 64, defaultValue: "👍" }],
  },
  KICK: {
    type: "KICK",
    label: "Expulser",
    category: "Modération",
    fields: [TARGET_FIELD, REASON_FIELD],
  },
  BAN: {
    type: "BAN",
    label: "Bannir",
    category: "Modération",
    fields: [
      TARGET_FIELD,
      REASON_FIELD,
      { key: "deleteMessageDays", label: "Jours de messages supprimés", kind: "number", min: 0, max: 7, defaultValue: 0 },
    ],
  },
  TIMEOUT: {
    type: "TIMEOUT",
    label: "Rendre muet (timeout)",
    category: "Modération",
    fields: [
      TARGET_FIELD,
      { key: "minutes", label: "Durée (minutes)", kind: "number", min: 1, max: ACTION_LIMITS.MAX_TIMEOUT_MINUTES, defaultValue: 10 },
      REASON_FIELD,
    ],
  },
  DELETE_MESSAGE: { type: "DELETE_MESSAGE", label: "Supprimer le message déclencheur", category: "Messages", fields: [] },
  STOP: { type: "STOP", label: "Arrêter la commande", category: "Logique", fields: [] },
  WAIT: {
    type: "WAIT",
    label: "Attendre",
    category: "Logique",
    fields: [{ key: "seconds", label: "Secondes", kind: "number", min: 1, max: ACTION_LIMITS.MAX_WAIT_SECONDS, defaultValue: 3 }],
  },
  SET_VARIABLE: {
    type: "SET_VARIABLE",
    label: "Modifier une variable",
    category: "Variables",
    fields: [
      { key: "name", label: "Variable", kind: "variable", required: true, defaultValue: "compteur" },
      {
        key: "operation",
        label: "Opération",
        kind: "select",
        options: [
          { value: "SET", label: "définir à" },
          { value: "ADD", label: "ajouter" },
          { value: "SUBTRACT", label: "soustraire" },
        ],
        defaultValue: "SET",
      },
      { key: "value", label: "Valeur", kind: "text", maxLength: 1000, defaultValue: "1" },
    ],
  },
  IF: {
    type: "IF",
    label: "Si… alors… sinon",
    category: "Logique",
    branches: ["THEN", "ELSE"],
    fields: [
      {
        key: "condition",
        label: "Condition",
        kind: "select",
        options: [
          { value: "HAS_ROLE", label: "l'auteur a le rôle" },
          { value: "HAS_ANY_ROLE", label: "l'auteur a l'un des rôles" },
          { value: "IN_CHANNEL", label: "le message est dans le salon" },
          { value: "IS_ADMIN", label: "l'auteur est administrateur" },
          { value: "MESSAGE_CONTAINS", label: "le message contient" },
          { value: "VARIABLE_EQUALS", label: "la variable est égale à" },
          { value: "VARIABLE_GREATER", label: "la variable est supérieure à" },
          { value: "RANDOM_CHANCE", label: "chance aléatoire (%)" },
        ],
        defaultValue: "IS_ADMIN",
      },
      { key: "value", label: "Valeur", kind: "text", maxLength: 500, defaultValue: "" },
      { key: "variable", label: "Variable", kind: "variable", defaultValue: "" },
    ],
  },
  REPEAT: {
    type: "REPEAT",
    label: "Répéter",
    category: "Logique",
    branches: ["BODY"],
    fields: [{ key: "count", label: "Nombre de fois", kind: "number", min: 1, max: ACTION_LIMITS.MAX_REPEAT_COUNT, defaultValue: 2 }],
  },
  CREATE_CHANNEL: {
    type: "CREATE_CHANNEL",
    label: "Créer un salon",
    category: "Salons",
    fields: [
      { key: "name", label: "Nom", kind: "text", required: true, maxLength: 100, defaultValue: "nouveau-salon" },
      {
        key: "kind",
        label: "Type",
        kind: "select",
        options: [
          { value: "TEXT", label: "textuel" },
          { value: "VOICE", label: "vocal" },
        ],
        defaultValue: "TEXT",
      },
      { key: "categoryId", label: "Catégorie (facultatif)", kind: "category", defaultValue: "" },
    ],
  },
  DELETE_CHANNEL: {
    type: "DELETE_CHANNEL",
    label: "Supprimer un salon",
    category: "Salons",
    fields: [{ key: "channelId", label: "Salon", kind: "channel", required: true, defaultValue: "" }],
  },
  CREATE_ROLE: {
    type: "CREATE_ROLE",
    label: "Créer un rôle",
    category: "Rôles",
    fields: [
      { key: "name", label: "Nom", kind: "text", required: true, maxLength: 100, defaultValue: "Nouveau rôle" },
      { key: "color", label: "Couleur", kind: "color", defaultValue: "#AFA9EC" },
    ],
  },
  DELETE_ROLE: {
    type: "DELETE_ROLE",
    label: "Supprimer un rôle",
    category: "Rôles",
    fields: [{ key: "roleId", label: "Rôle", kind: "role", required: true, defaultValue: "" }],
  },
  MOVE_VOICE: {
    type: "MOVE_VOICE",
    label: "Déplacer en vocal",
    category: "Salons",
    fields: [TARGET_FIELD, { key: "channelId", label: "Salon vocal", kind: "voiceChannel", required: true, defaultValue: "" }],
  },
  HTTP_REQUEST: {
    type: "HTTP_REQUEST",
    label: "Requête HTTP",
    category: "Avancé",
    fields: [
      { key: "url", label: "URL (http/https)", kind: "url", required: true, maxLength: 500, defaultValue: "https://" },
      {
        key: "method",
        label: "Méthode",
        kind: "select",
        options: [
          { value: "GET", label: "GET" },
          { value: "POST", label: "POST" },
        ],
        defaultValue: "GET",
      },
      { key: "body", label: "Corps (POST)", kind: "longtext", maxLength: 2000, defaultValue: "" },
      { key: "variable", label: "Variable où stocker la réponse", kind: "variable", defaultValue: "" },
    ],
  },
  ADD_CURRENCY: {
    type: "ADD_CURRENCY",
    label: "Donner des pièces",
    category: "Économie",
    fields: [TARGET_FIELD, { key: "amount", label: "Montant", kind: "number", min: 1, max: ACTION_LIMITS.MAX_CURRENCY_AMOUNT, defaultValue: 10 }],
  },
  REMOVE_CURRENCY: {
    type: "REMOVE_CURRENCY",
    label: "Retirer des pièces",
    category: "Économie",
    fields: [TARGET_FIELD, { key: "amount", label: "Montant", kind: "number", min: 1, max: ACTION_LIMITS.MAX_CURRENCY_AMOUNT, defaultValue: 10 }],
  },
};

export function isActionType(value: unknown): value is ActionType {
  return typeof value === "string" && (ACTION_TYPES as readonly string[]).includes(value);
}

export function isConditionType(value: unknown): value is ConditionType {
  return typeof value === "string" && (CONDITION_TYPES as readonly string[]).includes(value);
}

export type ActionTreeValidation = { ok: true; tree: ActionNode[]; count: number } | { ok: false; error: string };

const SNOWFLAKE = /^\d{17,20}$/;

function normalizeConfig(def: ActionDef, raw: unknown): { config: ActionConfig } | { error: string } {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const config: ActionConfig = {};
  for (const field of def.fields) {
    const value = source[field.key];
    if (field.kind === "number") {
      const parsed = typeof value === "number" ? value : Number(value ?? field.defaultValue);
      if (!Number.isFinite(parsed)) return { error: `« ${def.label} » : ${field.label} doit être un nombre.` };
      const min = field.min ?? Number.MIN_SAFE_INTEGER;
      const max = field.max ?? Number.MAX_SAFE_INTEGER;
      if (parsed < min || parsed > max) {
        return { error: `« ${def.label} » : ${field.label} doit être compris entre ${min} et ${max}.` };
      }
      config[field.key] = Math.trunc(parsed);
      continue;
    }
    const text = typeof value === "string" ? value.trim() : value == null ? String(field.defaultValue) : String(value);
    if (field.required && !text) return { error: `« ${def.label} » : le champ ${field.label} est obligatoire.` };
    if (field.maxLength && text.length > field.maxLength) {
      return { error: `« ${def.label} » : ${field.label} dépasse ${field.maxLength} caractères.` };
    }
    if (field.options && text && !field.options.some((option) => option.value === text)) {
      return { error: `« ${def.label} » : valeur invalide pour ${field.label}.` };
    }
    if (["channel", "voiceChannel", "category", "role"].includes(field.kind) && text && !SNOWFLAKE.test(text)) {
      return { error: `« ${def.label} » : ${field.label} doit être un identifiant Discord valide.` };
    }
    if (field.kind === "color" && text && !/^#[0-9a-fA-F]{6}$/.test(text)) {
      return { error: `« ${def.label} » : la couleur doit être au format #RRVVBB.` };
    }
    if (field.kind === "variable" && text && !/^[a-zA-Z0-9_-]{1,32}$/.test(text)) {
      return { error: `« ${def.label} » : nom de variable invalide (lettres, chiffres, - et _, 32 caractères max).` };
    }
    if (field.kind === "url" && text && !/^https?:\/\//i.test(text)) {
      return { error: `« ${def.label} » : l'URL doit commencer par http:// ou https://.` };
    }
    config[field.key] = text;
  }
  return { config };
}

/** Valide et normalise un arbre d'actions reçu du navigateur (types, champs, profondeur, taille). */
export function validateActionTree(input: unknown): ActionTreeValidation {
  let count = 0;

  const visit = (nodes: unknown, depth: number): ActionNode[] | string => {
    if (!Array.isArray(nodes)) return "Arbre d'actions invalide.";
    if (depth > ACTION_LIMITS.MAX_NESTING_DEPTH) {
      return `Trop d'imbrications (maximum ${ACTION_LIMITS.MAX_NESTING_DEPTH} niveaux).`;
    }
    const result: ActionNode[] = [];
    for (const raw of nodes) {
      count++;
      if (count > ACTION_LIMITS.MAX_TREE_NODES) return `Trop de blocs (maximum ${ACTION_LIMITS.MAX_TREE_NODES}).`;
      const node = raw as Partial<Record<keyof ActionNode, unknown>>;
      if (!isActionType(node?.type)) return "Type d'action inconnu.";
      const def = ACTION_DEFINITIONS[node.type];
      const normalized = normalizeConfig(def, node.config);
      if ("error" in normalized) return normalized.error;
      if (node.type === "IF" && !isConditionType(normalized.config.condition)) return "Condition inconnue.";
      const out: ActionNode = { type: node.type, config: normalized.config };
      for (const branch of def.branches ?? []) {
        const key = branch.toLowerCase() as "then" | "else" | "body";
        const children = visit(node[key] ?? [], depth + 1);
        if (typeof children === "string") return children;
        out[key] = children;
      }
      result.push(out);
    }
    return result;
  };

  const tree = visit(input, 1);
  if (typeof tree === "string") return { ok: false, error: tree };
  return { ok: true, tree, count };
}

/** Accès typés à la configuration d'une action. */
export function configString(config: ActionConfig, key: string, fallback = ""): string {
  const value = config[key];
  return value === undefined || value === null ? fallback : String(value);
}

export function configNumber(config: ActionConfig, key: string, fallback: number): number {
  const value = Number(config[key]);
  return Number.isFinite(value) ? value : fallback;
}
