import { useEffect, useRef, useMemo, type CSSProperties } from "react";
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
  "--g-tick-color-thick": "var(--border)",
  "--g-tick-color": "var(--border-subtle, var(--border))",
  "--g-border-color": "var(--border)",
  "--g-text-muted": "var(--overlay-1)",
  "--g-text-light": "var(--base)",
  "--g-text-dark": "var(--text)",
  "--g-progress-color": "color-mix(in srgb, var(--accent) 55%, transparent)",
  "--g-handle-color": "var(--text)",
  "--g-header-background": "var(--mantle)",
  "--g-row-color": "var(--base)",
  "--g-row-border-color": "var(--border-subtle, var(--border))",
  "--g-today-highlight": "var(--accent)",
  "--g-actions-background": "var(--surface-wash)",
  "--g-weekend-highlight-color": "var(--surface-wash)",
  "--g-weekend-label-color": "var(--border)",
  "--g-arrow-color": "var(--overlay-1)",
  "--g-expected-progress": "color-mix(in srgb, var(--accent) 30%, transparent)",
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

      result.push({
        id: record.id,
        name: getRecordTitle(record, database),
        start,
        end,
        progress,
      });
    }

    return result;
  }, [database, startFieldId, endFieldId, progressFieldId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.innerHTML = "";

    if (tasks.length === 0) return;

    const gantt = new Gantt(el, tasks, {
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
        onOpenRecord?.(task.id);
      },
      on_date_change: (task: GanttTask, start: Date, end: Date) => {
        if (!onUpdateField) return;
        if (startFieldId) onUpdateField(task.id, startFieldId, fromGanttDate(start));
        if (endFieldId) onUpdateField(task.id, endFieldId, fromGanttDate(end));
      },
      on_progress_change: (task: GanttTask, progress: number) => {
        if (!onUpdateField || !progressFieldId) return;
        onUpdateField(task.id, progressFieldId, Math.round(progress));
      },
    });

    ganttRef.current = gantt;

    return () => {
      if (el) el.innerHTML = "";
      ganttRef.current = null;
    };
  }, [tasks, viewMode, startFieldId, endFieldId, progressFieldId, onOpenRecord, onUpdateField]);

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
