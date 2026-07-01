import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Layout } from "react-grid-layout";
import { ArrowUpRight, CheckCircle2, CircleAlert, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { PinnedViewGrid, type PinnedDatabaseWidgetModel } from "@/components/home/pinned-view-grid";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  loadHomePins,
  saveHomePins,
  supportsPinnedHomeView,
  type HomePin,
} from "@/lib/home-pins";
import {
  loadHomeDashboardLayout,
  mergeHomeDashboardLayout,
  saveHomeDashboardLayout,
  type HomeDashboardLayoutItem,
} from "@/lib/home-dashboard";
import {
  GENZEN_WORKSPACE_DATABASE_IDS,
  listAgentProjects,
  listAgentWork,
  listWorkflowRuns,
  listWorkflows,
  listWorkspaceDatabaseCatalog,
} from "@/lib/data";
import { buildGzsDistributionHealthView, type GzsDistributionHealthView } from "@/lib/operating-views";
import { currentRotation, type RotationWeek } from "@/lib/rotation";
import type { AgentWorkItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROTATION_ACCENTS: Record<RotationWeek, string> = {
  Build: "var(--teal)",
  Marketing: "var(--peach)",
  Ops: "var(--yellow)",
  Slack: "var(--lavender)",
};

function OperatingMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning" | "danger" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "text-[var(--warning)]"
      : tone === "danger"
        ? "text-[var(--danger)]"
        : tone === "success"
          ? "text-[var(--success)]"
          : "text-[var(--text)]";
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-2">
      <div className={cn("font-mono text-[20px] leading-none", toneClass)}>{value}</div>
      <div className="mt-1 font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">{label}</div>
    </div>
  );
}

function WorkStatusBadge({ item }: { item: AgentWorkItem }) {
  const variant = item.status === "Blocked" ? "destructive" : item.status === "Needs approval" ? "warning" : "secondary";
  return <Badge variant={variant}>{item.status ?? "Unset"}</Badge>;
}

function AttentionRow({ item }: { item: AgentWorkItem }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--base)] px-3 py-2">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
        <p className="line-clamp-2 min-w-0 font-ui text-[12px] font-semibold leading-snug text-[var(--text)]">{item.title}</p>
        <WorkStatusBadge item={item} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {item.priority ? <Badge variant="neutral">{item.priority}</Badge> : null}
        {item.current_actor ? <Badge variant="outline">{item.current_actor}</Badge> : null}
        {item.initiative_name ? <Badge variant="info">{item.initiative_name}</Badge> : null}
      </div>
    </div>
  );
}

function GzsDistributionHealthPanel({
  view,
  isFetching,
  onRefresh,
}: {
  view: GzsDistributionHealthView;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="mb-5 rounded-md border border-[var(--border)] bg-[var(--surface-wash)]">
      <div className="flex flex-col gap-3 border-b border-[var(--border)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-label">{view.spec.title}</span>
            <Badge variant="outline">{view.spec.view_id}</Badge>
          </div>
          <p className="mt-1 max-w-3xl font-ui text-[12px] leading-relaxed text-[var(--overlay-1)]">{view.spec.purpose}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={onRefresh} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Link to="/databases" className={cn(buttonVariants({ size: "sm", variant: "accent-outline" }), "gap-1.5")}>
            Databases
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="grid gap-3 p-4 2xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 2xl:grid-cols-5">
            <OperatingMetric label="Open work" value={view.metrics.openWork} />
            <OperatingMetric label="Approvals" value={view.metrics.needsApproval} tone="warning" />
            <OperatingMetric label="Blocked" value={view.metrics.blocked} tone="danger" />
            <OperatingMetric label="Active runs" value={view.metrics.activeRuns} tone="success" />
            <OperatingMetric label="Workflows" value={view.metrics.workflowTemplates} />
          </div>

          <div className="grid gap-3 2xl:grid-cols-2">
            <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3">
              <div className="mb-2 flex items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">
                <CircleAlert className="h-3.5 w-3.5" />
                Needs attention
              </div>
              <div className="space-y-2">
                {view.attentionWork.length > 0 ? (
                  view.attentionWork.map((item) => <AttentionRow key={item.id} item={item} />)
                ) : (
                  <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 font-ui text-[12px] text-[var(--overlay-1)]">
                    No approval, blocked, or high-priority distribution work is currently visible.
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-3">
              {view.lanes.map((lane) => (
                <div key={lane.id} className="rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">
                      {lane.id === "approval" ? <ShieldCheck className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      <span className="truncate">{lane.label}</span>
                    </div>
                    <Badge variant={lane.count > 0 ? "outline" : "secondary"}>{lane.count}</Badge>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {lane.work.length > 0 ? (
                      lane.work.map((item) => (
                        <p key={item.id} className="line-clamp-2 font-ui text-[12px] leading-snug text-[var(--subtext-0)]">{item.title}</p>
                      ))
                    ) : (
                      <p className="font-ui text-[12px] text-[var(--overlay-1)]">No visible work in this lane.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3">
          <div>
            <div className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">Native view spec</div>
            <p className="mt-1 font-ui text-[12px] leading-relaxed text-[var(--subtext-0)]">
              {view.spec.entity_scope} · {view.spec.layout}
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-1">
            <div>
              <div className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">Sources</div>
              <ul className="mt-1 space-y-1 font-ui text-[12px] text-[var(--subtext-0)]">
                {view.spec.source_tables.map((source) => <li key={source}>{source}</li>)}
              </ul>
            </div>
            <div>
              <div className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">Policy</div>
              <ul className="mt-1 space-y-1 font-ui text-[12px] text-[var(--subtext-0)]">
                {view.spec.permissions.map((permission) => <li key={permission}>{permission}</li>)}
              </ul>
            </div>
          </div>
          <div>
            <div className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">Records sampled</div>
            <p className="mt-1 font-mono text-[11px] text-[var(--overlay-1)]">{view.spec.source_records.length} live records</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to={`/databases/${GENZEN_WORKSPACE_DATABASE_IDS.tasks}`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
              Tasks
            </Link>
            <Link to={`/databases/${GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns}`} className={buttonVariants({ size: "sm", variant: "ghost" })}>
              Runs
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}

export function HomeView() {
  const navigate = useNavigate();
  const [pins, setPins] = useState<HomePin[]>(() => loadHomePins());
  const [layout, setLayout] = useState<HomeDashboardLayoutItem[]>(() => loadHomeDashboardLayout());
  const rotation = currentRotation();
  const {
    data: catalog = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["workspace-database-catalog"],
    queryFn: listWorkspaceDatabaseCatalog,
    refetchInterval: 60_000,
  });
  const operatingViewQuery = useQuery({
    queryKey: ["home-operating-view", "gzs-distribution-health"],
    queryFn: async () => {
      const [projects, workItems, workflows, workflowRuns] = await Promise.all([
        listAgentProjects({ includeDone: false, limit: 120 }),
        listAgentWork({ includeDone: false, limit: 220 }),
        listWorkflows({ includeInactive: false, limit: 120 }),
        listWorkflowRuns({ includeCompleted: false, limit: 120 }),
      ]);
      return buildGzsDistributionHealthView({ projects, workItems, workflows, workflowRuns });
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    saveHomePins(pins);
  }, [pins]);

  useEffect(() => {
    saveHomeDashboardLayout(layout);
  }, [layout]);

  const pinnedWidgets = useMemo<PinnedDatabaseWidgetModel[]>(() => {
    const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
    return pins
      .map((pin): PinnedDatabaseWidgetModel | null => {
        const database = catalogById.get(pin.databaseId);
        const view = database?.views.find((candidate) => candidate.id === pin.viewId);
        if (!database || !view || !supportsPinnedHomeView(view.type)) return null;
        return { pin, database, view };
      })
      .filter((widget): widget is PinnedDatabaseWidgetModel => Boolean(widget));
  }, [catalog, pins]);

  useEffect(() => {
    const validIds = new Set(pinnedWidgets.map((widget) => widget.pin.id));

    if (validIds.size !== pins.length) {
      setPins((current) => current.filter((pin) => validIds.has(pin.id)));
    }

    if (layout.some((item) => !validIds.has(item.id))) {
      setLayout((current) => current.filter((item) => validIds.has(item.id)));
    }
  }, [layout, pins.length, pinnedWidgets]);

  const gridLayout = useMemo<Layout>(
    () =>
      mergeHomeDashboardLayout(
        pinnedWidgets.map((widget) => widget.pin),
        layout,
      ).map((item) => ({
        i: item.id,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: 4,
        minH: 8,
      })),
    [layout, pinnedWidgets],
  );

  function commitGridLayout(nextLayout: Layout) {
    setLayout(
      nextLayout.map((item) => ({
        id: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      })),
    );
  }

  function handleRemovePin(pinId: string) {
    setPins((current) => current.filter((pin) => pin.id !== pinId));
    setLayout((current) => current.filter((item) => item.id !== pinId));
  }

  if (error) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
          <span className="text-label">Home unavailable</span>
          <p className="mt-2 font-ui text-[13px] text-[var(--danger)]">
            {error instanceof Error ? error.message : "The dashboard could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <div className="flex shrink-0 items-end justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <div className="flex flex-col gap-2">
          <span className="text-label">Home</span>
          <p
            className="font-ui text-[12px]"
            style={{ color: ROTATION_ACCENTS[rotation.week] }}
          >
            {rotation.week} week · {rotation.daysRemaining} days remaining
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <section className="mx-auto flex w-full max-w-[1600px] flex-col">
          {operatingViewQuery.isLoading ? (
            <div className="mb-5 flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-4 py-3 font-ui text-[13px] text-[var(--overlay-1)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading GZS distribution health...</span>
            </div>
          ) : operatingViewQuery.data ? (
            <GzsDistributionHealthPanel
              view={operatingViewQuery.data}
              isFetching={operatingViewQuery.isFetching}
              onRefresh={() => void operatingViewQuery.refetch()}
            />
          ) : operatingViewQuery.error ? (
            <div className="mb-5 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-4 py-3">
              <p className="font-ui text-[13px] text-[var(--danger)]">
                {operatingViewQuery.error instanceof Error
                  ? operatingViewQuery.error.message
                  : "GZS distribution health could not be loaded."}
              </p>
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--mantle)] px-4 py-3 font-ui text-[13px] text-[var(--overlay-1)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading pinned views...</span>
            </div>
          ) : pinnedWidgets.length > 0 ? (
            <PinnedViewGrid
              widgets={pinnedWidgets}
              catalog={catalog}
              layout={gridLayout}
              onLayoutChange={commitGridLayout}
              onOpenWidget={(widget) => navigate(`/databases/${widget.database.id}?view=${widget.view.id}`)}
              onRemoveWidget={(widget) => handleRemovePin(widget.pin.id)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[var(--border)] py-16 text-center">
              <p className="font-ui text-[14px] font-medium text-[var(--subtext-0)]">
                No pinned views
              </p>
              <p className="font-ui text-[12px] text-[var(--overlay-1)]">
                Open a database view and pin it to see it here.
              </p>
              <button
                type="button"
                onClick={() => navigate("/databases")}
                className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-1.5 font-ui text-[12px] text-[var(--subtext-0)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              >
                Open Databases
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
