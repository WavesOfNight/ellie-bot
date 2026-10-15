"use server";

import { redirect } from "next/navigation";
import { AdminAuthError, createInitialAdminUser, hasAdminUser } from "@ellie/database";
import { signIn } from "@/auth";
import { fail, type ActionState } from "@/lib/forms";

export async function setupAction(_state: ActionState, form: FormData): Promise<ActionState> {
  if (await hasAdminUser()) redirect("/login");
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("confirm") ?? "")) return fail("Les deux mots de passe ne correspondent pas.");

  try {
    await createInitialAdminUser(username, password);
  } catch (error) {
    if (error instanceof AdminAuthError) return fail(error.message);
    throw error;
  }
  await signIn("credentials", { username, password, redirectTo: "/dashboard" });
  return null;
}
