import "react-grid-layout/css/styles.css";

import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import GridLayout, { type Layout } from "react-grid-layout";
import { ExternalLink, GripVertical, Plus, RefreshCw, Settings2, X } from "lucide-react";

import { AgentChatWidget } from "@/components/agent/agent-chat-widget";
import { DatabaseChartView } from "@/components/database/DatabaseChartView";
import { DatabaseListView } from "@/components/database/DatabaseListView";
import { DatabaseTableView } from "@/components/database/DatabaseTableView";
import { DatabaseTimelineView } from "@/components/database/DatabaseTimelineView";
import {
  type HomeDatabaseViewPin,
  type HomeGenuiPin,
  type HomePinBase,
  type HomeWidgetFilter,
} from "@/lib/home-pins";
import type { WorkspaceDatabaseCatalogEntry, WorkspaceDatabaseModel } from "@/lib/types";
import { cn } from "@/lib/utils";

const GRID_COLS = 12;
const GRID_ROW_HEIGHT = 28;
const FILTER_OPERATORS = [
  ["contains", "contains"],
  ["not_contains", "does not contain"],
  ["equals", "equals"],
  ["not_equals", "does not equal"],
  ["is_empty", "is empty"],
  ["is_not_empty", "is not empty"],
  ["is_today", "is today"],
  ["before_today", "is overdue"],
  ["within_last_days", "within last days"],
] as const;

export interface PinnedDatabaseWidgetModel {
  kind: "database-view";
  pin: HomeDatabaseViewPin;
  database: WorkspaceDatabaseCatalogEntry;
  view: WorkspaceDatabaseModel["views"][number];
}

export interface PinnedGenuiWidgetModel {
  kind: "genui";
  pin: HomeGenuiPin;
}

export type PinnedHomeWidgetModel = PinnedDatabaseWidgetModel | PinnedGenuiWidgetModel;

export function PinnedViewGrid({
  widgets,
  catalog,
  layout,
  onLayoutChange,
  onOpenWidget,
  onOpenRecord,
  onRemoveWidget,
  onUpdateWidgetMetadata,
}: {
  widgets: PinnedHomeWidgetModel[];
  catalog: WorkspaceDatabaseCatalogEntry[];
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
  onOpenWidget: (widget: PinnedDatabaseWidgetModel) => void;
  onOpenRecord: (widget: PinnedDatabaseWidgetModel, recordId: string) => void;
  onRemoveWidget: (widget: PinnedHomeWidgetModel) => void;
  onUpdateWidgetMetadata: (
    widget: PinnedHomeWidgetModel,
    metadata: Pick<HomePinBase, "title" | "filter" | "config">,
  ) => void;
}) {
  const [gridShellRef, gridShellSize] = useElementSize<HTMLDivElement>();
  const orderedWidgets = [...widgets].sort(
    (left, right) => left.pin.y - right.pin.y || left.pin.x - right.pin.x,
  );
  const useStackedLayout = gridShellSize.width > 0 && gridShellSize.width < 640;

  return (
    <div ref={gridShellRef} className="db-dashboard-grid-shell">
      {widgets.length > 0 && useStackedLayout ? (
        <div className="flex flex-col gap-4">
          {orderedWidgets.map((widget) => (
            <div key={widget.pin.id} className="h-[420px] min-h-0">
              <PinnedWidgetCard
                widget={widget}
                catalog={catalog}
                onOpen={widget.kind === "database-view" ? () => onOpenWidget(widget) : undefined}
                onOpenRecord={widget.kind === "database-view" ? (recordId) => onOpenRecord(widget, recordId) : undefined}
                onRemove={() => onRemoveWidget(widget)}
                onUpdateMetadata={(metadata) => onUpdateWidgetMetadata(widget, metadata)}
              />
            </div>
          ))}
        </div>
      ) : widgets.length > 0 && gridShellSize.width > 0 ? (
        <GridLayout
          width={gridShellSize.width}
          className="db-dashboard-grid"
          layout={layout}
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
          onDragStop={(nextLayout) => onLayoutChange(nextLayout)}
          onResizeStop={(nextLayout) => onLayoutChange(nextLayout)}
        >
          {orderedWidgets.map((widget) => (
            <div key={widget.pin.id} className="min-h-0">
              <PinnedWidgetCard
                widget={widget}
                catalog={catalog}
                onOpen={widget.kind === "database-view" ? () => onOpenWidget(widget) : undefined}
                onOpenRecord={widget.kind === "database-view" ? (recordId) => onOpenRecord(widget, recordId) : undefined}
                onRemove={() => onRemoveWidget(widget)}
                onUpdateMetadata={(metadata) => onUpdateWidgetMetadata(widget, metadata)}
              />
            </div>
          ))}
        </GridLayout>
      ) : null}
    </div>
  );
}

function PinnedWidgetCard({
  widget,
  catalog,
  onOpen,
  onOpenRecord,
  onRemove,
  onUpdateMetadata,
}: {
  widget: PinnedHomeWidgetModel;
  catalog: WorkspaceDatabaseCatalogEntry[];
  onOpen?: () => void;
  onOpenRecord?: (recordId: string) => void;
  onRemove: () => void;
  onUpdateMetadata: (metadata: Pick<HomePinBase, "title" | "filter" | "config">) => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [filterDraft, setFilterDraft] = useState<HomeWidgetFilter[]>([]);
  const [groupByDraft, setGroupByDraft] = useState("");
  const widthClass =
    widget.pin.w <= 4 ? "db-dashboard-widget--narrow" : widget.pin.w <= 8 ? "db-dashboard-widget--medium" : "db-dashboard-widget--wide";
  const heightClass =
    widget.pin.h <= 10 ? "db-dashboard-widget--short" : widget.pin.h <= 14 ? "db-dashboard-widget--medium-height" : "db-dashboard-widget--tall";
  const effectiveView = useMemo(
    () => widget.kind === "database-view" ? applyPinMetadataToView(widget) : null,
    [widget],
  );
  const title = widget.pin.title || (widget.kind === "database-view" ? widget.view.name : widget.pin.widget.title || "Generated view");
  const sourceLabel = widget.kind === "database-view" ? widget.database.name : "Agent widget";

  function beginEditing() {
    setTitleDraft(title);
    setFilterDraft(widget.pin.filter ?? (effectiveView?.filter ?? []));
    setGroupByDraft(
      widget.kind === "database-view"
        ? (typeof widget.pin.config?.groupBy === "string" ? widget.pin.config.groupBy : widget.view.groupBy ?? "")
        : "",
    );
    setEditing(true);
  }

  function saveMetadata() {
    const config = { ...(widget.pin.config ?? {}) };
    if (widget.kind === "database-view") {
      if (groupByDraft) config.groupBy = groupByDraft;
      else delete config.groupBy;
    }
    onUpdateMetadata({
      title: titleDraft.trim() || undefined,
      filter: widget.kind === "database-view" ? filterDraft : widget.pin.filter,
      config,
    });
    setEditing(false);
  }

  return (
    <div
      className={cn(
        "db-dashboard-widget group flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--base)]",
        widthClass,
        heightClass,
      )}
      data-view-type={widget.kind === "database-view" ? widget.view.type : "genui"}
    >
      <div className="relative flex items-start gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
        <div className="db-dashboard-widget-grip mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]">
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="text-label truncate">
              {sourceLabel}
            </div>
            {(effectiveView?.filter.length ?? 0) > 0 ? (
              <span className="shrink-0 rounded-full border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--overlay-1)]">
                {effectiveView?.filter.length} filter{effectiveView?.filter.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate font-ui text-[13px] font-medium leading-5 text-[var(--text)]">
            {title}
          </div>
          {widget.kind === "database-view" && widget.database.taxonomy?.entity_label ? (
            <div className="mt-0.5 truncate font-ui text-[10px] text-[var(--overlay-1)]">
              {widget.database.taxonomy.entity_label}
            </div>
          ) : null}
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-[var(--base)] opacity-70 transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100 group-focus-within:opacity-100">
          {widget.kind === "genui" && widget.pin.widget.kind === "html" ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              onClick={() => setRefreshKey((current) => current + 1)}
              aria-label="Refresh generated widget"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onOpen ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              onClick={onOpen}
              aria-label="Open source view"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
            onClick={beginEditing}
            aria-label="Edit widget"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
            onClick={onRemove}
            aria-label="Remove widget"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {editing ? (
        <div className="border-b border-[var(--border-subtle)] bg-[var(--mantle)] px-4 py-3">
          <label className="block font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
            Title
            <input
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-[var(--border)] bg-[var(--base)] px-2 font-ui text-[12px] normal-case tracking-normal text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
            />
          </label>
          {widget.kind === "database-view" ? (
            <div className="mt-3 space-y-3">
              <label className="block font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                Group by
                <select
                  value={groupByDraft}
                  onChange={(event) => setGroupByDraft(event.target.value)}
                  className="mt-1 h-8 w-full rounded-md border border-[var(--border)] bg-[var(--base)] px-2 font-ui text-[12px] normal-case tracking-normal text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
                >
                  <option value="">No grouping</option>
                  {widget.database.schema.map((field) => (
                    <option key={field.id} value={field.id}>{field.name}</option>
                  ))}
                </select>
              </label>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">Filters</span>
                  <button
                    type="button"
                    disabled={widget.database.schema.length === 0}
                    onClick={() => {
                      const field = widget.database.schema[0];
                      if (!field) return;
                      setFilterDraft((current) => [...current, { fieldId: field.id, op: "contains", value: "" }]);
                    }}
                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-1 font-ui text-[10px] text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" />
                    Add filter
                  </button>
                </div>
                {filterDraft.length === 0 ? (
                  <p className="mt-1 font-ui text-[11px] text-[var(--overlay-1)]">No filters applied.</p>
                ) : (
                  <div className="mt-1.5 space-y-2">
                    {filterDraft.map((filter, index) => {
                      const needsValue = !["is_empty", "is_not_empty", "is_today", "before_today"].includes(filter.op);
                      return (
                        <div key={`${filter.fieldId}-${index}`} className="rounded-md border border-[var(--border)] bg-[var(--base)] p-2">
                          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5">
                            <select
                              aria-label={`Filter ${index + 1} field`}
                              value={filter.fieldId}
                              onChange={(event) => setFilterDraft((current) => current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, fieldId: event.target.value } : item
                              ))}
                              className="h-8 min-w-0 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-1.5 font-ui text-[11px] text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
                            >
                              {widget.database.schema.map((field) => (
                                <option key={field.id} value={field.id}>{field.name}</option>
                              ))}
                            </select>
                            <select
                              aria-label={`Filter ${index + 1} operator`}
                              value={filter.op}
                              onChange={(event) => setFilterDraft((current) => current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, op: event.target.value } : item
                              ))}
                              className="h-8 min-w-0 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-1.5 font-ui text-[11px] text-[var(--text)] outline-none focus:border-[var(--accent-border)]"
                            >
                              {FILTER_OPERATORS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                            <button
                              type="button"
                              onClick={() => setFilterDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                              aria-label={`Remove filter ${index + 1}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--danger)]"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {needsValue ? (
                            <input
                              aria-label={`Filter ${index + 1} value`}
                              value={filter.value}
                              onChange={(event) => setFilterDraft((current) => current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, value: event.target.value } : item
                              ))}
                              placeholder={filter.op === "within_last_days" ? "Number of days" : "Value"}
                              className="mt-1.5 h-8 w-full rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2 font-ui text-[11px] text-[var(--text)] outline-none placeholder:text-[var(--overlay-1)] focus:border-[var(--accent-border)]"
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 font-ui text-[11px] text-[var(--subtext-0)] hover:text-[var(--text)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveMetadata}
              className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2.5 py-1 font-ui text-[11px] text-[var(--accent)]"
            >
              Save
            </button>
          </div>
        </div>
      ) : null}
      <div className="min-h-0 min-w-0 flex-1">
        {widget.kind === "database-view" && effectiveView ? (
          <PinnedWidgetBody widget={{ ...widget, view: effectiveView }} catalog={catalog} onOpenRecord={onOpenRecord ?? (() => {})} />
        ) : widget.kind === "genui" ? (
          <div className="h-full overflow-auto px-3 py-2">
            <AgentChatWidget key={refreshKey} widget={{ ...widget.pin.widget, title: undefined }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function applyPinMetadataToView(widget: PinnedDatabaseWidgetModel) {
  return {
    ...widget.view,
    ...(widget.pin.config ?? {}),
    filter: widget.pin.filter ?? widget.view.filter,
  } as WorkspaceDatabaseModel["views"][number];
}

function PinnedWidgetBody({
  widget,
  catalog,
  onOpenRecord,
}: {
  widget: PinnedDatabaseWidgetModel;
  catalog: WorkspaceDatabaseCatalogEntry[];
  onOpenRecord: (recordId: string) => void;
}) {
  const [chartHostRef, chartHostSize] = useElementSize<HTMLDivElement>();
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
      <div ref={chartHostRef} className="h-full min-h-0 min-w-0 w-full overflow-hidden">
        <DatabaseChartView
          compact
          database={databaseModel}
          view={widget.view}
          catalog={catalog}
          onCreateRecord={() => {}}
          compactWidthUnits={widget.pin.w}
          compactHeightUnits={widget.pin.h}
          compactPixelWidth={chartHostSize.width}
          compactPixelHeight={chartHostSize.height}
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
        onOpenRecord={onOpenRecord}
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

  if (widget.view.type === "timeline") {
    return (
      <DatabaseTimelineView
        database={databaseModel}
        view={widget.view}
        catalog={catalog}
        onOpenRecord={onOpenRecord}
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
      onOpenRecord={onOpenRecord}
      onCreateRecord={() => {}}
      onUpdateView={() => {}}
    />
  );
}

function useElementSize<T extends HTMLElement>() {
  const [node, setNode] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useCallback((nextNode: T | null) => {
    setNode(nextNode);
  }, []);

  useLayoutEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;

    const update = (width: number, height: number) => {
      const nextWidth = Math.round(width);
      const nextHeight = Math.round(height);
      setSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }
        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    };

    update(node.clientWidth, node.clientHeight);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      update(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [ref, size] as const;
}
