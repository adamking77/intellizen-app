import type { WorkspaceDatabaseCatalogEntry, WorkspaceDatabaseField, WorkspaceDatabaseModel } from "@/lib/types";
import { getFieldDisplayValue, getFieldValue } from "@/lib/database-core";
import { resolveFieldOptionColor, resolveRelationColor, resolveStatusColor } from "@/lib/database-colors";
import { Badge } from "./Badge";

interface TableCellProps {
  record: WorkspaceDatabaseModel["records"][number];
  field: WorkspaceDatabaseField;
  database: WorkspaceDatabaseModel;
  catalog?: WorkspaceDatabaseCatalogEntry[];
  onToggleCheckbox?: () => void;
}

export function TableCell({ record, field, database, catalog, onToggleCheckbox }: TableCellProps) {
  const value = getFieldValue(record, field, database, catalog);
  const displayValue = getFieldDisplayValue(record, field, database, catalog);

  // Non-editable computed fields
  if (field.type === "formula" || field.type === "rollup" || field.type === "createdAt" || field.type === "lastEditedAt") {
    return <span style={{ opacity: 0.5 }}>{displayValue}</span>;
  }

  switch (field.type) {
    case "checkbox":
      return (
        <button
          type="button"
          className="db-cell-checkbox-btn"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCheckbox?.();
          }}
        >
          <svg
            className={`db-cell-checkbox${value === true ? " db-cell-checkbox--checked" : ""}`}
            viewBox="0 0 14 14"
            aria-hidden="true"
          >
            <rect className="db-cell-checkbox-box" x="1.25" y="1.25" width="11.5" height="11.5" rx="3" />
            <path className="db-cell-checkbox-mark" d="M4 7.2 6.1 9.3 10 5.4" />
          </svg>
        </button>
      );
    case "status":
      return displayValue ? (
        <Badge color={resolveStatusColor(displayValue, field)}>{displayValue}</Badge>
      ) : (
        <span style={{ opacity: 0.25 }}>&mdash;</span>
      );
    case "select":
      return displayValue ? (
        <Badge color={resolveFieldOptionColor(field, displayValue)}>{displayValue}</Badge>
      ) : (
        <span style={{ opacity: 0.25 }}>&mdash;</span>
      );
    case "multiselect": {
      const values = Array.isArray(value) ? value : [];
      return (
        <div className="flex gap-1 flex-wrap">
          {values.map((v) => (
            <Badge key={v} color={resolveFieldOptionColor(field, v)}>{v}</Badge>
          ))}
          {values.length === 0 && <span style={{ opacity: 0.25 }}>&mdash;</span>}
        </div>
      );
    }
    case "relation": {
      const ids = Array.isArray(value) ? value : [];
      return (
        <div className="flex gap-1 flex-wrap">
          {ids.map((id) => {
            const label = resolveRelationLabel(field, id, catalog);
            return <Badge key={id} color={resolveRelationColor(label)}>{label}</Badge>;
          })}
          {ids.length === 0 && <span style={{ opacity: 0.25 }}>&mdash;</span>}
        </div>
      );
    }
    case "url":
      return displayValue ? (
        <a
          href={displayValue}
          className="underline"
          style={{ color: "var(--accent)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {displayValue}
        </a>
      ) : (
        <span style={{ opacity: 0.25 }}>&mdash;</span>
      );
    default:
      return (
        <span className="block truncate" title={displayValue}>
          {displayValue || <span style={{ opacity: 0.25 }}>&mdash;</span>}
        </span>
      );
  }
}

function resolveRelationLabel(
  field: WorkspaceDatabaseField,
  recordId: string,
  catalog?: Array<Pick<WorkspaceDatabaseModel, "id" | "name" | "schema" | "records" | "headerFieldIds">>,
): string {
  if (!catalog?.length) return recordId;
  const targetDatabaseId = field.relation?.targetDatabaseId;
  const databases = targetDatabaseId
    ? catalog.filter((entry) => entry.id === targetDatabaseId)
    : catalog;
  for (const db of databases) {
    const record = db.records.find((candidate) => candidate.id === recordId);
    if (!record) continue;
    const titleField =
      db.schema.find((f) => f.id === db.headerFieldIds?.[0]) ??
      db.schema.find((f) => f.type === "text") ??
      db.schema[0];
    if (!titleField) continue;
    const value = record[titleField.id];
    if (value !== null && value !== undefined && value !== "") {
      return Array.isArray(value) ? value.join(", ") : String(value);
    }
  }
  return recordId;
}
