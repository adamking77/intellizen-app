import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  ExternalLink,
  Plus,
  Trash2,
} from "lucide-react";

import { ColumnHeaderPopover } from "@/components/database/primitives/ColumnHeaderPopover";
import { InlineMultiPillPicker } from "@/components/database/primitives/InlineMultiPillPicker";
import { InlinePillPicker } from "@/components/database/primitives/InlinePillPicker";
import { InlineRelationEditor } from "@/components/database/primitives/InlineRelationEditor";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { resolveFieldOptionColor, resolveStatusColor } from "@/lib/database-colors";
import {
  applyFilters,
  applySorts,
  getFieldDisplayValue,
  getFieldValue,
  getRecordTitle,
  getVisibleFields,
} from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseField,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface DatabaseTableViewProps {
  database: WorkspaceDatabaseModel;
  view: WorkspaceDatabaseModel["views"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
  activeRecordId: string | null;
  onOpenRecord: (recordId: string) => void;
  onUpdateField: (recordId: string, fieldId: string, value: WorkspaceDatabaseFieldValue) => Promise<void> | void;
  onUpdateView: (input: {
    groupBy?: string;
    sort?: WorkspaceDatabaseModel["views"][number]["sort"];
    hiddenFields?: string[];
    fieldOrder?: string[];
    columnWidths?: Record<string, number>;
  }) => void;
  onSaveSchema: (schema: WorkspaceDatabaseModel["schema"]) => void;
  onOpenSchema: () => void;
  onCreateRecord: () => void;
  onDuplicateRecord: (recordId: string) => void;
  onDeleteRecord: (recordId: string) => void;
  onDeleteRecords: (recordIds: string[]) => void;
}

export function DatabaseTableView({
  database,
  view,
  catalog,
  activeRecordId,
  onOpenRecord,
  onUpdateField,
  onUpdateView,
  onSaveSchema,
  onOpenSchema,
  onCreateRecord,
  onDuplicateRecord,
  onDeleteRecord,
  onDeleteRecords,
}: DatabaseTableViewProps) {
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(view.columnWidths ?? {});
  const [popoverFieldId, setPopoverFieldId] = useState<string | null>(null);
  const [resizeGuideX, setResizeGuideX] = useState<number | null>(null);
  const headerButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    setColumnWidths(view.columnWidths ?? {});
  }, [view.columnWidths]);

  const visibleFields = getVisibleFields(database.schema, view);
  const filtered = applyFilters(database.records, view.filter, database.schema, catalog);
  const records = applySorts(filtered, view.sort, database.schema);
  const selectedCount = selectedRecordIds.size;
  const allSelected = records.length > 0 && records.every((record) => selectedRecordIds.has(record.id));

  const groupedRecords = useMemo(() => {
    const groupField = view.groupBy
      ? database.schema.find((field) => field.id === view.groupBy)
      : null;
    if (!groupField || !["status", "select", "multiselect"].includes(groupField.type)) {
      return null;
    }

    const groups = new Map<string, WorkspaceDatabaseModel["records"]>();
    for (const record of records) {
      const rawValue = getFieldValue(record, groupField, database, catalog);
      const values = Array.isArray(rawValue) ? (rawValue.length ? rawValue : [""]) : [String(rawValue ?? "")];
      for (const value of values) {
        const bucket = groups.get(value) ?? [];
        bucket.push(record);
        groups.set(value, bucket);
      }
    }

    const orderedValues = (groupField.options ?? []).filter((option) => groups.has(option));
    if (groups.has("")) {
      orderedValues.unshift("");
    }
    for (const value of groups.keys()) {
      if (!orderedValues.includes(value)) {
        orderedValues.push(value);
      }
    }
    return { groupField, groups, orderedValues };
  }, [catalog, database, records, view.groupBy]);

  function toggleSelectedRecord(recordId: string, checked: boolean) {
    setSelectedRecordIds((current) => {
      const next = new Set(current);
      if (checked) next.add(recordId);
      else next.delete(recordId);
      return next;
    });
  }

  function handleResize(fieldId: string, event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = columnWidths[fieldId] ?? 168;

    function handleMove(moveEvent: PointerEvent) {
      const nextWidth = Math.max(120, startWidth + (moveEvent.clientX - startX));
      setColumnWidths((current) => ({ ...current, [fieldId]: nextWidth }));
      setResizeGuideX(moveEvent.clientX);
    }

    function handleUp(moveEvent: PointerEvent) {
      const nextWidth = Math.max(120, startWidth + (moveEvent.clientX - startX));
      setResizeGuideX(null);
      onUpdateView({
        columnWidths: {
          ...columnWidths,
          [fieldId]: nextWidth,
        },
      });
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function renderRow(record: WorkspaceDatabaseModel["records"][number]) {
    return (
      <tr
        key={record.id}
        className={cn(
          "group cursor-pointer transition-colors hover:bg-[var(--surface-wash)]",
          activeRecordId === record.id && "bg-[var(--accent-soft)]",
        )}
        onClick={() => onOpenRecord(record.id)}
      >
        <td
          className="sticky left-0 z-[1] border-b border-[var(--border-subtle)] bg-[inherit] px-3 py-2.5 align-top"
          onClick={(event) => event.stopPropagation()}
        >
          <Checkbox
            checked={selectedRecordIds.has(record.id)}
            onCheckedChange={(checked) => toggleSelectedRecord(record.id, checked)}
          />
        </td>
        {visibleFields.map((field, index) => (
          <td
            key={field.id}
            className="border-b border-[var(--border-subtle)] px-4 py-2.5 align-top"
            style={{ width: columnWidths[field.id] ?? 168, minWidth: columnWidths[field.id] ?? 168 }}
          >
            <div className={cn("relative", index === 0 && "pr-22")}>
              <InlineCell
                database={database}
                record={record}
                field={field}
                catalog={catalog}
                onCommit={(value) => onUpdateField(record.id, field.id, value)}
              />
              {index === 0 ? (
                <div className="absolute right-0 top-0 flex items-center gap-1 opacity-0 transition-opacity duration-90 group-hover:opacity-100">
                  <RowAction icon={<ExternalLink className="h-3.5 w-3.5" />} label="Open" onClick={() => onOpenRecord(record.id)} />
                  <RowAction icon={<Copy className="h-3.5 w-3.5" />} label="Duplicate" onClick={() => onDuplicateRecord(record.id)} />
                  <RowAction
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    label="Delete"
                    className="hover:bg-[rgba(243,139,168,0.14)] hover:text-[var(--red)]"
                    onClick={() => onDeleteRecord(record.id)}
                  />
                </div>
              ) : null}
            </div>
          </td>
        ))}
        <td className="sticky right-0 z-[1] border-b border-[var(--border-subtle)] bg-[inherit] px-2" />
      </tr>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {resizeGuideX !== null ? (
        <div
          className="pointer-events-none absolute inset-y-0 z-30 w-px bg-[var(--accent)]"
          style={{ left: resizeGuideX }}
        />
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-[var(--mantle)]">
            <tr>
              <th className="sticky left-0 z-[2] w-8 border-b border-[var(--border)] bg-[var(--mantle)] px-3 py-3">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(checked) =>
                    setSelectedRecordIds(checked ? new Set(records.map((record) => record.id)) : new Set())
                  }
                />
              </th>
              {visibleFields.map((field) => {
                const currentSort = view.sort.find((item) => item.fieldId === field.id);
                return (
                  <th
                    key={field.id}
                    className="border-b border-[var(--border)] px-4 py-3 text-left align-middle"
                    style={{ width: columnWidths[field.id] ?? 168, minWidth: columnWidths[field.id] ?? 168 }}
                  >
                    <div className="relative flex items-center">
                      <button
                        ref={(node) => {
                          headerButtonRefs.current[field.id] = node;
                        }}
                        type="button"
                        onClick={() => setPopoverFieldId((current) => (current === field.id ? null : field.id))}
                        className="flex min-w-0 items-center gap-2 text-left"
                      >
                        <span className="truncate font-ui text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                          {field.name}
                        </span>
                        {currentSort ? (
                          currentSort.direction === "asc" ? (
                            <ArrowUp className="h-3 w-3 text-[var(--accent)]" />
                          ) : (
                            <ArrowDown className="h-3 w-3 text-[var(--accent)]" />
                          )
                        ) : (
                          <ChevronDown className="h-3 w-3 text-[var(--overlay-1)]" />
                        )}
                      </button>
                      <div
                        className="absolute inset-y-0 right-[-10px] w-3 cursor-col-resize"
                        onPointerDown={(event) => handleResize(field.id, event)}
                      >
                        <div className="mx-auto h-full w-px bg-[var(--border-subtle)]" />
                      </div>
                      <ColumnHeaderPopover
                        anchorRef={{ current: headerButtonRefs.current[field.id] }}
                        database={database}
                        field={field}
                        open={popoverFieldId === field.id}
                        currentSortDirection={currentSort?.direction}
                        onClose={() => setPopoverFieldId(null)}
                        onSaveSchema={onSaveSchema}
                        onHideField={(fieldId) =>
                          onUpdateView({
                            hiddenFields: [...view.hiddenFields, fieldId],
                          })
                        }
                        onToggleSort={(fieldId, direction) => {
                          const existing = view.sort.find((candidate) => candidate.fieldId === fieldId);
                          onUpdateView({
                            sort: existing && existing.direction === direction
                              ? view.sort.filter((candidate) => candidate.fieldId !== fieldId)
                              : [
                                  ...view.sort.filter((candidate) => candidate.fieldId !== fieldId),
                                  { fieldId, direction },
                                ],
                          });
                        }}
                        onGroupByField={(fieldId) => onUpdateView({ groupBy: fieldId })}
                      />
                    </div>
                  </th>
                );
              })}
              <th className="sticky right-0 z-[2] w-8 border-b border-[var(--border)] bg-[var(--mantle)] px-2 py-3">
                <button
                  type="button"
                  onClick={onOpenSchema}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {records.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleFields.length + 2}
                  className="px-6 py-16 text-center text-[13px] text-[var(--subtext-0)]"
                >
                  No records yet. Create one to start shaping the database.
                </td>
              </tr>
            ) : groupedRecords ? (
              groupedRecords.orderedValues.flatMap((value) => {
                const groupRecords = groupedRecords.groups.get(value) ?? [];
                const color =
                  groupedRecords.groupField.type === "status"
                    ? resolveStatusColor(value)
                    : resolveFieldOptionColor(groupedRecords.groupField, value || "No value");
                return [
                  <tr key={`group:${value || "empty"}`}>
                    <td
                      colSpan={visibleFields.length + 2}
                      className="sticky top-[45px] z-[3] border-b border-[var(--border)] bg-[var(--base)] px-4 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-[12px] font-semibold text-[var(--text)]">
                          {value || "No value"}
                        </span>
                        <span className="text-[11px] text-[var(--overlay-1)]">{groupRecords.length}</span>
                      </div>
                    </td>
                  </tr>,
                  ...groupRecords.map(renderRow),
                ];
              })
            ) : (
              records.map(renderRow)
            )}

            <tr>
              <td colSpan={visibleFields.length + 2} className="border-b border-[var(--border-subtle)] px-4 py-2">
                <button
                  type="button"
                  onClick={onCreateRecord}
                  className="flex items-center gap-1.5 text-[12px] text-[var(--overlay-1)] transition-colors hover:text-[var(--text)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New record
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {selectedCount > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-[var(--border-strong)] bg-[var(--mantle)] px-4 py-2 shadow-[var(--shadow-elevated)]">
            <div className="text-[12px] text-[var(--subtext-0)]">{selectedCount} selected</div>
            <button
              type="button"
              onClick={() => onDeleteRecords([...selectedRecordIds])}
              className="rounded-full bg-[var(--red)] px-3 py-1 text-[12px] font-medium text-[var(--crust)]"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InlineCell({
  database,
  record,
  field,
  catalog,
  onCommit,
}: {
  database: WorkspaceDatabaseModel;
  record: WorkspaceDatabaseModel["records"][number];
  field: WorkspaceDatabaseField;
  catalog: WorkspaceDatabaseCatalogEntry[];
  onCommit: (value: WorkspaceDatabaseFieldValue) => void;
}) {
  const value = getFieldValue(record, field, database, catalog);

  if (field.type === "checkbox") {
    return (
      <div className="flex min-h-8 items-center" onClick={(event) => event.stopPropagation()}>
        <Checkbox checked={Boolean(value)} onCheckedChange={(checked) => onCommit(checked)} />
      </div>
    );
  }

  if (field.type === "status") {
    return (
      <InlinePillPicker
        options={field.options ?? []}
        value={typeof value === "string" ? value : null}
        getColor={resolveStatusColor}
        onChange={onCommit}
      />
    );
  }

  if (field.type === "select") {
    return (
      <InlinePillPicker
        options={field.options ?? []}
        value={typeof value === "string" ? value : null}
        getColor={(option) => resolveFieldOptionColor(field, option)}
        onChange={onCommit}
      />
    );
  }

  if (field.type === "multiselect") {
    return (
      <InlineMultiPillPicker
        options={field.options ?? []}
        values={Array.isArray(value) ? value : []}
        getColor={(option) => resolveFieldOptionColor(field, option)}
        onChange={onCommit}
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
        onChange={onCommit}
      />
    );
  }

  if (field.type === "text" || field.type === "url" || field.type === "email" || field.type === "phone") {
    return (
      <Input
        defaultValue={typeof value === "string" ? value : ""}
        onClick={(event) => event.stopPropagation()}
        onBlur={(event) => onCommit(event.target.value || null)}
        className="h-8 border-transparent bg-transparent px-0 shadow-none focus:border-[var(--accent)]"
      />
    );
  }

  if (field.type === "number") {
    return (
      <Input
        type="number"
        defaultValue={typeof value === "number" ? String(value) : ""}
        onClick={(event) => event.stopPropagation()}
        onBlur={(event) => {
          const next = event.target.value.trim();
          onCommit(next ? Number(next) : null);
        }}
        className="h-8 border-transparent bg-transparent px-0 shadow-none focus:border-[var(--accent)]"
      />
    );
  }

  if (field.type === "date") {
    return (
      <Input
        type="date"
        defaultValue={typeof value === "string" ? value.slice(0, 10) : ""}
        onClick={(event) => event.stopPropagation()}
        onBlur={(event) => onCommit(event.target.value || null)}
        className="h-8 border-transparent bg-transparent px-0 shadow-none focus:border-[var(--accent)]"
      />
    );
  }

  const displayValue = getFieldDisplayValue(record, field, database, catalog);
  return (
    <div className={cn("min-h-8 text-[13px]", (field.type === "createdAt" || field.type === "lastEditedAt" || field.type === "formula" || field.type === "rollup") && "opacity-40", !displayValue && "text-[var(--overlay-1)]")}>
      {displayValue || "Empty"}
    </div>
  );
}

function RowAction({
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
