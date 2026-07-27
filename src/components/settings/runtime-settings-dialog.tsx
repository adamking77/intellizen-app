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
import { discoverCodexRuntime, type RuntimeDiscovery } from "@/services/runtimes";

export function RuntimeSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [discovery, setDiscovery] = useState<RuntimeDiscovery | null>(null);
  const [bound, setBound] = useState(false);
  const [reviewed, setReviewed] = useState<RuntimeBinding | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    void Promise.all([discoverCodexRuntime(), listRuntimeBindings()])
      .then(([runtime, store]) => {
        setDiscovery(runtime);
        setBound(store.bindings.some((binding) => binding.bindingId === "codex-local-primary"));
      })
      .catch((cause) => setError(String(cause)));
  }, [open]);

  const candidate = discovery
    ? ({
        bindingId: "codex-local-primary",
        adapterId: "codex-cli",
        canonicalBinary: discovery.binary,
        argTemplates: [
          "exec",
          "--strict-config",
          "--json",
          "--ephemeral",
          "--ignore-rules",
          "--sandbox",
          "workspace-write",
          "-c",
          'approval_policy="never"',
          "-C",
          "{workingDirectory}",
          "-",
        ],
        workingDirGrants: ["/Users/adamking/projects/intellizen-app"],
        providerPermissionMode: "workspace-write",
        envPolicy: "sanitized",
        workerProfileHome: discovery.workerProfileHome,
        secretRefs: [],
        capabilityEvidence: {
          suiteVersion: "gate3",
          passed: ["structured-output", "stream", "cancel", "timeout", "usage"],
          cliVersion: discovery.version,
        },
        modelPolicy: { default: "", allowed: [] },
      } satisfies RuntimeBinding)
    : null;

  async function review() {
    if (!candidate) return;
    try {
      const result = await previewRuntimeBinding(candidate);
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
      setBound(true);
      setReviewed(null);
      toast.success("Codex runtime binding created");
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
          ) : (
            <Button
              onClick={() => void review()}
              disabled={!candidate || !discovery?.supported}
            >
              Review binding
            </Button>
          )}
        </>
      }
    >
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {!discovery ? (
        <p className="text-sm text-[var(--subtext-0)]">Inspecting local runtimes…</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-wash)] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-ui text-sm font-semibold text-[var(--text)]">Codex CLI</p>
                <p className="mt-1 font-mono text-xs text-[var(--subtext-0)]">
                  {discovery.version || "Not installed"}
                </p>
              </div>
              <span className="rounded-full border border-[var(--border)] px-2.5 py-1 font-mono text-[10px] text-[var(--subtext-0)]">
                {bound ? "BOUND" : discovery.authState.replace("_", " ").toUpperCase()}
              </span>
            </div>
            <dl className="mt-4 grid gap-2 font-mono text-[11px]">
              <div><dt className="text-[var(--overlay-1)]">Binary</dt><dd className="break-all text-[var(--subtext-0)]">{discovery.binary}</dd></div>
              <div><dt className="text-[var(--overlay-1)]">Worker profile</dt><dd className="break-all text-[var(--subtext-0)]">{discovery.workerProfileHome}</dd></div>
              <div><dt className="text-[var(--overlay-1)]">Environment</dt><dd className="text-[var(--subtext-0)]">sanitized · worker MCP only</dd></div>
            </dl>
          </div>
          {reviewed ? (
            <p className="text-xs leading-5 text-[var(--warning)]">
              Review complete. Creating this binding writes the local binding store and worker-only Codex profile.
            </p>
          ) : null}
        </div>
      )}
    </AppDialog>
  );
}
