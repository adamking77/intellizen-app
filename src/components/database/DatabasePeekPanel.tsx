import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Copy,
  GripVertical,
  Maximize2,
  Minimize2,
  Pin,
  Trash2,
  X,
} from "lucide-react";

import { TaskRelationsSection } from "@/components/database/primitives/TaskRelationsSection";
import { Badge } from "@/components/database/primitives/Badge";
import { InlineMultiPillPicker } from "@/components/database/primitives/InlineMultiPillPicker";
import { InlinePillPicker } from "@/components/database/primitives/InlinePillPicker";
import { InlineRelationEditor } from "@/components/database/primitives/InlineRelationEditor";
import { MarkdownToolbar } from "@/components/database/primitives/MarkdownToolbar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { resolveFieldOptionColor, resolveRelationColor, resolveStatusColor } from "@/lib/database-colors";
import {
  getFieldDisplayValue,
  getFieldValue,
  getRecordTitle,
  getSuggestedHeaderFields,
} from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
} from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

let lastPanelWidth = 520;

interface DatabasePeekPanelProps {
  database: WorkspaceDatabaseModel;
  record: WorkspaceDatabaseModel["records"][number] | null;
  catalog: WorkspaceDatabaseCatalogEntry[];
  onClose: () => void;
  onDelete: (databaseId: string, recordId: string) => Promise<void> | void;
  onDuplicate: (databaseId: string, recordId: string) => Promise<void> | void;
  onOpenRecord: (databaseId: string, recordId: string) => void;
  onUpdateField: (recordId: string, fieldId: string, value: WorkspaceDatabaseFieldValue) => Promise<void> | void;
  onUpdateBody: (recordId: string, body: string | null) => Promise<void> | void;
  onUpdateRelation: (
    databaseId: string,
    recordId: string,
    fieldId: string,
    values: string[],
  ) => Promise<void> | void;
  onCreateRecord: (databaseId: string, seed?: Record<string, WorkspaceDatabaseFieldValue>) => Promise<string | null>;
  onSaveHeaderFields: (databaseId: string, fieldIds: string[]) => Promise<void> | void;
}

export function DatabasePeekPanel({
  database,
  record,
  catalog,
  onClose,
  onDelete,
  onDuplicate,
  onOpenRecord,
  onUpdateField,
  onUpdateBody,
  onUpdateRelation,
  onCreateRecord,
  onSaveHeaderFields,
}: DatabasePeekPanelProps) {
  const [width, setWidth] = useState(lastPanelWidth);
  const [isFullPage, setIsFullPage] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [customizeSummaryOpen, setCustomizeSummaryOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const customizeAnchorRef = useRef<HTMLDivElement | null>(null);
  const widthRef = useRef(lastPanelWidth);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!record) return;
    const activeRecord = record;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        void onDuplicate(database.id, activeRecord.id);
      }
      if (event.key === "Delete" && !["INPUT", "TEXTAREA"].includes((event.target as HTMLElement | null)?.tagName ?? "")) {
        event.preventDefault();
        void onDelete(database.id, activeRecord.id);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [database.id, onClose, onDelete, onDuplicate, record]);

  useEffect(() => {
    const persisted = window.localStorage.getItem("database-peek-width");
    if (!persisted) return;
    const parsed = Number(persisted);
    if (Number.isFinite(parsed) && parsed >= 380) {
      lastPanelWidth = parsed;
      setWidth(parsed);
    }
  }, []);

  const titleField =
    (database.headerFieldIds?.[0] ? database.schema.find((field) => field.id === database.headerFieldIds?.[0]) : undefined) ??
    database.schema.find((field) => field.type === "text") ??
    database.schema[0];
  const effectiveHeaderFieldIds = (database.headerFieldIds?.length
    ? database.headerFieldIds
    : getSuggestedHeaderFields(database)
  ).filter((fieldId) => database.schema.some((field) => field.id === fieldId));
  const summaryFieldIds = effectiveHeaderFieldIds.filter((fieldId) => fieldId !== titleField?.id).slice(0, 5);
  const summaryFields = summaryFieldIds
    .map((fieldId) => database.schema.find((field) => field.id === fieldId))
    .filter((field): field is NonNullable<typeof field> => Boolean(field));
  const nonPinnedFields = database.schema.filter(
    (field) => field.id !== titleField?.id && !summaryFieldIds.includes(field.id),
  );
  const taskRelationFields = database.schema.filter((field) => {
    if (field.type !== "relation") return false;
    const targetDatabaseId = field.relation?.targetDatabaseId ?? database.id;
    const targetDatabase =
      targetDatabaseId === database.id
        ? database
        : catalog.find((entry) => entry.id === targetDatabaseId);
    return Boolean(
      targetDatabase?.schema.some((candidate) => candidate.type === "status" || candidate.type === "checkbox"),
    );
  });

  if (!record) {
    return null;
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widthRef.current;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    function handleMove(moveEvent: PointerEvent) {
      const nextWidth = Math.max(380, Math.min(window.innerWidth * 0.92, startWidth + (startX - moveEvent.clientX)));
      widthRef.current = nextWidth;
      setWidth(nextWidth);
    }

    function handleUp() {
      lastPanelWidth = widthRef.current;
      window.localStorage.setItem("database-peek-width", String(widthRef.current));
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id || !titleField) return;
    const next = arrayMove(summaryFieldIds, summaryFieldIds.indexOf(String(event.active.id)), summaryFieldIds.indexOf(String(event.over.id)));
    void onSaveHeaderFields(database.id, [titleField.id, ...next]);
  }

  return (
    <aside
      className={cn(
        "absolute inset-y-0 right-0 z-40 flex flex-col border-l border-[var(--border)] bg-[var(--base)] transition-transform duration-200 ease-[var(--ease-out)]",
        isFullPage ? "w-full" : "",
      )}
      style={{
        width: isFullPage ? "100%" : width,
        transform: entered ? "translateX(0)" : "translateX(100%)",
      }}
    >
      <div
        className="absolute inset-y-0 left-0 z-10 w-2 cursor-ew-resize bg-transparent"
        onPointerDown={startResize}
      />

      <div className="border-b border-[var(--border)] px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            {titleField ? (
              <Input
                defaultValue={String(record[titleField.id] ?? "")}
                onBlur={(event) => onUpdateField(record.id, titleField.id, event.target.value || null)}
                className="h-auto border-transparent bg-transparent px-0 text-[20px] font-semibold tracking-[-0.03em] shadow-none focus:border-transparent focus:shadow-none"
              />
            ) : (
              <div className="text-[20px] font-semibold tracking-[-0.03em] text-[var(--text)]">
                {getRecordTitle(record, database)}
              </div>
            )}
            <div className="text-[12px] text-[var(--overlay-1)]">
              Created {formatDateTime(record._createdAt ?? null)} · Edited {formatDateTime(record._updatedAt ?? null)}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <IconAction
              label={isFullPage ? "Exit full page" : "Full page"}
              icon={isFullPage ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              onClick={() => setIsFullPage((current) => !current)}
            />
            <IconAction label="Duplicate" icon={<Copy className="h-4 w-4" />} onClick={() => void onDuplicate(database.id, record.id)} />
            <IconAction
              label="Delete"
              icon={<Trash2 className="h-4 w-4" />}
              className="hover:bg-[rgba(243,139,168,0.14)] hover:text-[var(--red)]"
              onClick={() => void onDelete(database.id, record.id)}
            />
            <IconAction label="Close" icon={<X className="h-4 w-4" />} onClick={onClose} />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--mantle)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13px] font-semibold text-[var(--text)]">Summary</div>
            <div ref={customizeAnchorRef}>
              <button
                type="button"
                onClick={() => setCustomizeSummaryOpen((current) => !current)}
                className="text-[12px] text-[var(--overlay-1)] transition-colors hover:text-[var(--text)]"
              >
                Customize view
              </button>
              {customizeSummaryOpen ? (
                <div className="absolute right-6 mt-2 w-64 rounded-2xl border border-[var(--border)] bg-[var(--mantle)] p-2 shadow-[var(--shadow-elevated)]">
                  {database.schema
                    .filter((field) => field.id !== titleField?.id)
                    .map((field) => {
                      const selected = summaryFieldIds.includes(field.id);
                      return (
                        <button
                          key={field.id}
                          type="button"
                          onClick={() => {
                            const nextSummary = selected
                              ? summaryFieldIds.filter((candidate) => candidate !== field.id)
                              : [...summaryFieldIds, field.id].slice(0, 5);
                            void onSaveHeaderFields(database.id, titleField ? [titleField.id, ...nextSummary] : nextSummary);
                          }}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                        >
                          <span>{field.name}</span>
                          {selected ? <Pin className="h-3.5 w-3.5 text-[var(--accent)]" /> : null}
                        </button>
                      );
                    })}
                </div>
              ) : null}
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={summaryFieldIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {summaryFields.length ? (
                  summaryFields.map((field) => (
                    <SummaryFieldRow
                      key={field.id}
                      database={database}
                      field={field}
                      record={record}
                      catalog={catalog}
                      onUpdateField={onUpdateField}
                      onUpdateRelation={onUpdateRelation}
                    />
                  ))
                ) : (
                  <div className="text-[12px] text-[var(--overlay-1)]">No pinned summary fields</div>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--mantle)] p-4">
          <button
            type="button"
            onClick={() => setPropertiesOpen((current) => !current)}
            className="flex w-full items-center justify-between text-left"
          >
            <div className="text-[13px] font-semibold text-[var(--text)]">
              Properties ({nonPinnedFields.length})
            </div>
            <div className="text-[12px] text-[var(--overlay-1)]">{propertiesOpen ? "Hide" : "Show"}</div>
          </button>

          {propertiesOpen ? (
            <div className="mt-4 space-y-3">
              {nonPinnedFields.map((field) => (
                <div key={field.id} className="grid gap-2 md:grid-cols-[140px_minmax(0,1fr)] md:items-start">
                  <div className="pt-1 text-[12px] font-medium text-[var(--subtext-0)]">{field.name}</div>
                  <FieldValueEditor
                    database={database}
                    field={field}
                    record={record}
                    catalog={catalog}
                    onUpdateField={onUpdateField}
                    onUpdateRelation={onUpdateRelation}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {taskRelationFields.map((field) => {
          const targetDatabaseId = field.relation?.targetDatabaseId ?? database.id;
          const targetCatalog = targetDatabaseId === database.id ? null : catalog.find((entry) => entry.id === targetDatabaseId);
          const targetDatabase: WorkspaceDatabaseModel =
            targetCatalog
              ? {
                  id: targetCatalog.id,
                  name: targetCatalog.name,
                  schema: targetCatalog.schema,
                  records: targetCatalog.records,
                  views: [],
                  headerFieldIds: targetCatalog.headerFieldIds,
                }
              : database;
          return (
            <TaskRelationsSection
              key={field.id}
              sourceDatabaseId={database.id}
              sourceRecordId={record.id}
              fieldId={field.id}
              fieldName={field.name}
              targetDatabase={targetDatabase}
              relatedRecordIds={Array.isArray(record[field.id]) ? (record[field.id] as string[]) : []}
              catalog={catalog}
              onOpenRecord={onOpenRecord}
              onCreateRecord={onCreateRecord}
              onUpdateField={onUpdateField}
              onUpdateRelation={onUpdateRelation}
            />
          );
        })}

        <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--mantle)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13px] font-semibold text-[var(--text)]">Notes</div>
            <div className="text-[12px] text-[var(--overlay-1)]">
              {(record._body?.trim().split(/\s+/).filter(Boolean).length ?? 0)} words
            </div>
          </div>
          <MarkdownToolbar textareaRef={textareaRef} />
          <Textarea
            ref={textareaRef}
            defaultValue={record._body ?? ""}
            onBlur={(event) => onUpdateBody(record.id, event.target.value || null)}
            placeholder="Record notes, context, and long-form detail"
            className="min-h-[220px] bg-[var(--base)]"
          />
        </section>
      </div>
    </aside>
  );
}

function SummaryFieldRow({
  database,
  field,
  record,
  catalog,
  onUpdateField,
  onUpdateRelation,
}: {
  database: WorkspaceDatabaseModel;
  field: WorkspaceDatabaseModel["schema"][number];
  record: WorkspaceDatabaseModel["records"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
  onUpdateField: (recordId: string, fieldId: string, value: WorkspaceDatabaseFieldValue) => Promise<void> | void;
  onUpdateRelation: (
    databaseId: string,
    recordId: string,
    fieldId: string,
    values: string[],
  ) => Promise<void> | void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 py-2"
    >
      <button
        type="button"
        className="mt-1 text-[var(--overlay-1)]"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-[var(--overlay-1)]">{field.name}</div>
        <FieldValueEditor
          database={database}
          field={field}
          record={record}
          catalog={catalog}
          onUpdateField={onUpdateField}
          onUpdateRelation={onUpdateRelation}
        />
      </div>
    </div>
  );
}

function FieldValueEditor({
  database,
  field,
  record,
  catalog,
  onUpdateField,
  onUpdateRelation,
}: {
  database: WorkspaceDatabaseModel;
  field: WorkspaceDatabaseModel["schema"][number];
  record: WorkspaceDatabaseModel["records"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
  onUpdateField: (recordId: string, fieldId: string, value: WorkspaceDatabaseFieldValue) => Promise<void> | void;
  onUpdateRelation: (
    databaseId: string,
    recordId: string,
    fieldId: string,
    values: string[],
  ) => Promise<void> | void;
}) {
  const value = getFieldValue(record, field, database, catalog);
  const displayValue = getFieldDisplayValue(record, field, database, catalog);

  if (field.type === "checkbox") {
    return (
      <div onClick={(event) => event.stopPropagation()}>
        <Checkbox checked={Boolean(value)} onCheckedChange={(checked) => onUpdateField(record.id, field.id, checked)} />
      </div>
    );
  }

  if (field.type === "status") {
    return (
      <InlinePillPicker
        options={field.options ?? []}
        value={typeof value === "string" ? value : null}
        getColor={resolveStatusColor}
        onChange={(next) => onUpdateField(record.id, field.id, next)}
      />
    );
  }

  if (field.type === "select") {
    return (
      <InlinePillPicker
        options={field.options ?? []}
        value={typeof value === "string" ? value : null}
        getColor={(option) => resolveFieldOptionColor(field, option)}
        onChange={(next) => onUpdateField(record.id, field.id, next)}
      />
    );
  }

  if (field.type === "multiselect") {
    return (
      <InlineMultiPillPicker
        options={field.options ?? []}
        values={Array.isArray(value) ? value : []}
        getColor={(option) => resolveFieldOptionColor(field, option)}
        onChange={(next) => onUpdateField(record.id, field.id, next)}
      />
    );
  }

  if (field.type === "relation") {
    const targetDatabaseId = field.relation?.targetDatabaseId ?? database.id;
    const targetDatabase =
      catalog.find((candidate) => candidate.id === targetDatabaseId) ??
      catalog.find((candidate) => candidate.id === database.id);
    return (
      <InlineRelationEditor
        values={Array.isArray(value) ? value : []}
        options={(targetDatabase?.records ?? []).map((candidate) => ({
          id: candidate.id,
          label: getRecordTitle(candidate, targetDatabase ?? database),
          meta: candidate.id,
        }))}
        onChange={(next) => onUpdateRelation(database.id, record.id, field.id, next)}
      />
    );
  }

  if (field.type === "text" || field.type === "url" || field.type === "email" || field.type === "phone") {
    return (
      <Input
        defaultValue={typeof value === "string" ? value : ""}
        onClick={(event) => event.stopPropagation()}
        onBlur={(event) => onUpdateField(record.id, field.id, event.target.value || null)}
        className="h-8 bg-[var(--base)]"
      />
    );
  }

  if (field.type === "number") {
    return (
      <Input
        type="number"
        defaultValue={typeof value === "number" ? String(value) : ""}
        onClick={(event) => event.stopPropagation()}
        onBlur={(event) => onUpdateField(record.id, field.id, event.target.value ? Number(event.target.value) : null)}
        className="h-8 bg-[var(--base)]"
      />
    );
  }

  if (field.type === "date") {
    return (
      <Input
        type="date"
        defaultValue={typeof value === "string" ? value.slice(0, 10) : ""}
        onClick={(event) => event.stopPropagation()}
        onBlur={(event) => onUpdateField(record.id, field.id, event.target.value || null)}
        className="h-8 bg-[var(--base)]"
      />
    );
  }

  if (field.type === "createdAt" || field.type === "lastEditedAt" || field.type === "formula" || field.type === "rollup") {
    return (
      <div className="opacity-60">
        <Badge>{displayValue || "No value"}</Badge>
      </div>
    );
  }

  return (
    <Badge color={resolveRelationColor(displayValue || "No value")}>
      {displayValue || "No value"}
    </Badge>
  );
}

function IconAction({
  icon,
  label,
  onClick,
  className,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
        className,
      )}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}
