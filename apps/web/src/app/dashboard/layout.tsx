import type { ReactNode } from "react";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Toutes les pages du tableau de bord exigent une session (sinon redirection vers /login). */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return children;
}
