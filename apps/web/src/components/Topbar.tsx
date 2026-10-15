import Link from "next/link";
import { LogOut, MonitorPlay, Settings } from "lucide-react";
import { BOT_NAME } from "@ellie/database/shared";
import { logoutAction } from "@/app/login/actions";
import type { AppUser } from "@/lib/session";

export function Topbar({ user, guild }: { user: AppUser; guild?: { name: string; iconUrl: string | null } | null }) {
  return (
    <header className="glass-panel sticky top-0 z-20 border-x-0 border-t-0 shadow-glass">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2 font-display text-lg font-bold text-lavender-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-lavender-400 text-white shadow-glass">E</span>
            <span className="hidden sm:inline">{BOT_NAME}</span>
          </Link>
          {guild ? (
            <span className="flex min-w-0 items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-sm font-semibold text-lavender-800">
              {guild.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- icône servie par le CDN Discord
                <img src={guild.iconUrl} alt="" className="h-6 w-6 rounded-full" />
              ) : null}
              <span className="truncate">{guild.name}</span>
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {user.role === "owner" ? (
            <>
              <Link href="/dashboard/twitch" className="bubble-btn hidden rounded-full bg-white/70 p-2 text-lavender-800 sm:inline-flex" title="Bot Twitch">
                <MonitorPlay className="h-4 w-4" aria-label="Bot Twitch" />
              </Link>
              <Link href="/dashboard/settings" className="bubble-btn rounded-full bg-white/70 p-2 text-lavender-800" title="Paramètres">
                <Settings className="h-4 w-4" aria-label="Paramètres" />
              </Link>
            </>
          ) : null}
          <span className="hidden max-w-[10rem] truncate text-sm font-semibold text-lavender-800 md:inline">{user.name}</span>
          <form action={logoutAction}>
            <button type="submit" className="bubble-btn rounded-full bg-coral-100 p-2 text-coral-600" title="Se déconnecter">
              <LogOut className="h-4 w-4" aria-label="Se déconnecter" />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
