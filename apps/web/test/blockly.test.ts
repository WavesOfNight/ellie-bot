import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as Blockly from "blockly";
import { ACTION_DEFINITIONS, ACTION_TYPES, validateActionTree, type ActionNode } from "@ellie/database/shared";
import { buildToolbox, defineBlocks, type EditorChoices } from "../src/lib/blockly-blocks";
import { buildActionTree, rowsToTree, START_BLOCK, treeToWorkspaceState, type WorkspaceState } from "../src/lib/blockly-convert";

const TEXT = "111111111111111111";
const VOICE = "222222222222222222";
const CATEGORY = "333333333333333333";
const ROLE = "444444444444444444";

const choices: EditorChoices = {
  text: [["# général", TEXT]],
  voice: [["🔊 vocal", VOICE]],
  category: [["📁 catégorie", CATEGORY]],
  roles: [["@membre", ROLE]],
};

/** Un nœud par type d'action, avec des valeurs valides pour chaque champ. */
function sampleNode(type: (typeof ACTION_TYPES)[number]): ActionNode {
  const config: ActionNode["config"] = {};
  for (const field of ACTION_DEFINITIONS[type].fields) {
    if (field.kind === "channel") config[field.key] = TEXT;
    else if (field.kind === "voiceChannel") config[field.key] = VOICE;
    else if (field.kind === "category") config[field.key] = CATEGORY;
    else if (field.kind === "role") config[field.key] = ROLE;
    else if (field.kind === "select") config[field.key] = field.options?.at(-1)?.value ?? "";
    else config[field.key] = field.defaultValue;
  }
  return { type, config };
}

function roundTrip(tree: ActionNode[]): { tree: ActionNode[]; ignored: number } {
  defineBlocks(Blockly, choices);
  const workspace = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(treeToWorkspaceState(tree), workspace);
    return buildActionTree(Blockly.serialization.workspaces.save(workspace) as WorkspaceState);
  } finally {
    workspace.dispose();
  }
}

function normalize(tree: ActionNode[]): ActionNode[] {
  const result = validateActionTree(tree);
  assert.ok(result.ok, result.ok ? "" : result.error);
  return result.ok ? result.tree : [];
}

describe("éditeur visuel Blockly (headless)", () => {
  it("chaque type d'action fait l'aller-retour arbre → blocs → arbre sans perte", () => {
    const tree = ACTION_TYPES.filter((type) => type !== "IF" && type !== "REPEAT" && type !== "STOP").map(sampleNode);
    tree.push(sampleNode("STOP"));
    const back = roundTrip(normalize(tree));
    assert.equal(back.ignored, 0);
    assert.deepEqual(normalize(back.tree), normalize(tree));
  });

  it("conserve les branches SI / SINON / RÉPÉTER et les conditions", () => {
    const tree: ActionNode[] = [
      {
        type: "IF",
        config: { condition: "HAS_ROLE", value: ROLE, variable: "" },
        then: [{ type: "SEND_MESSAGE", config: { content: "Tu as le rôle !", channelId: "" } }],
        else: [
          {
            type: "REPEAT",
            config: { count: 3 },
            body: [{ type: "SET_VARIABLE", config: { name: "compteur", operation: "ADD", value: "1" } }],
          },
        ],
      },
      { type: "IF", config: { condition: "VARIABLE_GREATER", variable: "compteur", value: "10" }, then: [], else: [] },
      { type: "IF", config: { condition: "RANDOM_CHANCE", value: "25", variable: "" }, then: [], else: [] },
    ];
    const back = roundTrip(normalize(tree));
    assert.deepEqual(normalize(back.tree), normalize(tree));
  });

  it("ignore les blocs non reliés au bloc de départ", () => {
    const state = treeToWorkspaceState([]);
    state.blocks?.blocks.push({ type: "ellie_wait", fields: { seconds: 2 } });
    const result = buildActionTree(state);
    assert.deepEqual(result.tree, []);
    assert.equal(result.ignored, 1);
    assert.equal(state.blocks?.blocks[0]?.type, START_BLOCK);
  });

  it("la palette contient tous les blocs déclarés", () => {
    defineBlocks(Blockly, choices);
    const toolbox = buildToolbox();
    const types = toolbox.contents.flatMap((category) => category.contents.map((block) => block.type));
    for (const type of types) assert.ok(Blockly.Blocks[type], `bloc ${type} non défini`);
    assert.ok(types.length >= ACTION_TYPES.length + 8);
  });

  it("reconstruit l'arbre depuis les lignes en base", () => {
    const tree = rowsToTree([
      { id: 1, parentId: null, branch: null, order: 0, type: "REPEAT", config: '{"count":2}' },
      { id: 2, parentId: 1, branch: "BODY", order: 0, type: "WAIT", config: '{"seconds":1}' },
    ]);
    assert.equal(tree[0]?.body?.[0]?.type, "WAIT");
  });
});
