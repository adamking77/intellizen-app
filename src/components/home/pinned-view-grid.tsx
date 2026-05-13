import "react-grid-layout/css/styles.css";

import { useCallback, useLayoutEffect, useState } from "react";
import GridLayout, { type Layout } from "react-grid-layout";
import { ExternalLink, GripVertical, X } from "lucide-react";

import { DatabaseChartView } from "@/components/database/DatabaseChartView";
import { DatabaseListView } from "@/components/database/DatabaseListView";
import { DatabaseTableView } from "@/components/database/DatabaseTableView";
import { DatabaseTimelineView } from "@/components/database/DatabaseTimelineView";
import type { HomePin } from "@/lib/home-pins";
import type { WorkspaceDatabaseCatalogEntry, WorkspaceDatabaseModel } from "@/lib/types";
import { cn } from "@/lib/utils";

const GRID_COLS = 12;
const GRID_ROW_HEIGHT = 28;

export interface PinnedDatabaseWidgetModel {
  pin: HomePin;
  database: WorkspaceDatabaseCatalogEntry;
  view: WorkspaceDatabaseModel["views"][number];
}

export function PinnedViewGrid({
  widgets,
  catalog,
  layout,
  onLayoutChange,
  onOpenWidget,
  onRemoveWidget,
}: {
  widgets: PinnedDatabaseWidgetModel[];
  catalog: WorkspaceDatabaseCatalogEntry[];
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
  onOpenWidget: (widget: PinnedDatabaseWidgetModel) => void;
  onRemoveWidget: (widget: PinnedDatabaseWidgetModel) => void;
}) {
  const [gridShellRef, gridShellSize] = useElementSize<HTMLDivElement>();

  return (
    <div ref={gridShellRef} className="db-dashboard-grid-shell">
      {widgets.length > 0 && gridShellSize.width > 0 ? (
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
          {widgets.map((widget) => (
            <div key={widget.pin.id} className="min-h-0">
              <PinnedWidgetCard
                widget={widget}
                catalog={catalog}
                onOpen={() => onOpenWidget(widget)}
                onRemove={() => onRemoveWidget(widget)}
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
  onRemove,
}: {
  widget: PinnedDatabaseWidgetModel;
  catalog: WorkspaceDatabaseCatalogEntry[];
  onOpen: () => void;
  onRemove: () => void;
}) {
  const widthClass =
    widget.pin.w <= 4 ? "db-dashboard-widget--narrow" : widget.pin.w <= 8 ? "db-dashboard-widget--medium" : "db-dashboard-widget--wide";
  const heightClass =
    widget.pin.h <= 10 ? "db-dashboard-widget--short" : widget.pin.h <= 14 ? "db-dashboard-widget--medium-height" : "db-dashboard-widget--tall";

  return (
    <div
      className={cn(
        "db-dashboard-widget group flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--base)]",
        widthClass,
        heightClass,
      )}
      data-view-type={widget.view.type}
    >
      <div className="flex items-start gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
        <div className="db-dashboard-widget-grip mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]">
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-label truncate">
            {widget.database.name}
          </div>
          <div className="mt-1 truncate font-ui text-[13px] font-medium leading-5 text-[var(--text)]">
            {widget.view.name}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
            onClick={onOpen}
            aria-label="Open source view"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
            onClick={onRemove}
            aria-label="Remove widget"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        <PinnedWidgetBody widget={widget} catalog={catalog} onOpen={onOpen} />
      </div>
    </div>
  );
}

function PinnedWidgetBody({
  widget,
  catalog,
  onOpen,
}: {
  widget: PinnedDatabaseWidgetModel;
  catalog: WorkspaceDatabaseCatalogEntry[];
  onOpen: () => void;
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

  if (widget.view.type === "timeline") {
    return (
      <DatabaseTimelineView
        database={databaseModel}
        view={widget.view}
        catalog={catalog}
        onOpenRecord={onOpen}
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
