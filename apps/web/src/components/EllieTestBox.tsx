"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { formatUsd } from "@ellie/ai/pricing";
import { testEllieReplyAction, type EllieTestResult } from "@/actions/ellie";

const CATEGORY_LABELS: Record<string, string> = {
  ok: "réponse normale",
  mention_vide: "message vide",
  refus: "refus (réplique de secours)",
  moderation: "bloquée par la modération (réplique de secours)",
  erreur_api: "erreur de l'API (réplique de secours)",
  cle_invalide: "clé API invalide",
  vide: "réponse vide (réplique de secours)",
  modele_invalide: "modèle non autorisé",
  pas_de_cle: "aucune clé API",
};

export function EllieTestBox({ guildId, disabled }: { guildId: string; disabled: boolean }) {
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<EllieTestResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => setResult(await testEllieReplyAction(guildId, message)));
        }}
      >
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={1000}
          placeholder="Salut Ellie, t'as joué à quoi hier ?"
          className="field flex-1"
          aria-label="Message de test"
        />
        <button
          type="submit"
          disabled={pending || disabled || !message.trim()}
          className="bubble-btn inline-flex items-center justify-center gap-2 rounded-full bg-lavender-400 px-4 py-2 text-sm font-semibold text-white shadow-glass hover:bg-lavender-600"
        >
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          Tester
        </button>
      </form>
      {result ? (
        <div className="rounded-2xl border border-lavender-100 bg-white/70 p-4 text-sm">
          {result.text ? <p className="whitespace-pre-wrap text-lavender-900">{result.text}</p> : null}
          {result.errorMessage ? <p className="mt-2 text-coral-600">{result.errorMessage}</p> : null}
          <p className="mt-3 text-xs text-lavender-600">
            Résultat : {CATEGORY_LABELS[result.category] ?? result.category} · {result.inputTokens} tokens d&apos;entrée · {result.outputTokens} de sortie ·{" "}
            {result.cacheReadTokens} lus en cache · {(result.durationMs / 1000).toFixed(1).replace(".", ",")} s · coût estimé {formatUsd(result.costUsd)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
