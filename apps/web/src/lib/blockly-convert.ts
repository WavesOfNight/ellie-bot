/**
 * Conversion bidirectionnelle entre l'état JSON d'un espace de travail Blockly et l'arbre
 * d'actions des commandes personnalisées. Fonctions pures (utilisées côté client et testables).
 */
import {
  ACTION_DEFINITIONS,
  ACTION_TYPES,
  CONDITION_TYPES,
  configString,
  type ActionConfig,
  type ActionNode,
  type ActionType,
  type ConditionType,
} from "@ellie/database/shared";

export const START_BLOCK = "ellie_start";
/** Valeur des listes déroulantes « aucun » (Blockly n'accepte pas de valeur vide). */
export const NONE = "__aucun__";

export const ACTION_TYPE_TO_BLOCK = Object.fromEntries(ACTION_TYPES.map((type) => [type, `ellie_${type.toLowerCase()}`])) as Record<ActionType, string>;
export const BLOCK_TYPE_TO_ACTION = Object.fromEntries(ACTION_TYPES.map((type) => [`ellie_${type.toLowerCase()}`, type])) as Record<string, ActionType>;
export const CONDITION_TO_BLOCK = Object.fromEntries(CONDITION_TYPES.map((type) => [type, `ellie_cond_${type.toLowerCase()}`])) as Record<ConditionType, string>;
export const BLOCK_TO_CONDITION = Object.fromEntries(CONDITION_TYPES.map((type) => [`ellie_cond_${type.toLowerCase()}`, type])) as Record<string, ConditionType>;

/** Champs portés par chaque bloc de condition (nom du champ Blockly → clé de configuration). */
export const CONDITION_FIELDS: Record<ConditionType, ReadonlyArray<"value" | "variable">> = {
  HAS_ROLE: ["value"],
  HAS_ANY_ROLE: ["value"],
  IN_CHANNEL: ["value"],
  IS_ADMIN: [],
  MESSAGE_CONTAINS: ["value"],
  VARIABLE_EQUALS: ["variable", "value"],
  VARIABLE_GREATER: ["variable", "value"],
  RANDOM_CHANCE: ["value"],
};

export interface BlockState {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  deletable?: boolean;
  fields?: Record<string, string | number>;
  inputs?: Record<string, { block?: BlockState }>;
  next?: { block?: BlockState };
}

export interface WorkspaceState {
  blocks?: { languageVersion: number; blocks: BlockState[] };
}

function toFieldValue(value: string | number | undefined, optional: boolean): string | number {
  if (value === undefined || value === "") return optional ? NONE : "";
  return value;
}

function conditionBlock(config: ActionConfig): BlockState | undefined {
  const condition = configString(config, "condition") as ConditionType;
  const type = CONDITION_TO_BLOCK[condition];
  if (!type) return undefined;
  const fields: Record<string, string | number> = {};
  for (const key of CONDITION_FIELDS[condition]) {
    const isSelect = key === "value" && (condition === "HAS_ROLE" || condition === "IN_CHANNEL");
    fields[key] = toFieldValue(configString(config, key), isSelect);
  }
  if (condition === "RANDOM_CHANCE") fields.value = Number(configString(config, "value", "50")) || 50;
  return { type, fields };
}

function nodeToBlock(node: ActionNode): BlockState {
  if (node.type === "IF") {
    const inputs: BlockState["inputs"] = {};
    const condition = conditionBlock(node.config);
    if (condition) inputs.CONDITION = { block: condition };
    const thenChain = chain(node.then ?? []);
    const elseChain = chain(node.else ?? []);
    if (thenChain) inputs.THEN = { block: thenChain };
    if (elseChain) inputs.ELSE = { block: elseChain };
    return { type: ACTION_TYPE_TO_BLOCK.IF, inputs };
  }
  const def = ACTION_DEFINITIONS[node.type];
  const fields: Record<string, string | number> = {};
  for (const field of def.fields) {
    const optionalSelect = ["channel", "voiceChannel", "category", "role"].includes(field.kind) && !field.required;
    fields[field.key] = toFieldValue(node.config[field.key] ?? field.defaultValue, optionalSelect);
  }
  const block: BlockState = { type: ACTION_TYPE_TO_BLOCK[node.type], fields };
  if (node.type === "REPEAT") {
    const body = chain(node.body ?? []);
    if (body) block.inputs = { BODY: { block: body } };
  }
  return block;
}

function chain(nodes: readonly ActionNode[]): BlockState | undefined {
  let first: BlockState | undefined;
  let previous: BlockState | undefined;
  for (const node of nodes) {
    const block = nodeToBlock(node);
    if (!first) first = block;
    if (previous) previous.next = { block };
    previous = block;
  }
  return first;
}

/** Arbre d'actions → état JSON Blockly (un bloc de départ non supprimable, suivi de la chaîne). */
export function treeToWorkspaceState(tree: readonly ActionNode[]): WorkspaceState {
  const start: BlockState = { type: START_BLOCK, x: 40, y: 40, deletable: false };
  const first = chain(tree);
  if (first) start.next = { block: first };
  return { blocks: { languageVersion: 0, blocks: [start] } };
}

function fromFieldValue(value: string | number | undefined): string | number {
  return value === NONE || value === undefined ? "" : value;
}

function readChain(block: BlockState | undefined): ActionNode[] {
  const nodes: ActionNode[] = [];
  for (let current = block; current; current = current.next?.block) {
    const type = BLOCK_TYPE_TO_ACTION[current.type];
    if (!type) continue;
    if (type === "IF") {
      const conditionState = current.inputs?.CONDITION?.block;
      const condition = conditionState ? BLOCK_TO_CONDITION[conditionState.type] : undefined;
      const config: ActionConfig = { condition: condition ?? "" };
      if (condition) for (const key of CONDITION_FIELDS[condition]) config[key] = fromFieldValue(conditionState?.fields?.[key]);
      nodes.push({ type, config, then: readChain(current.inputs?.THEN?.block), else: readChain(current.inputs?.ELSE?.block) });
      continue;
    }
    const config: ActionConfig = {};
    for (const field of ACTION_DEFINITIONS[type].fields) config[field.key] = fromFieldValue(current.fields?.[field.key]);
    const node: ActionNode = { type, config };
    if (type === "REPEAT") node.body = readChain(current.inputs?.BODY?.block);
    nodes.push(node);
  }
  return nodes;
}

/**
 * État JSON Blockly → arbre d'actions. Seuls les blocs reliés au bloc de départ sont pris en compte.
 * @returns l'arbre et le nombre de groupes de blocs détachés (ignorés).
 */
export function buildActionTree(state: WorkspaceState): { tree: ActionNode[]; ignored: number } {
  const top = state.blocks?.blocks ?? [];
  const start = top.find((block) => block.type === START_BLOCK);
  return { tree: readChain(start?.next?.block), ignored: top.filter((block) => block.type !== START_BLOCK).length };
}

/** Lignes en base (parentId + branch) → arbre d'actions, pour initialiser l'éditeur. */
export function rowsToTree(
  rows: ReadonlyArray<{ id: number; parentId: number | null; branch: string | null; order: number; type: string; config: string }>,
): ActionNode[] {
  const children = (parentId: number | null, branch: string | null): ActionNode[] =>
    rows
      .filter((row) => row.parentId === parentId && (parentId === null || row.branch === branch))
      .sort((a, b) => a.order - b.order)
      .filter((row) => (ACTION_TYPES as readonly string[]).includes(row.type))
      .map((row) => {
        let config: ActionConfig = {};
        try {
          config = JSON.parse(row.config) as ActionConfig;
        } catch {
          config = {};
        }
        const node: ActionNode = { type: row.type as ActionType, config };
        if (row.type === "IF") {
          node.then = children(row.id, "THEN");
          node.else = children(row.id, "ELSE");
        }
        if (row.type === "REPEAT") node.body = children(row.id, "BODY");
        return node;
      });
  return children(null, null);
}
