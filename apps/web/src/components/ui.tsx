import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function PageHeader({ icon: Icon, title, subtitle, actions }: { icon: LucideIcon; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="glass-panel flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lavender-600 shadow-glass">
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-lavender-900 sm:text-3xl">{title}</h1>
          {subtitle ? <p className="text-sm text-lavender-600">{subtitle}</p> : null}
        </div>
      </div>
      {actions}
    </header>
  );
}

export function Card({ title, description, children, className }: { title?: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("glass-panel rounded-aero p-5 shadow-glass", className)}>
      {title ? <h2 className="font-display text-lg font-bold text-lavender-900">{title}</h2> : null}
      {description ? <div className="mb-4 mt-1 text-sm text-lavender-600">{description}</div> : title ? <div className="mb-3" /> : null}
      {children}
    </section>
  );
}

export function Field({ label, hint, htmlFor, children }: { label: string; hint?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Toggle({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-lavender-100 bg-white/60 p-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-5 w-5 accent-lavender-400" />
      <span>
        <span className="block text-sm font-semibold text-lavender-800">{label}</span>
        {hint ? <span className="block text-xs text-lavender-600">{hint}</span> : null}
      </span>
    </label>
  );
}

export function Badge({ tone = "lavender", children }: { tone?: "lavender" | "aqua" | "blush" | "coral" | "discord"; children: ReactNode }) {
  const tones = {
    lavender: "bg-lavender-100 text-lavender-800",
    aqua: "bg-aqua-100 text-aqua-800",
    blush: "bg-blush-100 text-blush-800",
    coral: "bg-coral-100 text-coral-600",
    discord: "bg-discord-100 text-discord-600",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>{children}</span>;
}

export function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <div className="glass-panel flex items-center gap-4 rounded-aero p-5 shadow-glass">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-lavender-100 text-lavender-600">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm text-lavender-600">{label}</p>
        <p className="font-display text-2xl font-bold text-lavender-900">{value}</p>
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-lavender-200 bg-white/40 p-4 text-center text-sm text-lavender-600">{children}</p>;
}

export function Notice({ tone = "lavender", children }: { tone?: "lavender" | "aqua" | "coral" | "blush"; children: ReactNode }) {
  const tones = {
    lavender: "border-lavender-200 bg-lavender-50 text-lavender-800",
    aqua: "border-aqua-200 bg-aqua-50 text-aqua-800",
    coral: "border-coral-200 bg-coral-100 text-coral-600",
    blush: "border-blush-200 bg-blush-50 text-blush-800",
  };
  return <div className={cn("rounded-2xl border p-4 text-sm", tones[tone])}>{children}</div>;
}

/** Tableau qui défile dans son conteneur (jamais de scroll horizontal de page). */
export function TableWrapper({ children }: { children: ReactNode }) {
  return <div className="-mx-1 overflow-x-auto px-1">{children}</div>;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(date);
}
