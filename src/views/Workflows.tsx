import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { GENZEN_WORKSPACE_DATABASE_IDS, listWorkflowRuns, listWorkflows } from "@/lib/data";
import { isActiveWorkflowRun } from "@/lib/active-work";
import type { WorkspaceDatabaseFieldValue } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { WorkflowDesigner } from "@/components/workflows/workflow-designer";
import { listAgentPanelRoleTargets } from "@/services/agent-panel-roles";
import {
  buildWorkflowCatalog,
  type WorkflowCatalogItem,
  type WorkflowCatalogState,
} from "@/lib/workflow-catalog";

type WorkflowLane = "executable" | "sop-only";
type WorkflowStateFilter = "all" | Exclude<WorkflowCatalogState, "sop-only">;

const STATE_FILTERS: Array<{ id: WorkflowStateFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "runnable", label: "Runnable" },
  { id: "blocked", label: "Blocked" },
  { id: "draft", label: "Draft" },
  { id: "needs-review", label: "Needs review" },
];

function formatValue(value: WorkspaceDatabaseFieldValue) {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "None";
  return String(value);
}

function formatElapsed(iso: string | null | undefined) {
  if (!iso) return "unknown";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function normalizeSnippet(value: string | null | undefined) {
  return value?.trim() || "Not recorded.";
}

function catalogStateVariant(
  state: WorkflowCatalogState,
): "success" | "secondary" | "warning" | "destructive" | "info" {
  if (state === "runnable") return "success";
  if (state === "blocked") return "destructive";
  if (state === "draft" || state === "needs-review") return "warning";
  return "info";
}

function catalogStateLabel(state: WorkflowCatalogState) {
  if (state === "sop-only") return "SOP only";
  if (state === "needs-review") return "Needs review";
  return state[0].toUpperCase() + state.slice(1);
}

function InfoCell({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-2">
      <div className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">{label}</div>
      <div className="mt-1 truncate font-ui text-[12px] text-[var(--text)]">{value ?? "None"}</div>
    </div>
  );
}

function WorkflowCard({
  item,
  selected,
  onSelect,
}: {
  item: WorkflowCatalogItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const workflow = item.workflow;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-md border px-3 py-3 text-left transition-colors",
        selected
          ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-[var(--mantle)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-wash)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 font-ui text-[13px] font-semibold leading-snug text-[var(--text)]">{workflow.name}</p>
          <p className="mt-1 truncate font-mono text-[10px] text-[var(--overlay-1)]">{workflow.workflow_id}</p>
        </div>
        <Badge variant={catalogStateVariant(item.state)} className="shrink-0">
          {catalogStateLabel(item.state)}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {workflow.owner_role ? <Badge variant="info">{workflow.owner_role}</Badge> : null}
        {workflow.default_actor ? <Badge variant="outline">{workflow.default_actor}</Badge> : null}
        {workflow.entity ? <Badge variant="neutral">{workflow.entity}</Badge> : null}
      </div>
      {item.blockers[0] ? (
        <p className="mt-3 line-clamp-2 font-ui text-[10.5px] leading-snug text-[var(--danger)]">
          {item.blockers[0].message}
        </p>
      ) : null}
    </button>
  );
}

export function WorkflowsView() {
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [lane, setLane] = useState<WorkflowLane>("executable");
  const [stateFilter, setStateFilter] = useState<WorkflowStateFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [designerOpen, setDesignerOpen] = useState(false);

  const workflowQuery = useQuery({
    queryKey: ["workflow-registry", "screen", entityFilter, ownerFilter],
    queryFn: () =>
      listWorkflows({
        entity: entityFilter,
        includeInactive: true,
        ownerRole: ownerFilter || null,
        limit: 100,
      }),
    refetchInterval: 60_000,
  });
  const rolesQuery = useQuery({
    queryKey: ["workflow-designer", "role-targets"],
    queryFn: listAgentPanelRoleTargets,
    staleTime: 30_000,
  });
  const activeRunsQuery = useQuery({
    queryKey: ["active-work", "workflow-screen"],
    queryFn: () => listWorkflowRuns({ includeCompleted: false, limit: 100 }),
    refetchInterval: 15_000,
  });

  const workflows = workflowQuery.data ?? [];
  const catalog = useMemo(
    () => buildWorkflowCatalog(workflows, rolesQuery.data ?? []),
    [rolesQuery.data, workflows],
  );
  const ownerOptions = useMemo(
    () => Array.from(new Set(workflows.map((workflow) => workflow.owner_role).filter((value): value is string => Boolean(value)))).sort(),
    [workflows],
  );

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalog.filter((item) => {
      if (lane === "sop-only" && item.state !== "sop-only") return false;
      if (lane === "executable" && item.state === "sop-only") return false;
      if (
        lane === "executable" &&
        stateFilter !== "all" &&
        item.state !== stateFilter
      ) {
        return false;
      }
      if (!query) return true;
      const workflow = item.workflow;
      return (
      [
        workflow.name,
        workflow.workflow_id,
        workflow.owner_role,
        workflow.default_actor,
        workflow.entity,
        workflow.source_path,
        workflow.trigger,
        workflow.expected_output,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
      );
    });
  }, [catalog, lane, search, stateFilter]);

  useEffect(() => {
    if (filteredItems.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredItems.some((item) => item.workflow.id === selectedId)) {
      setSelectedId(filteredItems[0].workflow.id);
    }
  }, [filteredItems, selectedId]);

  const selectedItem =
    filteredItems.find((item) => item.workflow.id === selectedId) ??
    filteredItems[0] ??
    null;
  const selected = selectedItem?.workflow ?? null;
  const selectedActiveRun = useMemo(
    () =>
      (activeRunsQuery.data ?? []).find(
        (run) =>
          run.workflow_record_id === selected?.id &&
          isActiveWorkflowRun(run),
      ) ?? null,
    [activeRunsQuery.data, selected?.id],
  );
  const laneCounts = useMemo(
    () => ({
      executable: catalog.filter((item) => item.state !== "sop-only").length,
      sopOnly: catalog.filter((item) => item.state === "sop-only").length,
    }),
    [catalog],
  );

  if (workflowQuery.error) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
        <div className="border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
          <span className="text-label">Workflows unavailable</span>
          <p className="mt-2 font-ui text-[13px] text-[var(--danger)]">
            {workflowQuery.error instanceof Error ? workflowQuery.error.message : "Workflow registry could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <div className="flex shrink-0 items-end justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <div>
          <span className="text-label">Workflows</span>
          <p className="mt-1 font-ui text-[12px] text-[var(--overlay-1)]">
            Executable definitions and canonical SOP records
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            void workflowQuery.refetch();
          }}
          disabled={workflowQuery.isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", workflowQuery.isFetching && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="flex h-[46%] w-full shrink-0 flex-col border-b border-[var(--border)] bg-[var(--base)] lg:h-auto lg:w-[390px] lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b border-[var(--border)] p-4">
            <div className="grid grid-cols-2 gap-1 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-1">
              {([
                { id: "executable" as const, label: "Executable", count: laneCounts.executable },
                { id: "sop-only" as const, label: "SOP only", count: laneCounts.sopOnly },
              ]).map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => {
                    setLane(filter.id);
                    setStateFilter("all");
                  }}
                  className={cn(
                    "h-8 min-w-0 rounded px-2 font-ui text-[11px] font-medium transition-colors",
                    lane === filter.id
                      ? "bg-[var(--base)] text-[var(--text)]"
                      : "text-[var(--overlay-1)] hover:text-[var(--subtext-0)]",
                  )}
                >
                  {filter.label} · {filter.count}
                </button>
              ))}
            </div>

            {lane === "executable" ? (
              <div className="flex flex-wrap gap-1.5" aria-label="Execution state filters">
                {STATE_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setStateFilter(filter.id)}
                    className={cn(
                      "rounded-full border px-2 py-1 font-ui text-[10px] transition-colors",
                      stateFilter === filter.id
                        ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]"
                        : "border-[var(--border)] text-[var(--overlay-1)] hover:text-[var(--text)]",
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            ) : null}

            <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2.5">
              <Search className="h-3.5 w-3.5 text-[var(--overlay-1)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search workflows"
                className="min-w-0 flex-1 bg-transparent font-ui text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--overlay-1)]"
              />
            </label>

            <select
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
              aria-label="Workflow owner role filter"
              className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2.5 font-ui text-[12px] text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
            >
              <option value="">All owner roles</option>
              {ownerOptions.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {workflowQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-2 font-ui text-[12px] text-[var(--overlay-1)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading workflows...
              </div>
            ) : filteredItems.length > 0 ? (
              <div className="space-y-2">
                {filteredItems.map((item) => (
                  <WorkflowCard
                    key={item.workflow.id}
                    item={item}
                    selected={item.workflow.id === selected?.id}
                    onSelect={() => setSelectedId(item.workflow.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-[var(--border)] px-4 py-8 text-center font-ui text-[12px] text-[var(--overlay-1)]">
                No workflows match this view.
              </div>
            )}
          </div>
        </aside>

        <main className={cn("min-w-0 flex-1", designerOpen ? "overflow-hidden" : "overflow-y-auto px-6 py-5")}>
          {selected && selectedItem?.executable && designerOpen ? (
            <WorkflowDesigner
              workflow={selected}
              roleTargets={rolesQuery.data ?? []}
              onClose={() => setDesignerOpen(false)}
              onSaved={() => {
                setDesignerOpen(false);
                void workflowQuery.refetch();
              }}
            />
          ) : selected ? (
            <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
              <section className="border-b border-[var(--border)] pb-5">
                <div className="flex items-start justify-between gap-5">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant={catalogStateVariant(selectedItem?.state ?? "sop-only")}>
                        {catalogStateLabel(selectedItem?.state ?? "sop-only")}
                      </Badge>
                      {selected.entity ? <Badge variant="neutral">{selected.entity}</Badge> : null}
                      <Badge variant="outline">{formatElapsed(selected.updated_at)}</Badge>
                    </div>
                    <h1 className="font-ui text-[24px] font-semibold leading-tight text-[var(--text)]">{selected.name}</h1>
                    <p className="mt-2 font-mono text-[11px] text-[var(--overlay-1)]">{selected.workflow_id}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {selectedItem?.executable ? (
                      <Button size="sm" variant="outline" onClick={() => setDesignerOpen(true)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Design
                      </Button>
                    ) : null}
                    <Link
                      to={`/databases/${GENZEN_WORKSPACE_DATABASE_IDS.workflowRegistry}`}
                      className={cn(buttonVariants({ size: "sm", variant: "accent-outline" }), "shrink-0")}
                    >
                      Open canonical record
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
                {selectedActiveRun ? (
                  <Link
                    to={`/workflows?run=${selectedActiveRun.id}`}
                    className="mt-4 flex items-center justify-between gap-4 rounded-md border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-2 font-ui text-[12px] text-[var(--text)]"
                  >
                    <span className="min-w-0 truncate">
                      Current work · {selectedActiveRun.name}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] uppercase text-[var(--overlay-1)]">
                      {selectedActiveRun.status ?? "In progress"}
                    </span>
                  </Link>
                ) : null}
              </section>

              {selectedItem?.state === "sop-only" ? (
                <section className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-4 py-3">
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--overlay-1)]" />
                    <div>
                      <p className="font-ui text-[12px] font-semibold text-[var(--text)]">
                        Canonical SOP record
                      </p>
                      <p className="mt-1 font-ui text-[11px] leading-relaxed text-[var(--overlay-1)]">
                        This record has no validated schema-v1 definition. It is reference material and cannot enter the designer or runner.
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}

              {selectedItem && selectedItem.blockers.length > 0 ? (
                <section className="rounded-md border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_7%,var(--base))] px-4 py-3">
                  <div className="flex items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--danger)]">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Exact blockers
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {selectedItem.blockers.map((blocker, index) => (
                      <li key={`${blocker.kind}-${blocker.stepId ?? index}`} className="font-ui text-[11px] leading-relaxed text-[var(--subtext-0)]">
                        <span className="font-semibold capitalize text-[var(--text)]">{blocker.kind}</span>
                        {" · "}
                        {blocker.message}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoCell label="Owner role" value={selected.owner_role} />
                <InfoCell label="Default actor" value={selected.default_actor} />
                <InfoCell label="Source doc" value={formatValue(selected.source_document_id)} />
                <InfoCell label="Linked runs" value={selected.run_ids.length} />
              </section>

              <section className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">
                      <Route className="h-3.5 w-3.5" />
                      Trigger / Inputs
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <InfoCell label="Trigger" value={selected.trigger} />
                      <InfoCell label="Default routing" value={selected.default_routing} />
                    </div>
                    <pre className="mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[12px] leading-relaxed text-[var(--subtext-0)]">
                      {normalizeSnippet(selected.required_inputs)}
                    </pre>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Approval Gates
                    </div>
                    <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[12px] leading-relaxed text-[var(--subtext-0)]">
                      {normalizeSnippet(selected.approval_gates)}
                    </pre>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Success / Failure
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[12px] leading-relaxed text-[var(--subtext-0)]">
                        {normalizeSnippet(selected.success_criteria)}
                      </pre>
                      <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[12px] leading-relaxed text-[var(--subtext-0)]">
                        {normalizeSnippet(selected.failure_behavior)}
                      </pre>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">
                      <FileText className="h-3.5 w-3.5" />
                      Source / Output
                    </div>
                    <div className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3">
                      <InfoCell label="Source path" value={selected.source_path} />
                      <InfoCell label="Related databases" value={selected.related_databases.join(", ") || null} />
                      <div>
                        <div className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">Expected output</div>
                        <p className="mt-1 whitespace-pre-wrap font-ui text-[12px] leading-relaxed text-[var(--subtext-0)]">
                          {normalizeSnippet(selected.expected_output)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">
                      <UserRound className="h-3.5 w-3.5" />
                      Receipt Template
                    </div>
                    <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[12px] leading-relaxed text-[var(--subtext-0)]">
                      {normalizeSnippet(selected.receipt_template)}
                    </pre>
                  </div>

                  <div>
                    <div className="mb-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">Body Preview</div>
                    <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[12px] leading-relaxed text-[var(--subtext-0)]">
                      {normalizeSnippet(selected.body_preview)}
                    </pre>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-[var(--border)] font-ui text-[13px] text-[var(--overlay-1)]">
              Select a workflow template to inspect its source, routing, and approval policy.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
