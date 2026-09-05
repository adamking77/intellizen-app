import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CliCapabilities } from "./cli-capabilities";

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
  return <div className="space-y-4">
    <h1 className={SETTINGS_TITLE}>Capabilities</h1>
    <CliCapabilities hermesControls={(query) => <HermesCapabilities engineOpen={engineOpen} query={query} />} />
  </div>;
}

function HermesCapabilities({ engineOpen, query }: { engineOpen: boolean; query: string }) {
  const client = useQueryClient();
  const [profile, setProfile] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
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
      (!availableOnly || row.available) &&
      (!needle || `${row.name} ${row.description} ${row.detail}`.toLowerCase().includes(needle)),
    );
  }, [availableOnly, capabilities.data, query]);

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-4 pb-1">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm text-[var(--text)]">Shared Hermes profile</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--subtext-0)]">
            Hermes profile settings are shared with other apps using this profile. Changes apply to its next session.
          </p>
        </div>
      </header>

      {!engineOpen ? <Notice>Hermes is offline. Start it to read or change its capabilities.</Notice> : null}
      {profiles.error ? <Notice bad>{errorMessage(profiles.error)}</Notice> : null}
      {toggle.error ? <Notice bad>Capability was not updated. {errorMessage(toggle.error)}</Notice> : null}
      {capabilities.error ? <Notice bad>{errorMessage(capabilities.error)}</Notice> : null}

      <div className="flex flex-wrap items-center gap-2 py-1">
        {(profiles.data ?? []).map((row) => (
          <button
            key={row.name}
            type="button"
            className="pill"
            aria-selected={effectiveProfile === row.name}
            disabled={!engineOpen}
            onClick={() => setProfile(row.name)}
          >
            {row.displayName || row.name}
          </button>
        ))}
        {(profiles.data?.length ?? 0) > 0 ? <div className="h-[18px] w-px bg-[var(--line)]" /> : null}
        <button type="button" className="pill" aria-selected={availableOnly} disabled={!engineOpen} onClick={() => setAvailableOnly((value) => !value)}>Available only</button>
        <div className="min-w-2 flex-1" />

      </div>

      {(capabilities.isFetching || profiles.isFetching) && engineOpen ? (
        <div className="space-y-1" aria-busy>{[0, 1, 2, 3].map((row) => <div key={row} className="h-[var(--h-row)] rounded-[var(--r-ctl)] bg-[var(--line)] opacity-40" />)}</div>
      ) : null}

      {GROUPS.map((group) => {
        const rows = shown.filter((row) => row.kind === group.id);
        if (!rows.length) return null;
        return (
          <section key={group.id} className="pt-2">
            <div className="flex flex-wrap items-baseline gap-2 pb-0.5">
              <h2 className="font-ui text-[var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--overlay-1)]">{group.label}</h2>
              <span className="font-mono text-[var(--t-count)] text-[var(--overlay-1)]">{rows.length}</span>
              <span className="text-[var(--t-section)] text-[var(--overlay-1)]">{group.description}</span>
            </div>
            {rows.map((row) => {
              const pending = toggle.isPending && toggle.variables?.id === row.id && toggle.variables.kind === row.kind;
              return (
                <div key={`${row.kind}:${row.id}`} className={cn("flex flex-wrap items-center gap-3 border-b border-[var(--hair)] px-0.5 py-[9px]", !row.available && "opacity-45")}>
                  <SettingSwitch
                    size="compact"
                    on={row.enabled}
                    label={`${row.enabled ? "Disable" : "Enable"} ${row.name}`}
                    disabled={pending || !row.available}
                    onToggle={() => toggle.mutate({ id: row.id, kind: row.kind, enabled: !row.enabled })}
                  />
                  <details className="min-w-0 flex-1 basis-48">
                    <summary className="cursor-pointer break-words font-ui text-xs text-[var(--text)]">{row.name}</summary>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[var(--t-meta)] leading-5 text-[var(--subtext-0)]">{row.description || "No description supplied."}</p>
                  </details>
                  <span className="shrink-0 rounded-[var(--r-pill)] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-2 py-0.5 font-mono text-[var(--t-count)] text-[var(--overlay-1)]">{row.detail}</span>
                </div>
              );
            })}
          </section>
        );
      })}

      {!(capabilities.isFetching || profiles.isFetching) && engineOpen && shown.length === 0 ? (
        <div className="py-5">
          <p className="text-sm text-[var(--text)]">Nothing matches.</p>
          <p className="mt-1 text-xs text-[var(--subtext-0)]">Try a different profile, turn off the availability filter, or use a shorter search.</p>
        </div>
      ) : null}

      {!capabilities.isPending && (capabilities.data?.length ?? 0) > 0 ? (
        <p className="pt-2 text-[var(--t-meta)] text-[var(--overlay-1)]">{shown.length} of {capabilities.data?.length ?? 0} shown. Capabilities belong to the active Hermes profile.</p>
      ) : null}
    </div>
  );
}

function Notice({ children, bad }: { children: React.ReactNode; bad?: boolean }) {
  return <p className={cn("rounded-[var(--r-ctl)] px-3 py-2 text-xs", bad ? "border border-[var(--bad)] bg-[color-mix(in_srgb,var(--bad)_11%,transparent)] text-[var(--danger)]" : "bg-[var(--mantle)] text-[var(--subtext-0)]")}>{children}</p>;
}
