import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, CheckCircle2, ExternalLink, PanelRightClose, PanelRightOpen, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { GENZEN_WORKSPACE_DATABASE_IDS, listWorkflowRuns } from "@/lib/data";
import type { WorkflowRunItem } from "@/lib/types";
import { useWindowSize } from "@/lib/use-window-size";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "intelizen:agent-panel-collapsed";
const WORKFLOW_RUNS_DATABASE_ID = GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns;
const RUN_BOARD_VIEW_ID = "c2000000-0000-0000-0000-000000000102";
const APPROVAL_QUEUE_VIEW_ID = "c2000000-0000-0000-0000-000000000103";

function readCollapsed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function workflowRunsUrl(viewId: string) {
  return `/databases?database=${WORKFLOW_RUNS_DATABASE_ID}&view=${viewId}`;
}

function formatRunTime(value: string | null) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No timestamp";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusTone(status: string | null) {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "needs approval") return "border-[color-mix(in_srgb,var(--caution)_42%,transparent)] text-[var(--caution)]";
  if (normalized === "blocked") return "border-[color-mix(in_srgb,var(--danger)_38%,transparent)] text-[var(--danger)]";
  if (normalized === "done") return "border-[color-mix(in_srgb,var(--success)_38%,transparent)] text-[var(--success)]";
  if (normalized === "in progress") return "border-[color-mix(in_srgb,var(--info)_38%,transparent)] text-[var(--info)]";
  return "border-[var(--border)] text-[var(--subtext-0)]";
}

function runTitle(run: WorkflowRunItem) {
  return run.name.trim() || "Untitled workflow run";
}

export function AgentPanel() {
  const [collapsed, setCollapsed] = useState(() => readCollapsed());
  const { isCramped } = useWindowSize();

  const activeRunsQuery = useQuery({
    queryKey: ["workflow-runs", "agent-panel", "active"],
    queryFn: () => listWorkflowRuns({ includeCompleted: false, limit: 8 }),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });
  const approvalsQuery = useQuery({
    queryKey: ["workflow-runs", "agent-panel", "approvals"],
    queryFn: () => listWorkflowRuns({ status: "Needs approval", includeCompleted: true, limit: 8 }),
    refetchInterval: 60_000,
    staleTime: 20_000,
  });

  const activeRuns = activeRunsQuery.data ?? [];
  const approvals = approvalsQuery.data ?? [];
  const isFetching = activeRunsQuery.isFetching || approvalsQuery.isFetching;
  const error = activeRunsQuery.error ?? approvalsQuery.error;

  const visibleRuns = useMemo(() => {
    const approvalIds = new Set(approvals.map((run) => run.id));
    return activeRuns.filter((run) => !approvalIds.has(run.id)).slice(0, 5);
  }, [activeRuns, approvals]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function refresh() {
    await Promise.all([
      activeRunsQuery.refetch(),
      approvalsQuery.refetch(),
    ]);
  }

  if (collapsed || isCramped) {
    return (
      <aside className="flex h-dvh w-12 shrink-0 flex-col items-center border-l border-[var(--border)] bg-[var(--mantle)] py-3">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label="Expand agent panel"
          title="Expand agent panel"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
        <div className="mt-4 flex flex-col items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--accent)]">
            <Bot className="h-4 w-4" />
          </span>
          {approvals.length > 0 ? (
            <span className="rounded-full border border-[color-mix(in_srgb,var(--caution)_42%,transparent)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--caution)]">
              {approvals.length}
            </span>
          ) : null}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-dvh w-[336px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--mantle)]">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--accent)]">
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-ui text-[13px] font-semibold text-[var(--text)]">Agent Panel</p>
            <p className="truncate font-ui text-[11px] text-[var(--overlay-1)]">Workflow Runs</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={refresh}
            aria-label="Refresh agent panel"
            title="Refresh"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Collapse agent panel"
            title="Collapse agent panel"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {error ? (
          <div className="rounded-md border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] p-3">
            <p className="font-ui text-[12px] font-medium text-[var(--danger)]">Workflow Runs unavailable</p>
            <p className="mt-1 line-clamp-3 font-ui text-[11px] text-[var(--subtext-0)]">
              {error instanceof Error ? error.message : "Refresh failed."}
            </p>
          </div>
        ) : null}

        <section className="space-y-2">
          <PanelSectionHeader
            label="Approvals"
            count={approvals.length}
            to={workflowRunsUrl(APPROVAL_QUEUE_VIEW_ID)}
          />
          {approvals.length > 0 ? (
            approvals.map((run) => <RunCard key={run.id} run={run} approval />)
          ) : (
            <EmptyState label="No pending approvals" icon={<CheckCircle2 className="h-4 w-4" />} />
          )}
        </section>

        <section className="mt-5 space-y-2">
          <PanelSectionHeader
            label="Active Runs"
            count={visibleRuns.length}
            to={workflowRunsUrl(RUN_BOARD_VIEW_ID)}
          />
          {visibleRuns.length > 0 ? (
            visibleRuns.map((run) => <RunCard key={run.id} run={run} />)
          ) : (
            <EmptyState label={isFetching ? "Loading runs" : "No active runs"} icon={<RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />} />
          )}
        </section>
      </div>

      <div className="shrink-0 border-t border-[var(--border)] p-3">
        <Link
          to={workflowRunsUrl(RUN_BOARD_VIEW_ID)}
          className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-transparent px-3 font-ui text-xs font-medium text-[var(--text)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-wash)]"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Workflow Runs
        </Link>
      </div>
    </aside>
  );
}

function PanelSectionHeader({ label, count, to }: { label: string; count: number; to: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">{label}</h2>
        <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--subtext-0)]">
          {count}
        </span>
      </div>
      <Link
        to={to}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
        aria-label={`${label} view`}
        title={label}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function RunCard({ run, approval = false }: { run: WorkflowRunItem; approval?: boolean }) {
  return (
    <article className="rounded-md border border-[var(--border)] bg-[var(--base)] p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 min-w-0 font-ui text-[12px] font-medium leading-snug text-[var(--text)]">
          {runTitle(run)}
        </p>
        <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 font-ui text-[10px] font-medium", statusTone(run.status))}>
          {run.status ?? "No status"}
        </span>
      </div>
      <div className="mt-2 space-y-1">
        {run.current_step ? (
          <p className="line-clamp-2 font-ui text-[11px] leading-snug text-[var(--subtext-0)]">{run.current_step}</p>
        ) : null}
        <div className="flex items-center justify-between gap-2 font-ui text-[10.5px] text-[var(--overlay-1)]">
          <span className="truncate">{run.actor ?? run.owner_role ?? "Unassigned"}</span>
          <span className="shrink-0">{formatRunTime(run.updated_at)}</span>
        </div>
      </div>
      {approval ? (
        <div className="mt-2 border-t border-[var(--border-subtle)] pt-2 font-ui text-[10.5px] text-[var(--caution)]">
          {run.receipt || run.body_preview || "Approval required"}
        </div>
      ) : null}
    </article>
  );
}

function EmptyState({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-[var(--border)] px-3 py-2 font-ui text-[12px] text-[var(--overlay-1)]">
      {icon}
      <span>{label}</span>
    </div>
  );
}
