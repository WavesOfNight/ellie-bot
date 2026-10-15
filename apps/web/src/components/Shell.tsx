import type { ReactNode } from "react";
import type { AppUser } from "@/lib/session";
import { Topbar } from "./Topbar";

/** Mise en page du panel : barre du haut, barre latérale facultative, contenu. */
export function Shell({
  user,
  guild,
  sidebar,
  children,
}: {
  user: AppUser;
  guild?: { name: string; iconUrl: string | null } | null;
  sidebar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <Topbar user={user} guild={guild} />
      <div className="mx-auto max-w-7xl px-4 py-6">
        {sidebar ? (
          <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">{sidebar}</aside>
            <main className="min-w-0">{children}</main>
          </div>
        ) : (
          <main className="min-w-0">{children}</main>
        )}
      </div>
    </div>
  );
}
