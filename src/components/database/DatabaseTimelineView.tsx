import { useEffect, useRef, useMemo, useCallback, type CSSProperties } from "react";
import Gantt, { type GanttTask } from "frappe-gantt";
import "@/frappe-gantt.css";

import { EmptyState } from "@/components/ui/empty-state";
import { getRecordTitle, getFieldValue } from "@/lib/database-core";
import type {
  WorkspaceDatabaseModel,
  WorkspaceDatabaseFieldValue,
} from "@/lib/types";

interface DatabaseTimelineViewProps {
  database: WorkspaceDatabaseModel;
  view: WorkspaceDatabaseModel["views"][number];
  onOpenRecord?: (recordId: string) => void;
  onUpdateField?: (recordId: string, fieldId: string, value: WorkspaceDatabaseFieldValue) => void;
}

function toGanttDate(value: WorkspaceDatabaseFieldValue): string | null {
  if (!value || typeof value !== "string") return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromGanttDate(dateObj: Date): string {
  return dateObj.toISOString();
}

const GANTT_VARS: CSSProperties = {
  "--g-bar-color": "var(--accent)",
  "--g-bar-border": "var(--accent-border, var(--accent))",
  "--g-tick-color-thick": "color-mix(in srgb, var(--border) 50%, transparent)",
  "--g-tick-color": "color-mix(in srgb, var(--border) 25%, transparent)",
  "--g-border-color": "color-mix(in srgb, var(--border) 40%, transparent)",
  "--g-text-muted": "var(--overlay-1)",
  "--g-text-light": "var(--base)",
  "--g-text-dark": "var(--text)",
  "--g-progress-color": "color-mix(in srgb, var(--accent) 45%, transparent)",
  "--g-handle-color": "var(--text)",
  "--g-header-background": "var(--mantle)",
  "--g-row-color": "var(--base)",
  "--g-row-border-color": "color-mix(in srgb, var(--border) 30%, transparent)",
  "--g-today-highlight": "var(--accent)",
  "--g-actions-background": "var(--surface-wash)",
  "--g-weekend-highlight-color": "var(--base)",
  "--g-weekend-label-color": "transparent",
  "--g-arrow-color": "var(--overlay-1)",
  "--g-expected-progress": "color-mix(in srgb, var(--accent) 20%, transparent)",
  "--g-popup-actions": "var(--surface-wash)",
} as CSSProperties;

export function DatabaseTimelineView({
  database,
  view,
  onOpenRecord,
  onUpdateField,
}: DatabaseTimelineViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<Gantt | null>(null);

  const onOpenRecordRef = useRef(onOpenRecord);
  const onUpdateFieldRef = useRef(onUpdateField);
  onOpenRecordRef.current = onOpenRecord;
  onUpdateFieldRef.current = onUpdateField;

  // Per-(record,field) debounce: waits 500ms after the last drag snap before
  // writing to the database. Prevents mid-drag Gantt rebuilds that would abort the drag.
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Tracks whether a drag is in progress or just ended. on_date_change fires on every
  // mousemove during drag; we use it to suppress on_click (which the browser fires after
  // mouseup even after a drag in WKWebView SVG elements).
  const recentDragRef = useRef(false);
  const recentDragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stableOnOpenRecord = useCallback((recordId: string) => {
    if (recentDragRef.current) return;
    onOpenRecordRef.current?.(recordId);
  }, []);

  const stableOnUpdateField = useCallback(
    (recordId: string, fieldId: string, value: WorkspaceDatabaseFieldValue) => {
      const key = `${recordId}:${fieldId}`;
      const existing = debounceTimers.current.get(key);
      if (existing) clearTimeout(existing);
      debounceTimers.current.set(
        key,
        setTimeout(() => {
          debounceTimers.current.delete(key);
          onUpdateFieldRef.current?.(recordId, fieldId, value);
        }, 500),
      );
    },
    [],
  );

  const startFieldId = view.timelineStartField;
  const endFieldId = view.timelineEndField;
  const progressFieldId = view.timelineProgressField;
  const viewMode = view.timelineViewMode ?? "Week";

  const startField = useMemo(
    () => database.schema.find((f) => f.id === startFieldId),
    [database.schema, startFieldId],
  );
  const endField = useMemo(
    () => database.schema.find((f) => f.id === endFieldId),
    [database.schema, endFieldId],
  );

  const tasks = useMemo<GanttTask[]>(() => {
    if (!startFieldId || !endFieldId) return [];
    const result: GanttTask[] = [];
    for (const record of database.records) {
      const startRaw = getFieldValue(record, { id: startFieldId, type: "date", name: "" }, database);
      const endRaw = getFieldValue(record, { id: endFieldId, type: "date", name: "" }, database);
      const start = toGanttDate(startRaw as WorkspaceDatabaseFieldValue);
      const end = toGanttDate(endRaw as WorkspaceDatabaseFieldValue);
      if (!start || !end) continue;
      let progress: number | undefined;
      if (progressFieldId) {
        const rawProgress = getFieldValue(
          record,
          { id: progressFieldId, type: "number", name: "" },
          database,
        );
        if (typeof rawProgress === "number") {
          progress = Math.max(0, Math.min(100, rawProgress));
        }
      }
      result.push({ id: record.id, name: getRecordTitle(record, database), start, end, progress });
    }
    return result;
  }, [database, startFieldId, endFieldId, progressFieldId]);

  const lastSyncedTasksRef = useRef<GanttTask[]>([]);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // Effect 1: Build Gantt when config (viewMode, field mappings) changes.
  // Reads tasks from tasksRef so task-data changes don't cause a full rebuild.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.innerHTML = "";
    ganttRef.current = null;

    const currentTasks = tasksRef.current;
    if (currentTasks.length === 0) return;

    const gantt = new Gantt(el, currentTasks, {
      view_mode: viewMode as "Day" | "Week" | "Month" | "Year",
      date_format: "YYYY-MM-DD",
      view_mode_select: false,
      today_button: false,
      scroll_to: "today",
      bar_height: 28,
      bar_corner_radius: 4,
      padding: 16,
      readonly_progress: !progressFieldId,
      on_click: (task: GanttTask) => {
        stableOnOpenRecord(task.id);
      },
      on_date_change: (task: GanttTask, start: Date, end: Date) => {
        // Mark drag in progress to suppress on_click for 300ms after last movement.
        recentDragRef.current = true;
        if (recentDragTimerRef.current) clearTimeout(recentDragTimerRef.current);
        recentDragTimerRef.current = setTimeout(() => {
          recentDragRef.current = false;
        }, 300);

        if (startFieldId) stableOnUpdateField(task.id, startFieldId, fromGanttDate(start));
        if (endFieldId) stableOnUpdateField(task.id, endFieldId, fromGanttDate(end));
      },
      on_progress_change: (task: GanttTask, progress: number) => {
        if (!progressFieldId) return;
        stableOnUpdateField(task.id, progressFieldId, Math.round(progress));
      },
    });

    ganttRef.current = gantt;
    lastSyncedTasksRef.current = currentTasks;

    return () => {
      if (el) el.innerHTML = "";
      ganttRef.current = null;
      if (recentDragTimerRef.current) clearTimeout(recentDragTimerRef.current);
      recentDragRef.current = false;
      for (const t of debounceTimers.current.values()) clearTimeout(t);
      debounceTimers.current.clear();
    };
  }, [viewMode, startFieldId, endFieldId, progressFieldId, stableOnOpenRecord, stableOnUpdateField]);

  // Effect 2: Sync task data changes without rebuilding the chart.
  // Calls each render step individually and intentionally skips set_scroll_position().
  // The frappe-gantt dist is patched (patches/frappe-gantt.patch) to use behavior:'instant'
  // and clientX instead of offsetX, but we still skip set_scroll_position() here as belt-and-suspenders.
  useEffect(() => {
    if (tasks === lastSyncedTasksRef.current) return;

    // Deep-compare content to skip re-renders when React produces a new array reference
    // with identical data (e.g. after a DB refresh that didn't change task fields).
    // Without this, spurious Effect 2 fires capture savedScroll=0 (before the initial
    // scroll-to-today animation completes) and lock the chart at position 0.
    const prev = lastSyncedTasksRef.current;
    const sameContent =
      tasks.length === prev.length &&
      tasks.every(
        (t, i) =>
          t.id === prev[i]?.id &&
          t.start === prev[i]?.start &&
          t.end === prev[i]?.end &&
          t.name === prev[i]?.name &&
          t.progress === prev[i]?.progress,
      );
    if (sameContent) {
      lastSyncedTasksRef.current = tasks;
      return;
    }

    const gantt = ganttRef.current;
    if (!gantt || tasks.length === 0) {
      lastSyncedTasksRef.current = tasks;
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = gantt as unknown as Record<string, any>;
    const container = g.$container as HTMLElement | undefined;
    if (!container) {
      lastSyncedTasksRef.current = tasks;
      return;
    }

    const savedScroll = container.scrollLeft;

    g.setup_tasks(tasks);
    g.clear();
    g.setup_layers();
    g.make_grid();
    g.make_dates();
    g.make_grid_extras();
    g.make_bars();
    g.make_arrows();
    g.map_arrows_on_bars();
    g.set_dimensions();
    // Intentionally skip g.set_scroll_position() — see comment above.

    container.scrollLeft = savedScroll;

    lastSyncedTasksRef.current = tasks;
  }, [tasks]);

  const isUnconfigured = !startFieldId || !endFieldId;
  const dateFields = database.schema.filter((f) => f.type === "date");

  if (isUnconfigured) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="max-w-sm">
          <p className="font-ui text-[14px] font-medium text-[var(--text)]">Configure Timeline</p>
          <p className="mt-1 text-[13px] text-[var(--overlay-1)]">
            {dateFields.length < 2
              ? "Add at least two date fields to your database, then open View Settings to configure the timeline."
              : "Open View Settings and choose a start date and end date field to show records on the timeline."}
          </p>
        </div>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="No timeline data"
        description={`No records have both ${startField?.name ?? "start"} and ${endField?.name ?? "end"} dates set.`}
      />
    );
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-lg border border-[var(--border)]"
      style={GANTT_VARS}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
