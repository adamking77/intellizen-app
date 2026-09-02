import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CircleAlert,
  Clipboard,
  RefreshCw,
} from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AppearanceSection } from "@/components/settings/appearance";
import { Button } from "@/components/ui/button";
import {
  PANEL_SPEAK_REPLIES_KEY,
  PANEL_START_ROLE_KEY,
} from "@/lib/agent-panel-roles";
import {
  normalizeRuntimeModelPolicy,
  runtimeBindingCandidate,
} from "@/lib/runtime-binding-candidates";
import {
  ALLOW_RUN_OVERRIDE_KEY,
  DEFAULT_EXECUTION_KEY,
  DEFAULT_RUNTIME_KEY,
  readPreference,
  writePreference,
} from "@/lib/settings-preferences";
import { inspectWorkflowReceiptIntegrity } from "@/lib/data/work-receipts";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/toast";
import {
  prepareRuntimeWorkerProfile,
  previewRuntimeBinding,
  saveRuntimeBinding,
  type RuntimeBinding,
} from "@/services/runtime-bindings";
import { listAgentPanelRoleTargets } from "@/services/agent-panel-roles";
import {
  inspectRuntimeCatalog,
  inspectSettingsConnections,
} from "@/services/runtime-catalog";

const SECTIONS = [
  { id: "runtimes", label: "Runtimes" },
  { id: "defaults", label: "Defaults" },
  { id: "appearance", label: "Appearance" },
  { id: "worker-access", label: "Worker access" },
  { id: "connections", label: "Connections" },
  { id: "diagnostics", label: "Diagnostics" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function readBoolean(key: string, fallback: boolean) {
  return readPreference(key, fallback ? "1" : "0") === "1";
}

function FactBadge({ value, label }: { value: boolean; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em]",
        value
          ? "border-[color-mix(in_srgb,var(--success)_35%,var(--border))] text-[var(--success)]"
          : "border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] text-[var(--warning)]",
      )}
    >
      {value ? <Check className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
      {label}
    </span>
  );
}

function PreferenceRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 border-b border-[var(--border)] py-5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_240px] md:items-center">
      <div>
        <p className="font-ui text-sm font-semibold text-[var(--text)]">{label}</p>
        <p className="mt-1 max-w-xl text-xs leading-5 text-[var(--subtext-0)]">{description}</p>
      </div>
      {children}
    </div>
  );
}

export function SettingsView() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const requested = params.get("section") as SectionId | null;
  const section = SECTIONS.some((item) => item.id === requested) ? requested! : "runtimes";
  const [reviewed, setReviewed] = useState<RuntimeBinding | null>(null);
  const [saving, setSaving] = useState(false);
  const [defaultRuntime, setDefaultRuntime] = useState(() => readPreference(DEFAULT_RUNTIME_KEY, "codex-local-primary"));
  const [defaultExecution, setDefaultExecution] = useState(() => readPreference(DEFAULT_EXECUTION_KEY, "ephemeral"));
  const [allowOverride, setAllowOverride] = useState(() => readBoolean(ALLOW_RUN_OVERRIDE_KEY, true));
  const [startRole, setStartRole] = useState(() => readPreference(PANEL_START_ROLE_KEY, "operations_director"));
  const [speakReplies, setSpeakReplies] = useState(() => readBoolean(PANEL_SPEAK_REPLIES_KEY, false));

  const runtimeQuery = useQuery({
    queryKey: ["settings-runtime-catalog"],
    queryFn: inspectRuntimeCatalog,
    staleTime: 15_000,
  });
  const connectionQuery = useQuery({
    queryKey: ["settings-connections"],
    queryFn: inspectSettingsConnections,
    staleTime: 15_000,
  });
  const rolesQuery = useQuery({
    queryKey: ["agent-panel-role-targets"],
    queryFn: listAgentPanelRoleTargets,
    staleTime: 15_000,
  });
  const receiptIntegrityQuery = useQuery({
    queryKey: ["workflow-receipt-integrity"],
    queryFn: inspectWorkflowReceiptIntegrity,
    enabled: section === "diagnostics",
    staleTime: 15_000,
  });
  const roles = useMemo(
    () => (rolesQuery.data ?? []).filter((role) => role.state === "ready"),
    [rolesQuery.data],
  );

  function navigate(next: SectionId) {
    setParams({ section: next }, { replace: true });
  }

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["settings-runtime-catalog"] }),
      queryClient.invalidateQueries({ queryKey: ["settings-connections"] }),
      queryClient.invalidateQueries({ queryKey: ["agent-panel-role-targets"] }),
    ]);
  }

  async function reviewBinding(adapterId: "codex-cli" | "claude-cli") {
    const runtime = runtimeQuery.data?.find((item) => item.adapterId === adapterId);
    if (!runtime) return;
    setReviewed(runtimeBindingCandidate(runtime.discovery));
  }

  async function createReviewedBinding() {
    if (!reviewed) return;
    setSaving(true);
    try {
      const preview = await previewRuntimeBinding(reviewed);
      await saveRuntimeBinding(preview.binding);
      await prepareRuntimeWorkerProfile(preview.binding.bindingId);
      setReviewed(null);
      await refresh();
      toast.success("Local runtime binding created");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function updateReviewedModelPolicy(
    defaultModel: string,
    allowedModels: string | string[],
  ) {
    setReviewed((current) =>
      current
        ? {
            ...current,
            modelPolicy: normalizeRuntimeModelPolicy(
              defaultModel,
              allowedModels,
            ),
          }
        : null,
    );
  }

  const observedReceipt = JSON.stringify(
    {
      observedAt: new Date().toISOString(),
      runtimes: runtimeQuery.data,
      connections: connectionQuery.data,
      receiptIntegrity: receiptIntegrityQuery.data,
    },
    null,
    2,
  );

  return (
    <div className="flex h-full min-h-0 bg-[var(--base)]">
      <aside className="w-52 shrink-0 border-r border-[var(--border)] bg-[var(--mantle)] px-3 py-5">
        <span className="mb-2 block px-2 font-ui text-[11px] font-light uppercase tracking-[0.14em] text-[var(--text-muted)]">Settings</span>
        <nav className="flex flex-col gap-0.5" aria-label="Settings sections">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.id)}
              aria-selected={section === item.id}
              className="nav-node focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]"
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-7 py-6">
        {section === "appearance" ? (
          <h1 className="mx-auto max-w-5xl font-ui text-[16px] font-light uppercase tracking-[0.16em] text-[var(--text)]">Appearance</h1>
        ) : (
        <header className="mx-auto flex max-w-5xl items-start justify-between gap-4 border-b border-[var(--border)] pb-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">Local control plane</p>
            <h1 className="mt-1 font-display text-2xl text-[var(--text)]">{SECTIONS.find((item) => item.id === section)?.label}</h1>
            <p className="mt-1 text-xs leading-5 text-[var(--subtext-0)]">Observed state is shown separately from saved policy. Credentials stay in provider-owned worker profiles.</p>
          </div>
          <Button variant="outline" onClick={() => void refresh()} disabled={runtimeQuery.isFetching || connectionQuery.isFetching}>
            <RefreshCw className={cn("mr-2 h-3.5 w-3.5", (runtimeQuery.isFetching || connectionQuery.isFetching) && "animate-spin")} />
            Re-check
          </Button>
        </header>
        )}

        <div className="mx-auto max-w-5xl py-5">
          {section === "runtimes" ? (
            <div className="space-y-4">
              {runtimeQuery.isLoading ? <p className="text-sm text-[var(--subtext-0)]">Inspecting local runtimes…</p> : null}
              {runtimeQuery.error ? <p className="text-sm text-[var(--danger)]">{errorMessage(runtimeQuery.error)}</p> : null}
              {(runtimeQuery.data ?? []).map((runtime) => (
                <section key={runtime.adapterId} className="rounded-lg border border-[var(--border)] bg-[var(--mantle)] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-ui text-base font-semibold text-[var(--text)]">{runtime.label}</h2>
                        <span className={cn("rounded-full px-2 py-0.5 font-mono text-[10px] uppercase", runtime.usable ? "bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[var(--success)]" : "bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] text-[var(--warning)]")}>{runtime.usable ? "Usable" : "Not usable"}</span>
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-[var(--subtext-0)]">{runtime.discovery.version || "No installed version detected"}</p>
                    </div>
                    {!runtime.bound && runtime.discovery.supported ? (
                      <Button variant="outline" onClick={() => void reviewBinding(runtime.adapterId)}>Review binding</Button>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <FactBadge value={runtime.installed} label="Installed" />
                    <FactBadge value={runtime.supported} label="Supported" />
                    <FactBadge value={runtime.authenticated} label="Authenticated" />
                    <FactBadge value={runtime.bound} label="Bound" />
                    <FactBadge value={runtime.assigned} label="Assigned" />
                  </div>
                  <dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-[var(--border)] pt-4 font-mono text-[11px] md:grid-cols-2">
                    <div><dt className="text-[var(--overlay-1)]">Binary · {runtime.discovery.resolutionSource}</dt><dd className="mt-1 break-all text-[var(--subtext-0)]">{runtime.discovery.binary || "Not resolved"}</dd></div>
                    <div><dt className="text-[var(--overlay-1)]">Supported range</dt><dd className="mt-1 text-[var(--subtext-0)]">{runtime.discovery.supportRange}</dd></div>
                    <div><dt className="text-[var(--overlay-1)]">Worker profile</dt><dd className="mt-1 break-all text-[var(--subtext-0)]">{runtime.discovery.workerProfileHome}</dd></div>
                    <div><dt className="text-[var(--overlay-1)]">Assigned roles</dt><dd className="mt-1 text-[var(--subtext-0)]">{runtime.assignedRoles.map((role) => role.roleName).join(", ") || "None"}</dd></div>
                    <div><dt className="text-[var(--overlay-1)]">Capability evidence</dt><dd className="mt-1 text-[var(--subtext-0)]">{runtime.binding?.capabilityEvidence.passed.join(" · ") || "No reviewed binding"}</dd></div>
                    <div><dt className="text-[var(--overlay-1)]">Last checked</dt><dd className="mt-1 text-[var(--subtext-0)]">{new Date(runtime.discovery.checkedAtMs).toLocaleString()}</dd></div>
                  </dl>
                  {runtime.blockers.length ? (
                    <div className="mt-4 rounded border border-[color-mix(in_srgb,var(--warning)_25%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_6%,transparent)] p-3">
                      {runtime.blockers.map((blocker) => <p key={blocker} className="text-xs leading-5 text-[var(--warning)]">{blocker}</p>)}
                      <p className="mt-1 text-xs text-[var(--subtext-0)]">
                        {runtime.bound && !runtime.assigned
                          ? "Assign this reviewed binding to an active role in Team."
                          : runtime.discovery.remediation}
                      </p>
                    </div>
                  ) : null}
                  {runtime.modelChoices.length ? (
                    <label className="mt-4 block text-xs text-[var(--subtext-0)]">Confirmed model <select className="ml-2 rounded border border-[var(--border)] bg-[var(--base)] px-2 py-1">{runtime.modelChoices.map((model) => <option key={model}>{model}</option>)}</select></label>
                  ) : null}
                </section>
              ))}
              {reviewed ? (
                <section className="rounded-lg border border-[var(--accent-border)] bg-[var(--mantle)] p-5">
                  <p className="font-ui text-sm font-semibold text-[var(--text)]">Reviewed local change</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--subtext-0)]">Create <span className="font-mono text-[var(--accent)]">{reviewed.bindingId}</span>, its provider-owned worker profile, and no Supabase record.</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="text-xs text-[var(--subtext-0)] md:col-span-2">
                      Working-directory grant
                      <input
                        value={reviewed.workingDirGrants[0] ?? ""}
                        onChange={(event) =>
                          setReviewed((current) =>
                            current
                              ? {
                                  ...current,
                                  workingDirGrants: event.target.value
                                    ? [event.target.value]
                                    : [],
                                }
                              : null,
                          )
                        }
                        placeholder="/absolute/path/to/reviewed/workspace"
                        className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--base)] px-3 py-2 font-mono text-xs text-[var(--text)]"
                      />
                      <span className="mt-1 block leading-5">The worker is confined to this reviewed local workspace. IntelliZen also discovers its MCP build from this checkout.</span>
                    </label>
                    <label className="text-xs text-[var(--subtext-0)]">
                      Default model
                      <input
                        value={reviewed.modelPolicy.default}
                        onChange={(event) =>
                          updateReviewedModelPolicy(
                            event.target.value,
                            reviewed.modelPolicy.allowed,
                          )
                        }
                        placeholder="Provider-managed default"
                        className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--base)] px-3 py-2 font-mono text-xs text-[var(--text)]"
                      />
                    </label>
                    <label className="text-xs text-[var(--subtext-0)]">
                      Allowed model overrides
                      <input
                        value={reviewed.modelPolicy.allowed.join(", ")}
                        onChange={(event) =>
                          updateReviewedModelPolicy(
                            reviewed.modelPolicy.default,
                            event.target.value,
                          )
                        }
                        placeholder="Comma-separated; empty denies overrides"
                        className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--base)] px-3 py-2 font-mono text-xs text-[var(--text)]"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex gap-2"><Button onClick={() => void createReviewedBinding()} disabled={saving || !reviewed.workingDirGrants[0]}>{saving ? "Creating…" : "Create local binding"}</Button><Button variant="ghost" onClick={() => setReviewed(null)}>Cancel</Button></div>
                </section>
              ) : null}
            </div>
          ) : null}

          {section === "defaults" ? (
            <section className="rounded-lg border border-[var(--border)] bg-[var(--mantle)] px-5">
              <PreferenceRow label="Default runtime" description="Used when a workflow definition does not name a binding."><select value={defaultRuntime} onChange={(event) => { setDefaultRuntime(event.target.value); writePreference(DEFAULT_RUNTIME_KEY, event.target.value); }} className="rounded border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-xs text-[var(--text)]"><option value="codex-local-primary">Codex local primary</option><option value="claude-local-primary">Claude local primary</option></select></PreferenceRow>
              <PreferenceRow label="Default execution class" description="Ephemeral workers end with the assignment; durable workers retain a governed session."><select value={defaultExecution} onChange={(event) => { setDefaultExecution(event.target.value); writePreference(DEFAULT_EXECUTION_KEY, event.target.value); }} className="rounded border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-xs text-[var(--text)]"><option value="ephemeral">Ephemeral</option><option value="durable">Durable</option></select></PreferenceRow>
              <PreferenceRow label="Per-run overrides" description="Allow reviewed workflow runs to choose a different confirmed binding."><button type="button" role="switch" aria-checked={allowOverride} onClick={() => { const next = !allowOverride; setAllowOverride(next); writePreference(ALLOW_RUN_OVERRIDE_KEY, next ? "1" : "0"); }} className={cn("justify-self-start rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase", allowOverride ? "border-[var(--success)] text-[var(--success)]" : "border-[var(--border)] text-[var(--subtext-0)]")}>{allowOverride ? "Allowed" : "Locked"}</button></PreferenceRow>
              <PreferenceRow label="Panel start role" description="The Agent Panel opens on this role when no valid current selection exists."><select value={startRole} onChange={(event) => { setStartRole(event.target.value); writePreference(PANEL_START_ROLE_KEY, event.target.value); }} className="rounded border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-xs text-[var(--text)]">{roles.map((role) => <option key={role.roleKey} value={role.roleKey}>{role.roleName}</option>)}{roles.length === 0 ? <option value={startRole}>{startRole}</option> : null}</select></PreferenceRow>
              <PreferenceRow label="Speak replies" description="Read completed Agent Panel replies aloud using the current native voice provider."><button type="button" role="switch" aria-checked={speakReplies} onClick={() => { const next = !speakReplies; setSpeakReplies(next); writePreference(PANEL_SPEAK_REPLIES_KEY, next ? "1" : "0"); }} className={cn("justify-self-start rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase", speakReplies ? "border-[var(--success)] text-[var(--success)]" : "border-[var(--border)] text-[var(--subtext-0)]")}>{speakReplies ? "On" : "Off"}</button></PreferenceRow>
            </section>
          ) : null}

          {section === "appearance" ? <AppearanceSection /> : null}

          {section === "worker-access" ? (
            <div className="space-y-4">{(runtimeQuery.data ?? []).map((runtime) => <section key={runtime.bindingId} className="rounded-lg border border-[var(--border)] bg-[var(--mantle)] p-5"><h2 className="font-ui text-sm font-semibold text-[var(--text)]">{runtime.label}</h2><dl className="mt-4 grid gap-3 font-mono text-[11px] md:grid-cols-2"><div><dt className="text-[var(--overlay-1)]">Profile</dt><dd className="mt-1 break-all text-[var(--subtext-0)]">{runtime.discovery.workerProfileHome}</dd></div><div><dt className="text-[var(--overlay-1)]">Permission mode</dt><dd className="mt-1 text-[var(--subtext-0)]">{runtime.binding?.providerPermissionMode ?? "No binding"}</dd></div><div><dt className="text-[var(--overlay-1)]">Working-directory grants</dt><dd className="mt-1 text-[var(--subtext-0)]">{runtime.binding?.workingDirGrants.join(", ") ?? "None"}</dd></div><div><dt className="text-[var(--overlay-1)]">Environment</dt><dd className="mt-1 text-[var(--subtext-0)]">sanitized · worker MCP only · secrets by reference</dd></div></dl></section>)}</div>
          ) : null}

          {section === "connections" ? (
            <div className="grid gap-3 md:grid-cols-2">{connectionQuery.isLoading ? <p className="text-sm text-[var(--subtext-0)]">Checking connections…</p> : null}{(connectionQuery.data ?? []).map((connection) => <section key={connection.id} className="rounded-lg border border-[var(--border)] bg-[var(--mantle)] p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-ui text-sm font-semibold text-[var(--text)]">{connection.label}</h2><FactBadge value={connection.ready} label={connection.ready ? "Ready" : "Unavailable"} /></div><p className="mt-3 text-xs leading-5 text-[var(--subtext-0)]">{connection.detail}</p></section>)}</div>
          ) : null}

          {section === "diagnostics" ? (
            <div className="space-y-4">
              <section className="rounded-lg border border-[var(--border)] bg-[var(--mantle)] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-ui text-sm font-semibold text-[var(--text)]">Workflow transition coverage</h2>
                    <p className="mt-1 text-xs text-[var(--subtext-0)]">Detects schema-v1 run versions written outside the transactional transition RPC or missing from append-only history.</p>
                  </div>
                  <Button variant="outline" onClick={() => void receiptIntegrityQuery.refetch()} disabled={receiptIntegrityQuery.isFetching}>
                    <RefreshCw className={cn("mr-2 h-3.5 w-3.5", receiptIntegrityQuery.isFetching && "animate-spin")} />
                    Check
                  </Button>
                </div>
                {receiptIntegrityQuery.error ? <p className="mt-4 text-xs text-[var(--danger)]">{errorMessage(receiptIntegrityQuery.error)}</p> : null}
                {receiptIntegrityQuery.data ? (
                  <dl className="mt-4 grid gap-3 font-mono text-[11px] md:grid-cols-4">
                    <div><dt className="text-[var(--overlay-1)]">Runs</dt><dd className="mt-1 text-[var(--text)]">{receiptIntegrityQuery.data.runCount}</dd></div>
                    <div><dt className="text-[var(--overlay-1)]">Expected</dt><dd className="mt-1 text-[var(--text)]">{receiptIntegrityQuery.data.expectedTransitionCount}</dd></div>
                    <div><dt className="text-[var(--overlay-1)]">Observed</dt><dd className="mt-1 text-[var(--text)]">{receiptIntegrityQuery.data.observedTransitionCount}</dd></div>
                    <div><dt className="text-[var(--overlay-1)]">Runs missing versions</dt><dd className={cn("mt-1", receiptIntegrityQuery.data.runsWithGaps.length ? "text-[var(--danger)]" : "text-[var(--success)]")}>{receiptIntegrityQuery.data.runsWithGaps.length}</dd></div>
                  </dl>
                ) : null}
              </section>
              <section className="rounded-lg border border-[var(--border)] bg-[var(--mantle)] p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-ui text-sm font-semibold text-[var(--text)]">Observed-state receipt</h2><p className="mt-1 text-xs text-[var(--subtext-0)]">No credentials or secret values are included.</p></div><Button variant="outline" onClick={() => void navigator.clipboard.writeText(observedReceipt).then(() => toast.success("Diagnostics copied"))}><Clipboard className="mr-2 h-3.5 w-3.5" />Copy</Button></div><pre className="mt-4 max-h-[460px] overflow-auto rounded bg-[var(--base)] p-4 font-mono text-[10px] leading-5 text-[var(--subtext-0)]">{observedReceipt}</pre></section>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
