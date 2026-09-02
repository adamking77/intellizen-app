import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { useState } from "react";

import { tildify } from "@/components/layout/workspace-tree";
import { DEFAULT_AGENT_CONTEXT_KEY, useStringListPreference } from "@/lib/settings-preferences";
import { errorMessage } from "@/lib/toast";

export function ContextSettings() {
  const [context, setContext] = useStringListPreference(DEFAULT_AGENT_CONTEXT_KEY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const picked = await pickFolder({ directory: true, multiple: false });
      if (typeof picked !== "string" || !picked) return;
      const path = tildify(picked.replace(/\/$/, ""));
      if (!context.includes(path)) setContext([...context, path]);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-2xl text-[var(--text)]">Context</h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--subtext-0)]">
          Folders granted to every new agent. An agent can override this in its editor; the first folder becomes its starting workspace.
        </p>
      </header>

      <div className="max-w-2xl space-y-px">
        {context.map((path) => (
          <div key={path} className="flex items-center gap-3 rounded-[var(--r-row)] bg-[var(--mantle)] px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text)]">{path}</span>
            <span className="rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-2 py-0.5 font-mono text-[10px] text-[var(--overlay-1)]">read</span>
            <button type="button" className="pill" onClick={() => setContext(context.filter((item) => item !== path))} aria-label={`Remove ${path}`}>Remove</button>
          </div>
        ))}
        {context.length === 0 ? (
          <div className="py-5">
            <p className="text-sm text-[var(--text)]">No folders granted.</p>
            <p className="mt-1 text-xs text-[var(--subtext-0)]">New agents start without a default workspace.</p>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      <div className="flex items-center gap-3">
        <button type="button" className="action" onClick={() => void add()} disabled={busy}>{busy ? "Choosing…" : "Add folder"}</button>
        <span className="text-[11px] text-[var(--overlay-1)]">Databases and APIs remain in each provider’s own connections.</span>
      </div>
    </div>
  );
}
