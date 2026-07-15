import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, ChevronRight, Copy, Trash2, X } from "lucide-react";

import { TableCell } from "@/components/database/primitives/TableCell";
import { InlineEditor } from "@/components/database/primitives/InlineEditor";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { getReadableTextColor } from "@/lib/database-colors";
import {
  applyFilters,
  applySorts,
  getVisibleFields,
  STATUS_OPTIONS,
} from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseField,
  WorkspaceDatabaseFieldType,
  WorkspaceDatabaseModel,
  WorkspaceDatabaseSchemaSaveOptions,
} from "@/lib/types";

const DEFAULT_COLUMN_WIDTH = 168;

// Stored per-option as data, so literal hex is required — values come from
// the Catppuccin Mocha palette per DESIGN.md.
const OPTION_COLOR_PRESETS: Array<{ label: string; value: string }> = [
  { label: "Gray", value: "#6c7086" },
  { label: "Red", value: "#f38ba8" },
  { label: "Peach", value: "#fab387" },
  { label: "Yellow", value: "#f9e2af" },
  { label: "Green", value: "#a6e3a1" },
  { label: "Teal", value: "#94e2d5" },
  { label: "Blue", value: "#89b4fa" },
  { label: "Mauve", value: "#cba6f7" },
];

const FIELD_TYPES: WorkspaceDatabaseFieldType[] = [
  "text",
  "number",
  "select",
  "multiselect",
  "status",
  "date",
  "checkbox",
  "url",
  "email",
  "phone",
  "relation",
  "rollup",
  "formula",
  "createdAt",
  "lastEditedAt",
];

interface PropertyOptionDraft {
  id: string;
  name: string;
  color: string;
  originalName?: string;
}

function supportsOptions(type: WorkspaceDatabaseFieldType): boolean {
  return type === "select" || type === "multiselect" || type === "status";
}

function toFieldForType(field: WorkspaceDatabaseField, nextType: WorkspaceDatabaseFieldType): WorkspaceDatabaseField {
  const next: WorkspaceDatabaseField = { id: field.id, name: field.name, type: nextType };
  if (supportsOptions(nextType)) {
    next.options = field.options?.length
      ? [...field.options]
      : (nextType === "status" ? [...STATUS_OPTIONS] : []);
    if (field.optionColors) next.optionColors = { ...field.optionColors };
  }
  if (nextType === "relation") {
    next.relation = field.relation ? { ...field.relation } : {};
  }
  if (nextType === "rollup") {
    next.rollup = field.rollup ? { ...field.rollup } : { relationFieldId: "", aggregation: "count" };
  }
  if (nextType === "formula") {
    next.formula = field.formula ? { ...field.formula } : { expression: "" };
  }
  return next;
}

function signatureForField(field: WorkspaceDatabaseField): string {
  return JSON.stringify(field);
}

interface DatabaseTableViewProps {
  database: WorkspaceDatabaseModel;
  view: WorkspaceDatabaseModel["views"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
  activeRecordId: string | null;
  embedded?: boolean;
  schemaLocked?: boolean;
  onOpenRecord: (recordId: string) => void;
  onUpdateField: (recordId: string, fieldId: string, value: unknown) => Promise<void> | void;
  onUpdateView: (input: {
    groupBy?: string;
    sort?: WorkspaceDatabaseModel["views"][number]["sort"];
    hiddenFields?: string[];
    fieldOrder?: string[];
    columnWidths?: Record<string, number>;
  }) => void;
  onSaveSchema: (
    schema: WorkspaceDatabaseModel["schema"],
    records?: WorkspaceDatabaseModel["records"],
    options?: WorkspaceDatabaseSchemaSaveOptions,
  ) => void;
  onOpenSchema: () => void;
  onCreateRecord: () => void;
  onDuplicateRecord: (recordId: string) => void;
  onDeleteRecord: (recordId: string) => void;
  onDeleteRecords: (recordIds: string[]) => void;
  onDuplicateRecords: (recordIds: string[]) => void;
  subRecordsConfig?: { subItemsFieldId: string; parentFieldId: string };
  onCreateSubRecord?: (parentRecordId: string) => Promise<void>;
}

type EditingCell = { recordId: string; fieldId: string } | null;

export function DatabaseTableView({
  database,
  view,
  catalog,
  activeRecordId: _activeRecordId,
  embedded = false,
  schemaLocked = false,
  onOpenRecord,
  onUpdateField,
  onUpdateView,
  onSaveSchema,
  onOpenSchema: _onOpenSchema,
  onCreateRecord,
  onDuplicateRecord,
  onDeleteRecord,
  onDeleteRecords,
  onDuplicateRecords,
  subRecordsConfig,
  onCreateSubRecord,
}: DatabaseTableViewProps) {
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(view.columnWidths ?? {});
  const columnWidthsRef = useRef(columnWidths);

  const [propertyFieldId, setPropertyFieldId] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [propertyType, setPropertyType] = useState<WorkspaceDatabaseFieldType>("text");
  const [propertyOptionDrafts, setPropertyOptionDrafts] = useState<PropertyOptionDraft[]>([]);
  const [propertyMenuAnchor, setPropertyMenuAnchor] = useState<{ left: number; top: number } | null>(null);
  const propertyPanelRef = useRef<HTMLDivElement | null>(null);
  const lastPropertySignatureRef = useRef<string>("");

  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<WorkspaceDatabaseFieldType>("text");
  const addPanelRef = useRef<HTMLDivElement | null>(null);

  const [confirmDeleteRecordId, setConfirmDeleteRecordId] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Collapse expanded rows whose sub-records are all gone (deleted records leave
  // stale IDs in the parent's relation field that never get cleaned up otherwise).
  useEffect(() => {
    if (!subRecordsConfig) return;
    setExpandedRows((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      for (const parentId of prev) {
        const parent = database.records.find((r) => r.id === parentId);
        if (!parent) { next.delete(parentId); changed = true; continue; }
        const subIds = parent[subRecordsConfig.subItemsFieldId];
        if (!Array.isArray(subIds) || subIds.length === 0) {
          next.delete(parentId); changed = true; continue;
        }
        const hasLiveChild = (subIds as string[]).some((id) =>
          database.records.some((r) => r.id === id),
        );
        if (!hasLiveChild) { next.delete(parentId); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [database.records, subRecordsConfig]);

  const visibleFields = useMemo(
    () => getVisibleFields(database.schema, view),
    [database.schema, view],
  );

  const propertyField = useMemo(
    () => (propertyFieldId ? database.schema.find((field) => field.id === propertyFieldId) : undefined),
    [propertyFieldId, database.schema],
  );

  useEffect(() => {
    setColumnWidths(view.columnWidths ?? {});
  }, [view.id, view.columnWidths]);

  useEffect(() => {
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  useEffect(() => {
    const visibleIds = new Set(database.records.map((r) => r.id));
    setSelectedRecordIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [database.records]);

  const filtered = applyFilters(database.records, view.filter, database.schema, catalog);
  const sorted = applySorts(filtered, view.sort, database.schema);
  const records = subRecordsConfig
    ? sorted.filter((r) => {
        const parentVal = r[subRecordsConfig.parentFieldId];
        return !Array.isArray(parentVal) || parentVal.length === 0;
      })
    : sorted;

  // Grouped table rendering: sections per select/status option (view.groupBy).
  const groupField =
    view.groupBy != null
      ? database.schema.find(
          (field) => field.id === view.groupBy && (field.type === "select" || field.type === "status"),
        )
      : undefined;
  const groupedRecords = useMemo(() => {
    if (!groupField) return null;
    const groups = new Map<string, typeof records>();
    for (const record of records) {
      const raw = record[groupField.id];
      const key = typeof raw === "string" && raw.trim() ? raw : `No ${groupField.name}`;
      const bucket = groups.get(key);
      if (bucket) bucket.push(record);
      else groups.set(key, [record]);
    }
    const optionOrder = groupField.type === "status" ? STATUS_OPTIONS.slice() : groupField.options ?? [];
    const ordered: Array<{ key: string; rows: typeof records }> = [];
    for (const option of optionOrder) {
      const rows = groups.get(option);
      if (rows) {
        ordered.push({ key: option, rows });
        groups.delete(option);
      }
    }
    for (const [key, rows] of groups) ordered.push({ key, rows });
    return ordered;
  }, [groupField, records]);

  // All records currently visible in the table: top-level + any sub-records
  // whose parent row is expanded. Used for selection state so sub-record
  // checkboxes contribute to the bulk-action count.
  const allVisibleRecords = useMemo(() => {
    if (!subRecordsConfig) return records;
    const result = [...records];
    for (const parent of records) {
      if (!expandedRows.has(parent.id)) continue;
      const subIds = Array.isArray(parent[subRecordsConfig.subItemsFieldId])
        ? (parent[subRecordsConfig.subItemsFieldId] as string[])
        : [];
      result.push(...database.records.filter((r) => subIds.includes(r.id)));
    }
    return result;
  }, [records, expandedRows, subRecordsConfig, database.records]);

  const selectedVisibleCount = useMemo(
    () => allVisibleRecords.filter((r) => selectedRecordIds.has(r.id)).length,
    [allVisibleRecords, selectedRecordIds],
  );
  const canEditSchema = !embedded && !schemaLocked;

  const allVisibleSelected = allVisibleRecords.length > 0 && selectedVisibleCount === allVisibleRecords.length;
  const someVisibleSelected = selectedVisibleCount > 0 && selectedVisibleCount < allVisibleRecords.length;

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedRecordIds(new Set(allVisibleRecords.map((r) => r.id)));
      return;
    }
    setSelectedRecordIds(new Set());
  }

  function toggleSelectRow(recordId: string, checked: boolean) {
    setSelectedRecordIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(recordId);
      else next.delete(recordId);
      return next;
    });
  }

  function runBulkDuplicate() {
    const ids = allVisibleRecords.filter((r) => selectedRecordIds.has(r.id)).map((r) => r.id);
    onDuplicateRecords(ids);
    setSelectedRecordIds(new Set());
  }

  function runBulkDelete() {
    const ids = allVisibleRecords.filter((r) => selectedRecordIds.has(r.id)).map((r) => r.id);
    onDeleteRecords(ids);
    setSelectedRecordIds(new Set());
    setConfirmBulkDelete(false);
  }

  const pushPropertyChanges = useCallback(() => {
    if (!propertyField) return;
    const nextField = buildDraftField(propertyField);
    const signature = signatureForField(nextField);
    if (signature === lastPropertySignatureRef.current) {
      return;
    }
    lastPropertySignatureRef.current = signature;
    const nextSchema = database.schema.map((field) => (field.id === propertyField.id ? nextField : field));
    const nextRecords = buildPropertyRecordUpdates(propertyField, nextField);
    onSaveSchema(nextSchema, nextRecords, { silent: true });
  }, [database.schema, onSaveSchema, propertyField, propertyName, propertyOptionDrafts, propertyType]);

  const closePropertyMenu = useCallback(() => {
    pushPropertyChanges();
    setPropertyFieldId(null);
    setPropertyMenuAnchor(null);
  }, [pushPropertyChanges]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node;
      const targetElement = target instanceof Element ? target : null;
      if (propertyPanelRef.current && !propertyPanelRef.current.contains(target)) {
        if (targetElement?.closest(".db-property-color-menu")) {
          return;
        }
        closePropertyMenu();
      }
      if (addPanelRef.current && !addPanelRef.current.contains(target)) {
        setShowAddField(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [closePropertyMenu]);

  function openPropertyMenu(field: WorkspaceDatabaseField, anchorEl?: HTMLElement) {
    if (!canEditSchema) return;
    if (propertyFieldId === field.id) {
      closePropertyMenu();
      return;
    }
    if (propertyFieldId && propertyFieldId !== field.id) {
      pushPropertyChanges();
    }
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - 540));
      const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 8));
      setPropertyMenuAnchor({ left, top });
    }
    setPropertyFieldId(field.id);
    setPropertyName(field.name);
    setPropertyType(field.type);
    setPropertyOptionDrafts(
      (field.options ?? (field.type === "status" ? [...STATUS_OPTIONS] : []))
        .map((option, index) => ({
          id: `${field.id}-${index}-${crypto.randomUUID()}`,
          name: option,
          color: field.optionColors?.[option] ?? OPTION_COLOR_PRESETS[index % OPTION_COLOR_PRESETS.length].value,
          originalName: option,
        })),
    );
    lastPropertySignatureRef.current = signatureForField(field);
    setShowAddField(false);
  }

  function buildDraftField(base: WorkspaceDatabaseField): WorkspaceDatabaseField {
    const nextField = toFieldForType(base, propertyType);
    nextField.name = propertyName.trim() || base.name;
    if (supportsOptions(propertyType)) {
      const options: string[] = [];
      const optionColors: Record<string, string> = {};
      for (const draft of propertyOptionDrafts) {
        const optionName = draft.name.trim();
        if (!optionName || options.includes(optionName)) continue;
        options.push(optionName);
        optionColors[optionName] = draft.color;
      }
      nextField.options = options.length ? options : (propertyType === "status" ? [...STATUS_OPTIONS] : []);
      nextField.optionColors = optionColors;
    }
    return nextField;
  }

  function addField() {
    if (!canEditSchema) return;
    const name = newFieldName.trim();
    if (!name) return;
    const newField: WorkspaceDatabaseField = {
      id: crypto.randomUUID(),
      name,
      type: newFieldType,
    };
    if (supportsOptions(newFieldType)) {
      newField.options = newFieldType === "status" ? [...STATUS_OPTIONS] : [];
    }
    if (newFieldType === "relation") {
      newField.relation = {};
    }
    if (newFieldType === "rollup") {
      newField.rollup = { relationFieldId: "", aggregation: "count" };
    }
    if (newFieldType === "formula") {
      newField.formula = { expression: "" };
    }
    onSaveSchema([...database.schema, newField]);
    setNewFieldName("");
    setNewFieldType("text");
    setShowAddField(false);
  }

  function startColumnResize(e: React.PointerEvent<HTMLDivElement>, fieldId: string, currentWidth: number) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = currentWidth;
    let nextWidth = startWidth;
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (moveEvent: PointerEvent) => {
      nextWidth = Math.max(80, startWidth + moveEvent.clientX - startX);
      setColumnWidths((prev) => ({ ...prev, [fieldId]: nextWidth }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      onUpdateView({
        columnWidths: {
          ...(view.columnWidths ?? {}),
          ...columnWidthsRef.current,
          [fieldId]: nextWidth,
        },
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  function renderRow(record: WorkspaceDatabaseModel["records"][number], isSubRow = false) {
    const isEditableField = (field: WorkspaceDatabaseField) =>
      field.type !== "createdAt"
      && field.type !== "lastEditedAt"
      && field.type !== "formula"
      && field.type !== "rollup";
    const firstVisibleFieldId = visibleFields[0]?.id;
    const isExpanded = subRecordsConfig ? expandedRows.has(record.id) : false;

    return (
      <tr key={record.id} className={`db-row${isSubRow ? " db-row-sub" : ""}`}>
        {!embedded ? (
          <td
            className="db-td db-td-check"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              className="db-row-check"
              checked={selectedRecordIds.has(record.id)}
              onChange={(e) => toggleSelectRow(record.id, e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
          </td>
        ) : null}
        {visibleFields.map((field) => {
          const fieldWidth = columnWidths[field.id] ?? DEFAULT_COLUMN_WIDTH;
          return (
            <td
              key={field.id}
              className={`db-td${field.id === firstVisibleFieldId ? " db-td-primary" : ""}`}
              style={{
                width: fieldWidth,
                minWidth: fieldWidth,
                maxWidth: fieldWidth,
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (e.target !== e.currentTarget) return;
                if (editingCell?.recordId === record.id && editingCell.fieldId === field.id) return;
                const target = e.target as HTMLElement;
                if (target.closest("button, input, textarea, select, a, label, [contenteditable='true']")) return;
                if (target.closest(".db-col-resize-handle")) return;
                onOpenRecord(record.id);
              }}
            >
              {editingCell?.recordId === record.id && editingCell.fieldId === field.id ? (
                <InlineEditor
                  record={record}
                  field={field}
                  database={database}
                  catalog={catalog}
                  onSave={(value) => {
                    void onUpdateField(record.id, field.id, value);
                    setEditingCell(null);
                  }}
                  onCancel={() => setEditingCell(null)}
                />
              ) : (
                <>
                  {field.id === firstVisibleFieldId && isSubRow && (
                    <span className="db-sub-connector" aria-hidden />
                  )}
                  {field.id === firstVisibleFieldId && subRecordsConfig && !isSubRow && (
                    <button
                      type="button"
                      className="db-expand-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedRows((prev) => {
                          const next = new Set(prev);
                          if (next.has(record.id)) next.delete(record.id);
                          else next.add(record.id);
                          return next;
                        });
                      }}
                    >
                      <ChevronRight
                        className={`h-3 w-3 transition-transform duration-150${isExpanded ? " rotate-90" : ""}`}
                      />
                    </button>
                  )}
                  <div
                    className="db-td-content"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (embedded) {
                        onOpenRecord(record.id);
                        return;
                      }
                      if (field.type === "checkbox") {
                        onUpdateField(record.id, field.id, record[field.id] !== true);
                        setEditingCell(null);
                        return;
                      }
                      if (field.type === "relation") {
                        onOpenRecord(record.id);
                        return;
                      }
                      if (!isEditableField(field)) return;
                      setEditingCell({ recordId: record.id, fieldId: field.id });
                    }}
                  >
                    <TableCell
                      record={record}
                      field={field}
                      database={database}
                      catalog={catalog}
                      onToggleCheckbox={() => {
                        onUpdateField(record.id, field.id, record[field.id] !== true);
                        setEditingCell(null);
                      }}
                    />
                  </div>
                  {field.id === firstVisibleFieldId && !embedded && (
                    <div className="db-row-actions db-row-actions-inline">
                      <button
                        type="button"
                        className="db-icon-btn-plain"
                        title="Open record"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenRecord(record.id);
                        }}
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="db-icon-btn-plain"
                        title="Duplicate record"
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
                          setConfirmDeleteRecordId(record.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}
              {!embedded ? (
                <div
                  className="db-col-resize-handle db-col-resize-handle-cell"
                  onPointerDown={(e) => startColumnResize(e, field.id, (columnWidths[field.id] ?? (e.currentTarget.parentElement?.getBoundingClientRect().width ?? DEFAULT_COLUMN_WIDTH)))}
                />
              ) : null}
            </td>
          );
        })}
      </tr>
    );
  }

  function renderRowGroup(record: WorkspaceDatabaseModel["records"][number]) {
    if (!subRecordsConfig) return renderRow(record);
    const isExpanded = expandedRows.has(record.id);
    const subIds = isExpanded
      ? (Array.isArray(record[subRecordsConfig.subItemsFieldId]) ? (record[subRecordsConfig.subItemsFieldId] as string[]) : [])
      : [];
    const subRecords = database.records.filter((r) => subIds.includes(r.id));
    const totalCols = visibleFields.length + 2;
    return (
      <Fragment key={record.id}>
        {renderRow(record)}
        {subRecords.map((sub) => renderRow(sub, true))}
        {isExpanded && (
          <tr className="db-sub-add-row">
            <td colSpan={totalCols}>
              <button
                type="button"
                className="db-add-record-btn db-sub-add-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  void onCreateSubRecord?.(record.id);
                }}
              >
                + New sub-record
              </button>
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

  return (
    <div className="db-table-root">
      {!embedded && selectedVisibleCount > 0 && (
        <div className="db-bulk-actions db-bulk-actions-visible">
          <span className="db-bulk-count">{selectedVisibleCount} selected</span>
          <button className="db-btn" onClick={runBulkDuplicate}>
            Duplicate selected
          </button>
          <button className="db-btn db-icon-btn-danger" onClick={() => setConfirmBulkDelete(true)}>
            Delete selected
          </button>
          <span className="db-bulk-spacer" />
          <button className="db-btn" onClick={() => setSelectedRecordIds(new Set())}>
            Clear
          </button>
        </div>
      )}

      <div className="db-table-wrapper relative">
        <table className="db-table">
          <thead>
            <tr>
              {!embedded ? (
                <th className="db-th db-th-check">
                  <input
                    type="checkbox"
                    className="db-row-check"
                    ref={(el) => {
                      if (!el) return;
                      el.indeterminate = someVisibleSelected;
                    }}
                    checked={allVisibleSelected}
                    onChange={(e) => toggleSelectAll(e.target.checked)}
                  />
                </th>
              ) : null}
              {visibleFields.map((field) => {
                const fieldWidth = columnWidths[field.id] ?? DEFAULT_COLUMN_WIDTH;
                return (
                  <th
                    key={field.id}
                    className="db-th"
                    style={{
                      width: fieldWidth,
                      minWidth: fieldWidth,
                      maxWidth: fieldWidth,
                    }}
                  >
                    <div className="db-th-inner">
                      {embedded ? (
                        <span className="db-th-label">{field.name}</span>
                      ) : (
                        canEditSchema ? (
                          <button
                            className="db-th-label db-th-label-action"
                            title="Edit property"
                            onClick={(e) => {
                              e.stopPropagation();
                              openPropertyMenu(field, e.currentTarget);
                            }}
                          >
                            {field.name}
                          </button>
                        ) : (
                          <span className="db-th-label">{field.name}</span>
                        )
                      )}
                    </div>
                    {canEditSchema ? (
                      <div
                        className="db-col-resize-handle"
                        onPointerDown={(e) => startColumnResize(e, field.id, (columnWidths[field.id] ?? (e.currentTarget.parentElement?.getBoundingClientRect().width ?? DEFAULT_COLUMN_WIDTH)))}
                      />
                    ) : null}
                  </th>
                );
              })}
              {canEditSchema ? (
                <th className="db-th db-th-add-field">
                  <button
                    className="db-add-field-btn"
                    title="Add field"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAddField((v) => !v);
                      closePropertyMenu();
                    }}
                  >
                    +
                  </button>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {groupedRecords
              ? groupedRecords.map((group) => (
                  <Fragment key={group.key}>
                    <tr>
                      <td
                        colSpan={visibleFields.length + 2}
                        className="border-b border-[var(--border-subtle)] bg-[var(--surface-wash)] px-3 py-1.5"
                      >
                        <span className="font-ui text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                          {group.key}
                        </span>
                        <span className="ml-2 font-mono text-[10px] text-[var(--subtext-0)]">{group.rows.length}</span>
                      </td>
                    </tr>
                    {group.rows.map((record) => renderRowGroup(record))}
                  </Fragment>
                ))
              : records.map((record) => renderRowGroup(record))}
            {!embedded ? (
              <tr className="db-add-row">
                <td colSpan={visibleFields.length + 2}>
                  <button className="db-add-record-btn" onClick={onCreateRecord}>
                    + New record
                  </button>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {canEditSchema && propertyField && propertyMenuAnchor && (
          <div
            ref={propertyPanelRef}
            className="db-dropdown-panel db-property-menu-panel fixed z-30"
            style={{ left: propertyMenuAnchor.left, top: propertyMenuAnchor.top }}
          >
            <input
              className="db-input db-property-menu-name-input w-full"
              value={propertyName}
              onChange={(e) => setPropertyName(e.target.value)}
              placeholder="Property name"
              onKeyDown={(e) => {
                if (e.key === "Escape" || e.key === "Enter") {
                  e.preventDefault();
                  closePropertyMenu();
                }
              }}
            />
            <div className="db-property-menu-type-row">
              <span className="db-property-menu-type-label">TYPE</span>
              <select
                className="db-select db-property-menu-type-select"
                value={propertyType}
                onChange={(e) => {
                    const nextType = e.target.value as WorkspaceDatabaseFieldType;
                    setPropertyType(nextType);
                    if (supportsOptions(nextType) && propertyOptionDrafts.length === 0) {
                      const defaults = nextType === "status" ? [...STATUS_OPTIONS] : [];
                      setPropertyOptionDrafts(
                        defaults.map((option, index) => ({
                          id: `${nextType}-${index}-${crypto.randomUUID()}`,
                          name: option,
                          color: OPTION_COLOR_PRESETS[index % OPTION_COLOR_PRESETS.length].value,
                          originalName: option,
                        })),
                    );
                  }
                }}
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft} value={ft}>{ft}</option>
                ))}
              </select>
            </div>
            {supportsOptions(propertyType) && (
              <div className="db-property-menu-options-wrap space-y-1">
                <div className="db-panel-section-title">OPTIONS</div>
                <div className="db-property-option-list">
                  {propertyOptionDrafts.map((draft, index) => (
                    <div key={draft.id} className="db-property-option-row">
                      <input
                        className="db-input db-property-option-name flex-1"
                        value={draft.name}
                        onChange={(e) =>
                          setPropertyOptionDrafts((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], name: e.target.value };
                            return next;
                          })
                        }
                      />
                      <PropertyColorButton
                        color={draft.color}
                        onChange={(nextColor) =>
                          setPropertyOptionDrafts((prev) => {
                            const next = [...prev];
                            next[index] = { ...next[index], color: nextColor };
                            return next;
                          })
                        }
                      />
                      <button
                        className="db-property-option-remove"
                        title="Remove option"
                        aria-label={`Remove ${draft.name || "option"}`}
                        onClick={() =>
                          setPropertyOptionDrafts((prev) => prev.filter((_, rowIndex) => rowIndex !== index))
                        }
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="db-btn"
                  onClick={() =>
                    setPropertyOptionDrafts((prev) => [
                      ...prev,
                      {
                        id: crypto.randomUUID(),
                        name: "",
                        color: OPTION_COLOR_PRESETS[prev.length % OPTION_COLOR_PRESETS.length].value,
                        originalName: undefined,
                      },
                    ])
                  }
                >
                  + Add option
                </button>
              </div>
            )}
          </div>
        )}

        {canEditSchema && showAddField && (
          <div
            ref={addPanelRef}
            className="db-dropdown-panel absolute right-2 top-9 z-30 min-w-[220px]"
          >
            <div className="db-panel-section-title">Add field</div>
            <input
              className="db-input w-full"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              placeholder="Field name"
              onKeyDown={(e) => {
                if (e.key === "Enter") addField();
              }}
            />
            <select
              className="db-select w-full"
              value={newFieldType}
              onChange={(e) => setNewFieldType(e.target.value as WorkspaceDatabaseFieldType)}
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft} value={ft}>{ft}</option>
              ))}
            </select>
            <div className="db-panel-add flex items-center justify-end gap-2">
              <button className="db-btn" onClick={() => setShowAddField(false)}>
                Cancel
              </button>
              <button className="db-btn db-btn-primary" onClick={addField}>
                Add
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteRecordId !== null}
        title="Delete record"
        message="This action cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (confirmDeleteRecordId) {
            // Auto-collapse parent when its last sub-record is deleted.
            if (subRecordsConfig) {
              const parent = database.records.find((r) => {
                const subIds = r[subRecordsConfig.subItemsFieldId];
                return Array.isArray(subIds) && (subIds as string[]).includes(confirmDeleteRecordId);
              });
              if (parent && (parent[subRecordsConfig.subItemsFieldId] as string[]).length <= 1) {
                setExpandedRows((prev) => {
                  const next = new Set(prev);
                  next.delete(parent.id);
                  return next;
                });
              }
            }
            onDeleteRecord(confirmDeleteRecordId);
          }
          setConfirmDeleteRecordId(null);
        }}
        onCancel={() => setConfirmDeleteRecordId(null)}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        title="Delete selected records"
        message={`This will delete ${selectedVisibleCount} records. This action cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={runBulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  );

  function buildPropertyRecordUpdates(
    baseField: WorkspaceDatabaseField,
    nextField: WorkspaceDatabaseField,
  ): WorkspaceDatabaseModel["records"] | undefined {
    if (!supportsOptions(baseField.type) || !supportsOptions(nextField.type)) {
      return undefined;
    }

    const mappedNames = new Map<string, string | null>();
    const seenOriginalNames = new Set<string>();

    for (const draft of propertyOptionDrafts) {
      if (!draft.originalName) continue;
      seenOriginalNames.add(draft.originalName);
      const nextName = draft.name.trim();
      mappedNames.set(draft.originalName, nextName || null);
    }

    const originalOptions = baseField.options ?? (baseField.type === "status" ? [...STATUS_OPTIONS] : []);
    for (const option of originalOptions) {
      if (!seenOriginalNames.has(option)) {
        mappedNames.set(option, null);
      }
    }

    let changed = false;
    const nextRecords = database.records.map((record) => {
      const currentValue = record[baseField.id];

      if (baseField.type === "multiselect") {
        if (!Array.isArray(currentValue)) return record;
        let recordChanged = false;
        const nextValue = currentValue
          .map((item) => {
            if (!mappedNames.has(item)) return item;
            recordChanged = true;
            return mappedNames.get(item);
          })
          .filter((item): item is string => Boolean(item));
        const dedupedValue = Array.from(new Set(nextValue));
        if (!recordChanged) return record;
        changed = true;
        return { ...record, [baseField.id]: dedupedValue };
      }

      if (typeof currentValue !== "string" || !mappedNames.has(currentValue)) {
        return record;
      }

      const nextValue = mappedNames.get(currentValue) ?? null;
      if (nextValue === currentValue) {
        return record;
      }
      changed = true;
      return { ...record, [baseField.id]: nextValue };
    });

    return changed ? nextRecords : undefined;
  }
}

function PropertyColorButton({
  color,
  onChange,
}: {
  color: string;
  onChange: (nextColor: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (
        hostRef.current
        && !hostRef.current.contains(target)
        && (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  const activePreset = OPTION_COLOR_PRESETS.find((preset) => preset.value.toLowerCase() === color.toLowerCase())
    ?? OPTION_COLOR_PRESETS[0];

  return (
    <div ref={hostRef} className="relative">
      <button
        type="button"
        className="db-btn db-property-color-btn"
        style={{
          backgroundColor: activePreset.value,
          color: getReadableTextColor(activePreset.value),
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!open) {
            const rect = hostRef.current?.getBoundingClientRect();
            if (rect) {
              const menuWidth = 120;
              const menuHeight = 8 + (OPTION_COLOR_PRESETS.length * 32) + 8;
              let left = rect.right + 8;
              if (left + menuWidth > window.innerWidth - 8) {
                left = Math.max(8, rect.left - menuWidth - 8);
              }
              let top = rect.top - 8;
              if (top + menuHeight > window.innerHeight - 8) {
                top = Math.max(8, window.innerHeight - menuHeight - 8);
              }
              setMenuPosition({ left, top });
            }
          }
          setOpen((prev) => !prev);
        }}
      >
        {activePreset.label}
      </button>
      {open && menuPosition && createPortal(
        <div
          ref={menuRef}
          className="db-dropdown-panel db-property-color-menu"
          style={{ position: "fixed", left: menuPosition.left, top: menuPosition.top, zIndex: 160 }}
        >
          {OPTION_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={`db-record-picker-item db-property-color-item w-full text-left ${
                preset.value.toLowerCase() === color.toLowerCase() ? "db-property-color-item--active" : ""
              }`}
              onClick={() => {
                onChange(preset.value);
                setOpen(false);
              }}
            >
              <span
                className="db-property-color-pill"
                style={{
                  backgroundColor: preset.value,
                  color: getReadableTextColor(preset.value),
                }}
              >
                {preset.label}
              </span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
