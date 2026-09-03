import { open as pickFolder } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";
import { homeDir, join } from "@tauri-apps/api/path";
import { useEffect, useState } from "react";
import { Folder, X } from "lucide-react";

import { tildify } from "@/components/layout/workspace-tree";
import { DEFAULT_AGENT_CONTEXT_KEY, useStringListPreference } from "@/lib/settings-preferences";
import { errorMessage } from "@/lib/toast";

import { SETTINGS_TITLE } from "./settings-style";

export function ContextSettings() {
  const [context, setContext] = useStringListPreference(DEFAULT_AGENT_CONTEXT_KEY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let live = true;
    void Promise.all(
      context.map(async (path) => {
        try {
          const resolved = path === "~"
            ? await homeDir()
            : path.startsWith("~/")
              ? await join(await homeDir(), path.slice(2))
              : path;
          return [path, !(await exists(resolved))] as const;
        } catch {
          return [path, true] as const;
        }
      }),
    ).then((checks) => {
      if (live) setMissing(Object.fromEntries(checks));
    });
    return () => {
      live = false;
    };
  }, [context]);

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
        <h1 className={SETTINGS_TITLE}>Context</h1>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--subtext-0)]">
          Folders granted to every new agent. Each agent can override this in its own editor.
        </p>
      </header>

      <div className="max-w-[620px] space-y-px">
        {context.map((path) => (
          <div
            key={path}
            className="flex items-center gap-2.5 rounded-[var(--r-row)] bg-[var(--crust)] px-2.5 py-[9px]"
            style={missing[path] ? { border: "1px solid var(--bad)" } : undefined}
          >
            <Folder className="h-[13px] w-[13px] shrink-0 text-[var(--text-muted)]" strokeWidth={1.6} aria-hidden />
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text)]">{path}</span>
            <span className={missing[path]
              ? "rounded-[var(--r-pill)] bg-[color-mix(in_srgb,var(--bad)_14%,transparent)] px-2 py-0.5 font-mono text-[var(--t-count)] text-[var(--bad)]"
              : "rounded-[var(--r-pill)] bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-2 py-0.5 font-mono text-[var(--t-count)] text-[var(--overlay-1)]"
            }>{missing[path] ? "not found" : "read"}</span>
            <button type="button" className="pill !p-1" onClick={() => setContext(context.filter((item) => item !== path))} aria-label={`Remove ${path}`} title={`Remove ${path}`}>
              <X className="h-[13px] w-[13px]" strokeWidth={1.9} aria-hidden />
            </button>
          </div>
        ))}
        {context.length === 0 ? (
          <div className="py-5">
            <p className="text-sm text-[var(--text)]">No folders granted.</p>
            <p className="mt-1 text-xs text-[var(--subtext-0)]">Agents will only see the workspace they are given in their own editor.</p>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
      <div className="flex items-center gap-3">
        <button type="button" className="action" onClick={() => void add()} disabled={busy}>{busy ? "Choosing…" : "Add folder"}</button>
        <span className="text-[var(--t-section)] text-[var(--overlay-1)]">Databases and APIs reach agents through each provider’s own connections — never duplicated here.</span>
      </div>
    </div>
  );
}
