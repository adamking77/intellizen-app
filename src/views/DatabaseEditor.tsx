import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { DatabaseCalendarView } from "@/components/database/DatabaseCalendarView";
import { DatabaseGalleryView } from "@/components/database/DatabaseGalleryView";
import { DatabaseKanbanView } from "@/components/database/DatabaseKanbanView";
import { DatabaseListView } from "@/components/database/DatabaseListView";
import { DatabasePeekPanel } from "@/components/database/DatabasePeekPanel";
import { DatabaseSchemaEditor } from "@/components/database/DatabaseSchemaEditor";
import { DatabaseTableView } from "@/components/database/DatabaseTableView";
import { ViewTabBar } from "@/components/database/ViewTabBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  exportDatabaseCsv,
  findDefaultDateField,
  findDefaultKanbanField,
  prepareCsvImport,
} from "@/lib/database-core";
import { getVaultAbsolutePath, writeVaultFile } from "@/lib/vault";
import { openPath } from "@tauri-apps/plugin-opener";
import { dirname } from "@tauri-apps/api/path";
import {
  createWorkspaceRecord,
  createWorkspaceRecords,
  createWorkspaceView,
  deleteWorkspaceRecord,
  deleteWorkspaceView,
  getWorkspaceDatabaseBundle,
  listWorkspaceDatabaseCatalog,
  updateWorkspaceDatabase,
  updateWorkspaceDatabaseHeaderFields,
  updateWorkspaceDatabaseSchema,
  updateWorkspaceRecord,
  updateWorkspaceRelationLinks,
  updateWorkspaceView,
} from "@/lib/data";
import type {
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
  WorkspaceDatabaseViewConfig,
  WorkspaceDatabaseViewType,
} from "@/lib/types";
import { toast, toastError } from "@/lib/toast";

function toViewConfig(view: WorkspaceDatabaseModel["views"][number]): WorkspaceDatabaseViewConfig {
  return {
    groupBy: view.groupBy,
    sort: view.sort,
    filter: view.filter,
    hiddenFields: view.hiddenFields,
    fieldOrder: view.fieldOrder,
    columnWidths: view.columnWidths,
    cardCoverField: view.cardCoverField,
    cardFields: view.cardFields,
  };
}

export function DatabaseEditorView() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const databaseId = params.id ?? "";

  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [activePeek, setActivePeek] = useState<{ databaseId: string; recordId: string } | null>(null);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const { data: catalog = [] } = useQuery({
    queryKey: ["workspace-database-catalog"],
    queryFn: listWorkspaceDatabaseCatalog,
  });

  const {
    data: bundle,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["workspace-database", databaseId],
    queryFn: () => getWorkspaceDatabaseBundle(databaseId),
    enabled: Boolean(databaseId),
  });

  const database = bundle?.model;

  useEffect(() => {
    if (!database?.views.length) {
      setActiveViewId(null);
      return;
    }
    setActiveViewId((current) =>
      current && database.views.some((v) => v.id === current) ? current : database.views[0].id,
    );
  }, [database]);

  const activeView = useMemo(
    () => database?.views.find((v) => v.id === activeViewId) ?? database?.views[0] ?? null,
    [activeViewId, database],
  );

  const catalogDatabaseMap = useMemo(() => {
    const entries = new Map<string, WorkspaceDatabaseModel>();
    for (const entry of catalog) {
      entries.set(entry.id, {
        id: entry.id,
        name: entry.name,
        schema: entry.schema,
        headerFieldIds: entry.headerFieldIds,
        records: entry.records,
        views: [],
      });
    }
    if (database) {
      entries.set(database.id, database);
    }
    return entries;
  }, [catalog, database]);

  const activeRecordId = activePeek?.databaseId === databaseId ? activePeek.recordId : null;
  const peekDatabase = activePeek ? catalogDatabaseMap.get(activePeek.databaseId) ?? null : null;
  const activeRecord = activePeek && peekDatabase
    ? peekDatabase.records.find((record) => record.id === activePeek.recordId) ?? null
    : null;

  useEffect(() => {
    if (!activePeek) return;
    const targetDatabase = catalogDatabaseMap.get(activePeek.databaseId);
    if (!targetDatabase?.records.some((record) => record.id === activePeek.recordId)) {
      setActivePeek(null);
    }
  }, [activePeek, catalogDatabaseMap]);

  async function refreshDatabase() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace-database", databaseId] }),
      queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] }),
    ]);
  }

  function getDatabaseModel(targetDatabaseId: string) {
    return catalogDatabaseMap.get(targetDatabaseId);
  }

  async function handleUpdateDatabaseName(name: string) {
    if (!bundle) return;
    const next = name.trim();
    if (!next || next === bundle.database.name) return;
    try {
      await updateWorkspaceDatabase(bundle.database.id, { name: next });
      await refreshDatabase();
    } catch (err) {
      toastError("Rename failed", err);
    }
  }

  async function handleCreateRecord(
    targetDatabaseId = databaseId,
    seed?: Record<string, WorkspaceDatabaseFieldValue>,
  ) {
    const targetDatabase = getDatabaseModel(targetDatabaseId);
    if (!targetDatabase) return null;
    try {
      const titleField = targetDatabase.schema.find((field) => field.type === "text");
      const statusField = targetDatabase.schema.find((field) => field.type === "status");
      const record = await createWorkspaceRecord({
        databaseId: targetDatabaseId,
        fields: {
          ...(titleField ? { [titleField.id]: `Untitled ${targetDatabase.records.length + 1}` } : {}),
          ...(statusField && statusField.options?.[0] ? { [statusField.id]: statusField.options[0] } : {}),
          ...(seed ?? {}),
        },
      });
      await refreshDatabase();
      setActivePeek({ databaseId: targetDatabaseId, recordId: record.id });
      toast.success("Record created");
      return record.id;
    } catch (err) {
      toastError("Record creation failed", err);
      return null;
    }
  }

  async function handleUpdateRecordField(recordId: string, fieldId: string, value: unknown) {
    try {
      await updateWorkspaceRecord(recordId, { fieldId, value: value as never });
      await refreshDatabase();
    } catch (err) {
      toastError("Record update failed", err);
    }
  }

  async function handleUpdateRecordBody(recordId: string, body: string | null) {
    try {
      await updateWorkspaceRecord(recordId, { body });
      await refreshDatabase();
    } catch (err) {
      toastError("Record body update failed", err);
    }
  }

  async function handleDeleteRecord(targetDatabaseId: string, recordId: string) {
    try {
      await deleteWorkspaceRecord(recordId);
      setActivePeek((current) =>
        current && current.databaseId === targetDatabaseId && current.recordId === recordId ? null : current,
      );
      await refreshDatabase();
      toast.success("Record deleted");
    } catch (err) {
      toastError("Record deletion failed", err);
    }
  }

  async function handleDeleteRecords(recordIds: string[]) {
    try {
      await Promise.all(recordIds.map((recordId) => deleteWorkspaceRecord(recordId)));
      setActivePeek((current) => (current && recordIds.includes(current.recordId) ? null : current));
      await refreshDatabase();
      toast.success(`${recordIds.length} records deleted`);
    } catch (err) {
      toastError("Bulk delete failed", err);
    }
  }

  async function handleDuplicateRecords(targetDatabaseId: string, recordIds: string[]) {
    const targetDatabase = getDatabaseModel(targetDatabaseId);
    if (!targetDatabase) return;
    try {
      await Promise.all(
        recordIds.map((recordId) => {
          const sourceRecord = targetDatabase.records.find((record) => record.id === recordId);
          if (!sourceRecord) return Promise.resolve();
          return createWorkspaceRecord({
            databaseId: targetDatabaseId,
            fields: Object.fromEntries(
              Object.entries(sourceRecord).filter(([key]) => !key.startsWith("_") && key !== "id"),
            ),
            body: sourceRecord._body ?? null,
          });
        }),
      );
      await refreshDatabase();
      toast.success(`${recordIds.length} records duplicated`);
    } catch (err) {
      toastError("Bulk duplicate failed", err);
    }
  }

  async function handleDuplicateRecord(targetDatabaseId: string, recordId: string) {
    const targetDatabase = getDatabaseModel(targetDatabaseId);
    const sourceRecord = targetDatabase?.records.find((record) => record.id === recordId);
    if (!targetDatabase || !sourceRecord) return;
    try {
      const duplicated = await createWorkspaceRecord({
        databaseId: targetDatabaseId,
        fields: Object.fromEntries(
          Object.entries(sourceRecord).filter(([key]) => !key.startsWith("_") && key !== "id"),
        ),
        body: sourceRecord._body ?? null,
      });
      await refreshDatabase();
      setActivePeek({ databaseId: targetDatabaseId, recordId: duplicated.id });
      toast.success("Record duplicated");
    } catch (err) {
      toastError("Duplicate failed", err);
    }
  }

  async function handleUpdateRelation(targetDatabaseId: string, recordId: string, fieldId: string, recordIds: string[]) {
    try {
      await updateWorkspaceRelationLinks({ databaseId: targetDatabaseId, recordId, relationFieldId: fieldId, recordIds });
      await refreshDatabase();
    } catch (err) {
      toastError("Relation update failed", err);
    }
  }

  async function handleCreateView(type: WorkspaceDatabaseViewType = activeView?.type ?? "table") {
    if (!activeView || !database) return;
    const defaultGroupField = findDefaultKanbanField(database);
    const defaultDateField = findDefaultDateField(database);
    const nextName = `${VIEW_LABELS[type]} ${(bundle?.views.length ?? 0) + 1}`;
    try {
      const created = await createWorkspaceView({
        databaseId,
        name: nextName,
        type,
        config: {
          ...toViewConfig(activeView),
          groupBy:
            type === "kanban"
              ? activeView.groupBy ?? defaultGroupField?.id
              : type === "calendar"
                ? activeView.groupBy ?? defaultDateField?.id
                : activeView.groupBy,
        },
      });
      setActiveViewId(created.id);
      await refreshDatabase();
      toast.success("View created");
    } catch (err) {
      toastError("View creation failed", err);
    }
  }

  async function handleDeleteView(viewId: string) {
    if (!database || database.views.length <= 1) return;
    try {
      await deleteWorkspaceView(viewId);
      if (activeViewId === viewId) {
        const remaining = database.views.filter((v) => v.id !== viewId);
        setActiveViewId(remaining[0]?.id ?? null);
      }
      await refreshDatabase();
      toast.success("View deleted");
    } catch (err) {
      toastError("View deletion failed", err);
    }
  }

  async function handleRenameView(viewId: string, name: string) {
    try {
      await updateWorkspaceView(viewId, { name });
      await refreshDatabase();
    } catch (err) {
      toastError("View rename failed", err);
    }
  }

  async function handleUpdateViewConfig(input: Partial<WorkspaceDatabaseViewConfig>) {
    if (!activeView) return;
    try {
      await updateWorkspaceView(activeView.id, {
        config: { ...toViewConfig(activeView), ...input },
      });
      await queryClient.invalidateQueries({ queryKey: ["workspace-database", databaseId] });
    } catch (err) {
      toastError("View update failed", err);
    }
  }

  async function handleSaveSchema(
    schema: WorkspaceDatabaseModel["schema"],
    nextRecords?: WorkspaceDatabaseModel["records"],
  ) {
    if (!bundle || !database) return;
    try {
      await updateWorkspaceDatabaseSchema(bundle.database.id, schema);
      if (nextRecords && nextRecords.length) {
        const fieldIds = schema.map((candidate) => candidate.id);
        const updates: Array<Promise<unknown>> = [];
        for (const record of nextRecords) {
          const previous = database.records.find((candidate) => candidate.id === record.id);
          if (!previous) continue;
          for (const fieldId of fieldIds) {
            if (previous[fieldId] !== record[fieldId]) {
              updates.push(
                updateWorkspaceRecord(record.id, {
                  fieldId,
                  value: record[fieldId] as never,
                }),
              );
            }
          }
        }
        if (updates.length) await Promise.all(updates);
      }
      await refreshDatabase();
    } catch (err) {
      toastError("Schema update failed", err);
    }
  }

  async function handleSaveHeaderFields(targetDatabaseId: string, fieldIds: string[]) {
    try {
      await updateWorkspaceDatabaseHeaderFields(targetDatabaseId, fieldIds);
      await refreshDatabase();
    } catch (err) {
      toastError("Header field update failed", err);
    }
  }

  async function handleCsvImport(event: React.ChangeEvent<HTMLInputElement>) {
    if (!bundle || !database) return;
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setIsImportingCsv(true);
      const csvText = await file.text();
      const imported = prepareCsvImport(database, csvText);
      if (imported.records.length === 0) { toast.info("No rows imported"); return; }
      await createWorkspaceRecords(
        imported.records.map((r) => ({ databaseId: bundle.database.id, fields: r.fields })),
      );
      await refreshDatabase();
      const notices: string[] = [];
      if (imported.skippedRows > 0) notices.push(`${imported.skippedRows} blank row${imported.skippedRows === 1 ? "" : "s"} skipped`);
      if (imported.readOnlyHeaders.length > 0) notices.push(`read-only columns ignored: ${imported.readOnlyHeaders.join(", ")}`);
      if (imported.ignoredHeaders.length > 0) notices.push(`unmatched columns ignored: ${imported.ignoredHeaders.join(", ")}`);
      toast.success(`Imported ${imported.records.length} rows`, {
        description: notices.length ? notices.join(" • ") : undefined,
      });
    } catch (err) {
      toastError("CSV import failed", err);
    } finally {
      if (csvInputRef.current) csvInputRef.current.value = "";
      setIsImportingCsv(false);
    }
  }

  async function handleCsvExport() {
    if (!bundle || !database) return;
    try {
      const csv = exportDatabaseCsv(database, catalog);
      const slug = bundle.database.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "database";
      const relative = `exports/${slug}-${Date.now()}.csv`;
      await writeVaultFile(relative, csv, "vault");
      const absolute = await getVaultAbsolutePath(relative, "vault");
      toast.success(`Exported to vault/${relative}`, {
        action: {
          label: "Reveal",
          onClick: () => {
            void dirname(absolute).then((dir) => openPath(dir));
          },
        },
      });
    } catch (err) {
      toastError("CSV export failed", err);
    }
  }

  function handleOpenSchema() {
    setSchemaOpen(true);
    setActivePeek(null);
  }

  function handleOpenRecord(recordId: string) {
    setActivePeek({ databaseId, recordId });
    setSchemaOpen(false);
  }

  function handleOpenNestedRecord(targetDatabaseId: string, recordId: string) {
    setActivePeek({ databaseId: targetDatabaseId, recordId });
    setSchemaOpen(false);
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-[var(--subtext-0)]">
        Loading database…
      </div>
    );
  }

  if (error || !bundle || !database || !activeView) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md text-center">
          <div className="text-[18px] font-semibold text-[var(--text)]">Database unavailable</div>
          <div className="mt-2 text-[13px] text-[var(--subtext-0)]">
            {error instanceof Error ? error.message : "The selected database could not be loaded."}
          </div>
          <Button className="mt-4" variant="secondary" onClick={() => navigate("/databases")}>
            Back to databases
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--base)]">
      {/* Hidden CSV input */}
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleCsvImport}
      />

      {/* Database header */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--base)] px-8 pb-0 pt-4">
        {/* Breadcrumb */}
        <div className="mb-2.5 flex items-center gap-1">
          <Link
            to="/databases"
            className="flex items-center gap-0.5 text-[11px] text-[var(--overlay-1)] transition-colors hover:text-[var(--text)]"
          >
            <ChevronLeft className="h-3 w-3" />
            Databases
          </Link>
          <ChevronRight className="h-3 w-3 text-[var(--overlay-0)]" />
          <span className="text-[11px] text-[var(--subtext-0)]">{bundle.database.name}</span>
        </div>

        {/* Title */}
        <Input
          key={bundle.database.id}
          defaultValue={bundle.database.name}
          onBlur={(e) => handleUpdateDatabaseName(e.target.value)}
          className="mb-3 h-auto border-transparent bg-transparent px-0 text-[24px] font-bold tracking-[-0.04em] shadow-none focus:border-transparent focus:shadow-none placeholder:text-[var(--overlay-1)]"
        />

        {/* View tab bar */}
        <ViewTabBar
          views={database.views}
          activeView={activeView}
          database={database}
          onSwitchView={setActiveViewId}
          onCreateView={handleCreateView}
          onDeleteView={handleDeleteView}
          onRenameView={handleRenameView}
          onUpdateViewConfig={handleUpdateViewConfig}
          onCreateRecord={() => handleCreateRecord()}
          onOpenSchema={handleOpenSchema}
          onImportCsv={() => csvInputRef.current?.click()}
          onExportCsv={handleCsvExport}
          isImportingCsv={isImportingCsv}
        />
      </div>

      {/* Content */}
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-hidden">
          {activeView.type === "list" ? (
            <DatabaseListView
              database={database}
              view={activeView}
              catalog={catalog}
              activeRecordId={activeRecordId}
              onOpenRecord={handleOpenRecord}
              onUpdateView={handleUpdateViewConfig}
            />
          ) : activeView.type === "kanban" ? (
            <DatabaseKanbanView
              database={database}
              view={activeView}
              catalog={catalog}
              activeRecordId={activeRecordId}
              onOpenRecord={handleOpenRecord}
              onCreateRecord={(seed) => void handleCreateRecord(database.id, seed)}
              onUpdateField={handleUpdateRecordField}
              onDuplicateRecord={(recordId) => void handleDuplicateRecord(database.id, recordId)}
              onDeleteRecord={(recordId) => void handleDeleteRecord(database.id, recordId)}
            />
          ) : activeView.type === "gallery" ? (
            <DatabaseGalleryView
              database={database}
              view={activeView}
              catalog={catalog}
              activeRecordId={activeRecordId}
              onOpenRecord={handleOpenRecord}
              onUpdateField={handleUpdateRecordField}
            />
          ) : activeView.type === "calendar" ? (
            <DatabaseCalendarView
              database={database}
              view={activeView}
              catalog={catalog}
              activeRecordId={activeRecordId}
              onOpenRecord={handleOpenRecord}
              onCreateRecord={() => void handleCreateRecord()}
            />
          ) : (
            <DatabaseTableView
              database={database}
              view={activeView}
              catalog={catalog}
              activeRecordId={activeRecordId}
              onOpenRecord={handleOpenRecord}
              onUpdateField={handleUpdateRecordField}
              onUpdateView={handleUpdateViewConfig}
              onSaveSchema={handleSaveSchema}
              onOpenSchema={handleOpenSchema}
              onCreateRecord={() => void handleCreateRecord()}
              onDuplicateRecord={(recordId) => void handleDuplicateRecord(database.id, recordId)}
              onDeleteRecord={(recordId) => void handleDeleteRecord(database.id, recordId)}
              onDeleteRecords={(recordIds) => void handleDeleteRecords(recordIds)}
              onDuplicateRecords={(recordIds) => void handleDuplicateRecords(database.id, recordIds)}
            />
          )}
        </div>

        <DatabaseSchemaEditor
          open={schemaOpen}
          database={database}
          catalog={catalog}
          onClose={() => setSchemaOpen(false)}
          onSave={handleSaveSchema}
          onSaveHeaderFields={(fieldIds) => void handleSaveHeaderFields(database.id, fieldIds)}
        />

        <DatabasePeekPanel
          key={activeRecord?.id ?? "empty"}
          database={peekDatabase ?? database}
          record={activeRecord}
          catalog={catalog}
          onClose={() => setActivePeek(null)}
          onDelete={handleDeleteRecord}
          onDuplicate={handleDuplicateRecord}
          onOpenRecord={handleOpenNestedRecord}
          onUpdateField={handleUpdateRecordField}
          onUpdateBody={handleUpdateRecordBody}
          onUpdateRelation={handleUpdateRelation}
          onCreateRecord={handleCreateRecord}
          onSaveHeaderFields={handleSaveHeaderFields}
        />
      </div>
    </div>
  );
}

const VIEW_LABELS: Record<WorkspaceDatabaseViewType, string> = {
  table: "Table",
  kanban: "Board",
  list: "List",
  gallery: "Gallery",
  calendar: "Calendar",
};
