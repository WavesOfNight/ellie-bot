import { redirect } from "next/navigation";
import { ADMIN_PASSWORD_MIN_LENGTH, hasAdminUser } from "@ellie/database";
import { AuthShell } from "@/components/AuthShell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";
import { setupAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Première configuration" };

export default async function SetupPage() {
  if (await hasAdminUser()) redirect("/login");
  return (
    <AuthShell title="Bienvenue !" subtitle="Crée le compte administrateur du panel. Cette page ne sera plus accessible ensuite.">
      <ActionForm action={setupAction} className="space-y-4">
        <Field label="Nom d'utilisateur" htmlFor="username" hint="3 à 32 caractères : lettres, chiffres, point, tiret, tiret bas.">
          <input id="username" name="username" required minLength={3} maxLength={32} autoComplete="username" className="field" />
        </Field>
        <Field label="Mot de passe" htmlFor="password" hint={`${ADMIN_PASSWORD_MIN_LENGTH} caractères minimum. Il ne pourra pas être récupéré, seulement réinitialisé.`}>
          <input id="password" name="password" type="password" required minLength={ADMIN_PASSWORD_MIN_LENGTH} autoComplete="new-password" className="field" />
        </Field>
        <Field label="Confirmation du mot de passe" htmlFor="confirm">
          <input id="confirm" name="confirm" type="password" required minLength={ADMIN_PASSWORD_MIN_LENGTH} autoComplete="new-password" className="field" />
        </Field>
        <SubmitButton className="w-full">Créer le compte administrateur</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
