import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
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
import { Link, useSearchParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/app-dialog";
import { GENZEN_WORKSPACE_DATABASE_IDS, listWorkflowRuns, listWorkflows } from "@/lib/data";
import { isActiveWorkflowRun } from "@/lib/active-work";
import { formatElapsed } from "@/lib/format-elapsed";
import type { WorkspaceDatabaseFieldValue } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { WorkflowDesigner } from "@/components/workflows/workflow-designer";
import { WorkflowDefinitionDriftPanel } from "@/components/workflows/workflow-definition-drift-panel";
import { WorkflowTopology } from "@/components/workflows/workflow-topology";
import { ScheduleSheet } from "@/components/workflows/schedule-sheet";
import { listAgentPanelRoleTargets } from "@/services/agent-panel-roles";
import {
  buildWorkflowCatalog,
  type WorkflowCatalogItem,
  type WorkflowCatalogState,
} from "@/lib/workflow-catalog";
import { buildWorkflowTopology } from "@/lib/workflow-topology";
import {
  validatedWorkflowDefinitionHash,
  validateWorkflowDefinition,
  type WorkflowDefinitionV1,
} from "@/lib/workflow-schema";
import {
  inspectWorkflowDefinitionDrift,
  resolveWorkflowDefinitionDrift,
  type WorkflowDriftResolution,
  type WorkflowDriftResponse,
} from "@/lib/workflow-definition-drift";
import { useStartWorkflow } from "@/lib/use-start-workflow";

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

function normalizeSnippet(value: string | null | undefined) {
  return value?.trim() || "Not recorded.";
}

function hasRecordedValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return Boolean(value);
}

function workflowApprovalLabel(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "No approval decision";
  }
  const decisions = Object.values(value as Record<string, unknown>)
    .map((entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>).decision
        : null,
    )
    .filter((decision): decision is string => typeof decision === "string");
  if (decisions.length === 0) return "Approval state recorded";
  return `Approval · ${decisions.join(", ")}`;
}

function workflowVerificationLabel(
  definition: WorkflowDefinitionV1 | null,
  stepStates: unknown,
) {
  const verifierSteps =
    definition?.steps.filter(
      (step) => step.kind === "role-assign" && step.role === "verifier",
    ) ?? [];
  if (
    !stepStates ||
    typeof stepStates !== "object" ||
    Array.isArray(stepStates) ||
    verifierSteps.length === 0
  ) {
    return "Verification pending";
  }
  const states = stepStates as Record<string, unknown>;
  const recorded = verifierSteps
    .map((step) => states[step.id])
    .filter((state): state is string => typeof state === "string");
  return recorded.length > 0
    ? `Verification · ${recorded.join(", ")}`
    : "Verification pending";
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
    <div className="min-w-0 rounded-[var(--r-row)] border border-[var(--border)] bg-[var(--mantle)] px-3 py-2">
      <div className="font-ui text-[var(--t-count)] font-light uppercase text-[var(--overlay-1)]">{label}</div>
      <div className="mt-1 truncate font-ui text-[var(--t-meta)] text-[var(--text)]">{value ?? "None"}</div>
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
        "w-full rounded-[var(--r-row)] border px-3 py-3 text-left transition-colors",
        selected
          ? "border-transparent bg-[var(--selected)] hover:bg-[var(--selected-hover)]"
          : "border-[var(--border)] bg-[var(--mantle)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-wash)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 font-ui text-[var(--t-ui)] font-semibold leading-snug text-[var(--text)]">{workflow.name}</p>
          <p className="mt-1 truncate font-mono text-[var(--t-count)] text-[var(--overlay-1)]">{workflow.workflow_id}</p>
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
        <p className="mt-3 line-clamp-2 font-ui text-[var(--t-count)] leading-snug text-[var(--danger)]">
          {item.blockers[0].message}
        </p>
      ) : null}
    </button>
  );
}

export function WorkflowsView() {
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedRunId = searchParams.get("run");
  const [lane, setLane] = useState<WorkflowLane>("executable");
  const [stateFilter, setStateFilter] = useState<WorkflowStateFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [designerSeed, setDesignerSeed] =
    useState<WorkflowDefinitionV1 | null>(null);
  const [driftResolution, setDriftResolution] =
    useState<WorkflowDriftResolution | null>(null);
  const [migrationReviewOpen, setMigrationReviewOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);

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
    queryFn: () => listWorkflowRuns({ includeCompleted: true, limit: 100 }),
    refetchInterval: 15_000,
  });
  const workflowStarter = useStartWorkflow({
    onStarted: () => activeRunsQuery.refetch(),
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

  const selectedRun =
    (activeRunsQuery.data ?? []).find((run) => run.id === requestedRunId) ??
    null;
  useEffect(() => {
    if (!selectedRun?.workflow_record_id) return;
    const runWorkflow = catalog.find(
      (item) => item.workflow.id === selectedRun.workflow_record_id,
    );
    if (!runWorkflow) return;
    setLane(runWorkflow.state === "sop-only" ? "sop-only" : "executable");
    setStateFilter("all");
    setSelectedId(runWorkflow.workflow.id);
    setDesignerOpen(false);
  }, [catalog, selectedRun]);

  const selectedItem =
    (selectedRun?.workflow_record_id
      ? catalog.find(
          (item) => item.workflow.id === selectedRun.workflow_record_id,
        )
      : null) ??
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
  const liveRunDefinition = useMemo(() => {
    if (!selectedRun) return null;
    const validation = validateWorkflowDefinition(
      selectedRun.definition_snapshot,
    );
    return validation.valid
      ? (selectedRun.definition_snapshot as WorkflowDefinitionV1)
      : null;
  }, [selectedRun]);
  const selectedTopology = useMemo(() => {
    const definition = liveRunDefinition ?? selectedItem?.definition;
    if (!definition) return null;
    return buildWorkflowTopology({
      definition,
      roleTargets: rolesQuery.data ?? [],
      mode: liveRunDefinition ? "run" : "definition",
      run: liveRunDefinition ? selectedRun : null,
    });
  }, [
    liveRunDefinition,
    rolesQuery.data,
    selectedItem?.definition,
    selectedRun,
  ]);
  const definitionDriftQuery = useQuery({
    queryKey: [
      "workflow-definition-drift",
      selectedRun?.id,
      selectedRun?.definition_hash,
      selectedRun?.updated_at,
      selectedItem?.workflow.updated_at,
    ],
    enabled: Boolean(
      selectedRun &&
        liveRunDefinition &&
        selectedItem?.definition,
    ),
    queryFn: async () => {
      const currentDefinition = selectedItem?.definition ?? null;
      const runDefinition = liveRunDefinition;
      const [runHash, currentHash] = await Promise.all([
        selectedRun?.definition_hash
          ? Promise.resolve(selectedRun.definition_hash)
          : runDefinition
            ? validatedWorkflowDefinitionHash(runDefinition)
            : Promise.resolve(null),
        currentDefinition
          ? validatedWorkflowDefinitionHash(currentDefinition)
          : Promise.resolve(null),
      ]);
      return inspectWorkflowDefinitionDrift({
        runDefinition,
        currentDefinition,
        runHash,
        currentHash,
      });
    },
  });
  const definitionDrift =
    definitionDriftQuery.data ??
    inspectWorkflowDefinitionDrift({
      runDefinition: liveRunDefinition,
      currentDefinition: selectedItem?.definition ?? null,
      runHash: selectedRun?.definition_hash ?? null,
      currentHash: null,
    });

  useEffect(() => {
    setDriftResolution(null);
    setDesignerSeed(null);
    setMigrationReviewOpen(false);
  }, [selectedRun?.id]);

  function handleDriftResponse(response: WorkflowDriftResponse) {
    if (
      !selectedRun ||
      !liveRunDefinition ||
      definitionDrift.state !== "drifted"
    ) {
      return;
    }
    const resolution = resolveWorkflowDefinitionDrift({
      drift: definitionDrift,
      response,
      runId: selectedRun.id,
      runDefinition: liveRunDefinition,
    });
    setDriftResolution(resolution);
    if (resolution.response === "clone-definition") {
      setDesignerSeed(resolution.definition);
      setDesignerOpen(true);
    } else if (resolution.response === "reviewed-migration") {
      setMigrationReviewOpen(true);
    }
  }

  async function confirmReviewedMigration() {
    if (
      !selected ||
      !selectedRun ||
      driftResolution?.response !== "reviewed-migration"
    ) {
      return;
    }
    const result = await workflowStarter.start({
      workflowId: selected.workflow_id,
      triggerSource: "ui",
      sourceRecords: [selectedRun.id],
      context: {
        definition_migration: {
          source_run_id: selectedRun.id,
          source_definition_hash: driftResolution.sourceHash,
          target_definition_hash: driftResolution.targetHash,
          reviewed: true,
        },
      },
    });
    if (result) setMigrationReviewOpen(false);
  }
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
        <div className="bg-[var(--base)] px-3 py-4 sm:px-6">
          <span className="t-title text-[var(--text)]">Workflows unavailable</span>
          <p className="mt-2 font-ui text-[var(--t-ui)] text-[var(--danger)]">
            {workflowQuery.error instanceof Error ? workflowQuery.error.message : "Workflow registry could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 bg-[var(--base)] px-3 py-4 sm:px-6">
        <div>
          <span className="t-title text-[var(--text)]">Workflows</span>
          <p className="mt-1 font-ui text-[var(--t-meta)] text-[var(--overlay-1)]">
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
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {!designerOpen ? (
          <aside className="flex h-[46%] w-full shrink-0 flex-col bg-[var(--mantle)] lg:h-auto lg:w-[390px]">
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-2 gap-1 rounded-[var(--r-row)] bg-[var(--base)] p-1">
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
                    "h-8 min-w-0 rounded px-2 font-ui text-[var(--t-section)] font-medium transition-colors",
                    lane === filter.id
                      ? "bg-[var(--selected)] text-[var(--text)]"
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
                      "rounded-[var(--r-pill)] px-2 py-1 font-ui text-[var(--t-count)] transition-colors",
                      stateFilter === filter.id
                        ? "bg-[var(--selected)] text-[var(--text)]"
                        : "text-[var(--overlay-1)] hover:bg-[var(--hover)] hover:text-[var(--text)]",
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            ) : null}

            <label className="flex h-9 items-center gap-2 rounded-[var(--r-row)] bg-[var(--input)] px-2.5">
              <Search className="h-3.5 w-3.5 text-[var(--overlay-1)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search workflows"
                className="min-w-0 flex-1 bg-transparent font-ui text-[var(--t-meta)] text-[var(--text)] outline-none placeholder:text-[var(--overlay-1)]"
              />
            </label>

            <select
              value={ownerFilter}
              onChange={(event) => setOwnerFilter(event.target.value)}
              aria-label="Workflow owner role filter"
              className="h-9 w-full rounded-[var(--r-row)] border-0 bg-[var(--input)] px-2.5 font-ui text-[var(--t-meta)] text-[var(--text)] outline-none"
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
              <div role="status" className="flex items-center gap-2 px-3 py-2 font-ui text-[var(--t-meta)] text-[var(--overlay-1)]">
                <Loader2 className="h-4 w-4" />
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
              <div className="px-4 py-8 text-center font-ui text-[var(--t-meta)] text-[var(--overlay-1)]">
                No workflows match this view.
              </div>
            )}
          </div>
          </aside>
        ) : null}

        <main className={cn("min-w-0 flex-1", designerOpen ? "overflow-hidden" : "overflow-y-auto px-3 py-4 sm:px-6 sm:py-5")}>
          {selected && selectedItem?.executable && designerOpen ? (
            <WorkflowDesigner
              workflow={selected}
              roleTargets={rolesQuery.data ?? []}
              initialDefinition={designerSeed}
              onClose={() => {
                setDesignerOpen(false);
                setDesignerSeed(null);
              }}
              onSaved={() => {
                setDesignerOpen(false);
                void workflowQuery.refetch();
              }}
            />
          ) : selected ? (
            <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
              <section className="border-b border-[var(--border)] pb-5">
                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:gap-5">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant={catalogStateVariant(selectedItem?.state ?? "sop-only")}>
                        {catalogStateLabel(selectedItem?.state ?? "sop-only")}
                      </Badge>
                      {selected.entity ? <Badge variant="neutral">{selected.entity}</Badge> : null}
                      <Badge variant="outline">{formatElapsed(selected.updated_at)}</Badge>
                    </div>
                    <h1 className="t-title leading-tight text-[var(--text)]">{selected.name}</h1>
                    <p className="mt-2 font-mono text-[var(--t-section)] text-[var(--overlay-1)]">{selected.workflow_id}</p>
                  </div>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
                    {selectedItem?.executable ? (
                      <Button
                        disabled={!selectedItem.runnable}
                        onClick={() => setScheduleOpen(true)}
                        size="sm"
                        title={selectedItem.runnable ? "Schedule this workflow" : "Resolve the listed blockers before scheduling"}
                        variant="outline"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                        Schedule
                      </Button>
                    ) : null}
                    {selectedItem?.executable ? (
                      <Button size="sm" variant="outline" onClick={() => {
                        setDesignerSeed(null);
                        setDesignerOpen(true);
                      }}>
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
                    className="mt-4 flex items-center justify-between gap-4 rounded-[var(--r-row)] bg-[var(--selected)] px-3 py-2 font-ui text-[var(--t-meta)] text-[var(--text)] transition-colors hover:bg-[var(--selected-hover)]"
                  >
                    <span className="min-w-0 truncate">
                      Current work · {selectedActiveRun.name}
                    </span>
                    <span className="shrink-0 font-mono text-[var(--t-count)] uppercase text-[var(--overlay-1)]">
                      {selectedActiveRun.status ?? "In progress"}
                    </span>
                  </Link>
                ) : null}
              </section>

              {selectedItem?.state === "sop-only" ? (
                <section className="rounded-[var(--r-row)] border border-[var(--border)] bg-[var(--mantle)] px-4 py-3">
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[var(--overlay-1)]" />
                    <div>
                      <p className="font-ui text-[var(--t-meta)] font-semibold text-[var(--text)]">
                        Canonical SOP record
                      </p>
                      <p className="mt-1 font-ui text-[var(--t-section)] leading-relaxed text-[var(--overlay-1)]">
                        This record has no validated schema-v1 definition. It is reference material and cannot enter the designer or runner.
                      </p>
                    </div>
                  </div>
                </section>
              ) : null}

              {selectedItem && selectedItem.blockers.length > 0 ? (
                <section className="rounded-[var(--r-row)] border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_7%,var(--base))] px-4 py-3">
                  <div className="flex items-center gap-2 font-ui text-[var(--t-section)] font-light uppercase text-[var(--danger)]">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Exact blockers
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {selectedItem.blockers.map((blocker, index) => (
                      <li key={`${blocker.kind}-${blocker.stepId ?? index}`} className="font-ui text-[var(--t-section)] leading-relaxed text-[var(--subtext-0)]">
                        <span className="font-semibold capitalize text-[var(--text)]">{blocker.kind}</span>
                        {" · "}
                        {blocker.message}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <WorkflowDefinitionDriftPanel
                drift={definitionDrift}
                resolution={driftResolution}
                onResolve={handleDriftResponse}
              />

              {selectedTopology ? (
                <section>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-ui text-[var(--t-section)] font-light uppercase tracking-[0.12em] text-[var(--overlay-1)]">
                        {selectedRun ? "Live run topology" : "Topology preview"}
                      </p>
                      <p className="mt-1 font-ui text-[var(--t-section)] text-[var(--subtext-0)]">
                        {selectedRun
                          ? selectedRun.name
                          : "The same graph enters design, dry-run, and run modes."}
                      </p>
                    </div>
                    {selectedRun ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setSearchParams({})}
                      >
                        Close run
                      </Button>
                    ) : null}
                  </div>
                  {selectedRun ? (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                      <Badge variant="info">
                        Execution · {selectedRun.status ?? "Unknown"}
                      </Badge>
                      <Badge variant={selectedRun.receipt ? "success" : "secondary"}>
                        {selectedRun.receipt ? "Receipt recorded" : "Receipt pending"}
                      </Badge>
                      <Badge variant={hasRecordedValue(selectedRun.approvals) ? "warning" : "secondary"}>
                        {workflowApprovalLabel(selectedRun.approvals)}
                      </Badge>
                      <Badge variant={hasRecordedValue(selectedRun.step_states) ? "success" : "secondary"}>
                        {workflowVerificationLabel(
                          liveRunDefinition,
                          selectedRun.step_states,
                        )}
                      </Badge>
                      <Badge variant={selectedRun.completed_at ? "success" : "secondary"}>
                        {selectedRun.completed_at ? "Completion recorded" : "Not completed"}
                      </Badge>
                    </div>
                  ) : null}
                  <WorkflowTopology
                    key={
                      selectedRun
                        ? `run-${selectedRun.id}`
                        : `definition-${selected.id}`
                    }
                    topology={selectedTopology}
                    compact={!selectedRun}
                  />
                </section>
              ) : selectedRun ? (
                <section className="rounded-[var(--r-row)] border border-[var(--border)] bg-[var(--mantle)] px-4 py-3 font-ui text-[var(--t-section)] text-[var(--overlay-1)]">
                  This run has no valid schema-v1 snapshot, so it cannot be represented as an executable topology.
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
                    <div className="mb-2 flex items-center gap-2 font-ui text-[var(--t-section)] font-light uppercase text-[var(--overlay-1)]">
                      <Route className="h-3.5 w-3.5" />
                      Trigger / Inputs
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <InfoCell label="Trigger" value={selected.trigger} />
                      <InfoCell label="Default routing" value={selected.default_routing} />
                    </div>
                    <pre className="mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap rounded-[var(--r-row)] border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[var(--t-meta)] leading-relaxed text-[var(--subtext-0)]">
                      {normalizeSnippet(selected.required_inputs)}
                    </pre>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[var(--t-section)] font-light uppercase text-[var(--overlay-1)]">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Approval Gates
                    </div>
                    <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-[var(--r-row)] border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[var(--t-meta)] leading-relaxed text-[var(--subtext-0)]">
                      {normalizeSnippet(selected.approval_gates)}
                    </pre>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[var(--t-section)] font-light uppercase text-[var(--overlay-1)]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Success / Failure
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-[var(--r-row)] border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[var(--t-meta)] leading-relaxed text-[var(--subtext-0)]">
                        {normalizeSnippet(selected.success_criteria)}
                      </pre>
                      <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-[var(--r-row)] border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[var(--t-meta)] leading-relaxed text-[var(--subtext-0)]">
                        {normalizeSnippet(selected.failure_behavior)}
                      </pre>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[var(--t-section)] font-light uppercase text-[var(--overlay-1)]">
                      <FileText className="h-3.5 w-3.5" />
                      Source / Output
                    </div>
                    <div className="space-y-3 rounded-[var(--r-row)] border border-[var(--border)] bg-[var(--mantle)] p-3">
                      <InfoCell label="Source path" value={selected.source_path} />
                      <InfoCell label="Related databases" value={selected.related_databases.join(", ") || null} />
                      <div>
                        <div className="font-ui text-[var(--t-count)] font-light uppercase text-[var(--overlay-1)]">Expected output</div>
                        <p className="mt-1 whitespace-pre-wrap font-ui text-[var(--t-meta)] leading-relaxed text-[var(--subtext-0)]">
                          {normalizeSnippet(selected.expected_output)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[var(--t-section)] font-light uppercase text-[var(--overlay-1)]">
                      <UserRound className="h-3.5 w-3.5" />
                      Receipt Template
                    </div>
                    <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-[var(--r-row)] border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[var(--t-meta)] leading-relaxed text-[var(--subtext-0)]">
                      {normalizeSnippet(selected.receipt_template)}
                    </pre>
                  </div>

                  <div>
                    <div className="mb-2 font-ui text-[var(--t-section)] font-light uppercase text-[var(--overlay-1)]">Body Preview</div>
                    <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap rounded-[var(--r-row)] border border-[var(--border)] bg-[var(--mantle)] p-3 font-ui text-[var(--t-meta)] leading-relaxed text-[var(--subtext-0)]">
                      {normalizeSnippet(selected.body_preview)}
                    </pre>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-[var(--r-row)] border border-dashed border-[var(--border)] p-4 text-center font-ui text-[var(--t-ui)] text-[var(--overlay-1)]">
              Select a workflow template to inspect its source, routing, and approval policy.
            </div>
          )}
        </main>
      </div>
      <AppDialog
        open={migrationReviewOpen}
        onOpenChange={(open) => {
          if (!workflowStarter.isStartingWorkflow) setMigrationReviewOpen(open);
        }}
        title="Create reviewed replacement run?"
        description="The historical run remains pinned and unchanged. This creates a new run from the current Registry definition."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setMigrationReviewOpen(false)}
              disabled={workflowStarter.isStartingWorkflow}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void confirmReviewedMigration()}
              disabled={workflowStarter.isStartingWorkflow}
            >
              {workflowStarter.isStartingWorkflow
                ? "Creating replacement…"
                : "Confirm reviewed migration"}
            </Button>
          </>
        }
      >
        {driftResolution?.response === "reviewed-migration" ? (
          <dl className="grid gap-2 font-mono text-[var(--t-count)] text-[var(--subtext-0)]">
            <div>
              <dt className="text-[var(--overlay-1)]">Source run</dt>
              <dd>{driftResolution.sourceRunId}</dd>
            </div>
            <div>
              <dt className="text-[var(--overlay-1)]">Snapshot identity</dt>
              <dd>{driftResolution.sourceHash}</dd>
            </div>
            <div>
              <dt className="text-[var(--overlay-1)]">Target identity</dt>
              <dd>{driftResolution.targetHash}</dd>
            </div>
          </dl>
        ) : null}
      </AppDialog>
      {selected && selectedItem?.definition ? (
        <ScheduleSheet
          definition={selectedItem.definition}
          onOpenChange={setScheduleOpen}
          open={scheduleOpen}
          workflow={selected}
        />
      ) : null}
    </div>
  );
}
