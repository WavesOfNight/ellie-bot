/**
 * Définition des blocs « ellie_* » et de la palette de l'éditeur visuel (sans React : testable en mode headless).
 */
import { ACTION_DEFINITIONS, ACTION_TYPES, type ActionDef } from "@ellie/database/shared";
import { ACTION_TYPE_TO_BLOCK, CONDITION_TO_BLOCK, NONE, START_BLOCK } from "./blockly-convert";

export type BlocklyModule = typeof import("blockly");
export type Option = [string, string];

export interface EditorChoices {
  text: Option[];
  voice: Option[];
  category: Option[];
  roles: Option[];
}

const CATEGORY_COLOURS: Record<ActionDef["category"], string> = {
  Messages: "#7F77DD",
  Rôles: "#0F6E56",
  Modération: "#D85A30",
  Logique: "#534AB7",
  Salons: "#4752C4",
  Variables: "#D4537E",
  Économie: "#B8860B",
  Avancé: "#085041",
};

function withNone(options: Option[], label: string): Option[] {
  return [[label, NONE], ...options];
}

function nonEmpty(options: Option[], label: string): Option[] {
  return options.length ? options : [[label, NONE]];
}

/** Déclare tous les blocs « ellie_* » (redéfinis à chaque ouverture pour refléter les salons et rôles du serveur). */
export function defineBlocks(Blockly: BlocklyModule, choices: EditorChoices): void {
  Blockly.Blocks[START_BLOCK] = {
    init(this: import("blockly").Block) {
      this.appendDummyInput().appendField("▶ Quand la commande est utilisée");
      this.setNextStatement(true);
      this.setColour("#5DCAA5");
      this.setDeletable(false);
      this.setTooltip("Les blocs accrochés ici s'exécutent dans l'ordre.");
    },
  };

  for (const type of ACTION_TYPES) {
    if (type === "IF") continue;
    const def = ACTION_DEFINITIONS[type];
    Blockly.Blocks[ACTION_TYPE_TO_BLOCK[type]] = {
      init(this: import("blockly").Block) {
        const header = this.appendDummyInput().appendField(def.label);
        let input = header;
        def.fields.forEach((field, index) => {
          if (index > 0 || def.fields.length > 2) input = this.appendDummyInput();
          input.appendField(index === 0 && def.fields.length <= 2 ? " ·" : `${field.label} :`);
          switch (field.kind) {
            case "number":
              input.appendField(new Blockly.FieldNumber(Number(field.defaultValue), field.min, field.max, 1), field.key);
              break;
            case "select":
              input.appendField(new Blockly.FieldDropdown((field.options ?? []).map((option) => [option.label, option.value] as Option)), field.key);
              break;
            case "channel":
              input.appendField(
                new Blockly.FieldDropdown(field.required ? nonEmpty(choices.text, "(aucun salon)") : withNone(choices.text, "salon actuel")),
                field.key,
              );
              break;
            case "voiceChannel":
              input.appendField(new Blockly.FieldDropdown(nonEmpty(choices.voice, "(aucun salon vocal)")), field.key);
              break;
            case "category":
              input.appendField(new Blockly.FieldDropdown(withNone(choices.category, "aucune")), field.key);
              break;
            case "role":
              input.appendField(new Blockly.FieldDropdown(nonEmpty(choices.roles, "(aucun rôle)")), field.key);
              break;
            default:
              input.appendField(new Blockly.FieldTextInput(String(field.defaultValue)), field.key);
          }
        });
        if (def.branches?.includes("BODY")) this.appendStatementInput("BODY").appendField("faire");
        this.setPreviousStatement(true);
        if (type !== "STOP") this.setNextStatement(true);
        this.setColour(CATEGORY_COLOURS[def.category]);
        this.setTooltip(def.label);
      },
    };
  }

  Blockly.Blocks[ACTION_TYPE_TO_BLOCK.IF] = {
    init(this: import("blockly").Block) {
      this.appendValueInput("CONDITION").setCheck("Boolean").appendField("si");
      this.appendStatementInput("THEN").appendField("alors");
      this.appendStatementInput("ELSE").appendField("sinon");
      this.setInputsInline(false);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(CATEGORY_COLOURS.Logique);
      this.setTooltip("Exécute « alors » si la condition est vraie, sinon « sinon ».");
    },
  };

  const condition = (type: keyof typeof CONDITION_TO_BLOCK, build: (block: import("blockly").Block) => void) => {
    Blockly.Blocks[CONDITION_TO_BLOCK[type]] = {
      init(this: import("blockly").Block) {
        build(this);
        this.setOutput(true, "Boolean");
        this.setColour("#AFA9EC");
      },
    };
  };
  condition("HAS_ROLE", (block) =>
    block.appendDummyInput().appendField("l'auteur a le rôle").appendField(new Blockly.FieldDropdown(withNone(choices.roles, "(choisir)")), "value"),
  );
  condition("HAS_ANY_ROLE", (block) =>
    block.appendDummyInput().appendField("l'auteur a l'un des rôles (IDs séparés par des virgules)").appendField(new Blockly.FieldTextInput(""), "value"),
  );
  condition("IN_CHANNEL", (block) =>
    block.appendDummyInput().appendField("dans le salon").appendField(new Blockly.FieldDropdown(withNone(choices.text, "(choisir)")), "value"),
  );
  condition("IS_ADMIN", (block) => block.appendDummyInput().appendField("l'auteur est administrateur"));
  condition("MESSAGE_CONTAINS", (block) => block.appendDummyInput().appendField("le message contient").appendField(new Blockly.FieldTextInput("mot"), "value"));
  condition("VARIABLE_EQUALS", (block) =>
    block
      .appendDummyInput()
      .appendField("la variable")
      .appendField(new Blockly.FieldTextInput("compteur"), "variable")
      .appendField("=")
      .appendField(new Blockly.FieldTextInput("0"), "value"),
  );
  condition("VARIABLE_GREATER", (block) =>
    block
      .appendDummyInput()
      .appendField("la variable")
      .appendField(new Blockly.FieldTextInput("compteur"), "variable")
      .appendField(">")
      .appendField(new Blockly.FieldTextInput("0"), "value"),
  );
  condition("RANDOM_CHANCE", (block) =>
    block.appendDummyInput().appendField("chance de").appendField(new Blockly.FieldNumber(50, 0, 100, 1), "value").appendField("%"),
  );
}

export function buildToolbox() {
  const categories = new Map<ActionDef["category"], Array<{ kind: "block"; type: string }>>();
  for (const type of ACTION_TYPES) {
    const def = ACTION_DEFINITIONS[type];
    categories.set(def.category, [...(categories.get(def.category) ?? []), { kind: "block", type: ACTION_TYPE_TO_BLOCK[type] }]);
  }
  categories.set("Logique", [
    ...(categories.get("Logique") ?? []),
    ...Object.values(CONDITION_TO_BLOCK).map((type) => ({ kind: "block" as const, type })),
  ]);
  return {
    kind: "categoryToolbox",
    contents: [...categories].map(([name, contents]) => ({ kind: "category", name, colour: CATEGORY_COLOURS[name], contents })),
  };
}
