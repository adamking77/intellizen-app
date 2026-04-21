import { useState, type CSSProperties } from "react";

import { Badge } from "@/components/database/primitives/Badge";
import { EmptyState } from "@/components/ui/empty-state";
import { resolveFieldOptionColor, resolveRelationColor, resolveStatusColor } from "@/lib/database-colors";
import {
  getFieldDisplayValue,
  getViewRecords,
  getRecordTitle,
  getVisibleFields,
  resolveRelationLabel,
} from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseField,
  WorkspaceDatabaseModel,
  WorkspaceDatabaseViewConfig,
} from "@/lib/types";

interface DatabaseListViewProps {
  database: WorkspaceDatabaseModel;
  view: WorkspaceDatabaseModel["views"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
  activeRecordId: string | null;
  onOpenRecord: (recordId: string) => void;
  onCreateRecord: () => void;
  onUpdateView: (config: Partial<WorkspaceDatabaseViewConfig>) => void;
}

let lastListPropertyLabelWidth = 96;

export function DatabaseListView({
  database,
  view,
  catalog,
  activeRecordId,
  onOpenRecord,
  onCreateRecord,
  onUpdateView,
}: DatabaseListViewProps) {
  const records = getViewRecords(database, view, catalog);
  const titleFieldId = database.schema.find((field) => field.type === "text")?.id;
  const summaryFields = getVisibleFields(database.schema, view).filter((field) => field.id !== titleFieldId);
  const [propertyLabelWidth, setPropertyLabelWidth] = useState(view.listPropertyWidth ?? lastListPropertyLabelWidth);

  function handlePropertyResizeStart(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = propertyLabelWidth;
    const min = 76;
    const max = 180;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (moveEvent: PointerEvent) => {
      const next = Math.max(min, Math.min(max, startWidth + (moveEvent.clientX - startX)));
      lastListPropertyLabelWidth = next;
      setPropertyLabelWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      onUpdateView({ listPropertyWidth: lastListPropertyLabelWidth });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  if (records.length === 0) {
    return (
      <EmptyState
        title="No records"
        description="Create a record to get started."
        action={{ label: "+ New Record", onClick: onCreateRecord }}
      />
    );
  }

  return (
    <div className="db-list-root flex min-h-0 flex-col flex-1 overflow-y-auto">
      {records.map((record) => {
        const title = getRecordTitle(record, database);
        const shownFields = summaryFields.filter((field) => {
          const value = record[field.id];
          return !(value == null || value === "" || (Array.isArray(value) && value.length === 0));
        });
        return (
          <div
            key={record.id}
            className="db-list-record"
            style={{
              borderColor: activeRecordId === record.id ? "var(--accent)" : undefined,
              backgroundColor: activeRecordId === record.id ? "var(--surface-wash)" : undefined,
            }}
            onClick={() => onOpenRecord(record.id)}
          >
            <div className="db-list-record-main">
              <div className="db-list-record-title">{title}</div>
              <div className="db-list-property-list">
                {shownFields.length > 0 ? (
                  shownFields.map((field) => (
                    <div
                      key={field.id}
                      className="db-list-property-row"
                      style={{ gridTemplateColumns: `${propertyLabelWidth}px 16px minmax(0, 1fr)` } as CSSProperties}
                    >
                      <div className="db-list-property-label">{field.name}</div>
                      <div
                        className="db-list-property-divider"
                        onPointerDown={handlePropertyResizeStart}
                        onClick={(e) => e.stopPropagation()}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize list property label column"
                      />
                      <div className="db-list-property-value">
                        <ListPropertyValue field={field} record={record} database={database} catalog={catalog} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="db-list-property-empty">No visible properties</div>
                )}
              </div>
            </div>
            <button
              type="button"
              className="db-list-record-open"
              title="Open record"
              onClick={(e) => {
                e.stopPropagation();
                onOpenRecord(record.id);
              }}
            >
              ↗
            </button>
          </div>
        );
      })}
      <div className="db-list-add-row">
        <button
          type="button"
          className="db-add-record-btn"
          onClick={onCreateRecord}
        >
          + New record
        </button>
      </div>
    </div>
  );
}

function ListPropertyValue({
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
  const rawValue = record[field.id];
  if (rawValue == null || rawValue === "" || (Array.isArray(rawValue) && rawValue.length === 0)) {
    return <span className="db-list-property-empty">—</span>;
  }

  if (field.type === "status" && typeof rawValue === "string") {
    return <Badge color={resolveStatusColor(rawValue, field)}>{rawValue}</Badge>;
  }
  if (field.type === "select" && typeof rawValue === "string") {
    return <Badge color={resolveFieldOptionColor(field, rawValue)}>{rawValue}</Badge>;
  }
  if (field.type === "multiselect" && Array.isArray(rawValue)) {
    return (
      <div className="db-list-property-badges">
        {rawValue.map((value) => (
          <Badge key={value} color={resolveFieldOptionColor(field, value)}>{value}</Badge>
        ))}
      </div>
    );
  }
  if (field.type === "relation" && Array.isArray(rawValue)) {
    return (
      <div className="db-list-property-badges">
        {rawValue.map((id) => {
          const label = resolveRelationLabel(field, String(id), catalog);
          return <Badge key={id} color={resolveRelationColor(label)}>{label}</Badge>;
        })}
      </div>
    );
  }
  if (typeof rawValue === "boolean") {
    return <span>{rawValue ? "Yes" : "No"}</span>;
  }

  return <span className="truncate block">{getFieldDisplayValue(record, field, database, catalog)}</span>;
}
