import { useEffect, useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { STATUS_OPTIONS } from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseField,
  WorkspaceDatabaseFieldType,
  WorkspaceDatabaseModel,
} from "@/lib/types";

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

const ROLLUP_AGGREGATIONS: Array<NonNullable<WorkspaceDatabaseField["rollup"]>["aggregation"]> = [
  "count",
  "count_not_empty",
  "sum",
  "avg",
  "min",
  "max",
];

interface DatabaseSchemaEditorProps {
  open: boolean;
  database: WorkspaceDatabaseModel;
  activeView: WorkspaceDatabaseModel["views"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
  onClose: () => void;
  onSave: (schema: WorkspaceDatabaseField[], records?: WorkspaceDatabaseModel["records"]) => void;
  onSaveViewConfig: (input: {
    hiddenFields?: string[];
    fieldOrder?: string[];
  }) => Promise<void> | void;
}

function supportsOptions(type: WorkspaceDatabaseFieldType): boolean {
  return type === "select" || type === "multiselect" || type === "status";
}

function toFieldForType(field: WorkspaceDatabaseField, nextType: WorkspaceDatabaseFieldType): WorkspaceDatabaseField {
  const next: WorkspaceDatabaseField = { id: field.id, name: field.name, type: nextType };
  if (supportsOptions(nextType)) {
    next.options = field.options?.length ? [...field.options] : (nextType === "status" ? [...STATUS_OPTIONS] : []);
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

export function DatabaseSchemaEditor({
  open,
  database,
  activeView,
  catalog,
  onClose,
  onSave,
  onSaveViewConfig,
}: DatabaseSchemaEditorProps) {
  const [schema, setSchema] = useState<WorkspaceDatabaseField[]>(() => JSON.parse(JSON.stringify(database.schema)));
  const [hiddenInView, setHiddenInView] = useState<Set<string>>(
    () => new Set(activeView.hiddenFields.filter((id) => database.schema.some((field) => field.id === id))),
  );
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<WorkspaceDatabaseFieldType>("text");
  const [confirmRemoveIndex, setConfirmRemoveIndex] = useState<number | null>(null);

  const catalogById = useMemo(
    () => new Map(catalog.map((entry) => [entry.id, entry])),
    [catalog],
  );

  const selfRelationField = useMemo(
    () =>
      schema.find(
        (f) =>
          f.type === "relation" &&
          (!f.relation?.targetDatabaseId || f.relation.targetDatabaseId === database.id),
      ),
    [schema, database.id],
  );

  function enableSubRecords() {
    if (selfRelationField) return;
    const subItemsId = crypto.randomUUID();
    const parentId = crypto.randomUUID();
    setSchema((prev) => [
      ...prev,
      {
        id: subItemsId,
        name: "Sub-records",
        type: "relation",
        relation: { targetRelationFieldId: parentId },
      },
      {
        id: parentId,
        name: "Parent",
        type: "relation",
        relation: { targetRelationFieldId: subItemsId },
      },
    ]);
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--base)",
    color: "var(--text)",
    border: "1px solid var(--border-subtle)",
  };

  useEffect(() => {
    if (!open) return;
    setSchema(JSON.parse(JSON.stringify(database.schema)) as WorkspaceDatabaseField[]);
    setHiddenInView(new Set(activeView.hiddenFields.filter((id) => database.schema.some((field) => field.id === id))));
    setDragFieldId(null);
    setNewFieldName("");
    setNewFieldType("text");
    setConfirmRemoveIndex(null);
  }, [activeView.hiddenFields, activeView.id, database.schema, open]);

  function updateField(index: number, changes: Partial<WorkspaceDatabaseField>) {
    setSchema((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...changes };
      return next;
    });
  }

  function updateFieldType(index: number, nextType: WorkspaceDatabaseFieldType) {
    setSchema((prev) => {
      const next = [...prev];
      next[index] = toFieldForType(next[index], nextType);
      return next;
    });
  }

  function addField() {
    const name = newFieldName.trim();
    if (!name) return;
    setSchema((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name,
        type: newFieldType,
        ...(newFieldType === "relation" ? { relation: {} } : {}),
        ...(newFieldType === "rollup" ? { rollup: { relationFieldId: "", aggregation: "count" } } : {}),
        ...(newFieldType === "formula" ? { formula: { expression: "" } } : {}),
        ...(supportsOptions(newFieldType)
          ? { options: newFieldType === "status" ? [...STATUS_OPTIONS] : [] }
          : {}),
      },
    ]);
    setNewFieldName("");
    setNewFieldType("text");
  }

  function removeField(index: number) {
    setSchema((prev) => {
      const removed = prev[index];
      if (removed) {
        setHiddenInView((hidden) => {
          const next = new Set(hidden);
          next.delete(removed.id);
          return next;
        });
      }
      return prev.filter((_, i) => i !== index);
    });
    setConfirmRemoveIndex(null);
  }

  function moveField(fieldId: string, targetFieldId: string) {
    if (!fieldId || !targetFieldId || fieldId === targetFieldId) return;
    setSchema((prev) => {
      const next = [...prev];
      const from = next.findIndex((field) => field.id === fieldId);
      const to = next.findIndex((field) => field.id === targetFieldId);
      if (from < 0 || to < 0) return prev;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function toggleVisibility(fieldId: string, visible: boolean) {
    setHiddenInView((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  }

  function showAllInView() {
    setHiddenInView(new Set());
  }

  function hideAllInView() {
    setHiddenInView(new Set(schema.map((field) => field.id)));
  }

  function handleSave() {
    const fieldOrder = schema.map((field) => field.id);
    onSave(schema);
    void onSaveViewConfig({
      hiddenFields: [...hiddenInView].filter((fieldId) => fieldOrder.includes(fieldId)),
      fieldOrder,
    });
    onClose();
  }

  if (!open) return null;

  return (
    <div className="db-schema-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="db-schema-panel">
        <div className="db-schema-header">
          <div className="min-w-0">
            <div className="db-schema-kicker">Manage fields</div>
            <h3 className="db-schema-title">{database.name}</h3>
            <div className="db-schema-subtitle">{activeView.name} view</div>
          </div>
          <button className="db-icon-btn" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <div className="db-schema-toolbar">
          <div className="db-schema-toolbar-meta">
            Visible in this view: {schema.length - hiddenInView.size}/{schema.length}
          </div>
          <div className="db-schema-toolbar-actions">
            <button className="db-btn" onClick={showAllInView}>Show all</button>
            <button className="db-btn" onClick={hideAllInView}>Hide all</button>
          </div>
        </div>

        <div className="db-schema-list">
          {schema.map((field, index) => {
            const relationFields = schema.filter((candidate) => candidate.type === "relation");
            const rollupRelation = field.type === "rollup"
              ? relationFields.find((candidate) => candidate.id === field.rollup?.relationFieldId)
              : undefined;
            const relationTargetDbId = rollupRelation?.relation?.targetDatabaseId ?? database.id;
            const relationTargetSchema = catalogById.get(relationTargetDbId)?.schema ?? database.schema;
            const rollupNeedsNumeric =
              field.type === "rollup"
              && (field.rollup?.aggregation === "sum"
                || field.rollup?.aggregation === "avg"
                || field.rollup?.aggregation === "min"
                || field.rollup?.aggregation === "max");

            return (
              <div
                key={field.id}
                className="db-schema-row"
                draggable
                onDragStart={(e) => {
                  setDragFieldId(field.id);
                  e.currentTarget.classList.add("db-fields-row--dragging");
                }}
                onDragEnd={(e) => {
                  setDragFieldId(null);
                  e.currentTarget.classList.remove("db-fields-row--dragging");
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add("db-fields-row--over");
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove("db-fields-row--over");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("db-fields-row--over");
                  if (!dragFieldId) return;
                  moveField(dragFieldId, field.id);
                  setDragFieldId(null);
                }}
	              >
	                <div className="db-schema-row-main">
	                  <span className="db-fields-handle" title="Drag to reorder">⠿</span>
	                  <label className="db-schema-visibility">
	                    <input
	                      type="checkbox"
	                      checked={!hiddenInView.has(field.id)}
	                      onChange={(e) => toggleVisibility(field.id, e.target.checked)}
	                      title="Visible in this view"
	                    />
	                    <span>Show</span>
	                  </label>
	                  <input
	                    className="db-input db-schema-name"
	                    style={inputStyle}
	                    value={field.name}
	                    onChange={(e) => updateField(index, { name: e.target.value })}
	                  />
	                  <select
	                    className="db-select db-schema-type"
	                    style={inputStyle}
	                    value={field.type}
	                    onChange={(e) => updateFieldType(index, e.target.value as WorkspaceDatabaseFieldType)}
	                  >
	                    {FIELD_TYPES.map((type) => (
	                      <option key={type} value={type}>{type}</option>
	                    ))}
	                  </select>
	                  <button className="db-icon-btn db-schema-delete" onClick={() => setConfirmRemoveIndex(index)} title="Delete field">
	                    🗑
	                  </button>
	                </div>

	                {supportsOptions(field.type) && (
	                  <div className="db-schema-row-advanced">
	                    <div className="db-schema-advanced-field db-schema-advanced-field--wide">
	                      <div className="db-schema-advanced-label">Options</div>
	                      <input
	                        className="db-input db-schema-options"
	                        style={inputStyle}
	                        placeholder="Comma-separated options"
	                        value={(field.options ?? []).join(", ")}
	                        onChange={(e) =>
	                          updateField(index, {
	                            options: e.target.value
	                              .split(",")
	                              .map((item) => item.trim())
	                              .filter(Boolean),
	                          })
	                        }
	                      />
	                    </div>
	                  </div>
	                )}

	                {field.type === "relation" && (
	                  <div className="db-schema-row-advanced">
	                    <div className="db-schema-advanced-field">
	                      <div className="db-schema-advanced-label">Target database</div>
	                      <select
	                        className="db-select db-schema-type"
	                        style={inputStyle}
	                        value={field.relation?.targetDatabaseId ?? ""}
	                        onChange={(e) => {
	                          const nextTargetDatabaseId = e.target.value || undefined;
	                          updateField(index, {
	                            relation: {
	                              targetDatabaseId: nextTargetDatabaseId,
	                              targetRelationFieldId: undefined,
	                            },
	                          });
	                        }}
	                      >
	                        <option value="">Current database</option>
	                        {catalog.map((entry) => (
	                          <option key={entry.id} value={entry.id}>{entry.name}</option>
	                        ))}
	                      </select>
	                    </div>
	                    <div className="db-schema-advanced-field">
	                      <div className="db-schema-advanced-label">Backlink</div>
	                      <select
	                        className="db-select db-schema-type"
	                        style={inputStyle}
	                        value={field.relation?.targetRelationFieldId ?? ""}
	                        onChange={(e) => {
	                          updateField(index, {
	                            relation: {
	                              ...(field.relation ?? {}),
	                              targetRelationFieldId: e.target.value || undefined,
	                            },
	                          });
	                        }}
	                      >
	                        <option value="">No backlink</option>
	                        {(catalogById.get(field.relation?.targetDatabaseId ?? database.id)?.schema ?? database.schema)
	                          .filter((candidate) => candidate.type === "relation")
	                          .map((candidate) => (
	                            <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
	                          ))}
	                      </select>
	                    </div>
	                  </div>
	                )}

	                {field.type === "rollup" && (
	                  <div className="db-schema-row-advanced">
	                    <div className="db-schema-advanced-field">
	                      <div className="db-schema-advanced-label">Relation field</div>
	                      <select
	                        className="db-select db-schema-type"
	                        style={inputStyle}
	                        value={field.rollup?.relationFieldId ?? ""}
	                        onChange={(e) => {
	                          updateField(index, {
	                            rollup: {
	                              relationFieldId: e.target.value,
	                              aggregation: field.rollup?.aggregation ?? "count",
	                            },
	                          });
	                        }}
	                      >
	                        <option value="">Choose relation</option>
	                        {relationFields.map((candidate) => (
	                          <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
	                        ))}
	                      </select>
	                    </div>
	                    <div className="db-schema-advanced-field">
	                      <div className="db-schema-advanced-label">Aggregation</div>
	                      <select
	                        className="db-select db-schema-type"
	                        style={inputStyle}
	                        value={field.rollup?.aggregation ?? "count"}
	                        onChange={(e) => {
	                          updateField(index, {
	                            rollup: {
	                              ...(field.rollup ?? { relationFieldId: "" }),
	                              aggregation: e.target.value as NonNullable<typeof field.rollup>["aggregation"],
	                            },
	                          });
	                        }}
	                      >
	                        {ROLLUP_AGGREGATIONS.map((aggregation) => (
	                          <option key={aggregation} value={aggregation}>{aggregation}</option>
	                        ))}
	                      </select>
	                    </div>
	                    <div className="db-schema-advanced-field">
	                      <div className="db-schema-advanced-label">Target field</div>
	                      <select
	                        className="db-select db-schema-type"
	                        style={inputStyle}
	                        value={field.rollup?.targetFieldId ?? ""}
	                        onChange={(e) => {
	                          updateField(index, {
	                            rollup: {
	                              ...(field.rollup ?? { relationFieldId: "", aggregation: "count" }),
	                              targetFieldId: e.target.value || undefined,
	                            },
	                          });
	                        }}
	                      >
	                        <option value="">Choose field</option>
	                        {relationTargetSchema
	                          .filter((candidate) => !rollupNeedsNumeric || candidate.type === "number")
	                          .map((candidate) => (
	                            <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
	                          ))}
	                      </select>
	                    </div>
	                  </div>
	                )}

	                {field.type === "formula" && (
	                  <div className="db-schema-row-advanced">
	                    <div className="db-schema-advanced-field db-schema-advanced-field--wide">
	                      <div className="db-schema-advanced-label">Formula</div>
	                      <input
	                        className="db-input db-schema-options"
	                        style={inputStyle}
	                        placeholder="Formula expression"
	                        value={field.formula?.expression ?? ""}
	                        onChange={(e) =>
	                          updateField(index, {
	                            formula: { expression: e.target.value },
	                          })
	                        }
	                      />
	                    </div>
	                  </div>
	                )}
	              </div>
	            );
          })}

          <div className="db-schema-add">
            <div className="db-schema-add-title">Add field</div>
            <div className="db-schema-add-row">
              <input
                className="db-input"
                style={inputStyle}
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="Field name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addField();
                }}
              />
              <select
                className="db-select"
                style={inputStyle}
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value as WorkspaceDatabaseFieldType)}
              >
                {FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <button className="db-btn" onClick={addField}>
                Add
              </button>
            </div>
          </div>

          <div className="db-schema-add" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <div className="db-schema-add-title">Quick setup</div>
            <div className="db-schema-add-row" style={{ alignItems: "center" }}>
              <span style={{ flex: 1, fontSize: 12, color: "var(--overlay-1)" }}>
                {selfRelationField
                  ? `Sub-records enabled via "${selfRelationField.name}" field`
                  : "Add Parent / Sub-records relation pair to this database"}
              </span>
              <button
                className="db-btn"
                onClick={enableSubRecords}
                disabled={!!selfRelationField}
                style={selfRelationField ? { opacity: 0.5, cursor: "default" } : {}}
              >
                {selfRelationField ? "Enabled" : "Enable sub-records"}
              </button>
            </div>
          </div>
        </div>

        <div className="db-schema-footer">
          <button className="db-btn" onClick={onClose}>Cancel</button>
          <button className="db-btn db-btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemoveIndex !== null}
        title="Delete field"
        message="This will remove the field and its data from all records. This action cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (confirmRemoveIndex !== null) removeField(confirmRemoveIndex);
        }}
        onCancel={() => setConfirmRemoveIndex(null)}
      />
    </div>
  );
}
