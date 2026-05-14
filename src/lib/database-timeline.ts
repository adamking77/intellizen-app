import { getFieldDisplayValue, getFieldValue, getRecordTitle, getViewRecords } from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseField,
  WorkspaceDatabaseModel,
} from "@/lib/types";

export type TimelineViewMode = "Day" | "Week" | "Month" | "Year";

export interface TimelineRange {
  startDay: number;
  endDay: number;
}

export interface TimelineSegment {
  key: string;
  label: string;
  startDay: number;
  endDay: number;
}

export interface TimelineFieldDefaults {
  timelineStartField?: string;
  timelineEndField?: string;
  timelineProgressField?: string;
  timelineLabelField?: string;
  timelineViewMode: TimelineViewMode;
}

export interface TimelineRecordCore {
  id: string;
  label: string;
  startDay: number;
  endDay: number;
  progress: number;
}

export const DAY_MS = 86_400_000;

export const PX_PER_DAY: Record<TimelineViewMode, number> = {
  Day: 52,
  Week: 48,
  Month: 10,
  Year: 4,
};

export function clampTimelineProgress(value: unknown): number {
  return typeof value === "number" ? Math.max(0, Math.min(100, value)) : 0;
}

export function parseTimelineDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    return new Date(year, month, day);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export function toTimelineDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

export function fromTimelineDayNumber(dayNumber: number): Date {
  const utcDate = new Date(dayNumber * DAY_MS);
  return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
}

export function formatTimelineDateValue(dayNumber: number): string {
  const date = fromTimelineDayNumber(dayNumber);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTimelineDisplayDate(dayNumber: number): string {
  return fromTimelineDayNumber(dayNumber).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function addTimelineDays(dayNumber: number, amount: number): number {
  return dayNumber + amount;
}

export function getTimelineStartOfWeek(dayNumber: number): number {
  const date = fromTimelineDayNumber(dayNumber);
  const weekday = date.getDay();
  const delta = weekday === 0 ? -6 : 1 - weekday;
  return addTimelineDays(dayNumber, delta);
}

export function getTimelineFieldDefaults(
  database: Pick<WorkspaceDatabaseModel, "schema" | "headerFieldIds">,
): TimelineFieldDefaults {
  const dateFields = database.schema.filter((field) => field.type === "date");
  const startField =
    dateFields.find((field) => /(^|\b)(start|begin|from|open(ed)?)(\b|$)/i.test(field.name)) ??
    dateFields[0];
  const endField =
    dateFields.find((field) => field.id !== startField?.id && /(^|\b)(end|due|deadline|finish|close(d)?|target)(\b|$)/i.test(field.name)) ??
    dateFields.find((field) => field.id !== startField?.id) ??
    startField;

  const progressField = database.schema.find(
    (field) =>
      (field.type === "number" || field.type === "rollup" || field.type === "formula") &&
      /progress|complete|completion|percent|%/i.test(field.name),
  );
  const titleFieldId = database.headerFieldIds?.[0];
  const labelField = titleFieldId
    ? database.schema.find((field) => field.id === titleFieldId && field.type !== "createdAt" && field.type !== "lastEditedAt")
    : undefined;

  return {
    timelineStartField: startField?.id,
    timelineEndField: endField?.id,
    timelineProgressField: progressField?.id,
    timelineLabelField: labelField?.id,
    timelineViewMode: "Week",
  };
}

export function getTimelineMinorSegments(
  rangeStartDay: number,
  rangeEndDay: number,
  viewMode: TimelineViewMode,
): TimelineSegment[] {
  const segments: TimelineSegment[] = [];

  if (viewMode === "Day") {
    for (let day = rangeStartDay; day <= rangeEndDay; day += 1) {
      const date = fromTimelineDayNumber(day);
      segments.push({
        key: `d-${day}`,
        label: date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" }),
        startDay: day,
        endDay: day,
      });
    }
    return segments;
  }

  if (viewMode === "Week") {
    for (let day = rangeStartDay; day <= rangeEndDay; day += 1) {
      const date = fromTimelineDayNumber(day);
      segments.push({
        key: `d-${day}`,
        label: String(date.getDate()),
        startDay: day,
        endDay: day,
      });
    }
    return segments;
  }

  if (viewMode === "Month") {
    const cursor = fromTimelineDayNumber(rangeStartDay);
    cursor.setDate(1);
    while (toTimelineDayNumber(cursor) <= rangeEndDay) {
      const startDay = Math.max(toTimelineDayNumber(cursor), rangeStartDay);
      const endOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const endDay = Math.min(toTimelineDayNumber(endOfMonth), rangeEndDay);
      segments.push({
        key: `m-${cursor.getFullYear()}-${cursor.getMonth()}`,
        label: cursor.toLocaleDateString(undefined, { month: "short" }),
        startDay,
        endDay,
      });
      cursor.setMonth(cursor.getMonth() + 1, 1);
    }
    return segments;
  }

  const quarterCursor = fromTimelineDayNumber(rangeStartDay);
  quarterCursor.setMonth(Math.floor(quarterCursor.getMonth() / 3) * 3, 1);
  while (toTimelineDayNumber(quarterCursor) <= rangeEndDay) {
    const startDay = Math.max(toTimelineDayNumber(quarterCursor), rangeStartDay);
    const quarterEnd = new Date(quarterCursor.getFullYear(), quarterCursor.getMonth() + 3, 0);
    const endDay = Math.min(toTimelineDayNumber(quarterEnd), rangeEndDay);
    segments.push({
      key: `q-${quarterCursor.getFullYear()}-${quarterCursor.getMonth()}`,
      label: `Q${Math.floor(quarterCursor.getMonth() / 3) + 1}`,
      startDay,
      endDay,
    });
    quarterCursor.setMonth(quarterCursor.getMonth() + 3, 1);
  }
  return segments;
}

export function getTimelineMajorSegments(
  rangeStartDay: number,
  rangeEndDay: number,
  viewMode: TimelineViewMode,
): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  const cursor = fromTimelineDayNumber(rangeStartDay);
  cursor.setMonth(viewMode === "Year" ? 0 : cursor.getMonth(), 1);

  while (toTimelineDayNumber(cursor) <= rangeEndDay) {
    const startDay = Math.max(toTimelineDayNumber(cursor), rangeStartDay);

    if (viewMode === "Month" || viewMode === "Year") {
      const endOfYear = new Date(cursor.getFullYear(), 11, 31);
      segments.push({
        key: `y-${cursor.getFullYear()}`,
        label: String(cursor.getFullYear()),
        startDay,
        endDay: Math.min(toTimelineDayNumber(endOfYear), rangeEndDay),
      });
      cursor.setFullYear(cursor.getFullYear() + 1, 0, 1);
      continue;
    }

    const endOfMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    segments.push({
      key: `ym-${cursor.getFullYear()}-${cursor.getMonth()}`,
      label: cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      startDay,
      endDay: Math.min(toTimelineDayNumber(endOfMonth), rangeEndDay),
    });
    cursor.setMonth(cursor.getMonth() + 1, 1);
  }

  return segments;
}

export function getTimelineRangeBounds(
  records: Pick<TimelineRecordCore, "startDay" | "endDay">[],
  viewMode: TimelineViewMode,
): TimelineRange {
  const minDay = Math.min(...records.map((record) => record.startDay));
  const maxDay = Math.max(...records.map((record) => record.endDay));

  if (viewMode === "Day") {
    return { startDay: minDay - 3, endDay: maxDay + 3 };
  }

  if (viewMode === "Week") {
    return { startDay: getTimelineStartOfWeek(minDay - 7), endDay: maxDay + 7 };
  }

  if (viewMode === "Month") {
    const start = fromTimelineDayNumber(minDay);
    start.setMonth(start.getMonth() - 1, 1);
    const end = fromTimelineDayNumber(maxDay);
    end.setMonth(end.getMonth() + 2, 0);
    return { startDay: toTimelineDayNumber(start), endDay: toTimelineDayNumber(end) };
  }

  const start = fromTimelineDayNumber(minDay);
  start.setFullYear(start.getFullYear() - 1, 0, 1);
  const end = fromTimelineDayNumber(maxDay);
  end.setFullYear(end.getFullYear() + 1, 11, 31);
  return { startDay: toTimelineDayNumber(start), endDay: toTimelineDayNumber(end) };
}

export function buildTimelineRecords(
  database: WorkspaceDatabaseModel,
  view: WorkspaceDatabaseModel["views"][number],
  catalog: WorkspaceDatabaseCatalogEntry[],
): TimelineRecordCore[] {
  const startFieldId = view.timelineStartField;
  const endFieldId = view.timelineEndField;
  if (!startFieldId || !endFieldId) return [];

  return getViewRecords(database, view, catalog).flatMap((record) => {
    const startField = database.schema.find((field) => field.id === startFieldId);
    const endField = database.schema.find((field) => field.id === endFieldId);
    if (!startField || !endField) return [];

    const startDate = parseTimelineDate(getFieldValue(record, startField, database, catalog));
    const endDate = parseTimelineDate(getFieldValue(record, endField, database, catalog));
    if (!startDate && !endDate) return [];

    const startDay = toTimelineDayNumber(startDate ?? endDate!);
    const endDay = Math.max(startDay, toTimelineDayNumber(endDate ?? startDate!));
    const progressField = view.timelineProgressField
      ? database.schema.find((field) => field.id === view.timelineProgressField)
      : undefined;

    let label = getRecordTitle(record, database);
    if (view.timelineLabelField) {
      const labelField = database.schema.find((field) => field.id === view.timelineLabelField);
      if (labelField) {
        const displayValue = getFieldDisplayValue(record, labelField, database, catalog).trim();
        if (displayValue) label = displayValue;
      }
    }

    return [{
      id: record.id,
      label,
      startDay,
      endDay,
      progress: clampTimelineProgress(progressField ? getFieldValue(record, progressField, database, catalog) : null),
    }];
  });
}

export function createTimelineDateField(name: string): WorkspaceDatabaseField {
  return {
    id: crypto.randomUUID(),
    name,
    type: "date",
  };
}
