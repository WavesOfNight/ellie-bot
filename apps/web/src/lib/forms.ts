/** Résultat d'une action serveur, affiché sous le formulaire. */
export type ActionState = { ok: boolean; message: string } | null;

export const ok = (message: string): ActionState => ({ ok: true, message });
export const fail = (message: string): ActionState => ({ ok: false, message });

export class FormError extends Error {}

export function text(form: FormData, key: string, options: { max?: number; required?: string } = {}): string {
  const value = String(form.get(key) ?? "").trim();
  if (options.required && !value) throw new FormError(options.required);
  if (options.max && value.length > options.max) throw new FormError(`Le champ « ${key} » dépasse ${options.max} caractères.`);
  return value;
}

export function optionalText(form: FormData, key: string, max = 2000): string | null {
  const value = String(form.get(key) ?? "").trim();
  if (value.length > max) throw new FormError(`Le champ « ${key} » dépasse ${max} caractères.`);
  return value || null;
}

export function integer(form: FormData, key: string, bounds: { min: number; max: number }, label = key): number {
  const raw = String(form.get(key) ?? "").trim();
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value < bounds.min || value > bounds.max) {
    throw new FormError(`${label} doit être un nombre entier entre ${bounds.min} et ${bounds.max}.`);
  }
  return value;
}

export function optionalInteger(form: FormData, key: string, bounds: { min: number; max: number }, label = key): number | null {
  return String(form.get(key) ?? "").trim() ? integer(form, key, bounds, label) : null;
}

export function checkbox(form: FormData, key: string): boolean {
  const value = form.get(key);
  return value === "on" || value === "true" || value === "1";
}

const SNOWFLAKE = /^\d{17,20}$/;

/** Identifiant Discord facultatif (vide = null) ; doit faire partie des valeurs autorisées si fournies. */
export function snowflake(form: FormData, key: string, allowed?: ReadonlySet<string>): string | null {
  const value = String(form.get(key) ?? "").trim();
  if (!value) return null;
  if (!SNOWFLAKE.test(value) || (allowed && !allowed.has(value))) throw new FormError("Sélection invalide (salon ou rôle introuvable sur ce serveur).");
  return value;
}

export function oneOf<T extends string>(form: FormData, key: string, values: readonly T[], fallback: T): T {
  const value = String(form.get(key) ?? "");
  return (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Exécute une action en convertissant les erreurs de saisie en message lisible (jamais de détail technique). */
export async function handle(action: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof FormError) return fail(error.message);
    if (error && typeof error === "object" && "digest" in error && String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    console.error("[Ellie panel] action en échec :", error instanceof Error ? error.message : error);
    return fail(error instanceof Error && error.name === "DiscordApiError" ? error.message : "Une erreur est survenue, réessaie dans un instant.");
  }
}
