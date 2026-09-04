import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { toast, toastError } from "@/lib/toast";
import { listInstalledPluginMetadata, setPluginEnabled, uninstallPlugin } from "@/plugins/approval";
import { usePlugins } from "@/plugins/registry";

import { SETTINGS_TITLE } from "./settings-style";

export function PluginsSettings() {
  const loaded = usePlugins();
  const client = useQueryClient();
  const installed = useQuery({ queryKey: ["plugins", "installed"], queryFn: listInstalledPluginMetadata });
  const [busy, setBusy] = useState<string | null>(null);
  const loadedById = new Map(loaded.map((plugin) => [plugin.id, plugin]));

  async function toggle(id: string, enabled: boolean) {
    setBusy(id);
    try {
      await setPluginEnabled(id, enabled);
      await client.invalidateQueries({ queryKey: ["plugins", "installed"] });
      toast.success(`Plugin ${enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      toastError("Plugin update failed", error);
    } finally {
      setBusy(null);
    }
  }

  async function uninstall(id: string, name: string) {
    if (!window.confirm(`Uninstall “${name}”? Its plugin folder will be removed.`)) return;
    setBusy(id);
    try {
      await uninstallPlugin(id);
      await client.invalidateQueries({ queryKey: ["plugins", "installed"] });
      toast.success(`Plugin “${name}” uninstalled`);
    } catch (error) {
      toastError("Plugin uninstall failed", error);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className="pb-1.5">
        <h1 className={SETTINGS_TITLE}>Plugins</h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--subtext-0)]">Installed IntelliZen extensions and their approved capabilities.</p>
      </header>
      <section>
        {installed.error ? <p className="text-[var(--t-meta)] text-[var(--danger)]">Installed plugins could not be read.</p> : null}
        {(installed.data ?? []).map(({ id, metadata }) => {
          const plugin = loadedById.get(id);
          const enabled = metadata?.enabled !== false;
          const name = plugin?.name ?? id;
          const grants = metadata?.capabilities ?? plugin?.grants ?? {};
          return (
            <div key={id} className="border-b border-[var(--border-subtle)] py-3 last:border-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[var(--t-ui)] text-[var(--text)]">{name}</p>
                  <p className="text-[var(--t-meta)] text-[var(--text-muted)]">v{metadata?.version ?? plugin?.version ?? "unknown"} · written by {metadata?.author ?? plugin?.author ?? "Unknown"} · {enabled ? plugin?.status ?? "loaded" : "installed-disabled"}</p>
                </div>
                <div className="flex gap-1.5">
                  <button type="button" className="action" disabled={busy === id} onClick={() => void toggle(id, !enabled)}>{enabled ? "Disable" : "Enable"}</button>
                  <button type="button" className="action text-[var(--danger)]" disabled={busy === id} onClick={() => void uninstall(id, name)}>Uninstall</button>
                </div>
              </div>
              <p className="mt-2 font-mono text-[11px] text-[var(--text-muted)]">
                {Object.keys(grants).length ? Object.entries(grants).map(([capability, granted]) => `${capability}: ${granted ? "granted" : "denied"}`).join(" · ") : "No capability grants"}
              </p>
              {plugin?.status === "error" ? <p className="mt-1 text-[var(--t-meta)] text-[var(--danger)]">{plugin.error}</p> : null}
            </div>
          );
        })}
        {!installed.isLoading && !installed.error && (installed.data?.length ?? 0) === 0 ? <p className="text-[var(--t-meta)] text-[var(--text-muted)]">No IntelliZen plugins installed.</p> : null}
      </section>
    </>
  );
}
