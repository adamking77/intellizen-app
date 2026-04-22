import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { DatabaseCalendarView } from "@/components/database/DatabaseCalendarView";
import { DatabaseChartView } from "@/components/database/DatabaseChartView";
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
  findDefaultChartGroupField,
  findDefaultChartValueField,
  findDefaultDateField,
  findDefaultKanbanField,
  prepareCsvImport,
} from "@/lib/database-core";
import {
  loadDatabaseDashboardPins,
  saveDatabaseDashboardPins,
  supportsPinnedDashboardView,
  upsertDatabaseDashboardPin,
} from "@/lib/database-dashboard";
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
  isOperationalSystemWorkspaceIcon,
  listWorkspaceDatabaseCatalog,
  updateWorkspaceDatabase,
  updateWorkspaceDatabaseHeaderFields,
  updateWorkspaceDatabaseSchema,
  updateWorkspaceRecord,
  updateWorkspaceRelationLinks,
  updateWorkspaceView,
} from "@/lib/data";
import type {
  WorkspaceDatabaseBundle,
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
  WorkspaceDatabaseSchemaSaveOptions,
  WorkspaceDatabaseSummary,
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
    listPropertyWidth: view.listPropertyWidth,
    cardCoverField: view.cardCoverField,
    cardFields: view.cardFields,
    chartType: view.chartType,
    chartValueField: view.chartValueField,
    chartAggregation: view.chartAggregation,
    chartShowLegend: view.chartShowLegend,
    chartShowGrid: view.chartShowGrid,
    chartPalette: view.chartPalette,
    chartRange: view.chartRange,
  };
}

export function DatabaseEditorView() {
  const params = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const databaseId = params.id ?? "";

  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [activePeek, setActivePeek] = useState<{ databaseId: string; recordId: string } | null>(null);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

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
  const { data: catalogData = [] } = useQuery({
    queryKey: ["workspace-database-catalog"],
    queryFn: listWorkspaceDatabaseCatalog,
    enabled: Boolean(database),
  });
  const catalog = useMemo(
    () =>
      catalogData.length > 0
        ? catalogData
        : database
          ? [{
              id: database.id,
              name: database.name,
              schema: database.schema,
              headerFieldIds: database.headerFieldIds ?? [],
              records: database.records,
              views: database.views,
            }]
          : [],
    [catalogData, database],
  );
  const isSystemDatabase = isOperationalSystemWorkspaceIcon(bundle?.database.icon);

  useEffect(() => {
    if (!database?.views.length) {
      setActiveViewId(null);
      return;
    }
    const requestedViewId = searchParams.get("view");
    setActiveViewId((current) =>
      requestedViewId && database.views.some((v) => v.id === requestedViewId)
        ? requestedViewId
        : current && database.views.some((v) => v.id === current)
          ? current
          : database.views[0].id,
    );
  }, [database, searchParams]);

  useEffect(() => {
    if (!activeViewId) return;
    if (searchParams.get("view") === activeViewId) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("view", activeViewId);
      return next;
    }, { replace: true });
  }, [activeViewId, searchParams, setSearchParams]);

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
        views: entry.views,
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

  function getBundleSnapshot() {
    return queryClient.getQueryData<WorkspaceDatabaseBundle>(["workspace-database", databaseId]);
  }

  function getCatalogSnapshot() {
    return queryClient.getQueryData<WorkspaceDatabaseCatalogEntry[]>(["workspace-database-catalog"]);
  }

  function getDatabaseListSnapshot() {
    return queryClient.getQueryData<WorkspaceDatabaseSummary[]>(["workspace-databases"]);
  }

  function restoreSnapshots(snapshot: {
    bundle?: WorkspaceDatabaseBundle;
    catalog?: WorkspaceDatabaseCatalogEntry[];
    databases?: WorkspaceDatabaseSummary[];
  }) {
    if (snapshot.bundle) {
      queryClient.setQueryData(["workspace-database", databaseId], snapshot.bundle);
    }
    if (snapshot.catalog) {
      queryClient.setQueryData(["workspace-database-catalog"], snapshot.catalog);
    }
    if (snapshot.databases) {
      queryClient.setQueryData(["workspace-databases"], snapshot.databases);
    }
  }

  function patchBundle(updater: (bundle: WorkspaceDatabaseBundle) => WorkspaceDatabaseBundle) {
    queryClient.setQueryData<WorkspaceDatabaseBundle>(["workspace-database", databaseId], (current) =>
      current ? updater(current) : current,
    );
  }

  function patchCatalog(
    updater: (catalogEntries: WorkspaceDatabaseCatalogEntry[]) => WorkspaceDatabaseCatalogEntry[],
  ) {
    queryClient.setQueryData<WorkspaceDatabaseCatalogEntry[]>(["workspace-database-catalog"], (current) =>
      current ? updater(current) : current,
    );
  }

  function patchDatabaseList(
    updater: (entries: WorkspaceDatabaseSummary[]) => WorkspaceDatabaseSummary[],
  ) {
    queryClient.setQueryData<WorkspaceDatabaseSummary[]>(["workspace-databases"], (current) =>
      current ? updater(current) : current,
    );
  }

  function patchDatabaseSchemaState(
    targetDatabaseId: string,
    schema: WorkspaceDatabaseModel["schema"],
    nextRecords?: WorkspaceDatabaseModel["records"],
  ) {
    if (targetDatabaseId === databaseId) {
      patchBundle((current) => ({
        ...current,
        database: { ...current.database, schema },
        model: {
          ...current.model,
          schema,
          records: nextRecords ?? current.model.records,
        },
      }));
    }

    patchCatalog((entries) =>
      entries.map((entry) =>
        entry.id === targetDatabaseId
          ? {
              ...entry,
              schema,
              records: nextRecords ?? entry.records,
            }
          : entry,
      ),
    );

    patchDatabaseList((entries) =>
      entries.map((entry) => (entry.id === targetDatabaseId ? { ...entry, schema } : entry)),
    );
  }

  function findRecordDatabaseId(recordId: string) {
    for (const [candidateDatabaseId, candidateDatabase] of catalogDatabaseMap.entries()) {
      if (candidateDatabase.records.some((record) => record.id === recordId)) {
        return candidateDatabaseId;
      }
    }
    return databaseId;
  }

  function getDatabaseModel(targetDatabaseId: string) {
    return catalogDatabaseMap.get(targetDatabaseId);
  }

  async function handleUpdateDatabaseName(name: string) {
    if (!bundle) return;
    const next = name.trim();
    if (!next || next === bundle.database.name) return;
    const snapshot = {
      bundle: getBundleSnapshot(),
      catalog: getCatalogSnapshot(),
      databases: getDatabaseListSnapshot(),
    };
    patchBundle((current) => ({
      ...current,
      database: { ...current.database, name: next },
      model: { ...current.model, name: next },
    }));
    patchCatalog((entries) =>
      entries.map((entry) => (entry.id === bundle.database.id ? { ...entry, name: next } : entry)),
    );
    patchDatabaseList((entries) =>
      entries.map((entry) => (entry.id === bundle.database.id ? { ...entry, name: next } : entry)),
    );
    try {
      await updateWorkspaceDatabase(bundle.database.id, { name: next });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-database", databaseId] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-databases"] }),
      ]);
    } catch (err) {
      restoreSnapshots(snapshot);
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
    const targetDatabaseId = findRecordDatabaseId(recordId);
    const snapshot = {
      bundle: getBundleSnapshot(),
      catalog: getCatalogSnapshot(),
    };
    patchBundle((current) => ({
      ...current,
      records: current.records.map((record) =>
        record.id === recordId ? { ...record, fields: { ...record.fields, [fieldId]: value as never } } : record,
      ),
      model: {
        ...current.model,
        records: current.model.records.map((record) =>
          record.id === recordId ? { ...record, [fieldId]: value as WorkspaceDatabaseFieldValue } : record,
        ),
      },
    }));
    patchCatalog((entries) =>
      entries.map((entry) =>
        entry.id === targetDatabaseId
          ? {
              ...entry,
              records: entry.records.map((record) =>
                record.id === recordId ? { ...record, [fieldId]: value as WorkspaceDatabaseFieldValue } : record,
              ),
            }
          : entry,
      ),
    );
    try {
      await updateWorkspaceRecord(recordId, { fieldId, value: value as never });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-database", databaseId] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] }),
      ]);
    } catch (err) {
      restoreSnapshots(snapshot);
      toastError("Record update failed", err);
    }
  }

  async function handleUpdateRecordBody(recordId: string, body: string | null) {
    const targetDatabaseId = findRecordDatabaseId(recordId);
    const snapshot = {
      bundle: getBundleSnapshot(),
      catalog: getCatalogSnapshot(),
    };
    patchBundle((current) => ({
      ...current,
      records: current.records.map((record) =>
        record.id === recordId ? { ...record, body } : record,
      ),
      model: {
        ...current.model,
        records: current.model.records.map((record) =>
          record.id === recordId ? { ...record, _body: body ?? undefined } : record,
        ),
      },
    }));
    patchCatalog((entries) =>
      entries.map((entry) =>
        entry.id === targetDatabaseId
          ? {
              ...entry,
              records: entry.records.map((record) =>
                record.id === recordId ? { ...record, _body: body ?? undefined } : record,
              ),
            }
          : entry,
      ),
    );
    try {
      await updateWorkspaceRecord(recordId, { body });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-database", databaseId] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] }),
      ]);
    } catch (err) {
      restoreSnapshots(snapshot);
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
    const snapshot = {
      bundle: getBundleSnapshot(),
      catalog: getCatalogSnapshot(),
    };
    patchBundle((current) => ({
      ...current,
      records: current.records.map((record) =>
        record.id === recordId ? { ...record, fields: { ...record.fields, [fieldId]: recordIds as never } } : record,
      ),
      model: {
        ...current.model,
        records: current.model.records.map((record) =>
          record.id === recordId ? { ...record, [fieldId]: recordIds } : record,
        ),
      },
    }));
    patchCatalog((entries) =>
      entries.map((entry) =>
        entry.id === targetDatabaseId
          ? {
              ...entry,
              records: entry.records.map((record) =>
                record.id === recordId ? { ...record, [fieldId]: recordIds } : record,
              ),
            }
          : entry,
      ),
    );
    try {
      await updateWorkspaceRelationLinks({ databaseId: targetDatabaseId, recordId, relationFieldId: fieldId, recordIds });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-database", databaseId] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] }),
      ]);
    } catch (err) {
      restoreSnapshots(snapshot);
      toastError("Relation update failed", err);
    }
  }

  async function handleCreateView(type: WorkspaceDatabaseViewType = activeView?.type ?? "table") {
    if (!activeView || !database) return;
    const defaultGroupField = findDefaultKanbanField(database);
    const defaultDateField = findDefaultDateField(database);
    const defaultChartType = activeView.type === "chart" ? activeView.chartType ?? "bar" : "bar";
    const defaultChartGroupField = findDefaultChartGroupField(database, defaultChartType);
    const defaultChartValueField = findDefaultChartValueField(database);
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
                : type === "chart"
                  ? activeView.groupBy ?? defaultChartGroupField?.id
                  : undefined,
          chartType: type === "chart" ? defaultChartType : activeView.chartType,
          chartValueField:
            type === "chart" ? activeView.chartValueField ?? defaultChartValueField?.id : activeView.chartValueField,
          chartAggregation:
            type === "chart" ? activeView.chartAggregation ?? "count" : activeView.chartAggregation,
          chartShowLegend: type === "chart" ? activeView.chartShowLegend ?? true : activeView.chartShowLegend,
          chartShowGrid: type === "chart" ? activeView.chartShowGrid ?? true : activeView.chartShowGrid,
          chartPalette: type === "chart" ? activeView.chartPalette ?? "blue" : activeView.chartPalette,
          chartRange: type === "chart" ? activeView.chartRange ?? "90d" : activeView.chartRange,
        },
      });
      setActiveViewId(created.id);
      await refreshDatabase();
      toast.success("View created");
    } catch (err) {
      toastError("View creation failed", err);
    }
  }

  function handlePinActiveViewToDashboard() {
    if (!database || !activeView) return;
    if (!supportsPinnedDashboardView(activeView.type)) {
      toast.error("Dashboard currently supports pinned chart, table, and list views.");
      return;
    }
    const result = upsertDatabaseDashboardPin(loadDatabaseDashboardPins(), {
      databaseId: database.id,
      viewId: activeView.id,
    });
    saveDatabaseDashboardPins(result.pins);
    if (result.added) {
      toast.success("View pinned to dashboard");
    } else {
      toast.info("View is already pinned to dashboard");
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
    const snapshot = { bundle: getBundleSnapshot() };
    patchBundle((current) => ({
      ...current,
      views: current.views.map((view) => (view.id === viewId ? { ...view, name } : view)),
      model: {
        ...current.model,
        views: current.model.views.map((view) => (view.id === viewId ? { ...view, name } : view)),
      },
    }));
    try {
      await updateWorkspaceView(viewId, { name });
      await queryClient.invalidateQueries({ queryKey: ["workspace-database", databaseId] });
    } catch (err) {
      restoreSnapshots(snapshot);
      toastError("View rename failed", err);
    }
  }

  async function handleReorderViews(viewIds: string[]) {
    if (!bundle || !database || viewIds.length !== database.views.length) return;
    const snapshot = {
      bundle: getBundleSnapshot(),
      catalog: getCatalogSnapshot(),
    };

    const order = new Map(viewIds.map((id, index) => [id, index]));
    const sortByOrder = <T extends { id: string }>(items: T[]) =>
      [...items].sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));

    patchBundle((current) => ({
      ...current,
      views: sortByOrder(
        current.views.map((view) => ({
          ...view,
          position: order.get(view.id) ?? view.position,
        })),
      ),
      model: {
        ...current.model,
        views: sortByOrder(current.model.views),
      },
    }));

    patchCatalog((entries) =>
      entries.map((entry) =>
        entry.id === databaseId
          ? {
              ...entry,
              views: sortByOrder(entry.views),
            }
          : entry,
      ),
    );

    try {
      await Promise.all(viewIds.map((viewId, index) => updateWorkspaceView(viewId, { position: index })));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-database", databaseId] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] }),
      ]);
    } catch (err) {
      restoreSnapshots(snapshot);
      toastError("View reorder failed", err);
    }
  }

  async function handleUpdateViewConfig(input: Partial<WorkspaceDatabaseViewConfig>) {
    if (!activeView) return;
    const snapshot = { bundle: getBundleSnapshot() };
    patchBundle((current) => ({
      ...current,
      views: current.views.map((view) =>
        view.id === activeView.id ? { ...view, ...input } : view,
      ),
      model: {
        ...current.model,
        views: current.model.views.map((view) =>
          view.id === activeView.id ? { ...view, ...input } : view,
        ),
      },
    }));
    try {
      await updateWorkspaceView(activeView.id, {
        config: { ...toViewConfig(activeView), ...input },
      });
      await queryClient.invalidateQueries({ queryKey: ["workspace-database", databaseId] });
    } catch (err) {
      restoreSnapshots(snapshot);
      toastError("View update failed", err);
    }
  }

  async function handleUpdateViewConfigForDatabase(
    targetDatabaseId: string,
    viewId: string,
    input: Partial<WorkspaceDatabaseViewConfig>,
  ) {
    if (targetDatabaseId === databaseId && activeView?.id === viewId) {
      await handleUpdateViewConfig(input);
      return;
    }
    const targetDatabase = getDatabaseModel(targetDatabaseId);
    const targetView = targetDatabase?.views.find((view) => view.id === viewId);
    if (!targetView) return;
    try {
      await updateWorkspaceView(viewId, {
        config: { ...toViewConfig(targetView), ...input },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-database", targetDatabaseId] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] }),
      ]);
    } catch (err) {
      toastError("View update failed", err);
    }
  }

  async function handleSaveSchema(
    schema: WorkspaceDatabaseModel["schema"],
    nextRecords?: WorkspaceDatabaseModel["records"],
    options?: WorkspaceDatabaseSchemaSaveOptions,
  ) {
    if (!bundle || !database) return;
    const snapshot = {
      bundle: getBundleSnapshot(),
      catalog: getCatalogSnapshot(),
      databases: getDatabaseListSnapshot(),
    };
    patchDatabaseSchemaState(bundle.database.id, schema, nextRecords);
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
      if (!options?.silent) {
        toast.success("Schema saved");
      }
    } catch (err) {
      restoreSnapshots(snapshot);
      toastError("Schema update failed", err);
    }
  }

  async function handleSaveSchemaForDatabase(
    targetDatabaseId: string,
    schema: WorkspaceDatabaseModel["schema"],
    nextRecords?: WorkspaceDatabaseModel["records"],
    options?: WorkspaceDatabaseSchemaSaveOptions,
  ) {
    if (targetDatabaseId === databaseId) {
      await handleSaveSchema(schema, nextRecords, options);
      return;
    }
    const targetDatabase = getDatabaseModel(targetDatabaseId);
    if (!targetDatabase) return;
    const snapshot = {
      bundle: getBundleSnapshot(),
      catalog: getCatalogSnapshot(),
      databases: getDatabaseListSnapshot(),
    };
    patchDatabaseSchemaState(targetDatabaseId, schema, nextRecords);
    try {
      await updateWorkspaceDatabaseSchema(targetDatabaseId, schema);
      if (nextRecords && nextRecords.length) {
        const fieldIds = schema.map((candidate) => candidate.id);
        const updates: Array<Promise<unknown>> = [];
        for (const record of nextRecords) {
          const previous = targetDatabase.records.find((candidate) => candidate.id === record.id);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-database", targetDatabaseId] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] }),
      ]);
      if (!options?.silent) {
        toast.success("Schema saved");
      }
    } catch (err) {
      restoreSnapshots(snapshot);
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
    if (isSystemDatabase) return;
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
      <div className="shrink-0 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--base)_94%,black_6%)] px-6 pb-4 pt-5">
        {/* Breadcrumb */}
        <div className="mb-3 flex items-center gap-1.5">
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
          onBlur={(e) => {
            if (isSystemDatabase) return;
            void handleUpdateDatabaseName(e.target.value);
          }}
          disabled={isSystemDatabase}
          className="mb-4 h-auto border-transparent bg-transparent px-0 text-[22px] font-semibold tracking-[-0.03em] shadow-none focus:border-transparent focus:shadow-none placeholder:text-[var(--overlay-1)]"
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
          onReorderViews={handleReorderViews}
          onUpdateViewConfig={handleUpdateViewConfig}
          onCreateRecord={() => handleCreateRecord()}
          onOpenSchema={isSystemDatabase ? () => {} : handleOpenSchema}
          onImportCsv={isSystemDatabase ? () => {} : () => csvInputRef.current?.click()}
          onExportCsv={handleCsvExport}
          onPinToDashboard={handlePinActiveViewToDashboard}
          isImportingCsv={isImportingCsv}
        />
      </div>

      {/* Content */}
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-hidden px-6 pb-6 pt-5">
          <div className="flex h-full min-h-0 flex-col">
            {activeView.type === "list" ? (
              <DatabaseListView
                database={database}
                view={activeView}
                catalog={catalog}
                activeRecordId={activeRecordId}
                onOpenRecord={handleOpenRecord}
                onCreateRecord={() => void handleCreateRecord()}
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
                onCreateRecord={() => void handleCreateRecord()}
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
            ) : activeView.type === "chart" ? (
              <DatabaseChartView
                database={database}
                view={activeView}
                catalog={catalog}
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
                onOpenSchema={isSystemDatabase ? () => {} : handleOpenSchema}
                onCreateRecord={() => void handleCreateRecord()}
                onDuplicateRecord={(recordId) => void handleDuplicateRecord(database.id, recordId)}
                onDeleteRecord={(recordId) => void handleDeleteRecord(database.id, recordId)}
                onDeleteRecords={(recordIds) => void handleDeleteRecords(recordIds)}
                onDuplicateRecords={(recordIds) => void handleDuplicateRecords(database.id, recordIds)}
              />
            )}
          </div>
        </div>

        <DatabaseSchemaEditor
          open={schemaOpen && !isSystemDatabase}
          database={database}
          activeView={activeView}
          catalog={catalog}
          onClose={() => setSchemaOpen(false)}
          onSave={handleSaveSchema}
          onSaveViewConfig={handleUpdateViewConfig}
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
          onUpdateViewConfig={handleUpdateViewConfigForDatabase}
          onSaveSchema={handleSaveSchemaForDatabase}
          onDeleteRecords={handleDeleteRecords}
          onDuplicateRecords={handleDuplicateRecords}
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
  chart: "Chart",
};
