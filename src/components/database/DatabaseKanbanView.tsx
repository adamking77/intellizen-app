import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Copy, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/database/primitives/Badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { resolveFieldOptionColor, resolveRelationColor, resolveStatusColor } from "@/lib/database-colors";
import {
  getFieldDisplayValue,
  getFieldValue,
  getKanbanColumns,
  getRecordTitle,
  getViewRecords,
  resolveRelationLabel,
} from "@/lib/database-core";
import type {
  WorkspaceDatabaseField,
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
} from "@/lib/types";
import { formatDate } from "@/lib/utils";

interface DatabaseKanbanViewProps {
  database: WorkspaceDatabaseModel;
  view: WorkspaceDatabaseModel["views"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
  activeRecordId: string | null;
  onOpenRecord: (recordId: string) => void;
  onCreateRecord: (seed?: Record<string, WorkspaceDatabaseFieldValue>) => void;
  onUpdateField: (recordId: string, fieldId: string, value: WorkspaceDatabaseFieldValue) => Promise<void> | void;
  onDuplicateRecord: (recordId: string) => void;
  onDeleteRecord: (recordId: string) => void;
}

export function DatabaseKanbanView({
  database,
  view,
  catalog,
  activeRecordId,
  onOpenRecord,
  onCreateRecord,
  onUpdateField,
  onDuplicateRecord,
  onDeleteRecord,
}: DatabaseKanbanViewProps) {
  const [draggingRecordId, setDraggingRecordId] = useState<string | null>(null);
  const [overColumnValue, setOverColumnValue] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ recordId: string; value: string } | null>(null);
  const pendingMoveTimeoutRef = useRef<number | null>(null);
  const records = getViewRecords(database, view, catalog);
  const { groupField } = getKanbanColumns(database, view, records);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const titleFieldId =
    database.headerFieldIds?.[0] ??
    database.schema.find((field) => field.type === "text")?.id ??
    database.schema[0]?.id;

  const cardFieldIds = useMemo(
    () => selectKanbanCardFieldIds(database, view, titleFieldId, groupField?.id),
    [database, groupField?.id, titleFieldId, view],
  );

  const actualRecordColumnMap = useMemo(() => {
    if (!groupField) return new Map<string, string>();
    return new Map(
      records.map((record) => [record.id, String(getFieldValue(record, groupField, database, catalog) ?? "")] as const),
    );
  }, [catalog, database, groupField, records]);

  const displayedRecords = useMemo(() => {
    if (!groupField) return records;

    const overrides = new Map<string, string>();
    if (pendingMove) {
      const persistedValue = actualRecordColumnMap.get(pendingMove.recordId) ?? "";
      if (persistedValue !== pendingMove.value) {
        overrides.set(pendingMove.recordId, pendingMove.value);
      }
    }

    if (overrides.size === 0) return records;

    return records.map((record) => {
      const overrideValue = overrides.get(record.id);
      if (overrideValue === undefined) return record;
      return {
        ...record,
        [groupField.id]: overrideValue || null,
      };
    });
  }, [actualRecordColumnMap, groupField, pendingMove, records]);

  const { columns } = useMemo(
    () => getKanbanColumns(database, view, displayedRecords),
    [database, displayedRecords, view],
  );

  const displayedRecordColumnMap = useMemo(
    () => new Map(columns.flatMap((column) => column.records.map((record) => [record.id, column.value] as const))),
    [columns],
  );

  const draggingRecord = useMemo(
    () => (draggingRecordId ? records.find((record) => record.id === draggingRecordId) ?? null : null),
    [draggingRecordId, records],
  );

  useEffect(() => {
    if (!pendingMove) return;
    const persistedValue = actualRecordColumnMap.get(pendingMove.recordId) ?? "";
    if (persistedValue !== pendingMove.value) return;
    if (pendingMoveTimeoutRef.current !== null) {
      window.clearTimeout(pendingMoveTimeoutRef.current);
      pendingMoveTimeoutRef.current = null;
    }
    setPendingMove(null);
  }, [actualRecordColumnMap, pendingMove]);

  useEffect(() => () => {
    if (pendingMoveTimeoutRef.current !== null) {
      window.clearTimeout(pendingMoveTimeoutRef.current);
    }
  }, []);

  if (!groupField) {
    return (
      <EmptyState
        title="Kanban needs a status field"
        description="Add a status or select field in schema, then choose it as the kanban grouping property."
      />
    );
  }

  const resolvedGroupField = groupField;

  function resolveColumnValue(overId: string | null) {
    if (!overId) return null;
    if (overId.startsWith("column:")) {
      return overId.replace("column:", "");
    }
    return displayedRecordColumnMap.get(overId) ?? actualRecordColumnMap.get(overId) ?? null;
  }

  function handleDragStart(event: DragStartEvent) {
    const recordId = String(event.active.id);
    setDraggingRecordId(recordId);
    setOverColumnValue(actualRecordColumnMap.get(recordId) ?? "");
  }

  function handleDragOver(event: DragOverEvent) {
    if (!draggingRecordId) return;
    const nextValue = resolveColumnValue(event.over ? String(event.over.id) : null);
    if (nextValue === null) return;
    setOverColumnValue((current) => (current === nextValue ? current : nextValue));
  }

  function handleDragEnd(event: DragEndEvent) {
    const recordId = String(event.active.id);
    const currentValue = actualRecordColumnMap.get(recordId) ?? "";
    const nextValue = resolveColumnValue(event.over ? String(event.over.id) : null) ?? overColumnValue;
    setDraggingRecordId(null);
    setOverColumnValue(null);
    if (nextValue === null) return;
    if (nextValue === currentValue) return;
    setPendingMove({ recordId, value: nextValue });
    if (pendingMoveTimeoutRef.current !== null) {
      window.clearTimeout(pendingMoveTimeoutRef.current);
    }
    pendingMoveTimeoutRef.current = window.setTimeout(() => {
      setPendingMove((current) => (current?.recordId === recordId && current.value === nextValue ? null : current));
      pendingMoveTimeoutRef.current = null;
    }, 1800);
    void onUpdateField(recordId, resolvedGroupField.id, nextValue || null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setDraggingRecordId(null);
        setOverColumnValue(null);
      }}
    >
      <div className="db-kanban-root">
        {columns.map((column) => {
          const color = groupField.type === "status"
            ? resolveStatusColor(column.value, groupField)
            : resolveFieldOptionColor(groupField, column.value || "No value");
          return (
            <KanbanColumn
              key={column.value || "empty"}
              column={column}
              color={color}
              groupFieldId={resolvedGroupField.id}
              database={database}
              catalog={catalog}
              cardFieldIds={cardFieldIds}
              activeRecordId={activeRecordId}
              draggingRecordId={draggingRecordId}
              activeDropColumnValue={draggingRecordId ? overColumnValue : null}
              onOpenRecord={onOpenRecord}
              onCreateRecord={onCreateRecord}
              onDuplicateRecord={onDuplicateRecord}
              onDeleteRecord={onDeleteRecord}
            />
          );
        })}
      </div>

      <DragOverlay
        dropAnimation={{
          duration: 180,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {draggingRecord ? (
          <KanbanCard
            record={draggingRecord}
            database={database}
            catalog={catalog}
            cardFieldIds={cardFieldIds}
            active={false}
            dragging
            onOpenRecord={onOpenRecord}
            onDuplicateRecord={onDuplicateRecord}
            onDeleteRecord={onDeleteRecord}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  column,
  color,
  groupFieldId,
  database,
  catalog,
  cardFieldIds,
  activeRecordId,
  draggingRecordId,
  activeDropColumnValue,
  onOpenRecord,
  onCreateRecord,
  onDuplicateRecord,
  onDeleteRecord,
}: {
  column: { value: string; label: string; records: WorkspaceDatabaseModel["records"] };
  color: string;
  groupFieldId: string;
  database: WorkspaceDatabaseModel;
  catalog: WorkspaceDatabaseCatalogEntry[];
  cardFieldIds: string[];
  activeRecordId: string | null;
  draggingRecordId: string | null;
  activeDropColumnValue: string | null;
  onOpenRecord: (recordId: string) => void;
  onCreateRecord: (seed?: Record<string, WorkspaceDatabaseFieldValue>) => void;
  onDuplicateRecord: (recordId: string) => void;
  onDeleteRecord: (recordId: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `column:${column.value}` });
  const isActiveDropTarget = activeDropColumnValue === column.value || (isOver && draggingRecordId !== null);

  return (
    <div
      ref={setNodeRef}
      className={`db-kanban-column${isActiveDropTarget ? " db-kanban-column--active-drop" : ""}`}
    >
      <div className="db-kanban-column-header">
        <span className="db-kanban-column-dot" style={{ backgroundColor: color }} />
        <span className="db-kanban-column-title">{column.label}</span>
        <span className="db-kanban-column-count">{column.records.length}</span>
      </div>

      <div className="db-kanban-column-body">
        {column.records.map((record) => (
          <KanbanCard
            key={record.id}
            record={record}
            database={database}
            catalog={catalog}
            cardFieldIds={cardFieldIds}
            active={activeRecordId === record.id}
            onOpenRecord={onOpenRecord}
            onDuplicateRecord={onDuplicateRecord}
            onDeleteRecord={onDeleteRecord}
          />
        ))}
      </div>
      <button
        type="button"
        className="db-kanban-add-btn"
        onClick={() => onCreateRecord({ [groupFieldId]: column.value || null })}
      >
        + Add
      </button>
    </div>
  );
}

function KanbanCard({
  record,
  database,
  catalog,
  cardFieldIds,
  active,
  dragging,
  onOpenRecord,
  onDuplicateRecord,
  onDeleteRecord,
}: {
  record: WorkspaceDatabaseModel["records"][number];
  database: WorkspaceDatabaseModel;
  catalog: WorkspaceDatabaseCatalogEntry[];
  cardFieldIds: string[];
  active: boolean;
  dragging?: boolean;
  onOpenRecord: (recordId: string) => void;
  onDuplicateRecord: (recordId: string) => void;
  onDeleteRecord: (recordId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: record.id,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const statusField = database.schema.find((field) => field.type === "status" || field.type === "select");
  const statusValue = statusField ? String(getFieldValue(record, statusField, database, catalog) ?? "") : "";
  const borderColor = statusField
    ? statusField.type === "status"
      ? resolveStatusColor(statusValue, statusField)
      : resolveFieldOptionColor(statusField, statusValue || "No value")
    : "var(--surface-1)";
  const cardFields = cardFieldIds
    .map((fieldId) => database.schema.find((candidate) => candidate.id === fieldId))
    .filter((field): field is WorkspaceDatabaseField => Boolean(field));
  const propertyRows: Array<{
    key: string;
    kind: "badges" | "text";
    badges?: Array<{ key: string; label: string; color?: string | null }>;
    value?: string;
  }> = [];

  for (const field of cardFields) {
    const value = getFieldValue(record, field, database, catalog);
    if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      continue;
    }

    if (field.type === "checkbox") {
      if (value === true) {
        propertyRows.push({ key: field.id, kind: "text", value: field.name });
      }
      continue;
    }

    if (field.type === "status" || field.type === "select") {
      const textValue = String(value);
      propertyRows.push({
        key: field.id,
        kind: "badges",
        badges: [{
          key: field.id,
          label: textValue,
          color: field.type === "status" ? resolveStatusColor(textValue, field) : resolveFieldOptionColor(field, textValue),
          
        }],
      });
      continue;
    }

    if (field.type === "multiselect" && Array.isArray(value)) {
      const badges: Array<{ key: string; label: string; color?: string | null }> = value.slice(0, 2).map((option) => ({
        key: `${field.id}:${option}`,
        label: option,
        color: resolveFieldOptionColor(field, option),
      }));
      if (value.length > 2) {
        badges.push({ key: `${field.id}:more`, label: `+${value.length - 2}` });
      }
      propertyRows.push({
        key: field.id,
        kind: "badges",
        badges,
      });
      continue;
    }

    if (field.type === "relation" && Array.isArray(value)) {
      const badges: Array<{ key: string; label: string; color?: string | null }> = value.slice(0, 2).map((relationId) => {
        const label = resolveRelationLabel(field, relationId, catalog);
        return {
          key: `${field.id}:${relationId}`,
          label,
          color: resolveRelationColor(label),
        };
      });
      if (value.length > 2) {
        badges.push({ key: `${field.id}:more`, label: `+${value.length - 2}` });
      }
      propertyRows.push({
        key: field.id,
        kind: "badges",
        badges,
      });
      continue;
    }

    const displayValue = field.type === "date"
      ? formatDate(String(value))
      : getFieldDisplayValue(record, field, database, catalog);
    if (!displayValue) continue;
    propertyRows.push({
      key: field.id,
      kind: "text",
      value: displayValue,
    });
  }

  return (
    <>
      <div
        ref={setNodeRef}
        className="db-kanban-card"
        style={{
          transform: CSS.Translate.toString(transform),
          opacity: dragging || isDragging ? 0.5 : 1,
          borderLeftWidth: 3,
          borderLeftColor: borderColor,
          backgroundColor: active ? "var(--surface-wash)" : undefined,
        }}
        {...attributes}
        {...listeners}
        onClick={() => onOpenRecord(record.id)}
      >
        <div className="db-kanban-card-actions">
          <button
            type="button"
            className="db-icon-btn-plain"
            title="Duplicate"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicateRecord(record.id);
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="db-icon-btn-plain db-icon-btn-plain-danger"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(true);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="db-kanban-card-title">{getRecordTitle(record, database)}</div>

        {propertyRows.length > 0 ? (
          <div className="db-kanban-card-fields">
            {propertyRows.map((row) => (
              <div key={row.key} className="db-kanban-card-field">
                {row.kind === "badges" ? (
                  <div className="db-kanban-card-field-badges">
                    {row.badges?.map((badge) => (
                      <Badge key={badge.key} color={badge.color} className="max-w-full truncate">
                        {badge.label}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="db-kanban-card-field-value">{row.value}</span>
                )}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete record"
        message="This action cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          onDeleteRecord(record.id);
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function selectKanbanCardFieldIds(
  database: WorkspaceDatabaseModel,
  view: WorkspaceDatabaseModel["views"][number],
  titleFieldId?: string,
  groupFieldId?: string,
) {
  const excluded = new Set([titleFieldId, groupFieldId].filter(Boolean));
  const fallback = [...database.schema]
    .filter((field) => !excluded.has(field.id))
    .filter((field) => field.type !== "createdAt" && field.type !== "lastEditedAt" && field.type !== "formula" && field.type !== "rollup")
    .sort((left, right) => rankKanbanCardField(left) - rankKanbanCardField(right) || left.name.localeCompare(right.name))
    .slice(0, 3)
    .map((field) => field.id);

  if (view.cardFields?.length) {
    const configured = view.cardFields
      .filter((fieldId) => !excluded.has(fieldId))
      .filter((fieldId) => database.schema.some((field) => field.id === fieldId))
      .slice(0, 3);
    return configured.length > 0 ? configured : fallback;
  }

  return fallback;
}

function rankKanbanCardField(field: WorkspaceDatabaseField) {
  switch (field.type) {
    case "status":
    case "select":
    case "multiselect":
      return 0;
    case "date":
      return 1;
    case "relation":
      return 2;
    case "number":
      return 3;
    case "checkbox":
      return 4;
    case "url":
    case "email":
    case "phone":
      return 5;
    case "text":
    default:
      return 6;
  }
}
