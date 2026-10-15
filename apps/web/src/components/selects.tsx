import { CHANNEL_TYPES, type DiscordChannel, type DiscordRole } from "@/lib/discord";

type ChannelKind = "text" | "voice" | "category";

const KIND_TYPES: Record<ChannelKind, number[]> = {
  text: [CHANNEL_TYPES.TEXT, CHANNEL_TYPES.ANNOUNCEMENT],
  voice: [CHANNEL_TYPES.VOICE, CHANNEL_TYPES.STAGE],
  category: [CHANNEL_TYPES.CATEGORY],
};

export function filterChannels(channels: readonly DiscordChannel[], kind: ChannelKind): DiscordChannel[] {
  return channels.filter((channel) => KIND_TYPES[kind].includes(channel.type));
}

export function ChannelSelect({
  name,
  channels,
  kind = "text",
  defaultValue,
  emptyLabel = "— Aucun —",
  required,
  id,
}: {
  name: string;
  channels: readonly DiscordChannel[];
  kind?: ChannelKind;
  defaultValue?: string | null;
  emptyLabel?: string;
  required?: boolean;
  id?: string;
}) {
  const prefix = kind === "voice" ? "🔊 " : kind === "category" ? "📁 " : "# ";
  return (
    <select id={id} name={name} defaultValue={defaultValue ?? ""} required={required} className="field">
      {required ? null : <option value="">{emptyLabel}</option>}
      {filterChannels(channels, kind).map((channel) => (
        <option key={channel.id} value={channel.id}>
          {prefix}
          {channel.name}
        </option>
      ))}
    </select>
  );
}

/** Choix de plusieurs rôles (cases à cocher dans une liste défilante). */
export function RoleCheckboxes({ name, roles, selected }: { name: string; roles: readonly DiscordRole[]; selected: readonly string[] }) {
  return (
    <div className="grid max-h-56 gap-2 overflow-y-auto rounded-xl border border-lavender-100 bg-white/60 p-3 sm:grid-cols-2">
      {roles
        .filter((role) => !role.managed)
        .map((role) => (
          <label key={role.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={name} value={role.id} defaultChecked={selected.includes(role.id)} className="accent-lavender-400" />
            <span className="truncate">@{role.name}</span>
          </label>
        ))}
    </div>
  );
}

export function RoleSelect({
  name,
  roles,
  defaultValue,
  emptyLabel = "— Aucun —",
  required,
  id,
}: {
  name: string;
  roles: readonly DiscordRole[];
  defaultValue?: string | null;
  emptyLabel?: string;
  required?: boolean;
  id?: string;
}) {
  return (
    <select id={id} name={name} defaultValue={defaultValue ?? ""} required={required} className="field">
      {required ? null : <option value="">{emptyLabel}</option>}
      {roles
        .filter((role) => !role.managed)
        .map((role) => (
          <option key={role.id} value={role.id}>
            @{role.name}
          </option>
        ))}
    </select>
  );
}
