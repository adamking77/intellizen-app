import { useEffect, useState, type CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/database/primitives/Badge";
import { resolveFieldOptionColor, resolveRelationColor, resolveStatusColor } from "@/lib/database-colors";
import { getFieldDisplayValue, getFieldValue, getRecordTitle, getViewRecords, getVisibleFields } from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseField,
  WorkspaceDatabaseModel,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface DatabaseListViewProps {
  database: WorkspaceDatabaseModel;
  view: WorkspaceDatabaseModel["views"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
  activeRecordId: string | null;
  onOpenRecord: (recordId: string) => void;
  onUpdateView: (config: { listPropertyWidth?: number }) => void;
}

export function DatabaseListView({
  database,
  view,
  catalog,
  activeRecordId,
  onOpenRecord,
  onUpdateView,
}: DatabaseListViewProps) {
  const records = getViewRecords(database, view, catalog);
  const titleFieldId =
    database.headerFieldIds?.[0] ??
    database.schema.find((field) => field.type === "text")?.id ??
    database.schema[0]?.id;
  const summaryFields = getVisibleFields(database.schema, view).filter((field) => field.id !== titleFieldId);
  const [propertyWidth, setPropertyWidth] = useState(view.listPropertyWidth ?? 120);

  useEffect(() => {
    setPropertyWidth(view.listPropertyWidth ?? 120);
  }, [view.listPropertyWidth]);

  function handleResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = propertyWidth;

    function handleMove(moveEvent: PointerEvent) {
      setPropertyWidth(Math.max(96, Math.min(220, startWidth + (moveEvent.clientX - startX))));
    }

    function handleUp(moveEvent: PointerEvent) {
      const nextWidth = Math.max(96, Math.min(220, startWidth + (moveEvent.clientX - startX)));
      onUpdateView({ listPropertyWidth: nextWidth });
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {records.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--mantle)] text-[13px] text-[var(--subtext-0)]">
            No records yet. Create one to start shaping the list.
          </div>
        ) : (
          <div className="space-y-3">
            {records.map((record) => {
              const shownFields = summaryFields.filter((field) => {
                const value = getFieldValue(record, field, database, catalog);
                return !(
                  value === null ||
                  value === undefined ||
                  value === "" ||
                  (Array.isArray(value) && value.length === 0)
                );
              });

              return (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => onOpenRecord(record.id)}
                  className={cn(
                    "group w-full rounded-2xl border border-[var(--border)] bg-[var(--mantle)] p-5 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-wash)]",
                    activeRecordId === record.id && "border-[var(--accent-border)] bg-[var(--accent-soft)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-[17px] font-semibold tracking-[-0.02em] text-[var(--text)]">
                        {getRecordTitle(record, database)}
                      </div>
                      <div className="mt-1 text-[12px] uppercase tracking-[0.16em] text-[var(--overlay-1)]">
                        {shownFields.length} visible properties
                      </div>
                    </div>
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-[var(--overlay-1)] opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>

                  <div className="mt-4 space-y-2">
                    {shownFields.length ? (
                      shownFields.map((field) => {
                        return (
                          <div
                            key={field.id}
                            className="relative grid gap-4 border-t border-[var(--border-subtle)] pt-2 first:border-t-0 first:pt-0"
                            style={{ gridTemplateColumns: `${propertyWidth}px minmax(0,1fr)` }}
                          >
                            <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                              {field.name}
                            </div>
                            <div className="min-w-0">
                              <ListCellValue field={field} record={record} database={database} catalog={catalog} />
                            </div>
                            <div
                              className="absolute bottom-0 left-[calc(var(--list-width,120px)-8px)] top-0 w-4 cursor-col-resize"
                              style={{ "--list-width": `${propertyWidth}px` } as CSSProperties}
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                handleResize(event);
                              }}
                            />
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-[13px] text-[var(--overlay-1)]">No visible properties</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ListCellValue({
  field,
  record,
  database,
  catalog,
}: {
  field: WorkspaceDatabaseField;
  record: WorkspaceDatabaseModel["records"][number];
  database: WorkspaceDatabaseModel;
  catalog: WorkspaceDatabaseCatalogEntry[];
}) {
  const value = getFieldValue(record, field, database, catalog);

  if (field.type === "status") {
    const text = typeof value === "string" ? value : "";
    return text ? <Badge color={resolveStatusColor(text)}>{text}</Badge> : <EmDash />;
  }

  if (field.type === "select") {
    const text = typeof value === "string" ? value : "";
    return text ? <Badge color={resolveFieldOptionColor(field, text)}>{text}</Badge> : <EmDash />;
  }

  if (field.type === "multiselect") {
    const values = Array.isArray(value) ? value : [];
    if (values.length === 0) return <EmDash />;
    return (
      <div className="flex flex-wrap gap-1">
        {values.map((item) => (
          <Badge key={String(item)} color={resolveFieldOptionColor(field, String(item))}>
            {String(item)}
          </Badge>
        ))}
      </div>
    );
  }

  if (field.type === "relation") {
    const values = Array.isArray(value) ? value : [];
    if (values.length === 0) return <EmDash />;
    return (
      <div className="flex flex-wrap gap-1">
        {values.map((item) => {
          const label = String(item);
          return (
            <Badge key={label} color={resolveRelationColor(label)}>
              {label}
            </Badge>
          );
        })}
      </div>
    );
  }

  if (field.type === "checkbox") {
    return (
      <div className="text-[13px] text-[var(--subtext-0)]">
        {value === true ? "☑︎" : <EmDash />}
      </div>
    );
  }

  const displayValue = getFieldDisplayValue(record, field, database, catalog);
  return displayValue ? (
    <div className="truncate text-[13px] text-[var(--subtext-0)]">{displayValue}</div>
  ) : (
    <EmDash />
  );
}

function EmDash() {
  return <span className="text-[13px] text-[var(--overlay-1)] opacity-60">—</span>;
}
