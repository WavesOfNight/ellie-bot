"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import type { ActionNode } from "@ellie/database/shared";
import { saveCommandActionsAction } from "@/actions/guild-content";
import { buildToolbox, defineBlocks, type BlocklyModule, type EditorChoices } from "@/lib/blockly-blocks";
import { buildActionTree, treeToWorkspaceState, type WorkspaceState } from "@/lib/blockly-convert";
import { cn } from "./ui";

export type { EditorChoices };

export function BlocklyEditor({
  guildId,
  commandId,
  initialTree,
  choices,
}: {
  guildId: string;
  commandId: number;
  initialTree: ActionNode[];
  choices: EditorChoices;
}) {
  const container = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<import("blockly").WorkspaceSvg | null>(null);
  const blocklyRef = useRef<BlocklyModule | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const [Blockly, french] = await Promise.all([import("blockly"), import("blockly/msg/fr")]);
      if (disposed || !container.current) return;
      Blockly.setLocale(french as unknown as Record<string, string>);
      defineBlocks(Blockly, choices);
      const workspace = Blockly.inject(container.current, {
        toolbox: buildToolbox(),
        renderer: "zelos",
        trashcan: true,
        zoom: { controls: true, wheel: true, startScale: 0.8 },
        grid: { spacing: 24, length: 2, colour: "#E5E2FB", snap: true },
        move: { scrollbars: true, drag: true, wheel: false },
      });
      Blockly.serialization.workspaces.load(treeToWorkspaceState(initialTree), workspace);
      workspaceRef.current = workspace;
      blocklyRef.current = Blockly;
      setReady(true);
    })();
    return () => {
      disposed = true;
      workspaceRef.current?.dispose();
      workspaceRef.current = null;
    };
    // L'éditeur n'est initialisé qu'une fois par ouverture de la page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const workspace = workspaceRef.current;
    const Blockly = blocklyRef.current;
    if (!workspace || !Blockly) return;
    setSaving(true);
    setStatus(null);
    const { tree, ignored } = buildActionTree(Blockly.serialization.workspaces.save(workspace) as WorkspaceState);
    const result = await saveCommandActionsAction(guildId, commandId, tree);
    setSaving(false);
    if (result) {
      setStatus({
        ok: result.ok,
        message: `${result.message}${ignored ? ` (${ignored} groupe(s) de blocs non relié(s) au départ ignoré(s))` : ""}`,
      });
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div ref={container} className="h-[620px] w-full overflow-hidden rounded-aero border border-lavender-200 bg-white" />
        {!ready ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-aero bg-white/70 text-sm text-lavender-600">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Chargement de l&apos;éditeur…
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !ready}
          className="bubble-btn inline-flex items-center gap-2 rounded-full bg-aqua-400 px-4 py-2 text-sm font-semibold text-white shadow-glass hover:bg-aqua-600"
        >
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          Enregistrer les blocs
        </button>
        {status ? (
          <p role="status" className={cn("rounded-xl px-3 py-2 text-sm", status.ok ? "bg-aqua-100 text-aqua-800" : "bg-coral-100 text-coral-600")}>
            {status.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
