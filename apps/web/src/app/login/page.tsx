import { redirect } from "next/navigation";
import { getBotConfigStatus, hasAdminUser } from "@ellie/database";
import { AuthShell } from "@/components/AuthShell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Field, Notice } from "@/components/ui";
import { getAppUser } from "@/lib/session";
import { discordLoginAction, loginAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  if (!(await hasAdminUser())) redirect("/setup");
  if (await getAppUser()) redirect("/dashboard");
  const { hasClientSecret } = await getBotConfigStatus();

  return (
    <AuthShell title="Connexion" subtitle="Accède au panel d'administration.">
      {searchParams.error ? (
        <div className="mb-4">
          <Notice tone="coral">La connexion a échoué. Réessaie.</Notice>
        </div>
      ) : null}
      <ActionForm action={loginAction} className="space-y-4">
        <Field label="Nom d'utilisateur" htmlFor="username">
          <input id="username" name="username" required autoComplete="username" className="field" />
        </Field>
        <Field label="Mot de passe" htmlFor="password">
          <input id="password" name="password" type="password" required autoComplete="current-password" className="field" />
        </Field>
        <SubmitButton variant="secondary" className="w-full">
          Se connecter
        </SubmitButton>
      </ActionForm>
      {hasClientSecret ? (
        <form action={discordLoginAction} className="mt-4">
          <div className="mb-4 flex items-center gap-3 text-xs text-lavender-600">
            <span className="h-px flex-1 bg-lavender-200" />
            ou
            <span className="h-px flex-1 bg-lavender-200" />
          </div>
          <button type="submit" className="bubble-btn w-full rounded-full bg-discord-400 px-4 py-2 text-sm font-semibold text-white shadow-glass hover:bg-discord-500">
            Se connecter avec Discord
          </button>
          <p className="hint text-center">Pour les membres qui ont la permission « Gérer le serveur ».</p>
        </form>
      ) : null}
    </AuthShell>
  );
}
