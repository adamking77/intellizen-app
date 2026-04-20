import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowUpDown, Filter, Link2, Plus, Table2 } from "lucide-react";

import { Badge } from "@/components/database/primitives/Badge";
import { InlineMultiPillPicker } from "@/components/database/primitives/InlineMultiPillPicker";
import { InlinePillPicker } from "@/components/database/primitives/InlinePillPicker";
import { InlineRelationEditor } from "@/components/database/primitives/InlineRelationEditor";
import { RecordPickerDropdown } from "@/components/database/primitives/RecordPickerDropdown";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { resolveFieldOptionColor, resolveStatusColor } from "@/lib/database-colors";
import { getRecordTitle, getSuggestedHeaderFields } from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface TaskRelationsSectionProps {
  sourceDatabaseId: string;
  sourceRecordId: string;
  fieldId: string;
  fieldName: string;
  targetDatabase: WorkspaceDatabaseModel;
  relatedRecordIds: string[];
  catalog: WorkspaceDatabaseCatalogEntry[];
  onOpenRecord: (databaseId: string, recordId: string) => void;
  onCreateRecord: (databaseId: string, seed?: Record<string, WorkspaceDatabaseFieldValue>) => Promise<string | null>;
  onUpdateField: (recordId: string, fieldId: string, value: WorkspaceDatabaseFieldValue) => Promise<void> | void;
  onUpdateRelation: (
    databaseId: string,
    recordId: string,
    fieldId: string,
    values: string[],
  ) => Promise<void> | void;
}

export function TaskRelationsSection({
  sourceDatabaseId,
  sourceRecordId,
  fieldId,
  fieldName,
  targetDatabase,
  relatedRecordIds,
  catalog,
  onOpenRecord,
  onCreateRecord,
  onUpdateField,
  onUpdateRelation,
}: TaskRelationsSectionProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [linkExistingOpen, setLinkExistingOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sortFieldId, setSortFieldId] = useState<string>(
    targetDatabase.schema.find((candidate) => candidate.type === "status")?.id ??
      targetDatabase.schema.find((candidate) => candidate.type === "checkbox")?.id ??
      targetDatabase.schema[0]?.id ??
      "",
  );
  const [visibleFieldIds, setVisibleFieldIds] = useState<string[]>(
    getSuggestedHeaderFields(targetDatabase).filter((candidate) => candidate !== targetDatabase.headerFieldIds?.[0]),
  );
  const linkButtonRef = useRef<HTMLButtonElement | null>(null);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const sortButtonRef = useRef<HTMLButtonElement | null>(null);
  const fieldsButtonRef = useRef<HTMLButtonElement | null>(null);

  const targetTitleField =
    targetDatabase.schema.find((candidate) => candidate.id === targetDatabase.headerFieldIds?.[0]) ??
    targetDatabase.schema.find((candidate) => candidate.type === "text") ??
    targetDatabase.schema[0];

  const relatedRecords = useMemo(() => {
    const base = targetDatabase.records.filter((record) => relatedRecordIds.includes(record.id));
    const filtered = query.trim()
      ? base.filter((record) => getRecordTitle(record, targetDatabase).toLowerCase().includes(query.trim().toLowerCase()))
      : base;

    if (!sortFieldId) {
      return filtered;
    }

    return [...filtered].sort((left, right) => {
      const leftValue = String(left[sortFieldId] ?? "");
      const rightValue = String(right[sortFieldId] ?? "");
      return leftValue.localeCompare(rightValue, undefined, { sensitivity: "base" });
    });
  }, [query, relatedRecordIds, sortFieldId, targetDatabase]);

  async function handleCreateTask() {
    if (!targetTitleField || !draftTitle.trim()) return;
    const createdId = await onCreateRecord(targetDatabase.id, {
      [targetTitleField.id]: draftTitle.trim(),
    });
    if (!createdId) return;
    await onUpdateRelation(sourceDatabaseId, sourceRecordId, fieldId, [...relatedRecordIds, createdId]);
    setDraftTitle("");
    setShowCreate(false);
  }

  const candidateOptions = targetDatabase.records.map((record) => ({
    id: record.id,
    label: getRecordTitle(record, targetDatabase),
    meta: record.id,
  }));

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--mantle)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-[var(--text)]">{fieldName}</div>
          <div className="text-[12px] text-[var(--overlay-1)]">
            {relatedRecords.length} linked {relatedRecords.length === 1 ? "record" : "records"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowCreate((current) => !current)}>
            <Plus className="h-4 w-4" />
            Add task
          </Button>
          <Button
            ref={linkButtonRef}
            size="sm"
            variant="secondary"
            onClick={() => setLinkExistingOpen((current) => !current)}
          >
            <Link2 className="h-4 w-4" />
            Link existing
          </Button>
        </div>
      </div>

      {showCreate ? (
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--base)] p-3">
          <Input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="New task title"
            className="bg-transparent"
          />
          <Button size="sm" onClick={() => void handleCreateTask()}>
            Create
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
            Cancel
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={filterButtonRef}
          size="sm"
          variant={query.trim() ? "accent-outline" : "secondary"}
          onClick={() => {
            setFilterOpen((current) => !current);
            setSortOpen(false);
            setFieldsOpen(false);
          }}
        >
          <Filter className="h-3.5 w-3.5" />
          Filter ({query.trim() ? 1 : 0})
        </Button>
        <Button
          ref={sortButtonRef}
          size="sm"
          variant="secondary"
          onClick={() => {
            setSortOpen((current) => !current);
            setFilterOpen(false);
            setFieldsOpen(false);
          }}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          Sort
        </Button>
        <Button
          ref={fieldsButtonRef}
          size="sm"
          variant="secondary"
          onClick={() => {
            setFieldsOpen((current) => !current);
            setFilterOpen(false);
            setSortOpen(false);
          }}
        >
          <Table2 className="h-3.5 w-3.5" />
          Fields ({visibleFieldIds.length})
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
        <table className="min-w-full border-separate border-spacing-0">
          <thead className="bg-[var(--base)]">
            <tr>
              <th className="border-b border-[var(--border)] px-3 py-2 text-left text-[11px] uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                {targetTitleField?.name ?? "Title"}
              </th>
              {targetDatabase.schema
                .filter((candidate) => visibleFieldIds.includes(candidate.id))
                .map((candidate) => (
                  <th
                    key={candidate.id}
                    className="border-b border-[var(--border)] px-3 py-2 text-left text-[11px] uppercase tracking-[0.14em] text-[var(--overlay-1)]"
                  >
                    {candidate.name}
                  </th>
                ))}
            </tr>
          </thead>
          <tbody>
            {relatedRecords.length ? (
              relatedRecords.map((record) => (
                <tr
                  key={record.id}
                  className="cursor-pointer transition-colors hover:bg-[var(--surface-wash)]"
                  onClick={() => onOpenRecord(targetDatabase.id, record.id)}
                >
                  <td className="border-b border-[var(--border-subtle)] px-3 py-2.5 text-[13px] font-medium text-[var(--text)]">
                    {getRecordTitle(record, targetDatabase)}
                  </td>
                  {targetDatabase.schema
                    .filter((candidate) => visibleFieldIds.includes(candidate.id))
                    .map((candidate) => (
                      <td key={candidate.id} className="border-b border-[var(--border-subtle)] px-3 py-2.5 align-top">
                        <TaskFieldEditor
                          database={targetDatabase}
                          fieldId={candidate.id}
                          record={record}
                          catalog={catalog}
                          onUpdateField={onUpdateField}
                          onUpdateRelation={onUpdateRelation}
                        />
                      </td>
                    ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={Math.max(visibleFieldIds.length + 1, 1)}
                  className="px-4 py-10 text-center text-[12px] text-[var(--overlay-1)]"
                >
                  No related tasks yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <RecordPickerDropdown
        anchorRef={linkButtonRef}
        open={linkExistingOpen}
        options={candidateOptions}
        selectedIds={relatedRecordIds}
        onToggle={(recordId) => {
          const next = relatedRecordIds.includes(recordId)
            ? relatedRecordIds.filter((candidate) => candidate !== recordId)
            : [...relatedRecordIds, recordId];
          void onUpdateRelation(sourceDatabaseId, sourceRecordId, fieldId, next);
        }}
        onClose={() => setLinkExistingOpen(false)}
      />

      <MiniPanel
        anchorRef={filterButtonRef}
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title="Filter tasks"
      >
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--base)] px-3">
          <Filter className="h-3.5 w-3.5 text-[var(--overlay-1)]" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter tasks"
            className="border-0 bg-transparent px-0 shadow-none focus:border-0 focus:shadow-none"
            autoFocus
          />
        </div>
      </MiniPanel>

      <MiniPanel
        anchorRef={sortButtonRef}
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        title="Sort tasks"
      >
        <div className="space-y-2">
          {targetDatabase.schema.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => {
                setSortFieldId(candidate.id);
                setSortOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition-colors",
                sortFieldId === candidate.id
                  ? "bg-[var(--accent-soft)] text-[var(--text)]"
                  : "text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
              )}
            >
              <span>{candidate.name}</span>
              {sortFieldId === candidate.id ? <Badge>Active</Badge> : null}
            </button>
          ))}
        </div>
      </MiniPanel>

      <MiniPanel
        anchorRef={fieldsButtonRef}
        open={fieldsOpen}
        onClose={() => setFieldsOpen(false)}
        title="Visible fields"
      >
        <InlineMultiPillPicker
          options={targetDatabase.schema
            .filter((candidate) => candidate.id !== targetTitleField?.id)
            .map((candidate) => ({ id: candidate.id, label: candidate.name }))}
          values={visibleFieldIds}
          getColor={() => "var(--surface-1)"}
          onChange={setVisibleFieldIds}
        />
      </MiniPanel>
    </section>
  );
}

function MiniPanel({
  anchorRef,
  open,
  onClose,
  title,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <RecordPickerDropdownShell anchorRef={anchorRef} onClose={onClose}>
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
        {title}
      </div>
      {children}
    </RecordPickerDropdownShell>
  );
}

function RecordPickerDropdownShell({
  anchorRef,
  onClose,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const [position, setPosition] = useState({ top: 0, left: 0, width: 280 });
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function updatePosition() {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      setPosition({
        top: Math.min(rect.bottom + 8, window.innerHeight - 320),
        left: Math.max(16, Math.min(rect.left, window.innerWidth - 296)),
        width: Math.max(rect.width, 280),
      });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [anchorRef, onClose]);

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[90] w-[280px] rounded-2xl border border-[var(--border)] bg-[var(--mantle)] p-3 shadow-[var(--shadow-elevated)]"
      style={{ top: position.top, left: position.left, width: position.width }}
    >
      {children}
    </div>,
    document.body,
  );
}

function TaskFieldEditor({
  database,
  fieldId,
  record,
  catalog,
  onUpdateField,
  onUpdateRelation,
}: {
  database: WorkspaceDatabaseModel;
  fieldId: string;
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
  const field = database.schema.find((candidate) => candidate.id === fieldId);
  if (!field) return null;
  const value = record[field.id];

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
        onBlur={(event) => onUpdateField(record.id, field.id, event.target.value ? Number(event.target.value) : null)}
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
        onBlur={(event) => onUpdateField(record.id, field.id, event.target.value || null)}
        className="h-8 border-transparent bg-transparent px-0 shadow-none focus:border-[var(--accent)]"
      />
    );
  }

  return (
    <div className={cn("text-[12px] text-[var(--overlay-1)]")}>
      {value === null || value === undefined || value === "" ? "No value" : <Badge>{String(value)}</Badge>}
    </div>
  );
}
