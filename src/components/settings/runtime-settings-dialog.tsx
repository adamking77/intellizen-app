import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import {
  listRuntimeBindings,
  prepareRuntimeWorkerProfile,
  previewRuntimeBinding,
  saveRuntimeBinding,
  type RuntimeBinding,
} from "@/services/runtime-bindings";
import {
  discoverClaudeRuntime,
  discoverCodexRuntime,
  type RuntimeDiscovery,
} from "@/services/runtimes";
import { isTauriRuntime } from "@/components/layout/window-chrome";
import { runtimeBindingCandidate } from "@/lib/runtime-binding-candidates";

export function RuntimeSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [discoveries, setDiscoveries] = useState<RuntimeDiscovery[]>([]);
  const [boundIds, setBoundIds] = useState<Set<string>>(new Set());
  const [reviewed, setReviewed] = useState<RuntimeBinding | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (!isTauriRuntime) {
      setError("Runtime discovery is available in the IntelliZen desktop app.");
      return;
    }
    void Promise.all([
      discoverCodexRuntime(),
      discoverClaudeRuntime(),
      listRuntimeBindings(),
    ])
      .then(([codex, claude, store]) => {
        setDiscoveries([codex, claude]);
        setBoundIds(new Set(store.bindings.map((binding) => binding.bindingId)));
      })
      .catch((cause) => setError(String(cause)));
  }, [open]);

  async function review(discovery: RuntimeDiscovery) {
    try {
      const result = await previewRuntimeBinding(
        runtimeBindingCandidate(discovery),
      );
      setReviewed(result.binding);
    } catch (cause) {
      setError(String(cause));
    }
  }

  async function save() {
    if (!reviewed) return;
    try {
      await saveRuntimeBinding(reviewed);
      await prepareRuntimeWorkerProfile(reviewed.bindingId);
      setBoundIds((current) => new Set(current).add(reviewed.bindingId));
      setReviewed(null);
      toast.success(
        `${reviewed.adapterId === "codex-cli" ? "Codex" : "Claude"} runtime binding created`,
      );
    } catch (cause) {
      setError(String(cause));
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Settings · Runtimes"
      description="Local bindings stay on this Mac. Provider credentials never enter IntelliZen or Supabase."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          {reviewed ? (
            <Button onClick={() => void save()}>Create binding</Button>
          ) : null}
        </>
      }
    >
      {error ? (
        <p className="text-sm text-[var(--danger)]">{error}</p>
      ) : discoveries.length === 0 ? (
        <p className="text-sm text-[var(--subtext-0)]">Inspecting local runtimes…</p>
      ) : (
        <div className="space-y-4">
          {discoveries.map((discovery) => {
            const candidate = runtimeBindingCandidate(discovery);
            const bound = boundIds.has(candidate.bindingId);
            const label =
              discovery.adapterId === "codex-cli" ? "Codex CLI" : "Claude Code";
            return (
              <section
                key={discovery.adapterId}
                className="border-b border-[var(--border)] pb-4 last:border-b-0 last:pb-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-ui text-sm font-semibold text-[var(--text)]">{label}</p>
                    <p className="mt-1 font-mono text-xs text-[var(--subtext-0)]">
                      {discovery.version || "Not installed"}
                    </p>
                  </div>
                  <span className="rounded-full border border-[var(--border)] px-2.5 py-1 font-mono text-[10px] text-[var(--subtext-0)]">
                    {bound ? "BOUND" : discovery.authState.replace("_", " ").toUpperCase()}
                  </span>
                </div>
                <dl className="mt-3 grid gap-2 font-mono text-[11px]">
                  <div><dt className="text-[var(--overlay-1)]">Binary</dt><dd className="break-all text-[var(--subtext-0)]">{discovery.binary}</dd></div>
                  <div><dt className="text-[var(--overlay-1)]">Worker profile</dt><dd className="break-all text-[var(--subtext-0)]">{discovery.workerProfileHome}</dd></div>
                  <div><dt className="text-[var(--overlay-1)]">Environment</dt><dd className="text-[var(--subtext-0)]">sanitized · worker MCP only</dd></div>
                </dl>
                {!bound ? (
                  <Button
                    className="mt-3"
                    variant="outline"
                    onClick={() => void review(discovery)}
                    disabled={!discovery.supported}
                  >
                    Review binding
                  </Button>
                ) : null}
              </section>
            );
          })}
          {reviewed ? (
            <p className="text-xs leading-5 text-[var(--warning)]">
              Review complete. Creating this binding writes the local binding store and its worker-only provider profile.
            </p>
          ) : null}
        </div>
      )}
    </AppDialog>
  );
}
