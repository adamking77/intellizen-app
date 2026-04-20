import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, EyeOff, GripVertical } from "lucide-react";

import { Badge } from "@/components/database/primitives/Badge";
import { Input } from "@/components/ui/input";
import { HASH_PALETTE, resolveFieldOptionColor } from "@/lib/database-colors";
import type {
  WorkspaceDatabaseField,
  WorkspaceDatabaseFieldType,
  WorkspaceDatabaseModel,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const EDITABLE_TYPES: WorkspaceDatabaseFieldType[] = [
  "text",
  "number",
  "select",
  "multiselect",
  "date",
  "checkbox",
  "url",
  "email",
  "phone",
  "status",
];

interface ColumnHeaderPopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  database: WorkspaceDatabaseModel;
  field: WorkspaceDatabaseField;
  open: boolean;
  currentSortDirection?: "asc" | "desc";
  onClose: () => void;
  onSaveSchema: (schema: WorkspaceDatabaseField[]) => void;
  onHideField: (fieldId: string) => void;
  onToggleSort: (fieldId: string, direction: "asc" | "desc") => void;
  onGroupByField: (fieldId: string) => void;
}

export function ColumnHeaderPopover({
  anchorRef,
  database,
  field,
  open,
  currentSortDirection,
  onClose,
  onSaveSchema,
  onHideField,
  onToggleSort,
  onGroupByField,
}: ColumnHeaderPopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 320 });
  const [nameDraft, setNameDraft] = useState(field.name);

  useEffect(() => {
    setNameDraft(field.name);
  }, [field.id, field.name]);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        top: Math.min(rect.bottom + 8, window.innerHeight - 420),
        left: Math.max(16, Math.min(rect.left, window.innerWidth - 336)),
        width: 320,
      });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }
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
  }, [anchorRef, onClose, open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const nextName = nameDraft.trim();
      if (!nextName || nextName === field.name) return;
      onSaveSchema(
        database.schema.map((candidate) =>
          candidate.id === field.id ? { ...candidate, name: nextName } : candidate,
        ),
      );
    }, 160);
    return () => window.clearTimeout(timer);
  }, [database.schema, field.id, field.name, nameDraft, onSaveSchema, open]);

  const schemaField = useMemo(
    () => database.schema.find((candidate) => candidate.id === field.id) ?? field,
    [database.schema, field],
  );

  function moveOption(optionIndex: number, direction: -1 | 1) {
    const currentOptions = [...(schemaField.options ?? [])];
    const nextIndex = optionIndex + direction;
    if (optionIndex < 0 || nextIndex < 0 || nextIndex >= currentOptions.length) return;
    const [option] = currentOptions.splice(optionIndex, 1);
    currentOptions.splice(nextIndex, 0, option);
    onSaveSchema(
      database.schema.map((candidate) =>
        candidate.id === field.id
          ? { ...candidate, options: currentOptions }
          : candidate,
      ),
    );
  }

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[90] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--mantle)] shadow-[var(--shadow-elevated)]"
      style={{ top: position.top, left: position.left, width: position.width }}
    >
      <div className="space-y-3 border-b border-[var(--border)] p-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
          Column settings
        </div>
        <Input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} />
        <select
          value={schemaField.type}
          onChange={(event) =>
            onSaveSchema(
              database.schema.map((candidate) =>
                candidate.id === field.id
                  ? {
                      ...candidate,
                      type: event.target.value as WorkspaceDatabaseFieldType,
                    }
                  : candidate,
              ),
            )
          }
          className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--base)] px-3 text-[13px] text-[var(--text)] outline-none"
        >
          {EDITABLE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>

      {(schemaField.type === "select" || schemaField.type === "multiselect" || schemaField.type === "status") && (
        <div className="space-y-2 border-b border-[var(--border)] p-4">
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
            Options
          </div>
          {(schemaField.options ?? []).map((option, index) => (
            <div key={option} className="rounded-xl border border-[var(--border)] bg-[var(--base)] p-3">
              <div className="flex items-center gap-2">
                <GripVertical className="h-3.5 w-3.5 text-[var(--overlay-1)]" />
                <Input
                  defaultValue={option}
                  onBlur={(event) => {
                    const nextOption = event.target.value.trim();
                    if (!nextOption || nextOption === option) return;
                    const nextOptions = [...(schemaField.options ?? [])];
                    nextOptions[index] = nextOption;
                    const nextColors = { ...(schemaField.optionColors ?? {}) };
                    if (option in nextColors) {
                      nextColors[nextOption] = nextColors[option];
                      delete nextColors[option];
                    }
                    onSaveSchema(
                      database.schema.map((candidate) =>
                        candidate.id === field.id
                          ? { ...candidate, options: nextOptions, optionColors: nextColors }
                          : candidate,
                      ),
                    );
                  }}
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveOption(index, -1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                    aria-label={`Move ${option} up`}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveOption(index, 1)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                    aria-label={`Move ${option} down`}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const nextOptions = (schemaField.options ?? []).filter((candidate) => candidate !== option);
                    const nextColors = { ...(schemaField.optionColors ?? {}) };
                    delete nextColors[option];
                    onSaveSchema(
                      database.schema.map((candidate) =>
                        candidate.id === field.id
                          ? { ...candidate, options: nextOptions, optionColors: nextColors }
                          : candidate,
                      ),
                    );
                  }}
                  className="text-[12px] text-[var(--overlay-1)] transition-colors hover:text-[var(--danger)]"
                >
                  Delete
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextColors = { ...(schemaField.optionColors ?? {}) };
                    delete nextColors[option];
                    onSaveSchema(
                      database.schema.map((candidate) =>
                        candidate.id === field.id
                          ? { ...candidate, optionColors: nextColors }
                          : candidate,
                      ),
                    );
                  }}
                >
                  <Badge color={resolveFieldOptionColor(schemaField, option)}>Auto</Badge>
                </button>
                {HASH_PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() =>
                      onSaveSchema(
                        database.schema.map((candidate) =>
                          candidate.id === field.id
                            ? {
                                ...candidate,
                                optionColors: {
                                  ...(candidate.optionColors ?? {}),
                                  [option]: color,
                                },
                              }
                            : candidate,
                        ),
                      )
                    }
                    className={cn(
                      "h-6 w-6 rounded-full border transition-transform hover:scale-105",
                      schemaField.optionColors?.[option] === color
                        ? "border-[var(--text)]"
                        : "border-transparent",
                    )}
                    style={{ backgroundColor: color }}
                    aria-label={`Use ${color} for ${option}`}
                    title={option}
                  />
                ))}
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() =>
              onSaveSchema(
                database.schema.map((candidate) =>
                  candidate.id === field.id
                    ? {
                        ...candidate,
                        options: [...(candidate.options ?? []), `Option ${(candidate.options?.length ?? 0) + 1}`],
                      }
                    : candidate,
                ),
              )
            }
            className="rounded-xl border border-dashed border-[var(--border)] px-3 py-2 text-[12px] text-[var(--overlay-1)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
          >
            Add option
          </button>
        </div>
      )}

      <div className="p-2">
        <ActionButton icon={<EyeOff className="h-4 w-4" />} label="Hide column" onClick={() => onHideField(field.id)} />
        <ActionButton
          icon={<ArrowUp className="h-4 w-4" />}
          label={currentSortDirection === "asc" ? "Sorted ascending" : "Sort ascending"}
          onClick={() => onToggleSort(field.id, "asc")}
        />
        <ActionButton
          icon={<ArrowDown className="h-4 w-4" />}
          label={currentSortDirection === "desc" ? "Sorted descending" : "Sort descending"}
          onClick={() => onToggleSort(field.id, "desc")}
        />
        {(schemaField.type === "status" || schemaField.type === "select" || schemaField.type === "multiselect") ? (
          <ActionButton label="Group by this field" onClick={() => onGroupByField(field.id)} />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-[var(--subtext-0)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
    >
      {icon ? <span className="text-[var(--overlay-1)]">{icon}</span> : null}
      <span>{label}</span>
    </button>
  );
}
