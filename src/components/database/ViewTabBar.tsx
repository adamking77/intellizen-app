import { useEffect, useRef, useState } from "react";
import {
  ArrowUpDown,
  Calendar,
  Columns,
  Columns3,
  LayoutGrid,
  LayoutList,
  List,
  ListFilter,
  MoreHorizontal,
  Plus,
  Table2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/database/primitives/Badge";
import { Input } from "@/components/ui/input";
import type {
  WorkspaceDatabaseField,
  WorkspaceDatabaseModel,
  WorkspaceDatabaseViewConfig,
  WorkspaceDatabaseViewType,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const VIEW_ICONS: Record<WorkspaceDatabaseViewType, React.ReactNode> = {
  table: <Table2 className="h-3.5 w-3.5" strokeWidth={1.5} />,
  kanban: <Columns3 className="h-3.5 w-3.5" strokeWidth={1.5} />,
  list: <List className="h-3.5 w-3.5" strokeWidth={1.5} />,
  gallery: <LayoutGrid className="h-3.5 w-3.5" strokeWidth={1.5} />,
  calendar: <Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />,
};

const VIEW_LABELS: Record<WorkspaceDatabaseViewType, string> = {
  table: "Table",
  kanban: "Board",
  list: "List",
  gallery: "Gallery",
  calendar: "Calendar",
};

const VIEW_TYPES: WorkspaceDatabaseViewType[] = ["table", "kanban", "list", "gallery", "calendar"];

interface ViewTabBarProps {
  views: WorkspaceDatabaseModel["views"];
  activeView: WorkspaceDatabaseModel["views"][number];
  database: WorkspaceDatabaseModel;
  onSwitchView: (id: string) => void;
  onCreateView: (type: WorkspaceDatabaseViewType) => void;
  onDeleteView: (id: string) => void;
  onRenameView: (id: string, name: string) => void;
  onUpdateViewConfig: (config: Partial<WorkspaceDatabaseViewConfig>) => void;
  onCreateRecord: () => void;
  onOpenSchema: () => void;
  onImportCsv: () => void;
  onExportCsv: () => void;
  isImportingCsv?: boolean;
}

export function ViewTabBar({
  views,
  activeView,
  database,
  onSwitchView,
  onCreateView,
  onDeleteView,
  onRenameView,
  onUpdateViewConfig,
  onCreateRecord,
  onOpenSchema,
  onImportCsv,
  onExportCsv,
  isImportingCsv,
}: ViewTabBarProps) {
  const [addViewOpen, setAddViewOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const addViewRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  // Click-outside handlers
  useClickOutside(addViewRef, () => setAddViewOpen(false), addViewOpen);
  useClickOutside(filterRef, () => setFilterOpen(false), filterOpen);
  useClickOutside(sortRef, () => setSortOpen(false), sortOpen);
  useClickOutside(moreRef, () => setMoreOpen(false), moreOpen);

  const filterCount = activeView.filter.length;
  const sortCount = activeView.sort.length;

  function startRename(view: WorkspaceDatabaseModel["views"][number]) {
    setEditingViewId(view.id);
    setRenameDraft(view.name);
  }

  function commitRename(viewId: string) {
    const next = renameDraft.trim();
    setEditingViewId(null);
    if (!next) return;
    onRenameView(viewId, next);
  }

  // Sort helpers
  function addSort(fieldId: string) {
    if (activeView.sort.some((s) => s.fieldId === fieldId)) return;
    onUpdateViewConfig({ sort: [...activeView.sort, { fieldId, direction: "asc" as const }] });
  }

  function toggleSortDirection(fieldId: string) {
    onUpdateViewConfig({
      sort: activeView.sort.map((s) =>
        s.fieldId === fieldId ? { ...s, direction: s.direction === "asc" ? ("desc" as const) : ("asc" as const) } : s,
      ),
    });
  }

  function removeSort(fieldId: string) {
    onUpdateViewConfig({ sort: activeView.sort.filter((s) => s.fieldId !== fieldId) });
  }

  const sortableFields = database.schema.filter(
    (f) => f.type !== "relation" && f.type !== "formula" && f.type !== "rollup",
  );
  const groupedByField = activeView.groupBy
    ? database.schema.find((field) => field.id === activeView.groupBy)
    : undefined;

  const statusAndSelectFields = database.schema.filter(
    (f) => f.type === "status" || f.type === "select",
  );
  const dateFields = database.schema.filter((f) => f.type === "date");

  return (
    <div className="flex items-center gap-0.5">
      {/* View tabs */}
      <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
        {views.map((view) => (
          <div key={view.id} className="group relative flex items-center">
            {editingViewId === view.id ? (
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={() => commitRename(view.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitRename(view.id); }
                  if (e.key === "Escape") { e.preventDefault(); setEditingViewId(null); }
                }}
                className="h-8 w-28 rounded-md border border-[var(--accent)] bg-[var(--base)] px-2 text-[13px] text-[var(--text)] outline-none"
              />
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onSwitchView(view.id)}
                  onDoubleClick={() => startRename(view)}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
                    view.id === activeView.id
                      ? "bg-[var(--surface-0)] text-[var(--text)]"
                      : "text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
                  )}
                >
                  <span className={cn(view.id === activeView.id ? "text-[var(--accent)]" : "text-[var(--overlay-1)]")}>
                    {VIEW_ICONS[view.type]}
                  </span>
                  {view.name}
                  {view.id === activeView.id ? <Badge>Active</Badge> : null}
                </button>
                {views.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteView(view.id);
                    }}
                    className="ml-0.5 hidden h-5 w-5 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] group-hover:inline-flex"
                    title="Delete view"
                    aria-label={`Delete view ${view.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add view — outside overflow container so popover isn't clipped */}
      <div ref={addViewRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setAddViewOpen((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          title="Add view"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        {addViewOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
            {VIEW_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => { onCreateView(type); setAddViewOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              >
                <span className="text-[var(--overlay-1)]">{VIEW_ICONS[type]}</span>
                {VIEW_LABELS[type]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Toolbar */}
      <div className="flex items-center gap-1">
        {/* Group by — kanban only */}
        {activeView.type === "kanban" && statusAndSelectFields.length > 0 && (
          <div className="flex items-center gap-1 rounded-md bg-[var(--surface-wash)] px-2.5 py-1.5 text-[12px]">
            <LayoutList className="h-3 w-3 text-[var(--overlay-1)]" />
            <span className="text-[var(--overlay-1)]">Group:</span>
            <select
              value={activeView.groupBy ?? statusAndSelectFields[0]?.id ?? ""}
              onChange={(e) => onUpdateViewConfig({ groupBy: e.target.value || undefined })}
              className="border-0 bg-transparent text-[12px] font-medium text-[var(--text)] outline-none"
            >
              {statusAndSelectFields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Date by — calendar only */}
        {activeView.type === "calendar" && dateFields.length > 0 && (
          <div className="flex items-center gap-1 rounded-md bg-[var(--surface-wash)] px-2.5 py-1.5 text-[12px]">
            <Calendar className="h-3 w-3 text-[var(--overlay-1)]" />
            <span className="text-[var(--overlay-1)]">Date:</span>
            <select
              value={activeView.groupBy ?? dateFields[0]?.id ?? ""}
              onChange={(e) => onUpdateViewConfig({ groupBy: e.target.value || undefined })}
              className="border-0 bg-transparent text-[12px] font-medium text-[var(--text)] outline-none"
            >
              {dateFields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Filter */}
        <div ref={filterRef} className="relative">
          <button
            type="button"
            onClick={() => { setFilterOpen((v) => !v); setSortOpen(false); setMoreOpen(false); }}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors",
              filterCount > 0
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
            )}
          >
            <ListFilter className="h-3.5 w-3.5" />
            {filterCount > 0 ? `Filter (${filterCount})` : "Filter"}
          </button>
          {filterOpen && (
            <FilterPopover
              schema={database.schema}
              filters={activeView.filter}
              onChange={(next) => onUpdateViewConfig({ filter: next })}
            />
          )}
        </div>

        {/* Sort */}
        <div ref={sortRef} className="relative">
          <button
            type="button"
            onClick={() => { setSortOpen((v) => !v); setFilterOpen(false); setMoreOpen(false); }}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors",
              sortCount > 0
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
            )}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortCount > 0 ? `Sort (${sortCount})` : "Sort"}
          </button>
          {sortOpen && (
            <SortPopover
              sort={activeView.sort}
              sortableFields={sortableFields}
              groupedByFieldName={groupedByField?.name}
              onAddSort={addSort}
              onToggleDirection={toggleSortDirection}
              onRemoveSort={removeSort}
            />
          )}
        </div>

        {/* Fields = schema */}
        <button
          type="button"
          onClick={() => { onOpenSchema(); setFilterOpen(false); setSortOpen(false); setMoreOpen(false); }}
          className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
        >
          <Columns className="h-3.5 w-3.5" />
          Fields
        </button>

        {/* More (import / export) */}
        <div ref={moreRef} className="relative">
          <button
            type="button"
            onClick={() => { setMoreOpen((v) => !v); setFilterOpen(false); setSortOpen(false); }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
            title="More options"
            aria-label="More options"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {moreOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] py-1 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
              <button
                type="button"
                onClick={() => { onImportCsv(); setMoreOpen(false); }}
                disabled={isImportingCsv}
                className="w-full px-3 py-2 text-left text-[13px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)] disabled:opacity-50"
              >
                {isImportingCsv ? "Importing..." : "Import CSV"}
              </button>
              <button
                type="button"
                onClick={() => { onExportCsv(); setMoreOpen(false); }}
                className="w-full px-3 py-2 text-left text-[13px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              >
                Export CSV
              </button>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="mx-1 h-5 w-px bg-[var(--border)]" />

        {/* New record */}
        <Button size="sm" onClick={onCreateRecord}>
          <Plus className="h-3.5 w-3.5" />
          New record
        </Button>
      </div>
    </div>
  );
}

// ── Filter Popover ────────────────────────────────────────────────────────────

type FilterRule = { fieldId: string; op: string; value: string };

const FILTER_OPS_TEXT: Array<{ value: string; label: string }> = [
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

const FILTER_OPS_NUMBER: Array<{ value: string; label: string }> = [
  { value: "equals", label: "=" },
  { value: "not_equals", label: "≠" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];

const FILTER_OPS_CHECKBOX: Array<{ value: string; label: string }> = [
  { value: "equals", label: "is" },
  { value: "not_equals", label: "is not" },
];

function getOpsForField(field: WorkspaceDatabaseField | undefined) {
  if (!field) return FILTER_OPS_TEXT;
  if (field.type === "number") return FILTER_OPS_NUMBER;
  if (field.type === "checkbox") return FILTER_OPS_CHECKBOX;
  return FILTER_OPS_TEXT;
}

function getDefaultOpForField(field: WorkspaceDatabaseField | undefined): string {
  if (!field) return "contains";
  if (field.type === "number" || field.type === "checkbox") return "equals";
  return "contains";
}

function opNeedsValue(op: string): boolean {
  return op !== "is_empty" && op !== "is_not_empty";
}

function FilterPopover({
  schema,
  filters,
  onChange,
}: {
  schema: WorkspaceDatabaseField[];
  filters: FilterRule[];
  onChange: (next: FilterRule[]) => void;
}) {
  const filterableSchema = schema.filter((f) => f.type !== "formula" && f.type !== "rollup" && f.type !== "relation");
  const firstField = filterableSchema[0];
  const lastInputRef = useRef<HTMLInputElement | null>(null);
  const focusIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (focusIndexRef.current === null) return;
    if (focusIndexRef.current === filters.length - 1) {
      lastInputRef.current?.focus();
    }
    focusIndexRef.current = null;
  }, [filters.length]);

  return (
    <div className="absolute right-0 top-full z-50 mt-1 w-[420px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">Filter</div>
      {filters.length === 0 ? (
        <div className="py-2 text-[12px] text-[var(--overlay-1)]">No filters applied</div>
      ) : (
        <div className="mb-2 space-y-1.5">
          {filters.map((rule, index) => {
            const field = schema.find((f) => f.id === rule.fieldId);
            const ops = getOpsForField(field);
            return (
              <div key={index} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--base)] px-2 py-1.5">
                <select
                  value={rule.fieldId}
                  onChange={(event) => {
                    const nextFieldId = event.target.value;
                    const nextField = schema.find((f) => f.id === nextFieldId);
                    const nextRules = [...filters];
                    nextRules[index] = {
                      fieldId: nextFieldId,
                      op: getDefaultOpForField(nextField),
                      value: "",
                    };
                    onChange(nextRules);
                  }}
                  className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-1.5 py-1 text-[12px] text-[var(--text)] outline-none"
                >
                  {filterableSchema.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <select
                  value={rule.op}
                  onChange={(event) => {
                    const nextRules = [...filters];
                    nextRules[index] = { ...rule, op: event.target.value };
                    onChange(nextRules);
                  }}
                  className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-1.5 py-1 text-[12px] text-[var(--text)] outline-none"
                >
                  {ops.map((op) => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>
                {opNeedsValue(rule.op) ? (
                  <Input
                    ref={index === filters.length - 1 ? lastInputRef : undefined}
                    value={rule.value}
                    onChange={(event) => {
                      const nextRules = [...filters];
                      nextRules[index] = { ...rule, value: event.target.value };
                      onChange(nextRules);
                    }}
                    className="h-7 min-w-0 flex-1 text-[12px]"
                    placeholder="Value"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => onChange(filters.filter((_, i) => i !== index))}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                  aria-label="Remove filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={!firstField}
          onClick={() => {
            if (!firstField) return;
            focusIndexRef.current = filters.length;
            onChange([...filters, { fieldId: firstField.id, op: getDefaultOpForField(firstField), value: "" }]);
          }}
          className="rounded-md px-2 py-1 text-[12px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Add filter
        </button>
        {filters.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-md px-2 py-1 text-[12px] text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          >
            Clear all
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ── Sort Popover ──────────────────────────────────────────────────────────────

function SortPopover({
  sort,
  sortableFields,
  groupedByFieldName,
  onAddSort,
  onToggleDirection,
  onRemoveSort,
}: {
  sort: Array<{ fieldId: string; direction: "asc" | "desc" }>;
  sortableFields: WorkspaceDatabaseField[];
  groupedByFieldName?: string;
  onAddSort: (fieldId: string) => void;
  onToggleDirection: (fieldId: string) => void;
  onRemoveSort: (fieldId: string) => void;
}) {
  const usedFieldIds = new Set(sort.map((s) => s.fieldId));
  const availableFields = sortableFields.filter((f) => !usedFieldIds.has(f.id));

  return (
    <div className="absolute right-0 top-full z-50 mt-1 w-[280px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] p-3 shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
        Sort
      </div>
      {groupedByFieldName ? (
        <div className="mb-2 rounded-lg border border-[var(--border)] bg-[var(--base)] px-2.5 py-2 text-[11px] leading-5 text-[var(--overlay-1)]">
          Grouped by {groupedByFieldName}. Sorts apply within each group.
        </div>
      ) : null}
      {sort.length === 0 ? (
        <div className="py-2 text-[12px] text-[var(--overlay-1)]">No sorts applied</div>
      ) : (
        <div className="mb-2 space-y-1.5">
          {sort.map((rule) => {
            const field = sortableFields.find((f) => f.id === rule.fieldId);
            return (
              <div key={rule.fieldId} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--base)] px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text)]">
                  {field?.name ?? rule.fieldId}
                </span>
                <button
                  type="button"
                  onClick={() => onToggleDirection(rule.fieldId)}
                  className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-soft)]"
                >
                  {rule.direction === "asc" ? "A→Z" : "Z→A"}
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveSort(rule.fieldId)}
                  className="shrink-0 text-[var(--overlay-1)] transition-colors hover:text-[var(--text)]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {availableFields.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] text-[var(--overlay-1)]">Add sort</div>
          <div className="flex flex-wrap gap-1">
            {availableFields.slice(0, 6).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onAddSort(f.id)}
                className="rounded-full border border-[var(--border)] bg-[var(--base)] px-2 py-0.5 text-[11px] text-[var(--subtext-0)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
              >
                + {f.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    function handle(e: MouseEvent) {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [enabled, onClose, ref]);
}
