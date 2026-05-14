import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import {
  getReadableTextColor,
  resolveFieldOptionColor,
  resolveRelationColor,
  resolveStatusColor,
} from "@/lib/database-colors";
import { getFieldValue, resolveRelationLabel } from "@/lib/database-core";
import {
  PX_PER_DAY,
  buildTimelineRecords,
  formatTimelineDateValue,
  formatTimelineDisplayDate,
  getTimelineMajorSegments,
  getTimelineMinorSegments,
  getTimelineRangeBounds,
  toTimelineDayNumber,
  type TimelineRange,
  type TimelineViewMode,
} from "@/lib/database-timeline";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseField,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
} from "@/lib/types";

interface DatabaseTimelineViewProps {
  database: WorkspaceDatabaseModel;
  view: WorkspaceDatabaseModel["views"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
  onOpenRecord?: (recordId: string) => void;
  onUpdateField?: (recordId: string, fieldId: string, value: WorkspaceDatabaseFieldValue) => void;
  onCreateRecord?: (seed?: Record<string, WorkspaceDatabaseFieldValue>) => void;
  onConfigureTimelineFields?: () => void;
}

interface TimelineRecord {
  id: string;
  label: string;
  startDay: number;
  endDay: number;
  progress: number;
  color: string;
}

interface TimelineInteraction {
  recordId: string;
  mode: "move" | "resize-start" | "resize-end";
  startClientX: number;
  initialRange: TimelineRange;
  didChange: boolean;
}

const ROW_HEIGHT = 44;
const BAR_HEIGHT = 24;
const HEADER_ROW_HEIGHT = 28;
const DEFAULT_BAR_COLOR = "#89b4fa";
const MIN_CHART_WIDTH = 1680;
const COMPACT_BAR_WIDTH = 104;

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.trim().replace("#", "");
  if (normalized.length !== 6) return hex;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function resolveTimelineRecordColor(
  record: WorkspaceDatabaseModel["records"][number] | undefined,
  colorField: WorkspaceDatabaseField | undefined,
  database: WorkspaceDatabaseModel,
  catalog: WorkspaceDatabaseCatalogEntry[],
) {
  if (!record || !colorField) return DEFAULT_BAR_COLOR;

  const value = getFieldValue(record, colorField, database, catalog);

  if (colorField.type === "status" && typeof value === "string" && value.trim()) {
    return resolveStatusColor(value, colorField);
  }

  if (colorField.type === "select" && typeof value === "string" && value.trim()) {
    return resolveFieldOptionColor(colorField, value);
  }

  if (colorField.type === "multiselect" && Array.isArray(value)) {
    const first = value.find((candidate): candidate is string => typeof candidate === "string" && candidate.trim() !== "");
    return first ? resolveFieldOptionColor(colorField, first) : DEFAULT_BAR_COLOR;
  }

  if (colorField.type === "relation" && Array.isArray(value)) {
    const first = value.find((candidate): candidate is string => typeof candidate === "string" && candidate.trim() !== "");
    if (!first) return DEFAULT_BAR_COLOR;
    return resolveRelationColor(resolveRelationLabel(colorField, first, catalog));
  }

  return DEFAULT_BAR_COLOR;
}

export function DatabaseTimelineView({
  database,
  view,
  catalog,
  onOpenRecord,
  onUpdateField,
  onCreateRecord,
  onConfigureTimelineFields,
}: DatabaseTimelineViewProps) {
  const startFieldId = view.timelineStartField;
  const endFieldId = view.timelineEndField;
  const viewMode = (view.timelineViewMode ?? "Week") as TimelineViewMode;
  const pxPerDay = PX_PER_DAY[viewMode];
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const interactionRef = useRef<TimelineInteraction | null>(null);
  const draftRangeRef = useRef<Record<string, TimelineRange>>({});
  const [draftRange, setDraftRange] = useState<Record<string, TimelineRange>>({});
  const [draggingRecordId, setDraggingRecordId] = useState<string | null>(null);

  const startField = useMemo(
    () => database.schema.find((field) => field.id === startFieldId),
    [database.schema, startFieldId],
  );
  const endField = useMemo(
    () => database.schema.find((field) => field.id === endFieldId),
    [database.schema, endFieldId],
  );
  const colorField = useMemo(
    () => database.schema.find((field) => field.id === view.timelineColorField),
    [database.schema, view.timelineColorField],
  );

  const records = useMemo<TimelineRecord[]>(() => {
    const byId = new Map(database.records.map((record) => [record.id, record]));
    return buildTimelineRecords(database, view, catalog).map((record) => ({
      ...record,
      color: resolveTimelineRecordColor(byId.get(record.id), colorField, database, catalog),
    }));
  }, [catalog, colorField, database, view]);

  const bounds = useMemo(
    () => (records.length > 0 ? getTimelineRangeBounds(records, viewMode) : null),
    [records, viewMode],
  );
  const minorSegments = useMemo(
    () => (bounds ? getTimelineMinorSegments(bounds.startDay, bounds.endDay, viewMode) : []),
    [bounds, viewMode],
  );
  const majorSegments = useMemo(
    () => (bounds ? getTimelineMajorSegments(bounds.startDay, bounds.endDay, viewMode) : []),
    [bounds, viewMode],
  );

  const totalDays = bounds ? bounds.endDay - bounds.startDay + 1 : 0;
  const chartWidth = Math.max(totalDays * pxPerDay, MIN_CHART_WIDTH);
  const todayDay = toTimelineDayNumber(new Date());
  const todayOffset = bounds ? (todayDay - bounds.startDay) * pxPerDay : 0;
  const canResizeBars = Boolean(onUpdateField && startFieldId && endFieldId && startFieldId !== endFieldId);

  useEffect(() => {
    return () => {
      interactionRef.current = null;
      draftRangeRef.current = {};
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, []);

  const updateDraftRange = useCallback((recordId: string, nextRange: TimelineRange) => {
    draftRangeRef.current = {
      ...draftRangeRef.current,
      [recordId]: nextRange,
    };
    setDraftRange((current) => ({
      ...current,
      [recordId]: nextRange,
    }));
  }, []);

  const clearDraftRange = useCallback((recordId: string) => {
    if (!(recordId in draftRangeRef.current)) return;

    const nextDraft = { ...draftRangeRef.current };
    delete nextDraft[recordId];
    draftRangeRef.current = nextDraft;

    setDraftRange((current) => {
      if (!(recordId in current)) return current;
      const next = { ...current };
      delete next[recordId];
      return next;
    });
  }, []);

  const handleWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

    const canScrollHorizontally = scrollElement.scrollWidth > scrollElement.clientWidth;
    const canScrollVertically = scrollElement.scrollHeight > scrollElement.clientHeight;
    if (!canScrollHorizontally || canScrollVertically || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

    scrollElement.scrollLeft += event.deltaY;
  }, []);

  const finishInteraction = useCallback(async (openOnClick = false) => {
    const active = interactionRef.current;
    if (!active) return;

    const nextRange = draftRangeRef.current[active.recordId] ?? active.initialRange;
    interactionRef.current = null;
    setDraggingRecordId(null);
    clearDraftRange(active.recordId);
    document.body.style.userSelect = "";
    document.body.style.cursor = "";

    if (!active.didChange) {
      if (openOnClick && active.mode === "move") {
        onOpenRecord?.(active.recordId);
      }
      return;
    }

    if (!onUpdateField || !startFieldId || !endFieldId) return;

    if (startFieldId === endFieldId) {
      await Promise.resolve(onUpdateField(active.recordId, startFieldId, formatTimelineDateValue(nextRange.startDay)));
      return;
    }

    if (nextRange.startDay !== active.initialRange.startDay) {
      await Promise.resolve(onUpdateField(active.recordId, startFieldId, formatTimelineDateValue(nextRange.startDay)));
    }
    if (nextRange.endDay !== active.initialRange.endDay) {
      await Promise.resolve(onUpdateField(active.recordId, endFieldId, formatTimelineDateValue(nextRange.endDay)));
    }
  }, [clearDraftRange, endFieldId, onOpenRecord, onUpdateField, startFieldId]);

  const startInteraction = useCallback((
    event: React.PointerEvent<HTMLDivElement>,
    recordId: string,
    initialRange: TimelineRange,
    forcedMode?: TimelineInteraction["mode"],
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const barRect = event.currentTarget.getBoundingClientRect();
    const edgeThreshold = Math.min(18, Math.max(12, Math.floor(barRect.width * 0.24)));
    const offsetX = event.clientX - barRect.left;
    const canResize = Boolean(onUpdateField && startFieldId && endFieldId && startFieldId !== endFieldId);
    const mode: TimelineInteraction["mode"] =
      forcedMode && canResize
        ? forcedMode
        : canResize && offsetX <= edgeThreshold
        ? "resize-start"
        : canResize && offsetX >= barRect.width - edgeThreshold
          ? "resize-end"
          : "move";

    interactionRef.current = {
      recordId,
      mode,
      startClientX: event.clientX,
      initialRange,
      didChange: false,
    };

    const threshold = mode === "move" ? 6 : 4;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    const onMove = (moveEvent: PointerEvent) => {
      const active = interactionRef.current;
      if (!active) return;

      const deltaX = moveEvent.clientX - active.startClientX;
      if (Math.abs(deltaX) < threshold) return;

      if (!active.didChange) {
        setDraggingRecordId(active.recordId);
        updateDraftRange(active.recordId, active.initialRange);
        document.body.style.userSelect = "none";
        document.body.style.cursor = active.mode === "move" ? "grabbing" : "ew-resize";
        window.getSelection()?.removeAllRanges();
      }

      const deltaDays = Math.round(deltaX / pxPerDay);
      const { startDay, endDay } = active.initialRange;
      let nextStart = startDay;
      let nextEnd = endDay;

      if (active.mode === "move") {
        nextStart = startDay + deltaDays;
        nextEnd = endDay + deltaDays;
      } else if (active.mode === "resize-start") {
        nextStart = Math.min(startDay + deltaDays, endDay);
      } else {
        nextEnd = Math.max(endDay + deltaDays, startDay);
      }

      active.didChange = nextStart !== startDay || nextEnd !== endDay;
      updateDraftRange(active.recordId, { startDay: nextStart, endDay: nextEnd });
    };

    const onUp = async () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      await finishInteraction(true);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }, [endFieldId, finishInteraction, onUpdateField, pxPerDay, startFieldId, updateDraftRange]);

  const isUnconfigured = !startFieldId || !endFieldId || !startField || !endField;

  if (isUnconfigured) {
    const dateFields = database.schema.filter((field) => field.type === "date");
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="max-w-sm">
          <p className="font-ui text-[14px] font-medium text-[var(--text)]">Configure Timeline</p>
          <p className="mt-1 text-[13px] text-[var(--overlay-1)]">
            {dateFields.length === 0
              ? "Create Start and End date fields to place records on the timeline."
              : "Use the available date fields or choose start and end fields in View Settings."}
          </p>
        </div>
        {onConfigureTimelineFields ? (
          <button type="button" className="db-btn db-btn-primary" onClick={onConfigureTimelineFields}>
            {dateFields.length === 0 ? "Create date fields" : "Configure automatically"}
          </button>
        ) : null}
      </div>
    );
  }

  if (records.length === 0) {
    const today = formatTimelineDateValue(todayDay);
    const seed = startFieldId === endFieldId
      ? { [startFieldId]: today }
      : { [startFieldId]: today, [endFieldId]: today };
    return (
      <EmptyState
        title="No timeline data"
        description={`No visible records have ${startField.name} or ${endField.name} dates set.`}
        action={onCreateRecord ? { label: "New dated record", onClick: () => onCreateRecord(seed) } : undefined}
      />
    );
  }

  return (
    <div className="db-timeline-root">
      {!canResizeBars ? (
        <div className="db-timeline-notice">
          <span>
            Items are using a single date field, so they behave as milestones. Add or select a separate End date field to resize durations.
          </span>
          {onConfigureTimelineFields ? (
            <button type="button" className="db-timeline-notice-action" onClick={onConfigureTimelineFields}>
              Configure
            </button>
          ) : null}
        </div>
      ) : null}
      <div ref={scrollRef} className="db-timeline-scroll" onWheel={handleWheel}>
        <div className="db-timeline-canvas" style={{ width: chartWidth }}>
          <div className="db-timeline-header">
            <div className="db-timeline-major-row">
              {majorSegments.map((segment) => {
                const left = (segment.startDay - bounds!.startDay) * pxPerDay;
                const width = (segment.endDay - segment.startDay + 1) * pxPerDay;
                const isCurrentPeriod = todayDay >= segment.startDay && todayDay <= segment.endDay;
                return (
                  <div
                    key={segment.key}
                    className={`db-timeline-major-segment${isCurrentPeriod ? " db-timeline-major-segment--current" : ""}`}
                    style={{ left, width }}
                  >
                    <span className="db-timeline-major-label">{segment.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="db-timeline-minor-row" style={{ height: HEADER_ROW_HEIGHT }}>
              {minorSegments.map((segment) => {
                const left = (segment.startDay - bounds!.startDay) * pxPerDay;
                const width = (segment.endDay - segment.startDay + 1) * pxPerDay;
                const isToday = todayDay >= segment.startDay && todayDay <= segment.endDay;
                return (
                  <div
                    key={segment.key}
                    className={`db-timeline-minor-segment${isToday ? " db-timeline-minor-segment--today" : ""}`}
                    style={{ left, width }}
                  >
                    <span className="db-timeline-minor-label">{segment.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="relative" style={{ height: records.length * ROW_HEIGHT }}>
            {minorSegments.map((segment) => {
              const left = (segment.startDay - bounds!.startDay) * pxPerDay;
              return (
                <div
                  key={`grid-${segment.key}`}
                  className="db-timeline-grid-line"
                  style={{ left }}
                />
              );
            })}

            {bounds && todayDay >= bounds.startDay && todayDay <= bounds.endDay ? (
              <div className="db-timeline-today" style={{ left: todayOffset }} />
            ) : null}

            {records.map((record, index) => {
              const activeRange = draftRange[record.id] ?? { startDay: record.startDay, endDay: record.endDay };
              const left = (activeRange.startDay - bounds!.startDay) * pxPerDay;
              const width = Math.max((activeRange.endDay - activeRange.startDay + 1) * pxPerDay, 12);
              const progressWidth = width * (record.progress / 100);
              const top = index * ROW_HEIGHT;
              const isCompact = width < COMPACT_BAR_WIDTH;
              const tooltip = `${record.label}\n${formatTimelineDisplayDate(activeRange.startDay)} - ${formatTimelineDisplayDate(activeRange.endDay)}${record.progress > 0 ? `\n${Math.round(record.progress)}% complete` : ""}`;
              const barTop = (ROW_HEIGHT - BAR_HEIGHT) / 2;
              const colorWash = withAlpha(record.color, 0.74);
              const textColor = getReadableTextColor(record.color);

              return (
                <div key={record.id} className="db-timeline-row" style={{ top, height: ROW_HEIGHT }}>
                  <div className="db-timeline-row-border" />

                  <div
                    className={`db-timeline-bar${draggingRecordId === record.id ? " db-timeline-bar--dragging" : ""}`}
                    data-record-id={record.id}
                    style={{
                      left,
                      width,
                      top: barTop,
                      height: BAR_HEIGHT,
                      backgroundColor: colorWash,
                    }}
                    title={tooltip}
                    onPointerDown={(event) => startInteraction(event, record.id, activeRange)}
                  >
                    {startFieldId !== endFieldId ? (
                      <>
                        <div
                          className="db-timeline-bar-handle db-timeline-bar-handle--start"
                          title="Resize start date"
                          onPointerDown={(event) => startInteraction(event, record.id, activeRange, "resize-start")}
                        />
                        <div
                          className="db-timeline-bar-handle db-timeline-bar-handle--end"
                          title="Resize end date"
                          onPointerDown={(event) => startInteraction(event, record.id, activeRange, "resize-end")}
                        />
                      </>
                    ) : null}

                    {record.progress > 0 ? (
                      <div
                        className="db-timeline-bar-progress"
                        style={{ width: progressWidth }}
                      />
                    ) : null}

                    <div className="db-timeline-bar-content">
                      {!isCompact ? (
                        <span className="db-timeline-bar-label" style={{ color: textColor }}>
                          {record.label}
                        </span>
                      ) : null}
                      {!isCompact ? (
                        <span className="db-timeline-bar-meta" style={{ color: textColor, opacity: 0.78 }}>
                          {formatTimelineDisplayDate(activeRange.startDay)} to {formatTimelineDisplayDate(activeRange.endDay)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {isCompact ? (
                    <div
                      className="db-timeline-bar-external-label"
                      style={{
                        left: left + width + 8,
                        top: barTop + 4,
                        maxWidth: Math.max(180, Math.min(280, chartWidth - left - width - 16)),
                      }}
                    >
                      {record.label}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
