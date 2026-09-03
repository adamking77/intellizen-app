import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { getGatewayClient } from "@/engine/gateway";
import { listProfiles } from "@/engine/profiles";
import { errorMessage } from "@/lib/toast";

import { SETTINGS_TITLE } from "./settings-style";
import { cn } from "@/lib/utils";
import { listHermesCapabilities, setHermesCapability, type HermesCapabilityKind } from "@/services/hermes-settings";

import { SettingSwitch } from "./setting-switch";

const GROUPS: { id: HermesCapabilityKind; label: string; description: string }[] = [
  { id: "skill", label: "Skills", description: "Instructions Hermes loads when a task matches." },
  { id: "tool", label: "Tools", description: "Toolsets available to this Hermes profile." },
  { id: "connection", label: "Connections", description: "MCP servers Hermes can reach." },
];

export function CapabilitiesSettings({ engineOpen }: { engineOpen: boolean }) {
  const client = useQueryClient();
  const [profile, setProfile] = useState("");
  const [query, setQuery] = useState("");
  const profiles = useQuery({
    queryKey: ["settings", "profiles"],
    queryFn: () => listProfiles(getGatewayClient()),
    enabled: engineOpen,
    staleTime: 30_000,
  });
  const effectiveProfile = profile || profiles.data?.find((row) => row.isDefault)?.name || profiles.data?.[0]?.name || "";
  const capabilities = useQuery({
    queryKey: ["settings", "capabilities", effectiveProfile],
    queryFn: () => listHermesCapabilities(effectiveProfile),
    enabled: engineOpen && Boolean(effectiveProfile),
    staleTime: 15_000,
  });
  const toggle = useMutation({
    mutationFn: ({ id, kind, enabled }: { id: string; kind: HermesCapabilityKind; enabled: boolean }) =>
      setHermesCapability(effectiveProfile, { id, kind }, enabled),
    onSuccess: () => client.invalidateQueries({ queryKey: ["settings", "capabilities", effectiveProfile] }),
  });
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (capabilities.data ?? []).filter((row) =>
      !needle || `${row.name} ${row.description} ${row.detail}`.toLowerCase().includes(needle),
    );
  }, [capabilities.data, query]);

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-4 pb-1">
        <div className="min-w-0 flex-1">
          <h1 className={SETTINGS_TITLE}>Capabilities</h1>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--subtext-0)]">
            What this Hermes profile can use. Changes are written through Hermes and apply to its next session.
          </p>
        </div>
        <select
          aria-label="Hermes profile"
          value={effectiveProfile}
          onChange={(event) => setProfile(event.target.value)}
          disabled={!engineOpen || profiles.isPending}
          className="rounded-[var(--r-row)] border-0 bg-[var(--input)] px-3 py-2 font-ui text-xs text-[var(--text)] outline-none focus:ring-1 focus:ring-[var(--accent-border)]"
        >
          {(profiles.data ?? []).map((row) => <option key={row.name} value={row.name}>{row.displayName || row.name}</option>)}
        </select>
      </header>

      {!engineOpen ? <Notice>Hermes is offline. Start it to read or change its capabilities.</Notice> : null}
      {capabilities.error ? <Notice bad>{errorMessage(capabilities.error)}</Notice> : null}

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter capabilities…"
        aria-label="Filter capabilities"
        className="w-full max-w-xs rounded-[var(--r-row)] border-0 bg-[var(--input)] px-3 py-2 font-ui text-xs text-[var(--text)] outline-none placeholder:text-[var(--overlay-0)] focus:ring-1 focus:ring-[var(--accent-border)]"
      />

      {capabilities.isPending && engineOpen ? (
        <div className="space-y-1" aria-busy>{[0, 1, 2, 3].map((row) => <div key={row} className="h-10 rounded bg-[var(--line)] opacity-40" />)}</div>
      ) : null}

      {GROUPS.map((group) => {
        const rows = shown.filter((row) => row.kind === group.id);
        if (!rows.length) return null;
        return (
          <section key={group.id} className="pt-2">
            <div className="flex items-baseline gap-2 border-b border-[var(--hair)] pb-2">
              <h2 className="font-ui text-[var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--overlay-1)]">{group.label}</h2>
              <span className="font-mono text-[var(--t-count)] text-[var(--overlay-1)]">{rows.length}</span>
              <span className="text-[var(--t-section)] text-[var(--overlay-1)]">{group.description}</span>
            </div>
            {rows.map((row) => {
              const pending = toggle.isPending && toggle.variables?.id === row.id && toggle.variables.kind === row.kind;
              return (
                <div key={`${row.kind}:${row.id}`} className={cn("flex items-center gap-3 border-b border-[var(--hair)] py-2.5", !row.available && "opacity-45")}>
                  <SettingSwitch
                    on={row.enabled}
                    label={`${row.enabled ? "Disable" : "Enable"} ${row.name}`}
                    disabled={pending || !row.available}
                    onToggle={() => toggle.mutate({ id: row.id, kind: row.kind, enabled: !row.enabled })}
                  />
                  <span className="w-52 shrink-0 truncate font-ui text-xs text-[var(--text)]">{row.name}</span>
                  <span className="min-w-0 flex-1 truncate text-[var(--t-section)] text-[var(--subtext-0)]">{row.description || "—"}</span>
                  <span className="shrink-0 rounded-[var(--r-pill)] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-2 py-0.5 font-mono text-[var(--t-count)] text-[var(--overlay-1)]">{row.detail}</span>
                </div>
              );
            })}
          </section>
        );
      })}

      {!capabilities.isPending && engineOpen && shown.length === 0 ? (
        <p className="py-5 text-xs text-[var(--subtext-0)]">Nothing matches.</p>
      ) : null}
    </div>
  );
}

function Notice({ children, bad }: { children: React.ReactNode; bad?: boolean }) {
  return <p className={cn("rounded-[var(--r-row)] bg-[var(--mantle)] px-3 py-2 text-xs", bad ? "text-[var(--danger)]" : "text-[var(--subtext-0)]")}>{children}</p>;
}
