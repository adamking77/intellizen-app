import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/database/primitives/Badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { resolveFieldOptionColor, resolveStatusColor } from "@/lib/database-colors";
import { getFieldValue, getKanbanColumns, getRecordTitle, getViewRecords } from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
} from "@/lib/types";
import { cn } from "@/lib/utils";

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
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set());
  const records = getViewRecords(database, view, catalog);
  const { groupField, columns } = getKanbanColumns(database, view, records);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const titleFieldId =
    database.headerFieldIds?.[0] ??
    database.schema.find((field) => field.type === "text")?.id ??
    database.schema[0]?.id;
  const cardFieldIds =
    view.cardFields?.length
      ? view.cardFields
      : database.headerFieldIds?.slice(1) ??
        database.schema
          .filter((field) => field.id !== titleFieldId && field.id !== groupField?.id)
          .slice(0, 3)
          .map((field) => field.id);

  const recordColumnMap = useMemo(
    () => new Map(columns.flatMap((column) => column.records.map((record) => [record.id, column.value] as const))),
    [columns],
  );

  const draggingRecord = useMemo(
    () => (draggingRecordId ? records.find((record) => record.id === draggingRecordId) ?? null : null),
    [draggingRecordId, records],
  );

  if (!groupField) {
    return (
      <EmptyState
        title="Kanban needs a status field"
        description="Add a status or select field in schema, then choose it as the kanban grouping property."
      />
    );
  }

  const resolvedGroupField = groupField;

  function handleDragStart(event: DragStartEvent) {
    setDraggingRecordId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingRecordId(null);
    if (!event.over) return;
    const recordId = String(event.active.id);
    const overId = String(event.over.id);
    const currentValue = recordColumnMap.get(recordId) ?? "";
    const nextValue = overId.startsWith("column:") ? overId.replace("column:", "") : (recordColumnMap.get(overId) ?? currentValue);
    if (nextValue === currentValue) return;
    void onUpdateField(recordId, resolvedGroupField.id, nextValue || null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingRecordId(null)}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-4">
          <div className="flex h-full gap-4">
            {columns.map((column) => {
              const collapsed = collapsedColumns.has(column.value);
              const color = groupField.type === "status"
                ? resolveStatusColor(column.value)
                : resolveFieldOptionColor(groupField, column.value || "No value");
              return (
                <KanbanColumn
                  key={column.value || "empty"}
                  column={column}
                  color={color}
                  collapsed={collapsed}
                  groupFieldId={resolvedGroupField.id}
                  database={database}
                  catalog={catalog}
                  cardFieldIds={cardFieldIds}
                  activeRecordId={activeRecordId}
                  draggingRecordId={draggingRecordId}
                  onOpenRecord={onOpenRecord}
                  onCreateRecord={onCreateRecord}
                  onToggleCollapsed={() =>
                    setCollapsedColumns((current) => {
                      const next = new Set(current);
                      if (next.has(column.value)) next.delete(column.value);
                      else next.add(column.value);
                      return next;
                    })
                  }
                  onDuplicateRecord={onDuplicateRecord}
                  onDeleteRecord={onDeleteRecord}
                />
              );
            })}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
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
  collapsed,
  groupFieldId,
  database,
  catalog,
  cardFieldIds,
  activeRecordId,
  draggingRecordId,
  onOpenRecord,
  onCreateRecord,
  onToggleCollapsed,
  onDuplicateRecord,
  onDeleteRecord,
}: {
  column: { value: string; label: string; records: WorkspaceDatabaseModel["records"] };
  color: string;
  collapsed: boolean;
  groupFieldId: string;
  database: WorkspaceDatabaseModel;
  catalog: WorkspaceDatabaseCatalogEntry[];
  cardFieldIds: string[];
  activeRecordId: string | null;
  draggingRecordId: string | null;
  onOpenRecord: (recordId: string) => void;
  onCreateRecord: (seed?: Record<string, WorkspaceDatabaseFieldValue>) => void;
  onToggleCollapsed: () => void;
  onDuplicateRecord: (recordId: string) => void;
  onDeleteRecord: (recordId: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `column:${column.value}` });
  const visibleCount = column.records.filter((record) => record.id !== draggingRecordId).length;

  if (collapsed) {
    return (
      <section className="flex h-full w-14 shrink-0 flex-col items-center rounded-2xl border border-[var(--border)] bg-[var(--mantle)] py-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex flex-1 flex-col items-center justify-between text-[11px] text-[var(--overlay-1)]"
        >
          <ChevronRight className="h-4 w-4" />
          <div className="flex flex-col items-center gap-2 [writing-mode:vertical-rl]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="font-semibold text-[var(--text)]">{column.label}</span>
            <span>{visibleCount}</span>
          </div>
        </button>
      </section>
    );
  }

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex h-full w-[284px] shrink-0 flex-col rounded-2xl border bg-[var(--mantle)] transition-colors",
        isOver ? "border-[var(--accent-border)]" : "border-[var(--border)]",
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
            <div className="truncate text-[13px] font-semibold text-[var(--text)]">{column.label}</div>
            <div className="text-[11px] text-[var(--overlay-1)]">{visibleCount}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={onToggleCollapsed}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => onCreateRecord({ [groupFieldId]: column.value || null })}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className={cn("min-h-0 flex-1 space-y-2 overflow-y-auto p-3", isOver && "bg-[var(--accent-soft)]")}>
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
    </section>
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
  const statusField = database.schema.find((field) => field.type === "status" || field.type === "select");
  const statusValue = statusField ? String(getFieldValue(record, statusField, database, catalog) ?? "") : "";
  const borderColor = statusField
    ? statusField.type === "status"
      ? resolveStatusColor(statusValue)
      : resolveFieldOptionColor(statusField, statusValue || "No value")
    : "var(--surface-1)";

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onOpenRecord(record.id)}
      className={cn(
        "group w-full rounded-2xl border border-[var(--border)] bg-[var(--base)] p-4 text-left transition-colors hover:border-[var(--border-strong)]",
        active && "border-[var(--accent-border)] bg-[var(--accent-soft)]",
        (dragging || isDragging) && "opacity-50",
      )}
      style={{
        transform: CSS.Translate.toString(transform),
        borderLeftWidth: 3,
        borderLeftColor: borderColor,
      }}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-[var(--text)]">
            {getRecordTitle(record, database)}
          </div>
        </div>
        <div
          className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <IconButton icon={<Copy className="h-3.5 w-3.5" />} label="Duplicate" onClick={() => onDuplicateRecord(record.id)} />
          <IconButton
            icon={<Trash2 className="h-3.5 w-3.5" />}
            label="Delete"
            className="hover:bg-[rgba(243,139,168,0.14)] hover:text-[var(--red)]"
            onClick={() => onDeleteRecord(record.id)}
          />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {cardFieldIds.map((fieldId) => {
          const field = database.schema.find((candidate) => candidate.id === fieldId);
          if (!field) return null;
          const value = getFieldValue(record, field, database, catalog);
          if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
            return null;
          }
          if (field.type === "status" || field.type === "select") {
            const textValue = String(value);
            return (
              <Badge
                key={field.id}
                color={field.type === "status" ? resolveStatusColor(textValue) : resolveFieldOptionColor(field, textValue)}
              >
                {textValue}
              </Badge>
            );
          }
          return (
            <div key={field.id} className="text-[12px] text-[var(--subtext-0)]">
              <span className="text-[var(--overlay-1)]">{field.name}: </span>
              {Array.isArray(value) ? value.join(", ") : String(value)}
            </div>
          );
        })}
      </div>
    </button>
  );
}

function IconButton({
  icon,
  label,
  onClick,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
        className,
      )}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}
