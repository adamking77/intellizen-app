import "react-grid-layout/css/styles.css";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import GridLayout, { type Layout, type LayoutItem } from "react-grid-layout";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  GripVertical,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { DatabaseChartView } from "@/components/database/DatabaseChartView";
import { DatabaseListView } from "@/components/database/DatabaseListView";
import { DatabaseTableView } from "@/components/database/DatabaseTableView";
import { Button } from "@/components/ui/button";
import {
  loadDatabaseDashboardPins,
  saveDatabaseDashboardPins,
  supportsPinnedDashboardView,
  type DatabaseDashboardPin,
} from "@/lib/database-dashboard";
import { createWorkspaceDatabase, listWorkspaceDatabaseCatalog, listWorkspaceDatabases } from "@/lib/data";
import { toast, toastError } from "@/lib/toast";
import type { WorkspaceDatabaseCatalogEntry, WorkspaceDatabaseModel } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

const GRID_COLS = 12;
const GRID_ROW_HEIGHT = 28;
const DATABASE_RAIL_STORAGE_KEY = "intelizen:databases-rail-collapsed";
const DATABASE_RAIL_WIDTH_EXPANDED = 280;

interface PinnedWidgetModel {
  pin: DatabaseDashboardPin;
  database: WorkspaceDatabaseCatalogEntry;
  view: WorkspaceDatabaseModel["views"][number];
}

export function DatabasesView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [gridShellRef, gridShellSize] = useElementSize<HTMLDivElement>();
  const [isCreating, setIsCreating] = useState(false);
  const [pins, setPins] = useState<DatabaseDashboardPin[]>(() => loadDatabaseDashboardPins());
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DATABASE_RAIL_STORAGE_KEY) === "1";
  });

  const {
    data: databases = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["workspace-databases"],
    queryFn: listWorkspaceDatabases,
  });
  const {
    data: catalog = [],
    isLoading: catalogLoading,
  } = useQuery({
    queryKey: ["workspace-database-catalog"],
    queryFn: listWorkspaceDatabaseCatalog,
  });

  useEffect(() => {
    saveDatabaseDashboardPins(pins);
  }, [pins]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DATABASE_RAIL_STORAGE_KEY, railCollapsed ? "1" : "0");
  }, [railCollapsed]);

  const safeDatabases = useMemo(() => {
    const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
    const normalized = databases.map((database) => {
      const linked = catalogById.get(database.id);
      const schema = Array.isArray(database?.schema) ? database.schema : [];
      return {
        ...database,
        name: database?.name?.trim() || "Untitled database",
        schema,
        updated_at: database?.updated_at ?? null,
        recordCount: linked?.records.length ?? 0,
        relationCount: schema.filter((field) => field.type === "relation").length,
      };
    });

    return normalized.sort(
      (left, right) => new Date(right.updated_at ?? 0).getTime() - new Date(left.updated_at ?? 0).getTime(),
    );
  }, [catalog, databases]);

  const pinnedWidgets = useMemo(() => {
    const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
    return pins
      .map((pin) => {
        const database = catalogById.get(pin.databaseId);
        const view = database?.views.find((candidate) => candidate.id === pin.viewId);
        if (!database || !view || !supportsPinnedDashboardView(view.type)) return null;
        return { pin, database, view } satisfies PinnedWidgetModel;
      })
      .filter((widget): widget is PinnedWidgetModel => Boolean(widget));
  }, [catalog, pins]);

  useEffect(() => {
    if (catalogLoading) return;
    if (pinnedWidgets.length === pins.length) return;
    const validIds = new Set(pinnedWidgets.map((widget) => widget.pin.id));
    setPins((current) => current.filter((pin) => validIds.has(pin.id)));
  }, [catalogLoading, pins.length, pinnedWidgets]);

  const gridLayout = useMemo<Layout>(
    () =>
      pinnedWidgets.map((widget) => ({
        i: widget.pin.id,
        x: widget.pin.x,
        y: widget.pin.y,
        w: widget.pin.w,
        h: widget.pin.h,
        minW: 4,
        minH: 8,
      })),
    [pinnedWidgets],
  );

  async function handleCreateDatabase() {
    if (isCreating) return;

    try {
      setIsCreating(true);
      const created = await createWorkspaceDatabase();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-databases"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] }),
      ]);
      toast.success("Database created");
      navigate(`/databases/${created.database.id}`);
    } catch (createError) {
      toastError("Database creation failed", createError);
    } finally {
      setIsCreating(false);
    }
  }

  function handleRemovePin(pinId: string) {
    setPins((current) => current.filter((pin) => pin.id !== pinId));
  }

  function commitGridLayout(layout: Layout) {
    setPins((current) => current.map((pin) => {
      const item = layout.find((entry: LayoutItem) => entry.i === pin.id);
      if (!item) return pin;
      return {
        ...pin,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      };
    }));
  }

  if (error) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
          <span className="text-label">Databases unavailable</span>
          <p className="mt-2 font-ui text-[13px] text-[var(--danger)]">
            {error instanceof Error ? error.message : "The database list could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-end justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <div className="flex flex-col gap-2">
          <span className="text-label">Databases</span>
          <p className="font-ui text-[12px] text-[var(--overlay-1)]">
            Overview widgets on the right, database launcher in the left rail.
          </p>
        </div>

        <Button size="sm" onClick={handleCreateDatabase} disabled={isCreating} className="gap-1.5">
          {isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          New database
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 bg-[var(--base)]">
        <aside
          style={{ width: railCollapsed ? 0 : DATABASE_RAIL_WIDTH_EXPANDED }}
          className={cn(
            "flex shrink-0 flex-col overflow-hidden bg-[var(--base)]",
            "transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
            !railCollapsed && "border-r border-[var(--border)]",
          )}
        >
          <div
            className={cn(
              "flex h-14 shrink-0 items-center border-b border-[var(--border)]",
              railCollapsed ? "justify-center px-0" : "justify-between px-4",
            )}
          >
            {railCollapsed ? (
              <button
                type="button"
                onClick={() => setRailCollapsed(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                aria-label="Expand database rail"
                title="Expand databases"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <>
                <div className="min-w-0">
                  <div className="text-label">Databases</div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--overlay-1)]">
                    <span>{safeDatabases.length}</span>
                    <span aria-hidden className="text-[var(--overlay-0)]">·</span>
                    <span>launcher</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRailCollapsed(true)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                  aria-label="Collapse database rail"
                  title="Collapse databases"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className={cn("flex items-center gap-2 p-4 font-ui text-[13px] text-[var(--overlay-1)]", railCollapsed && "justify-center p-3")}>
                <Loader2 className="h-4 w-4 animate-spin" />
                {!railCollapsed ? <span>Loading databases...</span> : null}
              </div>
            ) : safeDatabases.length === 0 ? (
              railCollapsed ? (
                <div className="flex justify-center p-3">
                  <span className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-[10px] text-[var(--overlay-1)]">
                    0
                  </span>
                </div>
              ) : (
                <div className="p-4">
                  <p className="font-ui text-[13px] font-medium text-[var(--text)]">No databases yet</p>
                  <p className="mt-1 text-[12px] text-[var(--overlay-1)]">
                    Create your first database to start building structured views.
                  </p>
                </div>
              )
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {safeDatabases.map((database) => {
                  const fieldPreview = database.schema.slice(0, 3).map((field) => field.name).join(" · ");
                  const extraFieldCount = Math.max(database.schema.length - 3, 0);

                  if (railCollapsed) {
                    return (
                      <Link
                        key={database.id}
                        to={`/databases/${database.id}`}
                        title={database.name}
                        className="group flex h-14 items-center justify-center transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[color-mix(in_srgb,var(--surface-wash)_82%,var(--accent-soft)_18%)]"
                      >
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--base)] font-ui text-[11px] font-semibold uppercase text-[var(--text)] transition-colors group-hover:border-[var(--accent-border)] group-hover:text-[var(--accent)]">
                          {database.name.slice(0, 1)}
                        </span>
                      </Link>
                    );
                  }

                  return (
                    <Link
                      key={database.id}
                      to={`/databases/${database.id}`}
                      className="group relative flex w-full items-start gap-3 px-4 py-3 transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[color-mix(in_srgb,var(--surface-wash)_82%,var(--accent-soft)_18%)]"
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-[var(--accent)] opacity-0 transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-ui text-[13px] font-medium text-[var(--text)] transition-colors group-hover:text-[var(--accent)]">
                            {database.name}
                          </p>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)] transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:text-[var(--accent)]" />
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--subtext-0)]">
                          <span>{database.recordCount} rec</span>
                          <span aria-hidden className="text-[var(--overlay-0)]">·</span>
                          <span>{database.schema.length} fields</span>
                          <span aria-hidden className="text-[var(--overlay-0)]">·</span>
                          <span>{database.relationCount} rel</span>
                        </div>

                        <div className="mt-1 truncate text-[11px] text-[var(--overlay-1)]">
                          {fieldPreview}
                          {extraFieldCount > 0 ? ` · +${extraFieldCount}` : ""}
                        </div>

                        <div className="mt-1 text-[10px] text-[var(--overlay-1)]">
                          Updated {formatDateTime(database.updated_at)}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <div className="relative min-w-0 flex-1">
          {railCollapsed ? (
            <button
              type="button"
              onClick={() => setRailCollapsed(false)}
              className="absolute left-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-md bg-[var(--base)] text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              aria-label="Expand database rail"
              title="Show databases"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : null}

          <div className={cn("h-full overflow-y-auto", railCollapsed && "pl-14")}>
          {pinnedWidgets.length > 0 ? (
            <section className="px-6 py-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-ui text-[14px] font-semibold text-[var(--text)]">Pinned views</h2>
                  <p className="mt-1 text-[12px] text-[var(--overlay-1)]">
                    Drag modules into place and resize from any edge.
                  </p>
                </div>
                <span className="rounded-md border border-[var(--border)] px-2 py-1 font-mono text-[10px] text-[var(--overlay-1)]">
                  {pinnedWidgets.length}
                </span>
              </div>

              <div ref={gridShellRef} className="db-dashboard-grid-shell">
                {pinnedWidgets.length > 0 && gridShellSize.width > 0 ? (
                  <GridLayout
                    width={gridShellSize.width}
                    className="db-dashboard-grid"
                    layout={gridLayout}
                    gridConfig={{
                      cols: GRID_COLS,
                      rowHeight: GRID_ROW_HEIGHT,
                      margin: [16, 16],
                      containerPadding: [0, 0],
                    }}
                    dragConfig={{
                      enabled: true,
                      handle: ".db-dashboard-widget-grip",
                      cancel: "button, a, input, textarea, select",
                      threshold: 8,
                    }}
                    resizeConfig={{
                      enabled: true,
                      handles: ["n", "s", "e", "w"],
                    }}
                    onDragStop={(layout) => commitGridLayout(layout)}
                    onResizeStop={(layout) => commitGridLayout(layout)}
                  >
                    {pinnedWidgets.map((widget) => (
                      <div key={widget.pin.id} className="min-h-0">
                        <PinnedWidgetCard
                          widget={widget}
                          catalog={catalog}
                          onOpen={() => navigate(`/databases/${widget.database.id}?view=${widget.view.id}`)}
                          onRemove={() => handleRemovePin(widget.pin.id)}
                        />
                      </div>
                    ))}
                  </GridLayout>
                ) : null}
              </div>
            </section>
          ) : (
            <div className="flex flex-col items-center gap-3 p-16 text-center">
              <p className="text-label">No pinned views yet</p>
              <p className="font-ui text-[12px] text-[var(--overlay-1)]">
                Open a database view and pin a chart, table, or list here for quick oversight.
              </p>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PinnedWidgetCard({
  widget,
  catalog,
  onOpen,
  onRemove,
}: {
  widget: PinnedWidgetModel;
  catalog: WorkspaceDatabaseCatalogEntry[];
  onOpen: () => void;
  onRemove: () => void;
}) {
  const widthClass = widget.pin.w <= 4 ? "db-dashboard-widget--narrow" : widget.pin.w <= 8 ? "db-dashboard-widget--medium" : "db-dashboard-widget--wide";
  const heightClass = widget.pin.h <= 10 ? "db-dashboard-widget--short" : widget.pin.h <= 14 ? "db-dashboard-widget--medium-height" : "db-dashboard-widget--tall";

  return (
    <div
      className={cn(
        "db-dashboard-widget flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)]",
        widthClass,
        heightClass,
      )}
      data-view-type={widget.view.type}
    >
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <div className="db-dashboard-widget-grip inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]">
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-ui text-[13px] font-semibold text-[var(--text)]">
            {widget.view.name}
          </div>
          <div className="truncate text-[11px] text-[var(--overlay-1)]">
            {widget.database.name}
          </div>
        </div>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          onClick={onOpen}
          aria-label="Open source view"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          onClick={onRemove}
          aria-label="Remove widget"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        <DashboardWidgetBody widget={widget} catalog={catalog} onOpen={onOpen} />
      </div>
    </div>
  );
}

function DashboardWidgetBody({
  widget,
  catalog,
  onOpen,
}: {
  widget: PinnedWidgetModel;
  catalog: WorkspaceDatabaseCatalogEntry[];
  onOpen: () => void;
}) {
  const databaseModel: WorkspaceDatabaseModel = {
    id: widget.database.id,
    name: widget.database.name,
    schema: widget.database.schema,
    headerFieldIds: widget.database.headerFieldIds,
    views: widget.database.views,
    records: widget.database.records,
  };

  if (widget.view.type === "chart") {
    return (
      <div className="h-full min-h-0 min-w-0 w-full overflow-hidden">
        <DatabaseChartView
          compact
          database={databaseModel}
          view={widget.view}
          catalog={catalog}
          onCreateRecord={() => {}}
          compactWidthUnits={widget.pin.w}
          compactHeightUnits={widget.pin.h}
        />
      </div>
    );
  }

  if (widget.view.type === "table") {
    return (
      <DatabaseTableView
        embedded
        database={databaseModel}
        view={widget.view}
        catalog={catalog}
        activeRecordId={null}
        onOpenRecord={onOpen}
        onUpdateField={() => {}}
        onUpdateView={() => {}}
        onSaveSchema={() => {}}
        onOpenSchema={() => {}}
        onCreateRecord={() => {}}
        onDuplicateRecord={() => {}}
        onDeleteRecord={() => {}}
        onDeleteRecords={() => {}}
        onDuplicateRecords={() => {}}
      />
    );
  }

  return (
    <DatabaseListView
      embedded
      database={databaseModel}
      view={widget.view}
      catalog={catalog}
      activeRecordId={null}
      onOpenRecord={onOpen}
      onCreateRecord={() => {}}
      onUpdateView={() => {}}
    />
  );
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const update = () => {
      setSize({
        width: node.clientWidth,
        height: node.clientHeight,
      });
    };

    update();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setSize({
        width: Math.round(entry.contentRect.width),
        height: Math.round(entry.contentRect.height),
      });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}
