import "react-grid-layout/css/styles.css";

import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import GridLayout, { type Layout } from "react-grid-layout";
import { ExternalLink, GripVertical, Plus, RefreshCw, Settings2, X } from "lucide-react";

import { AgentChatWidget } from "@/components/agent/agent-chat-widget";
import { InstrumentWidget } from "@/components/home/instrument-widget";
import { DatabaseChartView } from "@/components/database/DatabaseChartView";
import { DatabasePill } from "@/components/database/primitives/DatabasePill";
import { EmptyState } from "@/components/ui/empty-state";
import { Identity } from "@/components/ui/identity";
import {
  type HomeDatabaseViewPin,
  type HomeGenuiPin,
  type HomeInstrumentPin,
  type HomePinBase,
  type HomePluginPin,
  type HomeWidgetFilter,
} from "@/lib/home-pins";
import type { WorkspaceDatabaseCatalogEntry, WorkspaceDatabaseModel } from "@/lib/types";
import { getFieldDisplayValue, getRecordTitle, getViewRecords } from "@/lib/database-core";
import { resolveStatusColor } from "@/lib/database-colors";
import { cn } from "@/lib/utils";
import { PluginWidgetSurface } from "@/plugins/home-widgets";

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

export interface PinnedPluginWidgetModel {
  kind: "plugin";
  pin: HomePluginPin;
}

export interface PinnedInstrumentWidgetModel {
  kind: "instrument";
  pin: HomeInstrumentPin;
}

export type PinnedHomeWidgetModel = PinnedDatabaseWidgetModel | PinnedGenuiWidgetModel | PinnedPluginWidgetModel | PinnedInstrumentWidgetModel;

export const DASHBOARD_BANDS = ["Question", "In motion", "Outputs", "Reference"] as const;
const WIDGET_FIELD_CLASS = "rounded-none border-0 border-b border-[var(--surface-line)] bg-transparent focus-visible:border-[var(--accent)] focus-visible:!outline-none";
export function dashboardBand(widget: PinnedHomeWidgetModel): typeof DASHBOARD_BANDS[number] {
  const saved = widget.pin.config?.band;
  if (DASHBOARD_BANDS.some((band) => band === saved)) return saved as typeof DASHBOARD_BANDS[number];
  if (widget.kind === "genui") return "Outputs";
  if (widget.kind === "instrument") {
    if (["activity.attention", "attention.waiting"].includes(widget.pin.instrumentId)) return "Question";
    if (widget.pin.instrumentId === "activity.progress") return "In motion";
    if (widget.pin.instrumentId === "activity.outcomes") return "Outputs";
  }
  return "Reference";
}

export function PinnedViewGrid({
  widgets,
  catalog,
  layout,
  onLayoutChange,
  onOpenWidget,
  onOpenRecord,
  onRemoveWidget,
  onUpdateWidgetMetadata,
  workspaceName,
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
  workspaceName?: string;
}) {
  const [arranging, setArranging] = useState(false);
  const [gridShellRef, gridShellSize] = useElementSize<HTMLDivElement>();
  const orderedWidgets = [...widgets].sort(
    (left, right) => left.pin.y - right.pin.y || left.pin.x - right.pin.x,
  );
  const useStackedLayout = gridShellSize.width > 0 && gridShellSize.width < 640;
  const canArrange = !workspaceName || arranging;

  const card = (widget: PinnedHomeWidgetModel) => <PinnedWidgetCard
    widget={widget} catalog={catalog} workspaceName={workspaceName} arranging={canArrange}
    onOpen={widget.kind === "database-view" ? () => onOpenWidget(widget) : undefined}
    onOpenRecord={widget.kind === "database-view" ? (recordId) => onOpenRecord(widget, recordId) : undefined}
    onRemove={() => onRemoveWidget(widget)}
    onUpdateMetadata={(metadata) => onUpdateWidgetMetadata(widget, metadata)}
  />;

  return (
    <div ref={gridShellRef} className="db-dashboard-grid-shell">
      {workspaceName && <div className="mb-4 flex justify-end"><button type="button" aria-pressed={arranging} onClick={() => setArranging((value) => !value)} className="px-3 py-1.5 text-[length:var(--t-meta)] text-[var(--text-muted)] hover:text-[var(--text)]">{arranging ? "Done arranging" : "Arrange"}</button></div>}
      {workspaceName && !arranging ? <div className="space-y-8">{DASHBOARD_BANDS.map((band) => {
        const items = orderedWidgets.filter((widget) => dashboardBand(widget) === band);
        return items.length ? <section key={band} aria-label={band}>
          <h2 className="mb-3 border-b border-[var(--hair)] pb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">{band}</h2>
          <div className="grid grid-cols-1 gap-6">{items.map((widget) => <div key={widget.pin.id} className="min-h-0" style={{ height: Math.max(280, widget.pin.h * GRID_ROW_HEIGHT) }}>{card(widget)}</div>)}</div>
        </section> : null;
      })}</div> : widgets.length > 0 && useStackedLayout ? (
        <div className="flex flex-col gap-4">
          {orderedWidgets.map((widget) => (
            <div key={widget.pin.id} className="h-[420px] min-h-0">
              {card(widget)}
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
            enabled: canArrange,
            handle: ".db-dashboard-widget-grip",
            cancel: "button, a, input, textarea, select",
            threshold: 8,
          }}
          resizeConfig={{
            enabled: canArrange,
            handles: ["n", "s", "e", "w"],
          }}
          onDragStop={(nextLayout) => onLayoutChange(nextLayout)}
          onResizeStop={(nextLayout) => onLayoutChange(nextLayout)}
        >
          {orderedWidgets.map((widget) => (
            <div key={widget.pin.id} className="min-h-0">
              {card(widget)}
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
  workspaceName,
  arranging,
}: {
  widget: PinnedHomeWidgetModel;
  catalog: WorkspaceDatabaseCatalogEntry[];
  onOpen?: () => void;
  onOpenRecord?: (recordId: string) => void;
  onRemove: () => void;
  onUpdateMetadata: (metadata: Pick<HomePinBase, "title" | "filter" | "config">) => void;
  workspaceName?: string;
  arranging: boolean;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [filterDraft, setFilterDraft] = useState<HomeWidgetFilter[]>([]);
  const [groupByDraft, setGroupByDraft] = useState("");
  const [bandDraft, setBandDraft] = useState(dashboardBand(widget));
  const widthClass =
    widget.pin.w <= 4 ? "db-dashboard-widget--narrow" : widget.pin.w <= 8 ? "db-dashboard-widget--medium" : "db-dashboard-widget--wide";
  const heightClass =
    widget.pin.h <= 10 ? "db-dashboard-widget--short" : widget.pin.h <= 14 ? "db-dashboard-widget--medium-height" : "db-dashboard-widget--tall";
  const effectiveView = useMemo(
    () => widget.kind === "database-view" ? applyPinMetadataToView(widget) : null,
    [widget],
  );
  const title = widget.pin.title || (widget.kind === "database-view"
    ? widget.view.name
    : widget.kind === "genui" ? widget.pin.widget.title || "Generated view" : widget.kind === "plugin" ? widget.pin.widgetId : "Activity");
  const sourceLabel = widget.kind === "database-view" ? widget.database.name : widget.kind === "genui" ? "Agent widget" : widget.kind === "plugin" ? "Plugin widget" : "Activity";

  function beginEditing() {
    setBandDraft(dashboardBand(widget));
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
    if (workspaceName) config.band = bandDraft;
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
        "db-dashboard-widget group flex h-full min-h-0 flex-col overflow-hidden bg-[var(--base)]",
        !workspaceName && "rounded-[var(--r-plane)] border border-[var(--border)]",
        widthClass,
        heightClass,
      )}
      data-view-type={widget.kind === "database-view" ? widget.view.type : widget.kind}
    >
      <div className="relative flex items-start gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
        {arranging && <div className="db-dashboard-widget-grip mt-0.5 inline-flex h-[var(--h-ctl)] w-7 items-center justify-center rounded-[var(--r-ctl)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]">
          <GripVertical className="h-3.5 w-3.5" />
        </div>}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
              {workspaceName ? `${workspaceName} · ${sourceLabel}` : sourceLabel}
            </div>
            {(effectiveView?.filter.length ?? 0) > 0 ? (
              <span className="shrink-0 rounded-[var(--r-pill)] border border-[var(--border)] px-1.5 py-0.5 font-mono text-[length:var(--t-count)] text-[var(--text-muted)]">
                {effectiveView?.filter.length} filter{effectiveView?.filter.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          <div className="mt-1 truncate font-ui text-[length:var(--t-ui)] font-medium leading-5 text-[var(--text)]">
            {title}
          </div>
          {widget.kind === "database-view" && widget.database.taxonomy?.entity_label ? (
            <div className="mt-0.5 truncate font-ui text-[length:var(--t-count)] text-[var(--text-muted)]">
              {widget.database.taxonomy.entity_label}
            </div>
          ) : null}
        </div>
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-[var(--r-ctl)] bg-[var(--base)] opacity-70 transition-opacity duration-[var(--t-base)] ease-[var(--ease)] group-hover:opacity-100 group-focus-within:opacity-100">
          {widget.kind === "genui" && widget.pin.widget.kind === "html" ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-pill)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              onClick={() => setRefreshKey((current) => current + 1)}
              aria-label="Refresh generated widget"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {onOpen ? (
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-pill)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              onClick={onOpen}
              aria-label="Open source view"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-pill)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
            onClick={beginEditing}
            aria-label="Edit widget"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          {arranging && <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-pill)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
            onClick={onRemove}
            aria-label="Remove widget"
          >
            <X className="h-3.5 w-3.5" />
          </button>}
        </div>
      </div>
      {editing ? (
        <div className="border-b border-[var(--border-subtle)] bg-[var(--mantle)] px-4 py-3">
          {workspaceName && <label className="mb-3 block font-mono text-[length:var(--t-meta)] text-[var(--text-muted)]">Band
            <select aria-label="Widget band" value={bandDraft} onChange={(event) => setBandDraft(event.target.value as typeof bandDraft)} className={cn(WIDGET_FIELD_CLASS, "ml-3 p-1 text-[var(--text)]")}>{DASHBOARD_BANDS.map((band) => <option key={band}>{band}</option>)}</select>
          </label>}
          <label className="block font-ui text-[length:var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Title
            <input
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              className={cn(WIDGET_FIELD_CLASS, "mt-1 h-[var(--h-ctl)] w-full px-2 font-ui text-[length:var(--t-meta)] normal-case tracking-normal text-[var(--text)]")}
            />
          </label>
          {widget.kind === "database-view" ? (
            <div className="mt-3 space-y-3">
              <label className="block font-ui text-[length:var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Group by
                <select
                  value={groupByDraft}
                  onChange={(event) => setGroupByDraft(event.target.value)}
                  className={cn(WIDGET_FIELD_CLASS, "mt-1 h-[var(--h-ctl)] w-full px-2 font-ui text-[length:var(--t-meta)] normal-case tracking-normal text-[var(--text)]")}
                >
                  <option value="">No grouping</option>
                  {widget.database.schema.map((field) => (
                    <option key={field.id} value={field.id}>{field.name}</option>
                  ))}
                </select>
              </label>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-ui text-[length:var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--text-muted)]">Filters</span>
                  <button
                    type="button"
                    disabled={widget.database.schema.length === 0}
                    onClick={() => {
                      const field = widget.database.schema[0];
                      if (!field) return;
                      setFilterDraft((current) => [...current, { fieldId: field.id, op: "contains", value: "" }]);
                    }}
                    className="inline-flex items-center gap-1 rounded-[var(--r-pill)] px-1.5 py-1 font-ui text-[length:var(--t-count)] text-[var(--accent-text)] hover:bg-[var(--accent-soft)] disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" />
                    Add filter
                  </button>
                </div>
                {filterDraft.length === 0 ? (
                  <p className="mt-1 font-ui text-[length:var(--t-section)] text-[var(--text-muted)]">No filters applied.</p>
                ) : (
                  <div className="mt-1.5 space-y-2">
                    {filterDraft.map((filter, index) => {
                      const needsValue = !["is_empty", "is_not_empty", "is_today", "before_today"].includes(filter.op);
                      return (
                        <div key={`${filter.fieldId}-${index}`} className="rounded-[var(--r-ctl)] border border-[var(--border)] bg-[var(--base)] p-2">
                          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5">
                            <select
                              aria-label={`Filter ${index + 1} field`}
                              value={filter.fieldId}
                              onChange={(event) => setFilterDraft((current) => current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, fieldId: event.target.value } : item
                              ))}
                              className={cn(WIDGET_FIELD_CLASS, "h-[var(--h-ctl)] min-w-0 px-1.5 font-ui text-[length:var(--t-section)] text-[var(--text)]")}
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
                              className={cn(WIDGET_FIELD_CLASS, "h-[var(--h-ctl)] min-w-0 px-1.5 font-ui text-[length:var(--t-section)] text-[var(--text)]")}
                            >
                              {FILTER_OPERATORS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                            <button
                              type="button"
                              onClick={() => setFilterDraft((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                              aria-label={`Remove filter ${index + 1}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-pill)] text-[var(--text-muted)] hover:bg-[var(--surface-wash)] hover:text-[var(--danger)]"
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
                              className={cn(WIDGET_FIELD_CLASS, "mt-1.5 h-[var(--h-ctl)] w-full px-2 font-ui text-[length:var(--t-section)] text-[var(--text)] placeholder:text-[var(--text-muted)]")}
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
              className="rounded-[var(--r-pill)] border border-[var(--border)] px-2.5 py-1 font-ui text-[length:var(--t-section)] text-[var(--subtext-0)] hover:text-[var(--text)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveMetadata}
              className="rounded-[var(--r-pill)] bg-[var(--accent-soft)] px-2.5 py-1 font-ui text-[length:var(--t-section)] text-[var(--accent-text)]"
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
        ) : widget.kind === "plugin" ? (
          <div className="h-full overflow-auto px-3 py-2">
            <PluginWidgetSurface pluginId={widget.pin.pluginId} widgetId={widget.pin.widgetId} />
          </div>
        ) : widget.kind === "instrument" ? (
          <InstrumentWidget pin={widget.pin} />
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

  return (
    <HomeRecordRows database={databaseModel} view={widget.view} catalog={catalog} onOpenRecord={onOpenRecord} />
  );
}

export function HomeRecordRows({
  database,
  view,
  catalog,
  onOpenRecord,
}: {
  database: WorkspaceDatabaseModel;
  view: WorkspaceDatabaseModel["views"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
  onOpenRecord: (recordId: string) => void;
}) {
  const records = getViewRecords(database, view, catalog);
  const identityField = database.schema.find((field) => /assignee|owner|author|agent/i.test(field.name));
  const statusField = database.schema.find((field) => field.type === "status")
    ?? database.schema.find((field) => /status|state|outcome/i.test(field.name));
  const metaField = database.schema.find((field) => field.type === "date" || field.type === "lastEditedAt" || field.type === "createdAt");

  if (!records.length) {
    return <EmptyState title="No records" description="No records match this view." className="px-4" />;
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-2">
      {records.map((record) => {
        const identity = identityField ? getFieldDisplayValue(record, identityField, database, catalog) : "";
        const status = statusField ? getFieldDisplayValue(record, statusField, database, catalog) : "";
        const meta = metaField ? getFieldDisplayValue(record, metaField, database, catalog) : "";
        return (
          <button
            key={record.id}
            type="button"
            onClick={() => onOpenRecord(record.id)}
            className="nav-node grid w-full grid-cols-[minmax(0,1fr)_minmax(88px,0.7fr)_auto_auto] items-center gap-3 px-2 text-left"
          >
            <span className="truncate text-[length:var(--t-ui)] text-[var(--text)]">{getRecordTitle(record, database)}</span>
            {identity ? <Identity name={identity} /> : <span className="text-[var(--text-muted)]">—</span>}
            {status && statusField ? <DatabasePill color={resolveStatusColor(status, statusField)}>{status}</DatabasePill> : <span className="text-[var(--text-muted)]">—</span>}
            <span className="truncate font-mono text-[length:var(--t-count)] text-[var(--text-muted)]">{meta || "—"}</span>
          </button>
        );
      })}
    </div>
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
