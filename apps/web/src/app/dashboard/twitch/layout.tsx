import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { TwitchSidebar } from "@/components/Sidebar";
import { requireOwner } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Section Twitch : réservée au compte administrateur du panel. */
export default async function TwitchLayout({ children }: { children: ReactNode }) {
  const user = await requireOwner();
  return (
    <Shell user={user} guild={{ name: "Twitch", iconUrl: null }} sidebar={<TwitchSidebar />}>
      {children}
    </Shell>
  );
}
