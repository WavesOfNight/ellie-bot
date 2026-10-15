"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { fail, type ActionState } from "@/lib/forms";

export async function loginAction(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    await signIn("credentials", {
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
      redirectTo: "/dashboard",
    });
    return null;
  } catch (error) {
    if (error instanceof AuthError) {
      return fail("Identifiants incorrects (ou trop de tentatives : patiente quelques minutes).");
    }
    throw error;
  }
}

export async function discordLoginAction(): Promise<void> {
  await signIn("discord", { redirectTo: "/dashboard" });
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
