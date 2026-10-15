"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Blocks,
  Gift,
  Hand,
  LayoutDashboard,
  Link2,
  MousePointerClick,
  Shield,
  Sparkles,
  Star,
  Terminal,
  Ticket,
  TrendingUp,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "./ui";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

function NavList({ items, title }: { items: NavItem[]; title?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={title ?? "Navigation"} className="glass-panel rounded-aero p-3 shadow-glass">
      {title ? <p className="px-3 pb-2 pt-1 font-display text-sm font-bold uppercase tracking-wide text-lavender-600">{title}</p> : null}
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 whitespace-nowrap rounded-2xl px-3 py-2 text-sm font-semibold transition",
                  active ? "bg-discord-400 text-white shadow-glass" : "text-lavender-800 hover:bg-white/70",
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar({ guildId }: { guildId: string }) {
  const base = `/dashboard/${guildId}`;
  const items: NavItem[] = [
    { href: base, label: "Tableau de bord", icon: LayoutDashboard },
    { href: `${base}/welcome`, label: "Bienvenue", icon: Hand },
    { href: `${base}/commands`, label: "Commandes Perso", icon: Blocks },
    { href: `${base}/levels`, label: "Niveaux", icon: TrendingUp },
    { href: `${base}/moderation`, label: "Modération", icon: Shield },
    { href: `${base}/slash-commands`, label: "Slash Commands", icon: Terminal },
    { href: `${base}/giveaways`, label: "Giveaways", icon: Gift },
    { href: `${base}/reaction-roles`, label: "Reaction Buttons", icon: MousePointerClick },
    { href: `${base}/starboard`, label: "Starboard", icon: Star },
    { href: `${base}/tickets`, label: "Tickets", icon: Ticket },
    { href: `${base}/alerts`, label: "Alertes", icon: Bell },
    { href: `${base}/voice`, label: "Salons Vocaux", icon: Volume2 },
    { href: `${base}/invite`, label: "Invitation", icon: Link2 },
    { href: `${base}/ellie`, label: "Ellie (IA)", icon: Sparkles },
  ];
  return <NavList items={items} title="Modules" />;
}

export function TwitchSidebar() {
  const base = "/dashboard/twitch";
  const items: NavItem[] = [
    { href: base, label: "Tableau de bord", icon: LayoutDashboard },
    { href: `${base}/commands`, label: "Commandes", icon: Terminal },
    { href: `${base}/timers`, label: "Timers", icon: Bell },
    { href: `${base}/giveaways`, label: "Giveaways", icon: Gift },
    { href: `${base}/moderation`, label: "Modération", icon: Shield },
    { href: `${base}/logs`, label: "Logs", icon: Blocks },
    { href: `${base}/settings`, label: "Paramètres", icon: Sparkles },
  ];
  return <NavList items={items} title="Bot Twitch" />;
}
