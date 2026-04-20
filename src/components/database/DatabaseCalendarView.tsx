import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  findDefaultDateField,
  getRecordTitle,
  getViewRecords,
} from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface DatabaseCalendarViewProps {
  database: WorkspaceDatabaseModel;
  view: WorkspaceDatabaseModel["views"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
  activeRecordId: string | null;
  onOpenRecord: (recordId: string) => void;
  onCreateRecord: (seed?: Record<string, WorkspaceDatabaseFieldValue>) => void;
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DatabaseCalendarView({
  database,
  view,
  catalog,
  activeRecordId,
  onOpenRecord,
  onCreateRecord,
}: DatabaseCalendarViewProps) {
  const dateField =
    (view.groupBy ? database.schema.find((field) => field.id === view.groupBy) : undefined) ??
    findDefaultDateField(database);

  const seedMonth = useMemo(() => {
    if (!dateField) return startOfMonth(new Date());
    const firstDatedRecord = getViewRecords(database, view, catalog).find((record) => {
      const raw = record[dateField.id];
      return typeof raw === "string" && raw.length >= 10;
    });
    return firstDatedRecord
      ? startOfMonth(parseLocalDate(String(firstDatedRecord[dateField.id]).slice(0, 10)))
      : startOfMonth(new Date());
  }, [catalog, database, dateField, view]);

  const [currentMonth, setCurrentMonth] = useState(seedMonth);
  useEffect(() => {
    setCurrentMonth(seedMonth);
  }, [seedMonth]);
  const records = getViewRecords(database, view, catalog);

  const days = useMemo(() => {
    const start = startOfCalendarGrid(currentMonth);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [currentMonth]);

  const recordsByDay = useMemo(() => {
    const grouped = new Map<string, typeof records>();
    if (!dateField) return grouped;

    for (const record of records) {
      const raw = record[dateField.id];
      if (typeof raw !== "string" || raw.length < 10) continue;
      const key = raw.slice(0, 10);
      grouped.set(key, [...(grouped.get(key) ?? []), record]);
    }

    return grouped;
  }, [dateField, records]);

  if (!dateField) {
    return (
      <EmptyState
        title="Calendar needs a date field"
        description="Add a `date` property in schema, then assign it as the calendar field for this view."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-2">
        <div className="flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={() => setCurrentMonth((month) => addMonths(month, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[160px] text-center text-[13px] font-medium text-[var(--text)]">
            {formatMonthLabel(currentMonth)}
          </div>
          <Button size="icon" variant="ghost" onClick={() => setCurrentMonth((month) => addMonths(month, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-[12px] text-[var(--overlay-1)]">by {dateField.name}</div>
      </div>

      <div className="grid grid-cols-7 border-b border-[var(--border)] bg-[var(--mantle)]">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="border-r border-[var(--border-subtle)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)] last:border-r-0"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-hidden">
        {days.map((day) => {
          const key = toDateKey(day);
          const dayRecords = recordsByDay.get(key) ?? [];
          const inMonth = day.getMonth() === currentMonth.getMonth();

          return (
            <div
              key={key}
              onDoubleClick={() => onCreateRecord({ [dateField.id]: key })}
              className={cn(
                "min-h-0 border-r border-b border-[var(--border-subtle)] p-2 last:border-r-0",
                !inMonth && "bg-[rgba(17,17,27,0.35)]",
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <div
                  className={cn(
                    "text-[12px] font-medium",
                    inMonth ? "text-[var(--text)]" : "text-[var(--overlay-1)]",
                  )}
                >
                  {day.getDate()}
                </div>
                <button
                  type="button"
                  onClick={() => onCreateRecord({ [dateField.id]: key })}
                  className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                  title="Create record for this day"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              <div className="space-y-1 overflow-y-auto">
                {dayRecords.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    onClick={() => onOpenRecord(record.id)}
                    className={cn(
                      "block w-full rounded-lg border border-[var(--border)] bg-[var(--mantle)] px-2 py-1.5 text-left text-[11px] text-[var(--subtext-0)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-wash)]",
                      activeRecordId === record.id && "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--text)]",
                    )}
                  >
                    <div className="truncate font-medium">{getRecordTitle(record, database)}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfCalendarGrid(month: Date) {
  const first = startOfMonth(month);
  return addDays(first, -first.getDay());
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthLabel(date: Date) {
  const timestamp = date.getTime();
  if (!Number.isFinite(timestamp)) {
    return "Invalid month";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(timestamp);
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, (month || 1) - 1, day || 1);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}
