import type { ReactNode } from "react";
import { BOT_NAME, STREAMER_NAME } from "@ellie/database/shared";

/** Mise en page centrée des écrans /setup et /login. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass-panel w-full max-w-md rounded-aero p-8 shadow-glass">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-3xl bg-lavender-400 font-display text-2xl font-bold text-white shadow-glass">
            E
          </span>
          <h1 className="font-display text-2xl font-bold text-lavender-900">{title}</h1>
          <p className="mt-1 text-sm text-lavender-600">{subtitle}</p>
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-lavender-600">
          {BOT_NAME} · communauté de {STREAMER_NAME}
        </p>
      </div>
    </main>
  );
}
