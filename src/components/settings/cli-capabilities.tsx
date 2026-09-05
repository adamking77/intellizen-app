import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState, type ReactNode } from "react";
import { SettingSwitch } from "./setting-switch";
import { useSearchParams } from "react-router-dom";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/toast";

export type CliCapability = {
  provider: string;
  kind: "skill" | "command" | "plugin" | "connection";
  name: string;
  state: string;
  enabled: boolean;
  controllable: boolean;
  overridden: boolean;
};
type Inventory = { items: CliCapability[]; warnings: string[] };
const PROVIDERS: Record<string, string> = { hermes: "Hermes", "claude-code": "Claude Code", codex: "Codex", gemini: "Gemini", qwen: "Qwen" };
const KINDS = [
  { id: "plugin", label: "CLI plugins" },
  { id: "skill", label: "Skills" },
  { id: "command", label: "Commands" },
  { id: "connection", label: "MCP connections" },
] as const;

export function CliCapabilities({ hermesControls }: { hermesControls?: (query: string) => ReactNode }) {
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const provider = params.get("provider") || "all";
  const [query, setQuery] = useState("");
  const inventory = useQuery({
    queryKey: ["settings", "cli-capabilities"],
    queryFn: () => invoke<Inventory>("cli_capabilities"),
    staleTime: 30_000,
  });
  const toggle = useMutation({
    mutationFn: ({ row, enabled }: { row: CliCapability; enabled: boolean }) => invoke("cli_capability_set", { selection: { provider: row.provider, kind: row.kind, name: row.name, enabled } }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["settings", "cli-capabilities"] }),
  });
  const rows = (inventory.data?.items ?? []).filter((item) =>
    (provider === "all" || item.provider === provider) &&
    !(provider === "hermes" && hermesControls && item.kind === "skill") &&
    `${item.name} ${PROVIDERS[item.provider] ?? item.provider}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <section className="space-y-3" aria-label="CLI capabilities">
      <p className="text-xs leading-5 text-[var(--subtext-0)]">
        {provider === "hermes" ? "Review Hermes capabilities and manage its shared profile settings below." : "Choose what IntelliZen agents can use. Switches apply to new chats; reconnect a provider to apply changes to existing chats. Your CLI settings stay unchanged."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Capability provider" controlSize="sm" value={provider} onChange={(event) => {
          const next = new URLSearchParams(params);
          if (event.target.value === "all") next.delete("provider"); else next.set("provider", event.target.value);
          setParams(next, { replace: true });
        }}>
          <option value="all">All providers</option>
          {Object.entries(PROVIDERS).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          {provider !== "all" && !PROVIDERS[provider] ? <option value={provider}>{provider}</option> : null}
        </Select>
        <Input className="min-w-0 flex-1 basis-40" aria-label="Search CLI capabilities" placeholder="Search capabilities…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="button" className="action" disabled={inventory.isFetching} onClick={() => void inventory.refetch()}>{inventory.isFetching ? "Reading…" : "Refresh"}</button>
      </div>
      {toggle.error ? <p role="alert" className="text-xs text-[var(--danger)]">Selection was not saved. {errorMessage(toggle.error)}</p> : null}
      {toggle.isSuccess ? <p role="status" className="text-xs text-[var(--subtext-0)]">Saved for new chats. Existing chats keep their current capabilities until reconnected.</p> : null}
      {inventory.error ? <p role="alert" className="text-xs text-[var(--danger)]">CLI inventory unavailable. {errorMessage(inventory.error)}</p> : null}
      {inventory.data?.warnings.map((warning) => <p key={warning} role="status" className="text-xs text-[var(--subtext-0)]">{warning} The inventory may be incomplete.</p>)}
      {inventory.isPending && !inventory.error ? <p role="status" className="text-xs text-[var(--subtext-0)]">Reading local capabilities…</p> : null}
      {KINDS.map((kind) => {
        const items = rows.filter((row) => row.kind === kind.id);
        if (!items.length) return null;
        return <details key={`${kind.id}:${provider}:${query}`} open={kind.id === "plugin" || Boolean(query)} className="border-b border-[var(--hair)] pb-2">
          <summary className="cursor-pointer py-2 text-xs text-[var(--text)]">{kind.label} <span className="text-[var(--overlay-1)]">{items.length}</span></summary>
          <ul className="divide-y divide-[var(--hair)]">
            {items.map((item) => <li key={`${item.provider}:${item.name}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs">
              {item.controllable ? <SettingSwitch size="compact" on={item.enabled} label={`${item.enabled ? "Disable" : "Enable"} ${item.name} for IntelliZen`} disabled={toggle.isPending} onToggle={() => toggle.mutate({ row: item, enabled: !item.enabled })} /> : null}
              <span className="min-w-0 flex-1 basis-48 break-words text-[var(--text)]">{item.name}</span>
              <span className="text-[var(--subtext-0)]">{PROVIDERS[item.provider] ?? item.provider}</span>
              <span className="text-[var(--overlay-1)]" title={item.provider === "claude-code" && item.kind === "connection" ? "Controls MCP tool access in new IntelliZen chats; does not disconnect the CLI-owned server." : undefined}>{item.overridden ? item.provider === "claude-code" && item.kind === "connection" ? item.enabled ? "Tool access on" : "Tool access off" : item.enabled ? "On for new chats" : "Off for new chats" : item.state}{!item.controllable ? " · Provider managed" : ""}</span>
            </li>)}
          </ul>
        </details>;
      })}
      {inventory.isSuccess && !rows.length ? <p className="text-xs text-[var(--subtext-0)]">{provider !== "all" && !PROVIDERS[provider] ? "Local inventory is not supported for this provider yet." : "No matching capabilities in the supported local sources."}</p> : null}
      {provider === "hermes" ? hermesControls?.(query) : null}
      <details className="text-[var(--t-meta)] leading-5 text-[var(--overlay-1)]">
        <summary className="cursor-pointer">What this inventory includes</summary>
        <p className="pt-2">
        Reads user-level skills, Claude commands and Codex prompts; Hermes plugin manifests, Claude’s installation registry and Codex’s configured plugins; Claude, Codex, Gemini and Qwen MCP configuration. Project overrides, bundled plugin skills, remote installs and other CLI formats are not included. Codex skills, CLI plugins and MCP connections support session switches. Claude CLI plugins support session switches; its MCP switches block tool access without disconnecting the server. Other entries remain provider managed. Select Hermes to manage its shared profile settings below.
        </p>
      </details>
    </section>
  );
}
