"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { DEFAULT_WELCOME_TEXT_COLOR, isHexColor, stripEmoji, WELCOME_TEXT_COLOR_PRESETS, welcomeCardPanel } from "@ellie/database/shared";
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

/** Couleur du texte de l'image de bienvenue : palette, sélecteur libre et aperçu en direct (même rendu que le bot). */
export function WelcomeTextColorField({
  name,
  defaultValue,
  sampleText,
  serverName,
}: {
  name: string;
  defaultValue?: string | null;
  sampleText?: string | null;
  serverName?: string | null;
}) {
  const [color, setColor] = useState(defaultValue && isHexColor(defaultValue) ? defaultValue.toUpperCase() : DEFAULT_WELCOME_TEXT_COLOR);
  const panel = welcomeCardPanel(color);
  const title = stripEmoji((sampleText || "Bienvenue {user} !").replaceAll("{user.mention}", "@Pseudo").replace(/\{user(\.name|\.tag)?\}/g, "Pseudo"));
  const subtitle = `Membre n°128 · ${stripEmoji(serverName || "ton serveur")}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {WELCOME_TEXT_COLOR_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            title={preset.name}
            aria-label={preset.name}
            aria-pressed={color === preset.value}
            onClick={() => setColor(preset.value)}
            className={cn(
              "h-8 w-8 rounded-full border-2 shadow-glass transition-transform hover:scale-110",
              color === preset.value ? "border-lavender-800 ring-2 ring-lavender-300" : "border-white",
            )}
            style={{ backgroundColor: preset.value }}
          />
        ))}
        <label className="ml-1 flex items-center gap-2 text-sm font-semibold text-lavender-800">
          <input
            name={name}
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value.toUpperCase())}
            className="h-9 w-12 cursor-pointer rounded-xl border border-lavender-200 bg-white"
            aria-label="Couleur personnalisée"
          />
          <code className="text-xs">{color}</code>
        </label>
      </div>
      <div
        className="flex aspect-[1024/450] w-full max-w-md items-center justify-center rounded-2xl p-3"
        style={{ background: "linear-gradient(135deg, #F7F5FF, #E1F5EE 45%, #FBEAF0)" }}
        aria-label="Aperçu du texte de l'image"
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-xl px-3 text-center" style={{ backgroundColor: panel.fill }}>
          <span className="h-10 w-10 rounded-full border-2 border-white bg-lavender-300" aria-hidden />
          <span className="max-w-full truncate font-display text-lg font-bold" style={{ color }}>
            {title}
          </span>
          <span className="max-w-full truncate text-xs font-semibold" style={{ color, opacity: 0.8 }}>
            {subtitle}
          </span>
        </div>
      </div>
    </div>
  );
}
