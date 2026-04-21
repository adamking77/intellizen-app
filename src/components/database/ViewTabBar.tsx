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
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  ArrowUpDown,
  BarChart3,
  CalendarDays,
  Columns3,
  Download,
  Funnel,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Settings2,
  Table2,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findDefaultChartGroupField, getChartGroupCandidates } from "@/lib/database-core";
import type {
  WorkspaceDatabaseField,
  WorkspaceDatabaseModel,
  WorkspaceDatabaseViewConfig,
  WorkspaceDatabaseViewType,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const VIEW_ICONS: Record<WorkspaceDatabaseViewType, ReactNode> = {
  table: <Table2 className="h-3.5 w-3.5" />,
  kanban: <Columns3 className="h-3.5 w-3.5" />,
  list: <List className="h-3.5 w-3.5" />,
  gallery: <LayoutGrid className="h-3.5 w-3.5" />,
  calendar: <CalendarDays className="h-3.5 w-3.5" />,
  chart: <BarChart3 className="h-3.5 w-3.5" />,
};

const VIEW_DEFAULT_NAMES: Record<WorkspaceDatabaseViewType, string> = {
  table: "Table",
  kanban: "Kanban",
  list: "List",
  gallery: "Gallery",
  calendar: "Calendar",
  chart: "Chart",
};

function getViewTabLabel(view: WorkspaceDatabaseModel["views"][number]): string {
  const aliases = {
    table: ["Table", "All items"],
    kanban: ["Kanban", "Board"],
    list: ["List"],
    gallery: ["Gallery"],
    calendar: ["Calendar"],
    chart: ["Chart"],
  } satisfies Record<WorkspaceDatabaseViewType, string[]>;

  const matchedAlias = aliases[view.type].find((alias) => view.name.match(new RegExp(`^${alias} \\d+$`)));
  return matchedAlias ?? view.name;
}

type FilterOperator =
  | "contains"
  | "not_contains"
  | "equals"
  | "not_equals"
  | "is_empty"
  | "is_not_empty"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

interface ViewTabBarProps {
  views: WorkspaceDatabaseModel["views"];
  activeView: WorkspaceDatabaseModel["views"][number];
  database: WorkspaceDatabaseModel;
  onSwitchView: (viewId: string) => void;
  onCreateView: (type: WorkspaceDatabaseViewType) => void;
  onDeleteView: (viewId: string) => void;
  onRenameView: (viewId: string, name: string) => void;
  onReorderViews: (viewIds: string[]) => void;
  onUpdateViewConfig: (input: Partial<WorkspaceDatabaseViewConfig>) => void;
  onCreateRecord: () => void;
  onOpenSchema: () => void;
  onImportCsv: () => void;
  onExportCsv: () => void;
  onPinToDashboard: () => void;
  isImportingCsv: boolean;
}

export function ViewTabBar({
  views,
  activeView,
  database,
  onSwitchView,
  onCreateView,
  onDeleteView,
  onRenameView,
  onReorderViews,
  onUpdateViewConfig,
  onCreateRecord,
  onOpenSchema,
  onImportCsv,
  onExportCsv,
  onPinToDashboard,
  isImportingCsv,
}: ViewTabBarProps) {
  const [addViewOpen, setAddViewOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const addViewRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useClickOutside(addViewRef, addViewOpen, () => setAddViewOpen(false));
  useClickOutside(filterRef, filterOpen, () => setFilterOpen(false));
  useClickOutside(sortRef, sortOpen, () => setSortOpen(false));
  useClickOutside(moreRef, moreOpen, () => setMoreOpen(false));

  const filterCount = activeView.filter.length;
  const sortCount = activeView.sort.length;
  const hiddenCount = activeView.hiddenFields.length;

  function closePanels() {
    setAddViewOpen(false);
    setFilterOpen(false);
    setSortOpen(false);
    setSettingsOpen(false);
    setMoreOpen(false);
  }

  function togglePanel(panel: "add" | "filter" | "sort" | "settings" | "more") {
    const nextState = {
      add: panel === "add" ? !addViewOpen : false,
      filter: panel === "filter" ? !filterOpen : false,
      sort: panel === "sort" ? !sortOpen : false,
      settings: panel === "settings" ? !settingsOpen : false,
      more: panel === "more" ? !moreOpen : false,
    };
    setAddViewOpen(nextState.add);
    setFilterOpen(nextState.filter);
    setSortOpen(nextState.sort);
    setSettingsOpen(nextState.settings);
    setMoreOpen(nextState.more);
  }

  function startRename(view: WorkspaceDatabaseModel["views"][number]) {
    setEditingViewId(view.id);
    setRenameDraft(view.name);
  }

  function commitRename(view: WorkspaceDatabaseModel["views"][number]) {
    const nextName = renameDraft.trim();
    setEditingViewId(null);
    if (!nextName || nextName === view.name) return;
    onRenameView(view.id, nextName);
  }

  function toggleFieldVisibility(fieldId: string) {
    const nextHidden = activeView.hiddenFields.includes(fieldId)
      ? activeView.hiddenFields.filter((id) => id !== fieldId)
      : [...activeView.hiddenFields, fieldId];
    onUpdateViewConfig({ hiddenFields: nextHidden });
  }

  function toggleSort(fieldId: string, direction: "asc" | "desc") {
    const existing = activeView.sort.find((sort) => sort.fieldId === fieldId);
    if (existing?.direction === direction) {
      onUpdateViewConfig({ sort: activeView.sort.filter((sort) => sort.fieldId !== fieldId) });
      return;
    }
    onUpdateViewConfig({
      sort: [
        ...activeView.sort.filter((sort) => sort.fieldId !== fieldId),
        { fieldId, direction },
      ],
    });
  }

  const hasDisplaySettings =
    hiddenCount > 0 ||
    Boolean(activeView.groupBy) ||
    Boolean(activeView.cardCoverField) ||
    Boolean(activeView.cardFields?.length) ||
    Boolean(activeView.chartValueField) ||
    Boolean(activeView.chartType) ||
    Boolean(activeView.chartAggregation && activeView.chartAggregation !== "count") ||
    activeView.chartShowLegend === false ||
    activeView.chartShowGrid === false;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentIndex = views.findIndex((view) => view.id === active.id);
    const nextIndex = views.findIndex((view) => view.id === over.id);
    if (currentIndex < 0 || nextIndex < 0) return;
    const nextViews = [...views];
    const [moved] = nextViews.splice(currentIndex, 1);
    nextViews.splice(nextIndex, 0, moved);
    onReorderViews(nextViews.map((view) => view.id));
  }

  return (
    <>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={views.map((view) => view.id)} strategy={horizontalListSortingStrategy}>
            <div className="db-tabs min-w-0 flex-1 overflow-x-auto">
              {views.map((view) => (
                <SortableViewTab
                  key={view.id}
                  view={view}
                  activeViewId={activeView.id}
                  editingViewId={editingViewId}
                  renameDraft={renameDraft}
                  setRenameDraft={setRenameDraft}
                  onCommitRename={commitRename}
                  onCancelRename={() => setEditingViewId(null)}
                  onSwitchView={onSwitchView}
                  onStartRename={startRename}
                  onDeleteView={onDeleteView}
                  showClose={views.length > 1}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div ref={addViewRef} className="relative shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => togglePanel("add")}
            aria-label="Add view"
            className="h-8 w-8"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          {addViewOpen ? (
            <div className="db-dropdown-panel absolute left-0 top-full z-50 mt-2 min-w-[180px]">
              {(["table", "kanban", "list", "gallery", "calendar", "chart"] as WorkspaceDatabaseViewType[]).map((viewType) => (
                <button
                  key={viewType}
                  type="button"
                  className="db-context-menu-item"
                  onClick={() => {
                    onCreateView(viewType);
                    closePanels();
                  }}
                >
                  <span className="mr-2 inline-flex align-middle">{VIEW_ICONS[viewType]}</span>
                  {VIEW_DEFAULT_NAMES[viewType]}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

        <div className="flex shrink-0 items-center gap-2 lg:flex-nowrap">
        <div ref={filterRef} className="relative">
          <Button
            variant={filterCount > 0 ? "glow" : "ghost"}
            size="sm"
            onClick={() => togglePanel("filter")}
          >
            <Funnel className="h-3.5 w-3.5" />
            {filterCount > 0 ? `Filter (${filterCount})` : "Filter"}
          </Button>
          {filterOpen ? (
            <FilterPanel
              activeView={activeView}
              schema={database.schema}
              onClose={() => setFilterOpen(false)}
              onUpdateViewConfig={onUpdateViewConfig}
            />
          ) : null}
        </div>

        <div ref={sortRef} className="relative">
          <Button
            variant={sortCount > 0 ? "glow" : "ghost"}
            size="sm"
            onClick={() => togglePanel("sort")}
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortCount > 0 ? `Sort (${sortCount})` : "Sort"}
          </Button>
          {sortOpen ? (
            <SortPanel
              activeView={activeView}
              schema={database.schema}
              onClose={() => setSortOpen(false)}
              onToggleSort={toggleSort}
              onClearSort={() => onUpdateViewConfig({ sort: [] })}
            />
          ) : null}
        </div>

          <Button
            variant={hasDisplaySettings ? "glow" : "ghost"}
            size="sm"
            onClick={() => {
              closePanels();
              setSettingsOpen(true);
            }}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Settings
          </Button>

        <div ref={moreRef} className="relative">
          <Button variant="ghost" size="icon" onClick={() => togglePanel("more")} className="h-8 w-8">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
          {moreOpen ? (
            <div className="db-dropdown-panel absolute right-0 top-full z-50 mt-2 min-w-[180px]">
              <button
                type="button"
                className="db-context-menu-item"
                onClick={() => {
                  closePanels();
                  onPinToDashboard();
                }}
              >
                Pin to dashboard
              </button>
              <button
                type="button"
                className="db-context-menu-item"
                onClick={() => {
                  closePanels();
                  onOpenSchema();
                }}
              >
                Manage fields
              </button>
              <button
                type="button"
                className="db-context-menu-item"
                onClick={() => {
                  closePanels();
                  onImportCsv();
                }}
                disabled={isImportingCsv}
              >
                <Upload className="mr-2 inline h-3.5 w-3.5 align-middle" />
                {isImportingCsv ? "Importing..." : "Import CSV"}
              </button>
              <button
                type="button"
                className="db-context-menu-item"
                onClick={() => {
                  closePanels();
                  onExportCsv();
                }}
              >
                <Download className="mr-2 inline h-3.5 w-3.5 align-middle" />
                Export CSV
              </button>
            </div>
          ) : null}
        </div>

        <Button size="sm" onClick={onCreateRecord}>
          <Plus className="h-3.5 w-3.5" />
          New record
        </Button>
      </div>
      </div>

      <ViewSettingsModal
        open={settingsOpen}
        activeView={activeView}
        database={database}
        onClose={() => setSettingsOpen(false)}
        onOpenSchema={() => {
          setSettingsOpen(false);
          onOpenSchema();
        }}
        onToggleField={toggleFieldVisibility}
        onUpdateViewConfig={onUpdateViewConfig}
      />
    </>
  );
}

function SortableViewTab({
  view,
  activeViewId,
  editingViewId,
  renameDraft,
  setRenameDraft,
  onCommitRename,
  onCancelRename,
  onSwitchView,
  onStartRename,
  onDeleteView,
  showClose,
}: {
  view: WorkspaceDatabaseModel["views"][number];
  activeViewId: string;
  editingViewId: string | null;
  renameDraft: string;
  setRenameDraft: (value: string) => void;
  onCommitRename: (view: WorkspaceDatabaseModel["views"][number]) => void;
  onCancelRename: () => void;
  onSwitchView: (viewId: string) => void;
  onStartRename: (view: WorkspaceDatabaseModel["views"][number]) => void;
  onDeleteView: (viewId: string) => void;
  showClose: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: view.id, disabled: editingViewId === view.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 5 : undefined,
      }}
      className={cn(
        "db-tab-wrapper",
        showClose && editingViewId !== view.id && "db-tab-wrapper--closable",
        isDragging && "db-tab-wrapper--dragging",
      )}
    >
      {editingViewId === view.id ? (
        <input
          autoFocus
          className="db-input db-tab-rename-input"
          value={renameDraft}
          onChange={(event) => setRenameDraft(event.target.value)}
          onBlur={() => onCommitRename(view)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCommitRename(view);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onCancelRename();
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={cn(
            "db-tab",
            view.id === activeViewId && "db-tab--active",
            showClose && "db-tab--closable",
          )}
          onClick={() => onSwitchView(view.id)}
          onDoubleClick={() => onStartRename(view)}
          {...attributes}
          {...listeners}
        >
          <span className={cn("shrink-0", view.id === activeViewId ? "text-[var(--accent)]" : "text-[var(--overlay-1)]")}>
            {VIEW_ICONS[view.type]}
          </span>
          <span className="truncate">{getViewTabLabel(view)}</span>
        </button>
      )}
      {showClose && editingViewId !== view.id ? (
        <button
          type="button"
          className="db-tab-close"
          onClick={(event) => {
            event.stopPropagation();
            onDeleteView(view.id);
          }}
          aria-label={`Delete ${getViewTabLabel(view)}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function FilterPanel({
  activeView,
  schema,
  onClose,
  onUpdateViewConfig,
}: {
  activeView: WorkspaceDatabaseModel["views"][number];
  schema: WorkspaceDatabaseField[];
  onClose: () => void;
  onUpdateViewConfig: ViewTabBarProps["onUpdateViewConfig"];
}) {
  function updateFilter(
    index: number,
    changes: Partial<WorkspaceDatabaseModel["views"][number]["filter"][number]>,
  ) {
    const next = activeView.filter.map((filter, filterIndex) =>
      filterIndex === index ? { ...filter, ...changes } : filter,
    );
    onUpdateViewConfig({ filter: next });
  }

  function addFilter(fieldId: string) {
    const field = schema.find((candidate) => candidate.id === fieldId);
    if (!field) return;
    onUpdateViewConfig({
      filter: [...activeView.filter, defaultFilterForField(field)],
    });
  }

  return (
    <div className="db-dropdown-panel absolute right-0 top-full z-50 mt-2 min-w-[320px] max-w-[360px]">
      <div className="db-panel-section-title">Filters</div>
      <div className="space-y-2">
        {activeView.filter.length === 0 ? (
          <div className="db-panel-empty">No active filters</div>
        ) : (
          activeView.filter.map((filter, index) => {
            const field = schema.find((candidate) => candidate.id === filter.fieldId) ?? schema[0];
            if (!field) return null;
            const operators = operatorsForField(field);
            const normalizedOperator = operators.includes(filter.op as FilterOperator)
              ? (filter.op as FilterOperator)
              : operators[0];
            return (
              <div key={`${filter.fieldId}-${index}`} className="rounded-xl bg-[var(--base)] p-3">
                <div className="mb-2 grid grid-cols-[minmax(0,1fr)_120px_auto] gap-2">
                  <select
                    className="db-select"
                    value={field.id}
                    onChange={(event) => {
                      const nextField = schema.find((candidate) => candidate.id === event.target.value);
                      if (!nextField) return;
                      const nextDefault = defaultFilterForField(nextField);
                      updateFilter(index, nextDefault);
                    }}
                  >
                    {schema.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="db-select"
                    value={normalizedOperator}
                    onChange={(event) => {
                      const nextOperator = event.target.value as FilterOperator;
                      updateFilter(index, {
                        op: nextOperator,
                        value: operatorNeedsValue(nextOperator) ? filter.value : "",
                      });
                    }}
                  >
                    {operators.map((operator) => (
                      <option key={operator} value={operator}>
                        {OPERATOR_LABELS[operator]}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() =>
                      onUpdateViewConfig({
                        filter: activeView.filter.filter((_, filterIndex) => filterIndex !== index),
                      })
                    }
                  >
                    ×
                  </Button>
                </div>

                {operatorNeedsValue(normalizedOperator) ? (
                  renderFilterValueInput(field, filter.value, (value) => updateFilter(index, { value }))
                ) : null}
              </div>
            );
          })
        )}
      </div>
      <div className="db-panel-add">
        <select
          className="db-select w-full"
          value=""
          onChange={(event) => {
            if (!event.target.value) return;
            addFilter(event.target.value);
            onClose();
          }}
        >
          <option value="">Add filter...</option>
          {schema.map((field) => (
            <option key={field.id} value={field.id}>
              {field.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function SortPanel({
  activeView,
  schema,
  onClose,
  onToggleSort,
  onClearSort,
}: {
  activeView: WorkspaceDatabaseModel["views"][number];
  schema: WorkspaceDatabaseField[];
  onClose: () => void;
  onToggleSort: (fieldId: string, direction: "asc" | "desc") => void;
  onClearSort: () => void;
}) {
  const sortableFields = schema.filter((field) => field.type !== "formula" && field.type !== "rollup");

  return (
    <div className="db-dropdown-panel absolute right-0 top-full z-50 mt-2 min-w-[260px]">
      <div className="db-panel-section-title">Sort</div>
      <div className="space-y-1.5">
        {sortableFields.map((field) => {
          const activeSort = activeView.sort.find((sort) => sort.fieldId === field.id);
          return (
            <div key={field.id} className="flex items-center gap-2 rounded-xl bg-[var(--base)] px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text)]">{field.name}</span>
              <Button
                variant={activeSort?.direction === "asc" ? "glow" : "ghost"}
                size="sm"
                onClick={() => onToggleSort(field.id, "asc")}
              >
                Asc
              </Button>
              <Button
                variant={activeSort?.direction === "desc" ? "glow" : "ghost"}
                size="sm"
                onClick={() => onToggleSort(field.id, "desc")}
              >
                Desc
              </Button>
            </div>
          );
        })}
      </div>
      {activeView.sort.length > 0 ? (
        <div className="db-panel-add">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={() => {
              onClearSort();
              onClose();
            }}
          >
            Clear sorting
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ViewSettingsModal({
  open,
  activeView,
  database,
  onClose,
  onOpenSchema,
  onToggleField,
  onUpdateViewConfig,
}: {
  open: boolean;
  activeView: WorkspaceDatabaseModel["views"][number];
  database: WorkspaceDatabaseModel;
  onClose: () => void;
  onOpenSchema: () => void;
  onToggleField: (fieldId: string) => void;
  onUpdateViewConfig: ViewTabBarProps["onUpdateViewConfig"];
}) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const coverCandidates = database.schema.filter((field) => field.type === "url" || field.type === "text");
  const chartType = activeView.chartType ?? "bar";
  const groupCandidates = activeView.type === "kanban"
    ? database.schema.filter((field) => field.type === "status" || field.type === "select")
    : activeView.type === "calendar"
      ? database.schema.filter((field) => field.type === "date")
      : activeView.type === "chart"
        ? getChartGroupCandidates(database, chartType)
      : [];
  const chartValueCandidates = database.schema.filter(
    (field) => field.type === "number" || field.type === "rollup" || field.type === "formula",
  );
  const titleFieldId = database.headerFieldIds?.[0];
  const selectedFieldIds = activeView.cardFields ?? [];
  const selectedFieldOrder = new Map(selectedFieldIds.map((fieldId, index) => [fieldId, index]));
  const cardCandidates = database.schema
    .filter((field) => field.type !== "createdAt" && field.type !== "lastEditedAt")
    .filter((field) => field.id !== titleFieldId)
    .sort((left, right) => {
      const leftIndex = selectedFieldOrder.get(left.id);
      const rightIndex = selectedFieldOrder.get(right.id);
      if (leftIndex !== undefined || rightIndex !== undefined) {
        if (leftIndex === undefined) return 1;
        if (rightIndex === undefined) return -1;
        return leftIndex - rightIndex;
      }
      return left.name.localeCompare(right.name);
    });
  const isGallery = activeView.type === "gallery";
  const isChart = activeView.type === "chart";
  const supportsCardFields = activeView.type === "gallery" || activeView.type === "kanban";
  const visibleFieldCount = database.schema.length - activeView.hiddenFields.length;
  const cardFieldCount = Math.min(selectedFieldIds.length, 3);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,7,8,0.72)] p-6 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="View settings"
        className="flex max-h-[min(720px,90vh)] w-full max-w-[640px] flex-col overflow-hidden rounded-xl bg-[var(--mantle)] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--overlay-1)]">
              <Settings2 className="h-3 w-3 text-[var(--accent)]" />
              View settings
            </p>
            <h3 className="mt-2 truncate font-ui text-[15px] font-medium text-[var(--text)]">
              {activeView.name}
            </h3>
            <p className="mt-1 text-[12px] text-[var(--overlay-1)]">
              {VIEW_DEFAULT_NAMES[activeView.type]} view
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-5">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-[13px] font-semibold text-[var(--text)]">Layout</h4>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--base)] px-2.5 py-1 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                  {VIEW_ICONS[activeView.type]}
                  {VIEW_DEFAULT_NAMES[activeView.type]}
                </span>
              </div>

              <div className="grid gap-3">
                {groupCandidates.length > 0 ? (
                  <label className="grid gap-1.5">
                    <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                      {activeView.type === "kanban"
                        ? "Group columns by"
                        : activeView.type === "calendar"
                          ? "Date property"
                          : chartType === "line"
                            ? "Time field"
                            : "Group by"}
                    </span>
                    <select
                      className="db-select"
                      value={activeView.groupBy ?? ""}
                      onChange={(event) => onUpdateViewConfig({ groupBy: event.target.value || undefined })}
                    >
                      <option value="">Auto</option>
                      {groupCandidates.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {isGallery ? (
                  <label className="grid gap-1.5">
                    <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                      Card cover
                    </span>
                    <select
                      className="db-select"
                      value={activeView.cardCoverField ?? ""}
                      onChange={(event) => onUpdateViewConfig({ cardCoverField: event.target.value || undefined })}
                    >
                      <option value="">None</option>
                      {coverCandidates.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {isChart ? (
                  <>
                    <label className="grid gap-1.5">
                      <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                        Chart type
                      </span>
                      <select
                        className="db-select"
                        value={activeView.chartType ?? "bar"}
                        onChange={(event) => {
                          const nextType = event.target.value as "bar" | "line" | "donut";
                          const nextCandidates = getChartGroupCandidates(database, nextType);
                          const currentGroupIsValid = nextCandidates.some((field) => field.id === activeView.groupBy);
                          onUpdateViewConfig({
                            chartType: nextType,
                            groupBy: currentGroupIsValid
                              ? activeView.groupBy
                              : findDefaultChartGroupField(database, nextType)?.id,
                          });
                        }}
                      >
                        <option value="bar">Bar</option>
                        <option value="line">Line</option>
                        <option value="donut">Donut</option>
                      </select>
                    </label>

                    <label className="grid gap-1.5">
                      <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                        Value mode
                      </span>
                      <select
                        className="db-select"
                        value={activeView.chartAggregation ?? "count"}
                        onChange={(event) =>
                          onUpdateViewConfig({
                            chartAggregation: event.target.value as "count" | "sum" | "avg" | "min" | "max",
                          })
                        }
                      >
                        <option value="count">Count records</option>
                        <option value="sum">Sum field</option>
                        <option value="avg">Average field</option>
                        <option value="min">Minimum field</option>
                        <option value="max">Maximum field</option>
                      </select>
                    </label>

                    {(activeView.chartAggregation ?? "count") !== "count" ? (
                      <label className="grid gap-1.5">
                        <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                          Numeric field
                        </span>
                        <select
                          className="db-select"
                          value={activeView.chartValueField ?? ""}
                          onChange={(event) =>
                            onUpdateViewConfig({ chartValueField: event.target.value || undefined })
                          }
                        >
                          <option value="">Select field...</option>
                          {chartValueCandidates.map((field) => (
                            <option key={field.id} value={field.id}>
                              {field.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    <label className="grid gap-1.5">
                      <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                        Palette
                      </span>
                      <select
                        className="db-select"
                        value={activeView.chartPalette ?? "blue"}
                        onChange={(event) =>
                          onUpdateViewConfig({
                            chartPalette: event.target.value as "blue" | "rose" | "gold" | "teal",
                          })
                        }
                      >
                        <option value="blue">Blue</option>
                        <option value="rose">Rose</option>
                        <option value="gold">Gold</option>
                        <option value="teal">Teal</option>
                      </select>
                    </label>

                    {chartType === "line" ? (
                      <label className="grid gap-1.5">
                        <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                          Time range
                        </span>
                        <select
                          className="db-select"
                          value={activeView.chartRange ?? "90d"}
                          onChange={(event) =>
                            onUpdateViewConfig({
                              chartRange: event.target.value as "30d" | "90d" | "365d" | "all",
                            })
                          }
                        >
                          <option value="30d">Last 30 days</option>
                          <option value="90d">Last 90 days</option>
                          <option value="365d">Last year</option>
                          <option value="all">All time</option>
                        </select>
                      </label>
                    ) : null}

                    <div className="grid gap-2">
                      <label className="db-fields-row">
                        <input
                          type="checkbox"
                          checked={activeView.chartShowGrid ?? true}
                          onChange={(event) => onUpdateViewConfig({ chartShowGrid: event.target.checked })}
                        />
                        <span className="db-fields-name">Show grid</span>
                      </label>
                      <label className="db-fields-row">
                        <input
                          type="checkbox"
                          checked={activeView.chartShowLegend ?? true}
                          onChange={(event) => onUpdateViewConfig({ chartShowLegend: event.target.checked })}
                        />
                        <span className="db-fields-name">Show legend</span>
                      </label>
                    </div>
                  </>
                ) : null}
              </div>
            </section>

            {!isChart ? (
              <section className="space-y-3 border-t border-[var(--border)] pt-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-[13px] font-semibold text-[var(--text)]">Visible fields</h4>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-[var(--overlay-1)]">
                    {visibleFieldCount}/{database.schema.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onUpdateViewConfig({ hiddenFields: [] })}
                  >
                    Show all
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onUpdateViewConfig({ hiddenFields: database.schema.map((field) => field.id) })}
                  >
                    Hide all
                  </Button>
                </div>
              </div>

              <div className="db-fields-list rounded-xl bg-[var(--base)] p-2">
                {database.schema.map((field) => (
                  <label key={field.id} className="db-fields-row">
                    <input
                      type="checkbox"
                      checked={!activeView.hiddenFields.includes(field.id)}
                      onChange={() => onToggleField(field.id)}
                    />
                    <span className="db-fields-name">{field.name}</span>
                  </label>
                ))}
              </div>
              </section>
            ) : null}

            {supportsCardFields ? (
              <section className="space-y-3 border-t border-[var(--border)] pt-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-[13px] font-semibold text-[var(--text)]">Card properties</h4>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-[var(--overlay-1)]">
                      {selectedFieldIds.length > 0 ? `${cardFieldCount}/3` : "auto"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onUpdateViewConfig({ cardFields: [] })}
                    >
                      Auto
                    </Button>
                  </div>
                </div>

                <div className="db-fields-list rounded-xl bg-[var(--base)] p-2">
                  {cardCandidates.map((field) => (
                    <label key={field.id} className="db-fields-row">
                      <input
                        type="checkbox"
                        checked={selectedFieldIds.includes(field.id)}
                        onChange={() => {
                          const next = selectedFieldIds.includes(field.id)
                            ? selectedFieldIds.filter((id) => id !== field.id)
                            : [...selectedFieldIds, field.id];
                          onUpdateViewConfig({ cardFields: next });
                        }}
                      />
                      <span className="db-fields-name">{field.name}</span>
                    </label>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="border-t border-[var(--border)] pt-4">
              <Button variant="secondary" size="sm" onClick={onOpenSchema}>
                Manage schema
              </Button>
            </section>
          </div>
        </div>

        <div className="flex justify-end border-t border-[var(--border)] px-5 py-4">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!enabled) return;
    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!ref.current || ref.current.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [enabled, onClose, ref]);
}

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: "Contains",
  not_contains: "Doesn't contain",
  equals: "Equals",
  not_equals: "Not equal",
  is_empty: "Is empty",
  is_not_empty: "Is not empty",
  gt: "Greater than",
  gte: "Greater or equal",
  lt: "Less than",
  lte: "Less or equal",
};

function operatorsForField(field: WorkspaceDatabaseField): FilterOperator[] {
  switch (field.type) {
    case "number":
    case "date":
      return ["equals", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"];
    case "checkbox":
    case "select":
    case "status":
      return ["equals", "not_equals", "is_empty", "is_not_empty"];
    default:
      return ["contains", "not_contains", "equals", "not_equals", "is_empty", "is_not_empty"];
  }
}

function operatorNeedsValue(operator: FilterOperator) {
  return operator !== "is_empty" && operator !== "is_not_empty";
}

function defaultFilterForField(field: WorkspaceDatabaseField) {
  return {
    fieldId: field.id,
    op: operatorsForField(field)[0],
    value: "",
  };
}

function renderFilterValueInput(
  field: WorkspaceDatabaseField,
  value: string,
  onChange: (value: string) => void,
) {
  if (field.type === "status" || field.type === "select") {
    return (
      <select className="db-select w-full" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select value...</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "checkbox") {
    return (
      <select className="db-select w-full" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select value...</option>
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    );
  }

  return (
    <Input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Filter value"
      className="h-9"
    />
  );
}
