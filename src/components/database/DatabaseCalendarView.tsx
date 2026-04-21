import { useMemo, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { getRecordTitle, getViewRecords } from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
} from "@/lib/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DatabaseCalendarViewProps {
  database: WorkspaceDatabaseModel;
  view: WorkspaceDatabaseModel["views"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
  activeRecordId: string | null;
  onOpenRecord: (recordId: string) => void;
  onCreateRecord: (seed?: Record<string, WorkspaceDatabaseFieldValue>) => void;
}

export function DatabaseCalendarView({
  database,
  view,
  catalog,
  activeRecordId,
  onOpenRecord,
  onCreateRecord,
}: DatabaseCalendarViewProps) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const records = getViewRecords(database, view, catalog);

  const dateField = useMemo(
    () =>
      database.schema.find((f) => f.id === view.groupBy && f.type === "date")
      ?? database.schema.find((f) => f.type === "date"),
    [database.schema, view.groupBy],
  );

  const days = useMemo(() => {
    const first = new Date(month.year, month.month, 1);
    const last = new Date(month.year, month.month + 1, 0);
    const startDay = first.getDay();
    const totalDays = last.getDate();

    const grid: Array<{ date: number | null; records: WorkspaceDatabaseModel["records"]; isToday: boolean }> = [];

    for (let i = 0; i < startDay; i++) {
      grid.push({ date: null, records: [], isToday: false });
    }

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === month.year && today.getMonth() === month.month;

    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayRecords = dateField
        ? records.filter((r) => {
            const val = String(r[dateField.id] ?? "");
            return val.startsWith(dateStr);
          })
        : [];
      grid.push({ date: d, records: dayRecords, isToday: isCurrentMonth && today.getDate() === d });
    }

    return grid;
  }, [month, records, dateField]);

  if (!dateField) {
    return (
      <EmptyState
        title="No date field"
        description="Calendar view requires a date field to group by."
      />
    );
  }

  const monthLabel = new Date(month.year, month.month).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  function createRecord(dateValue?: string) {
    if (!dateField) {
      onCreateRecord();
      return;
    }
    onCreateRecord(dateValue ? { [dateField.id]: dateValue } : undefined);
  }

  return (
    <div className="flex flex-col flex-1 p-3">
      <div className="flex items-center justify-between mb-3">
        <button
          className="db-btn"
          onClick={() =>
            setMonth((m) => {
              const d = new Date(m.year, m.month - 1);
              return { year: d.getFullYear(), month: d.getMonth() };
            })
          }
        >
          &lt;
        </button>
        <span className="text-sm font-medium">{monthLabel}</span>
        <div className="flex items-center gap-2">
          <button
            className="db-btn"
            onClick={() =>
              setMonth((m) => {
                const d = new Date(m.year, m.month + 1);
                return { year: d.getFullYear(), month: d.getMonth() };
              })
            }
          >
            &gt;
          </button>
          <button className="db-btn db-btn-primary" onClick={() => createRecord()}>
            + Record
          </button>
        </div>
      </div>

      <div className="db-calendar-grid">
        {WEEKDAYS.map((day) => (
          <div key={day} className="db-calendar-weekday">
            {day}
          </div>
        ))}
        {days.map((day, i) => (
          <div
            key={i}
            className={`db-calendar-day${day.date ? "" : " db-calendar-day--other"}${day.isToday ? " db-calendar-day-today" : ""}`}
            onDoubleClick={() => {
              if (!day.date || !dateField) return;
              const dateValue = `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(day.date).padStart(2, "0")}`;
              createRecord(dateValue);
            }}
          >
            {day.date && (
              <>
                <div className="db-calendar-day-number">{day.date}</div>
                {day.records.slice(0, 3).map((record) => (
                  <div
                    key={record.id}
                    className="db-calendar-event"
                    style={{
                      backgroundColor: activeRecordId === record.id ? "var(--accent)" : undefined,
                      color: activeRecordId === record.id ? "var(--crust)" : undefined,
                    }}
                    onClick={() => onOpenRecord(record.id)}
                  >
                    {getRecordTitle(record, database)}
                  </div>
                ))}
                {day.records.length > 3 && (
                  <div className="text-[10px] opacity-40">+{day.records.length - 3} more</div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
