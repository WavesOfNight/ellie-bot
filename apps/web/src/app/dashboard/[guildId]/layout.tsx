import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { Sidebar } from "@/components/Sidebar";
import { Notice } from "@/components/ui";
import { getGuild, guildIconUrl } from "@/lib/discord";
import { requireGuildAccess } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function GuildLayout({ children, params }: { children: ReactNode; params: { guildId: string } }) {
  const { user, guildId } = await requireGuildAccess(params.guildId);
  const guild = await getGuild(guildId);
  return (
    <Shell user={user} guild={guild ? { name: guild.name, iconUrl: guildIconUrl(guild, 64) } : null} sidebar={<Sidebar guildId={guildId} />}>
      {guild ? (
        children
      ) : (
        <Notice tone="coral">Le bot n&apos;est pas (ou plus) présent sur ce serveur, ou l&apos;API Discord est injoignable. Invite-le depuis les Paramètres.</Notice>
      )}
    </Shell>
  );
}
