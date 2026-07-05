import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { GENZEN_WORKSPACE_DATABASE_IDS, listWorkflows } from "@/lib/data";
import type { WorkflowTemplateItem, WorkspaceDatabaseFieldValue } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";

type WorkflowStatusFilter = "active" | "inactive" | "all";

const STATUS_FILTERS: Array<{ id: WorkflowStatusFilter; label: string }> = [
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "all", label: "All" },
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

function workflowStatusVariant(status: string | null | undefined): "success" | "secondary" | "warning" {
  if (status === "Active") return "success";
  if (status === "Draft") return "warning";
  return "secondary";
}

function InfoCell({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-2">
      <div className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">{label}</div>
      <div className="mt-1 truncate font-ui text-[12px] text-[var(--text)]">{value ?? "None"}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-2">
      <div className="font-mono text-[20px] leading-none text-[var(--text)]">{value}</div>
      <div className="mt-1 font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">{label}</div>
    </div>
  );
}

function WorkflowCard({
  workflow,
  selected,
  onSelect,
}: {
  workflow: WorkflowTemplateItem;
  selected: boolean;
  onSelect: () => void;
}) {
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
        <Badge variant={workflowStatusVariant(workflow.status)} className="shrink-0">
          {workflow.status ?? "Unset"}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {workflow.owner_role ? <Badge variant="info">{workflow.owner_role}</Badge> : null}
        {workflow.default_actor ? <Badge variant="outline">{workflow.default_actor}</Badge> : null}
        {workflow.entity ? <Badge variant="neutral">{workflow.entity}</Badge> : null}
      </div>
    </button>
  );
}

export function WorkflowsView() {
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [statusFilter, setStatusFilter] = useState<WorkflowStatusFilter>("active");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const includeInactive = statusFilter !== "active";
  const workflowQuery = useQuery({
    queryKey: ["workflow-registry", "screen", entityFilter, statusFilter, ownerFilter],
    queryFn: () =>
      listWorkflows({
        entity: entityFilter,
        includeInactive,
        status: statusFilter === "inactive" ? "Inactive" : null,
        ownerRole: ownerFilter || null,
        limit: 100,
      }),
    refetchInterval: 60_000,
  });

  const workflows = workflowQuery.data ?? [];
  const ownerOptions = useMemo(
    () => Array.from(new Set(workflows.map((workflow) => workflow.owner_role).filter((value): value is string => Boolean(value)))).sort(),
    [workflows],
  );

  const filteredWorkflows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return workflows;
    return workflows.filter((workflow) =>
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
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [search, workflows]);

  useEffect(() => {
    if (filteredWorkflows.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredWorkflows.some((workflow) => workflow.id === selectedId)) {
      setSelectedId(filteredWorkflows[0].id);
    }
  }, [filteredWorkflows, selectedId]);

  const selected = filteredWorkflows.find((workflow) => workflow.id === selectedId) ?? filteredWorkflows[0] ?? null;
  const metrics = useMemo(() => ({
    total: workflows.length,
    active: workflows.filter((workflow) => workflow.status === "Active").length,
    approvalGated: workflows.filter((workflow) => Boolean(workflow.approval_gates)).length,
    linkedRuns: workflows.reduce((count, workflow) => count + workflow.run_ids.length, 0),
  }), [workflows]);

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
            SOP-backed templates · Workflow Registry records
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

      <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4 lg:grid-cols-4">
        <Metric label="Templates" value={metrics.total} />
        <Metric label="Active" value={metrics.active} />
        <Metric label="Approval gated" value={metrics.approvalGated} />
        <Metric label="Linked runs" value={metrics.linkedRuns} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="flex h-[46%] w-full shrink-0 flex-col border-b border-[var(--border)] bg-[var(--base)] lg:h-auto lg:w-[390px] lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b border-[var(--border)] p-4">
            <div className="grid grid-cols-3 gap-1 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-1">
              {STATUS_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setStatusFilter(filter.id)}
                  className={cn(
                    "h-7 min-w-0 rounded px-2 font-ui text-[11px] font-medium transition-colors",
                    statusFilter === filter.id
                      ? "bg-[var(--base)] text-[var(--text)]"
                      : "text-[var(--overlay-1)] hover:text-[var(--subtext-0)]",
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>

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
            ) : filteredWorkflows.length > 0 ? (
              <div className="space-y-2">
                {filteredWorkflows.map((workflow) => (
                  <WorkflowCard
                    key={workflow.id}
                    workflow={workflow}
                    selected={workflow.id === selected?.id}
                    onSelect={() => setSelectedId(workflow.id)}
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

        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          {selected ? (
            <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
              <section className="border-b border-[var(--border)] pb-5">
                <div className="flex items-start justify-between gap-5">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant={workflowStatusVariant(selected.status)}>{selected.status ?? "Unset"}</Badge>
                      {selected.entity ? <Badge variant="neutral">{selected.entity}</Badge> : null}
                      <Badge variant="outline">{formatElapsed(selected.updated_at)}</Badge>
                    </div>
                    <h1 className="font-ui text-[24px] font-semibold leading-tight text-[var(--text)]">{selected.name}</h1>
                    <p className="mt-2 font-mono text-[11px] text-[var(--overlay-1)]">{selected.workflow_id}</p>
                  </div>
                  <Link
                    to={`/databases/${GENZEN_WORKSPACE_DATABASE_IDS.workflowRegistry}`}
                    className={cn(buttonVariants({ size: "sm", variant: "accent-outline" }), "shrink-0")}
                  >
                    Open registry
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </section>

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
