import { ArrowDown, ArrowUp, Plus, Star, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_OPTION_COLORS,
  STATUS_OPTIONS,
  getComputedFieldIssue,
  getFieldValue,
} from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseField,
  WorkspaceDatabaseFieldType,
  WorkspaceDatabaseModel,
} from "@/lib/types";

interface DatabaseSchemaEditorProps {
  open: boolean;
  database: WorkspaceDatabaseModel;
  catalog: WorkspaceDatabaseCatalogEntry[];
  onClose: () => void;
  onSave: (schema: WorkspaceDatabaseField[]) => Promise<void> | void;
  onSaveHeaderFields: (fieldIds: string[]) => Promise<void> | void;
}

const FIELD_TYPES: WorkspaceDatabaseFieldType[] = [
  "text",
  "number",
  "select",
  "multiselect",
  "relation",
  "rollup",
  "formula",
  "date",
  "checkbox",
  "url",
  "email",
  "phone",
  "status",
  "createdAt",
  "lastEditedAt",
];

export function DatabaseSchemaEditor({
  open,
  database,
  catalog,
  onClose,
  onSave,
  onSaveHeaderFields,
}: DatabaseSchemaEditorProps) {
  if (!open) {
    return null;
  }

  const schema = structuredClone(database.schema) as WorkspaceDatabaseField[];

  function updateField(fieldId: string, updater: (field: WorkspaceDatabaseField) => WorkspaceDatabaseField) {
    const index = schema.findIndex((field) => field.id === fieldId);
    if (index === -1) return;
    schema[index] = updater(schema[index]);
    void onSave(schema);
  }

  function addField() {
    const next: WorkspaceDatabaseField = {
      id: crypto.randomUUID(),
      name: "New field",
      type: "text",
    };
    void onSave([...schema, next]);
  }

  function removeField(fieldId: string) {
    void onSave(schema.filter((field) => field.id !== fieldId));
  }

  function moveField(fieldId: string, direction: -1 | 1) {
    const index = schema.findIndex((field) => field.id === fieldId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= schema.length) return;
    const next = [...schema];
    const [field] = next.splice(index, 1);
    next.splice(targetIndex, 0, field);
    void onSave(next);
  }

  function toggleHeaderField(fieldId: string) {
    const current = database.headerFieldIds ?? [];
    const exists = current.includes(fieldId);
    const next = exists ? current.filter((id) => id !== fieldId) : [...current, fieldId].slice(0, 3);
    void onSaveHeaderFields(next);
  }

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--base)]">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div>
          <div className="font-ui text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--overlay-1)]">
            Schema
          </div>
          <div className="mt-1 text-[13px] text-[var(--subtext-0)]">
            Fields, types, and relation targets
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
          aria-label="Close schema editor"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {database.schema.map((field) => (
          <div key={field.id} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--mantle)] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleHeaderField(field.id)}
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors ${
                    (database.headerFieldIds ?? []).includes(field.id)
                      ? "border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                  }`}
                  title="Toggle header field"
                >
                  <Star className="h-4 w-4" />
                </button>
                <Input
                  defaultValue={field.name}
                  onBlur={(event) =>
                    updateField(field.id, (current) => ({
                      ...current,
                      name: event.target.value.trim() || current.name,
                    }))
                  }
                />
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveField(field.id, -1)}
                  className="rounded-md px-2 py-1 text-[12px] text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                  title="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveField(field.id, 1)}
                  className="rounded-md px-2 py-1 text-[12px] text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                  title="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeField(field.id)}
                  className="rounded-md px-2 py-1 text-[12px] text-[var(--overlay-1)] transition-colors hover:bg-[rgba(240,63,63,0.12)] hover:text-[var(--danger)]"
                >
                  Remove
                </button>
              </div>
            </div>

            {(database.headerFieldIds ?? []).includes(field.id) ? (
              <div className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-2 text-[12px] text-[var(--accent)]">
                Used in record headers
              </div>
            ) : null}

            <label className="block space-y-2">
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                Type
              </div>
              <select
                value={field.type}
                onChange={(event) =>
                  updateField(field.id, (current) => coerceFieldForType(current, event.target.value as WorkspaceDatabaseFieldType))
                }
                className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 text-[13px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)]"
              >
                {FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            {(field.type === "select" || field.type === "multiselect" || field.type === "status") && (
              <label className="block space-y-2">
                <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                  Options
                </div>
                <Textarea
                  defaultValue={(field.options ?? []).join(", ")}
                  onBlur={(event) =>
                    updateField(field.id, (current) => {
                      const options = event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean);
                      return {
                        ...current,
                        options,
                        optionColors: Object.fromEntries(
                          options.map((option, index) => [
                            option,
                            current.optionColors?.[option] ?? DEFAULT_OPTION_COLORS[index % DEFAULT_OPTION_COLORS.length],
                          ]),
                        ),
                      };
                    })
                  }
                  className="min-h-[88px]"
                />
              </label>
            )}

            {field.type === "relation" && (
              <div className="space-y-3">
                <label className="block space-y-2">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                    Target database
                  </div>
                  <select
                    value={field.relation?.targetDatabaseId ?? ""}
                    onChange={(event) =>
                      updateField(field.id, (current) => ({
                        ...current,
                        relation: {
                          ...current.relation,
                          targetDatabaseId: event.target.value || undefined,
                          targetRelationFieldId: undefined,
                        },
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 text-[13px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)]"
                  >
                    <option value="">Current database</option>
                    {catalog
                      .filter((entry) => entry.id !== database.id)
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                    Reciprocal field
                  </div>
                  <select
                    value={field.relation?.targetRelationFieldId ?? ""}
                    onChange={(event) =>
                      updateField(field.id, (current) => ({
                        ...current,
                        relation: {
                          ...current.relation,
                          targetRelationFieldId: event.target.value || undefined,
                        },
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 text-[13px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)]"
                  >
                    <option value="">None</option>
                    {relationFieldOptions(database, catalog, field.relation?.targetDatabaseId).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {field.type === "formula" && (
              <div className="space-y-2">
                <label className="block space-y-2">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                    Expression
                  </div>
                  <Textarea
                    defaultValue={field.formula?.expression ?? ""}
                    onBlur={(event) =>
                      updateField(field.id, (current) => ({
                        ...current,
                        formula: {
                          expression: event.target.value.trim(),
                        },
                      }))
                    }
                    placeholder={'=CONCAT({field_id}, " - ", {other_field_id})'}
                    className="min-h-[88px]"
                  />
                </label>
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                    Insert field
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {database.schema
                      .filter((candidate) => candidate.id !== field.id)
                      .map((candidate) => (
                        <button
                          key={candidate.id}
                          type="button"
                          onClick={() =>
                            updateField(field.id, (current) => ({
                              ...current,
                              formula: {
                                expression: `${current.formula?.expression?.trim() ?? ""}{${candidate.id}}`,
                              },
                            }))
                          }
                          className="rounded-full border border-[var(--border)] bg-[var(--base)] px-2.5 py-1 text-[11px] text-[var(--subtext-0)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)]"
                        >
                          {candidate.name}
                        </button>
                      ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                    Presets
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      '=CONCAT({field_id}, " / ", {other_field_id})',
                      "=TODAY()",
                      '=IF({field_id}>0, "Yes", "No")',
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() =>
                          updateField(field.id, (current) => ({
                            ...current,
                            formula: {
                              expression: preset,
                            },
                          }))
                        }
                        className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-2.5 py-1 text-[11px] text-[var(--accent)]"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {field.type === "rollup" && (
              <div className="space-y-3">
                <label className="block space-y-2">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                    Relation field
                  </div>
                  <select
                    value={field.rollup?.relationFieldId ?? ""}
                    onChange={(event) =>
                      updateField(field.id, (current) => ({
                        ...current,
                        rollup: {
                          relationFieldId: event.target.value,
                          targetFieldId: undefined,
                          aggregation: current.rollup?.aggregation ?? "count",
                        },
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 text-[13px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)]"
                  >
                    <option value="">Select relation</option>
                    {database.schema
                      .filter((candidate) => candidate.type === "relation")
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                    Aggregation
                  </div>
                  <select
                    value={field.rollup?.aggregation ?? "count"}
                    onChange={(event) =>
                      updateField(field.id, (current) => ({
                        ...current,
                        rollup: {
                          relationFieldId: current.rollup?.relationFieldId ?? "",
                          targetFieldId: current.rollup?.targetFieldId,
                          aggregation: event.target.value as NonNullable<typeof current.rollup>["aggregation"],
                        },
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 text-[13px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)]"
                  >
                    <option value="count">count</option>
                    <option value="count_not_empty">count_not_empty</option>
                    <option value="sum">sum</option>
                    <option value="avg">avg</option>
                    <option value="min">min</option>
                    <option value="max">max</option>
                  </select>
                </label>

                <label className="block space-y-2">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                    Target field
                  </div>
                  <select
                    value={field.rollup?.targetFieldId ?? ""}
                    onChange={(event) =>
                      updateField(field.id, (current) => ({
                        ...current,
                        rollup: {
                          relationFieldId: current.rollup?.relationFieldId ?? "",
                          targetFieldId: event.target.value || undefined,
                          aggregation: current.rollup?.aggregation ?? "count",
                        },
                      }))
                    }
                    className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 text-[13px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)]"
                  >
                    <option value="">Select target field</option>
                    {rollupTargetFieldOptions(database, catalog, field.rollup?.relationFieldId).map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {field.type === "formula" || field.type === "rollup" ? (
              <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--base)] px-3 py-2 text-[12px] text-[var(--subtext-0)]">
                <div>{getComputedFieldIssue(field, database, catalog) ?? "Computed field is valid."}</div>
                <div className="text-[11px] text-[var(--overlay-1)]">
                  Preview: {computedPreview(field, database, catalog)}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--border)] p-4">
        <Button variant="secondary" className="w-full" onClick={addField}>
          <Plus className="h-3.5 w-3.5" />
          Add field
        </Button>
      </div>
    </aside>
  );
}

function coerceFieldForType(field: WorkspaceDatabaseField, type: WorkspaceDatabaseFieldType): WorkspaceDatabaseField {
  const next: WorkspaceDatabaseField = {
    id: field.id,
    name: field.name,
    type,
  };

  if (type === "select" || type === "multiselect" || type === "status") {
    const fallbackOptions = type === "status" ? [...STATUS_OPTIONS] : field.options ?? [];
    next.options = fallbackOptions;
    next.optionColors = Object.fromEntries(
      fallbackOptions.map((option, index) => [
        option,
        field.optionColors?.[option] ?? DEFAULT_OPTION_COLORS[index % DEFAULT_OPTION_COLORS.length],
      ]),
    );
  }

  if (type === "relation") {
    next.relation = field.relation ? { ...field.relation } : {};
  }

  if (type === "rollup") {
    next.rollup = field.rollup ?? { relationFieldId: "", aggregation: "count" };
  }

  if (type === "formula") {
    next.formula = field.formula ?? { expression: "" };
  }

  return next;
}

function relationFieldOptions(
  database: WorkspaceDatabaseModel,
  catalog: WorkspaceDatabaseCatalogEntry[],
  targetDatabaseId?: string,
) {
  const target =
    catalog.find((entry) => entry.id === targetDatabaseId) ??
    catalog.find((entry) => entry.id === database.id);
  return (target?.schema ?? []).filter((field) => field.type === "relation");
}

function rollupTargetFieldOptions(
  database: WorkspaceDatabaseModel,
  catalog: WorkspaceDatabaseCatalogEntry[],
  relationFieldId?: string,
) {
  const relationField = relationFieldId
    ? database.schema.find((field) => field.id === relationFieldId && field.type === "relation")
    : undefined;
  const targetDatabaseId = relationField?.relation?.targetDatabaseId;
  const target =
    catalog.find((entry) => entry.id === targetDatabaseId) ??
    catalog.find((entry) => entry.id === database.id);
  return (target?.schema ?? []).filter((field) => field.type !== "relation" || target?.id === database.id);
}

function computedPreview(
  field: WorkspaceDatabaseField,
  database: WorkspaceDatabaseModel,
  catalog: WorkspaceDatabaseCatalogEntry[],
) {
  const sample = database.records[0];
  if (!sample) return "No records yet";
  const value = getFieldValue(sample, field, database, catalog);
  if (value === null || value === undefined || value === "") return "Empty";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}
