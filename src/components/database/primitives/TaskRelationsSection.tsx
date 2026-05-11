import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Plus } from "lucide-react";

import { DatabaseTableView } from "@/components/database/DatabaseTableView";
import { RecordPickerDropdown } from "@/components/database/primitives/RecordPickerDropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getRecordTitle } from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
  WorkspaceDatabaseSchemaSaveOptions,
  WorkspaceDatabaseViewConfig,
} from "@/lib/types";

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
  onUpdateViewConfig: (
    databaseId: string,
    viewId: string,
    input: Partial<WorkspaceDatabaseViewConfig>,
  ) => Promise<void> | void;
  onSaveSchema: (
    databaseId: string,
    schema: WorkspaceDatabaseModel["schema"],
    records?: WorkspaceDatabaseModel["records"],
    options?: WorkspaceDatabaseSchemaSaveOptions,
  ) => Promise<void> | void;
  onDeleteRecord: (databaseId: string, recordId: string) => Promise<void> | void;
  onDeleteRecords: (recordIds: string[]) => Promise<void> | void;
  onDuplicateRecord: (databaseId: string, recordId: string) => Promise<void> | void;
  onDuplicateRecords: (databaseId: string, recordIds: string[]) => Promise<void> | void;
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
  onUpdateViewConfig,
  onSaveSchema,
  onDeleteRecord,
  onDeleteRecords,
  onDuplicateRecord,
  onDuplicateRecords,
}: TaskRelationsSectionProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [linkExistingOpen, setLinkExistingOpen] = useState(false);
  const [selectedViewId, setSelectedViewId] = useState("");
  const linkButtonRef = useRef<HTMLButtonElement | null>(null);

  const targetTitleField =
    targetDatabase.schema.find((candidate) => candidate.id === targetDatabase.headerFieldIds?.[0]) ??
    targetDatabase.schema.find((candidate) => candidate.type === "text") ??
    targetDatabase.schema[0];

  const fallbackView = useMemo<WorkspaceDatabaseModel["views"][number]>(
    () => ({
      id: `${targetDatabase.id}-linked-default`,
      name: "Linked records",
      type: "table",
      sort: [],
      filter: [],
      hiddenFields: [],
      fieldOrder: targetDatabase.schema.map((candidate) => candidate.id),
    }),
    [targetDatabase.id, targetDatabase.schema],
  );

  const availableViews = useMemo(
    () => [
      fallbackView,
      ...targetDatabase.views.filter((view) => view.type === "table" && view.id !== fallbackView.id),
    ],
    [fallbackView, targetDatabase.views],
  );

  useEffect(() => {
    setSelectedViewId((current) => {
      if (availableViews.some((view) => view.id === current)) return current;
      return fallbackView.id;
    });
  }, [availableViews, fallbackView.id]);

  const activeView = useMemo(
    () => availableViews.find((view) => view.id === selectedViewId) ?? fallbackView,
    [availableViews, fallbackView, selectedViewId],
  );

  const linkedRecords = useMemo(
    () => targetDatabase.records.filter((record) => relatedRecordIds.includes(record.id)),
    [relatedRecordIds, targetDatabase.records],
  );

  const linkedDatabase = useMemo<WorkspaceDatabaseModel>(
    () => ({
      ...targetDatabase,
      records: linkedRecords,
      views: [activeView],
    }),
    [activeView, linkedRecords, targetDatabase],
  );

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
    <section className="db-record-section db-related-tasks-section px-6 py-2">
      <div className="db-related-tasks-head">
        <div className="min-w-0">
          <div className="db-related-tasks-title">{fieldName}</div>
          <div className="db-related-tasks-meta">
            {linkedRecords.length} linked {linkedRecords.length === 1 ? "record" : "records"} / {activeView.name}
          </div>
        </div>
        <div className="db-related-tasks-actions">
          <label className="db-related-view-picker">
            <span>View</span>
            <select
              className="db-select db-related-view-select"
              value={selectedViewId}
              onChange={(event) => setSelectedViewId(event.target.value)}
            >
              {availableViews.map((view) => (
                <option key={view.id} value={view.id}>{view.name}</option>
              ))}
            </select>
          </label>
          <Button size="sm" variant="secondary" onClick={() => setShowCreate((current) => !current)}>
            <Plus className="h-4 w-4" />
            New record
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
        <div className="db-related-task-inline-create">
          <Input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Record name…"
            className="bg-transparent"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleCreateTask();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setShowCreate(false);
                setDraftTitle("");
              }
            }}
          />
          <div className="db-related-task-inline-actions">
            <Button size="sm" onClick={() => void handleCreateTask()}>
              Create
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="db-related-tasks-view">
        <DatabaseTableView
          database={linkedDatabase}
          view={activeView}
          catalog={catalog}
          activeRecordId={null}
          embedded
          onOpenRecord={(recordId) => onOpenRecord(targetDatabase.id, recordId)}
          onUpdateField={(recordId, fieldId, value) =>
            onUpdateField(recordId, fieldId, value as WorkspaceDatabaseFieldValue)}
          onUpdateView={(input) => {
            if (activeView.id === fallbackView.id) return;
            void onUpdateViewConfig(targetDatabase.id, activeView.id, input);
          }}
          onSaveSchema={(schema, records, options) =>
            void onSaveSchema(targetDatabase.id, schema, records, options)
          }
          onOpenSchema={() => {}}
          onCreateRecord={() => void handleCreateTask()}
          onDuplicateRecord={(recordId) => void onDuplicateRecord(targetDatabase.id, recordId)}
          onDeleteRecord={(recordId) => void onDeleteRecord(targetDatabase.id, recordId)}
          onDeleteRecords={(recordIds) => void onDeleteRecords(recordIds)}
          onDuplicateRecords={(recordIds) => void onDuplicateRecords(targetDatabase.id, recordIds)}
        />
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
        onClearSelection={() => void onUpdateRelation(sourceDatabaseId, sourceRecordId, fieldId, [])}
        onClose={() => setLinkExistingOpen(false)}
      />
    </section>
  );
}
