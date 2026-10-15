"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import type { ActionState } from "@/lib/forms";
import { cn } from "./ui";

type ServerAction = (state: ActionState, form: FormData) => Promise<ActionState>;

/** Formulaire branché sur une action serveur, avec message de résultat accessible. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
}: {
  action: ServerAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useFormState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state ? (
        <p role="status" className={cn("mt-3 rounded-xl px-3 py-2 text-sm", state.ok ? "bg-aqua-100 text-aqua-800" : "bg-coral-100 text-coral-600")}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

const VARIANTS = {
  primary: "bg-aqua-400 text-white hover:bg-aqua-600",
  secondary: "bg-lavender-400 text-white hover:bg-lavender-600",
  discord: "bg-discord-400 text-white hover:bg-discord-500",
  danger: "bg-coral-100 text-coral-600 hover:bg-coral-200",
  ghost: "bg-white/70 text-lavender-800 hover:bg-white",
};

export function SubmitButton({
  children,
  variant = "primary",
  confirm,
  className,
  name,
  value,
}: {
  children: ReactNode;
  variant?: keyof typeof VARIANTS;
  /** Message de confirmation (actions destructives). */
  confirm?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
      className={cn("bubble-btn inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-glass", VARIANTS[variant], className)}
    >
      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** Zone de texte avec compteur de caractères visible. */
export function CountedTextarea({
  name,
  defaultValue,
  maxLength,
  rows = 4,
  placeholder,
  id,
}: {
  name: string;
  defaultValue?: string;
  maxLength: number;
  rows?: number;
  placeholder?: string;
  id?: string;
}) {
  const [length, setLength] = useState(defaultValue?.length ?? 0);
  return (
    <div>
      <textarea
        id={id}
        name={name}
        defaultValue={defaultValue}
        maxLength={maxLength}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => setLength(event.target.value.length)}
        className="field resize-y"
      />
      <p className={cn("mt-1 text-right text-xs", length > maxLength * 0.9 ? "text-coral-600" : "text-lavender-600")}>
        {length} / {maxLength}
      </p>
    </div>
  );
}

/** Aperçu d'une image à partir d'une URL saisie (fond de bienvenue). */
export function ImageUrlField({ name, defaultValue }: { name: string; defaultValue?: string | null }) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const valid = /^https:\/\/\S+$/i.test(url);
  return (
    <div className="space-y-2">
      <input name={name} type="url" defaultValue={defaultValue ?? ""} placeholder="https://…/fond.png" className="field" onChange={(event) => setUrl(event.target.value.trim())} />
      {valid ? (
        // eslint-disable-next-line @next/next/no-img-element -- aperçu d'une URL externe arbitraire
        <img src={url} alt="Aperçu du fond" className="max-h-40 w-full rounded-xl object-cover" referrerPolicy="no-referrer" />
      ) : null}
    </div>
  );
}
