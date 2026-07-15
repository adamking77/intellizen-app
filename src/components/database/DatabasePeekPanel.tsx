import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Copy,
  FileText,
  GitBranch,
  Maximize2,
  Minimize2,
  Play,
  RefreshCw,
  Route,
  Trash2,
  UserRound,
  X,
} from "lucide-react";

import { TaskRelationsSection } from "@/components/database/primitives/TaskRelationsSection";
import {
  RecordActivitySection,
  RecordBacklinksSection,
  RecordHistorySection,
} from "@/components/database/RecordInsightSections";
import { DatabaseRichTextEditor } from "@/components/database/primitives/DatabaseRichTextEditor";
import { TableCell } from "@/components/database/primitives/TableCell";
import { InlineEditor } from "@/components/database/primitives/InlineEditor";
import { Badge } from "@/components/database/primitives/Badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MarkdownBody } from "@/components/ui/markdown-body";
import {
  createRecordFromTemplate,
  GENZEN_WORKSPACE_DATABASE_IDS,
  listWorkflows,
  OPERATOR_ACTOR,
  requestWorkflowApproval,
  resolveWorkflowApproval,
  saveRecordAsTemplate,
  updateWorkflowRun,
} from "@/lib/data";
import { toast, toastError } from "@/lib/toast";
import { useStartWorkflow } from "@/lib/use-start-workflow";
import { useAppStore } from "@/store";
import { resolveFieldOptionColor, resolveRelationColor, resolveStatusColor } from "@/lib/database-colors";
import {
  getFieldDisplayValue,
  getFieldValue,
  getSuggestedHeaderFields,
  resolveRelationLabel,
} from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseField,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
  WorkspaceDatabaseSchemaSaveOptions,
  WorkspaceDatabaseViewConfig,
} from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

let lastPanelWidth = 560;

const WORKFLOW_RUN_FIELD_IDS = {
  name: "run_name",
  status: "run_status",
  workflow: "run_workflow",
  task: "run_task",
  bizOps: "run_biz_ops",
  entityScope: "run_entity_scope",
  ownerRole: "run_owner_role",
  actor: "run_actor",
  triggerSource: "run_trigger_source",
  currentStep: "run_current_step",
  sourceDocuments: "run_source_documents",
  sourceRecords: "run_source_records",
  context: "run_context",
  receipt: "run_receipt",
  startedAt: "run_started_at",
  completedAt: "run_completed_at",
} as const;

interface DatabasePeekPanelProps {
  database: WorkspaceDatabaseModel;
  record: WorkspaceDatabaseModel["records"][number] | null;
  catalog: WorkspaceDatabaseCatalogEntry[];
  headerFieldsLocked?: boolean;
  onClose: () => void;
  onDelete: (databaseId: string, recordId: string) => Promise<void> | void;
  onDuplicate: (databaseId: string, recordId: string) => Promise<void> | void;
  onOpenRecord: (databaseId: string, recordId: string) => void;
  onUpdateField: (recordId: string, fieldId: string, value: WorkspaceDatabaseFieldValue) => Promise<void> | void;
  onUpdateBody: (recordId: string, body: string | null) => Promise<void> | void;
  onUpdateRelation: (
    databaseId: string,
    recordId: string,
    fieldId: string,
    values: string[],
  ) => Promise<void> | void;
  onCreateRecord: (databaseId: string, seed?: Record<string, WorkspaceDatabaseFieldValue>) => Promise<string | null>;
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
  onDeleteRecords: (recordIds: string[]) => Promise<void> | void;
  onDuplicateRecords: (databaseId: string, recordIds: string[]) => Promise<void> | void;
  onSaveHeaderFields: (databaseId: string, fieldIds: string[]) => Promise<void> | void;
}

export function DatabasePeekPanel({
  database,
  record,
  catalog,
  headerFieldsLocked = false,
  onClose,
  onDelete,
  onDuplicate,
  onOpenRecord,
  onUpdateField,
  onUpdateBody,
  onUpdateRelation,
  onCreateRecord,
  onUpdateViewConfig,
  onSaveSchema,
  onDeleteRecords,
  onDuplicateRecords,
  onSaveHeaderFields,
}: DatabasePeekPanelProps) {
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [visible, setVisible] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [panelWidth, setPanelWidth] = useState(lastPanelWidth);
  const [fullPage, setFullPage] = useState(false);
  const [notesDraft, setNotesDraft] = useState(String(record?._body ?? ""));
  const [notesStatus, setNotesStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const [showHeaderPicker, setShowHeaderPicker] = useState(false);
  const [headerDragId, setHeaderDragId] = useState<string | null>(null);
  const [headerFieldIds, setHeaderFieldIds] = useState<string[]>([]);
  const [headerFieldOrder, setHeaderFieldOrder] = useState<string[]>([]);
  const [propertiesOpen, setPropertiesOpen] = useState(true);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
  const [isTemplateActionRunning, setIsTemplateActionRunning] = useState(false);
  const queryClient = useQueryClient();

  async function handleSaveAsTemplate() {
    if (!record || isTemplateActionRunning) return;
    try {
      setIsTemplateActionRunning(true);
      await saveRecordAsTemplate(record.id);
      await queryClient.invalidateQueries({ queryKey: ["workspace-database"] });
      toast.success("Template saved", { description: "A template copy of this record was created." });
    } catch (templateError) {
      toastError("Template save failed", templateError);
    } finally {
      setIsTemplateActionRunning(false);
    }
  }

  async function handleCreateFromTemplate() {
    if (!record || isTemplateActionRunning) return;
    try {
      setIsTemplateActionRunning(true);
      const created = await createRecordFromTemplate(record.id);
      await queryClient.invalidateQueries({ queryKey: ["workspace-database"] });
      toast.success("Record created from template");
      onOpenRecord(created.database_id, created.id);
    } catch (templateError) {
      toastError("Create from template failed", templateError);
    } finally {
      setIsTemplateActionRunning(false);
    }
  }
  const { isStartingWorkflow, start: startRecordWorkflow } = useStartWorkflow({
    onStarted: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-database", database.id] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-database-catalog"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-databases"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow-runs", "agent-panel", "active"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow-runs", "agent-panel", "approvals"] }),
        queryClient.invalidateQueries({ queryKey: ["workflows", "agent-panel", "active"] }),
      ]),
  });
  const lastSavedNotesRef = useRef(String(record?._body ?? ""));
  const notesSaveSeqRef = useRef(0);
  const headerPickerRef = useRef<HTMLDivElement | null>(null);
  const propertyRowRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  useEffect(() => {
    setNotesDraft(String(record?._body ?? ""));
    lastSavedNotesRef.current = String(record?._body ?? "");
    setNotesStatus("idle");
    setEditingFieldId(null);
  }, [record?.id]);

  useEffect(() => {
    if (!record || notesStatus !== "dirty") return;
    const handle = window.setTimeout(() => {
      const nextBody = notesDraft || null;
      const requestId = ++notesSaveSeqRef.current;
      setNotesStatus("saving");
      Promise.resolve(onUpdateBody(record.id, nextBody))
        .then(() => {
          if (notesSaveSeqRef.current !== requestId) return;
          lastSavedNotesRef.current = notesDraft;
          setNotesStatus("saved");
        })
        .catch(() => {
          if (notesSaveSeqRef.current !== requestId) return;
          setNotesStatus("error");
        });
    }, 500);
    return () => window.clearTimeout(handle);
  }, [notesDraft, notesStatus, onUpdateBody, record]);

  useEffect(() => {
    if (notesStatus !== "saved") return;
    const handle = window.setTimeout(() => setNotesStatus("idle"), 1200);
    return () => window.clearTimeout(handle);
  }, [notesStatus]);

  const animateClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") animateClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [animateClose]);

  useEffect(() => {
    if (!showHeaderPicker) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (headerPickerRef.current && !headerPickerRef.current.contains(target)) {
        setShowHeaderPicker(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [showHeaderPicker]);

  function handleChange(fieldId: string, value: string | number | boolean | string[] | null) {
    if (!record) return;
    void onUpdateField(record.id, fieldId, value);
  }

  function handleDelete() {
    if (!record) return;
    void onDelete(database.id, record.id);
    animateClose();
  }

  const titleField = database.schema.find((field) => field.type === "text");
  const titleValue = titleField ? String(record?.[titleField.id] ?? "") : "Untitled";
  useEffect(() => {
    setTitleDraft(titleValue);
  }, [record?.id, titleValue]);

  const bodyFields = useMemo(
    () => database.schema.filter((field) => field !== titleField),
    [database.schema, titleField],
  );
  const canStartRecordWorkflow = isWorkflowSourceDatabase(database.id);
  const workflowsQuery = useQuery({
    queryKey: ["workflows", "record-peek", "active", entityFilter],
    queryFn: () => listWorkflows({ entity: entityFilter, includeInactive: false, limit: 24 }),
    staleTime: 60_000,
    enabled: canStartRecordWorkflow,
  });
  const workflows = workflowsQuery.data ?? [];
  const selectedWorkflow = workflows.find((workflow) => workflow.workflow_id === selectedWorkflowId) ?? workflows[0] ?? null;
  const activeWorkflowId = selectedWorkflowId || selectedWorkflow?.workflow_id || "";

  const suggestedHeaderFields = useMemo(
    () => getSuggestedHeaderFields(database),
    [database],
  );

  const displayedHeaderFields = useMemo(() => {
    const selected = headerFieldIds
      .map((fieldId) => bodyFields.find((field) => field.id === fieldId))
      .filter((field): field is WorkspaceDatabaseField => Boolean(field));
    if (selected.length) return selected.slice(0, 5);
    return suggestedHeaderFields
      .map((fieldId) => bodyFields.find((field) => field.id === fieldId))
      .filter((field): field is WorkspaceDatabaseField => Boolean(field))
      .slice(0, 5);
  }, [bodyFields, headerFieldIds, suggestedHeaderFields]);

  const createdAtField = database.schema.find((field) => field.type === "createdAt");
  const editedAtField = database.schema.find((field) => field.type === "lastEditedAt");

  useEffect(() => {
    const allowed = new Set(bodyFields.map((field) => field.id));
    const configured = (database.headerFieldIds ?? []).filter((fieldId) => allowed.has(fieldId)).slice(0, 5);
    setHeaderFieldIds(configured);
    setHeaderFieldOrder([
      ...configured,
      ...bodyFields.map((field) => field.id).filter((fieldId) => !configured.includes(fieldId)),
    ]);
  }, [database.headerFieldIds, bodyFields]);

  function handlePanelResizeStart(event: React.MouseEvent<HTMLDivElement>) {
    if (fullPage) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = panelWidth;
    const min = 380;
    const max = Math.max(min, Math.floor(window.innerWidth * 0.92));
    const onMove = (moveEvent: MouseEvent) => {
      const next = Math.max(min, Math.min(max, startWidth + (startX - moveEvent.clientX)));
      lastPanelWidth = next;
      setPanelWidth(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function togglePanelWidth() {
    if (fullPage) return;
    const compactWidth = 440;
    const expandedWidth = Math.min(Math.floor(window.innerWidth * 0.72), 1040);
    const nextWidth = panelWidth < ((compactWidth + expandedWidth) / 2) ? expandedWidth : compactWidth;
    lastPanelWidth = nextWidth;
    setPanelWidth(nextWidth);
  }

  function updateNotes(nextNotes: string) {
    setNotesDraft(nextNotes);
    setNotesStatus(nextNotes === lastSavedNotesRef.current ? "idle" : "dirty");
  }

  function flushNotesSave() {
    if (!record || notesStatus !== "dirty") return;
    const nextBody = notesDraft || null;
    const requestId = ++notesSaveSeqRef.current;
    setNotesStatus("saving");
    Promise.resolve(onUpdateBody(record.id, nextBody))
      .then(() => {
        if (notesSaveSeqRef.current !== requestId) return;
        lastSavedNotesRef.current = notesDraft;
        setNotesStatus("saved");
      })
      .catch(() => {
        if (notesSaveSeqRef.current !== requestId) return;
        setNotesStatus("error");
      });
  }

  function persistHeaderFields(nextFieldIds: string[]) {
    if (headerFieldsLocked) return;
    void onSaveHeaderFields(database.id, nextFieldIds);
  }

  if (!record) return null;

  const isEditableField = (field: WorkspaceDatabaseField) =>
    field.type !== "createdAt"
    && field.type !== "lastEditedAt"
    && field.type !== "formula"
    && field.type !== "rollup";

  const renderRelationSection = (field: WorkspaceDatabaseField) => {
    const targetDatabase = resolveTargetDatabase(database, field, catalog);
    if (!targetDatabase) return null;
    return (
      <TaskRelationsSection
        key={field.id}
        sourceDatabaseId={database.id}
        sourceRecordId={record.id}
        fieldId={field.id}
        fieldName={field.name}
        targetDatabase={targetDatabase}
        relatedRecordIds={Array.isArray(record[field.id]) ? (record[field.id] as string[]) : []}
        catalog={catalog}
        onOpenRecord={onOpenRecord}
        onCreateRecord={onCreateRecord}
        onUpdateField={onUpdateField}
        onUpdateRelation={onUpdateRelation}
        onUpdateViewConfig={onUpdateViewConfig}
        onSaveSchema={onSaveSchema}
        onDeleteRecord={onDelete}
        onDeleteRecords={onDeleteRecords}
        onDuplicateRecord={onDuplicate}
        onDuplicateRecords={onDuplicateRecords}
      />
    );
  };

  async function handleStartRecordWorkflow() {
    if (!record || !canStartRecordWorkflow || !activeWorkflowId) return;
    await startRecordWorkflow({
      workflowId: activeWorkflowId,
      triggerSource: "ui",
      entityScope: selectedWorkflow?.entity ?? undefined,
      taskId: database.id === GENZEN_WORKSPACE_DATABASE_IDS.tasks ? record.id : undefined,
      bizOpsId: database.id === GENZEN_WORKSPACE_DATABASE_IDS.bizOps ? record.id : undefined,
      context: {
        route: typeof window === "undefined" ? null : `${window.location.pathname}${window.location.search}`,
        source: "database_peek_panel",
        record_database_id: database.id,
        record_id: record.id,
      },
    });
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{
          backgroundColor: visible ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0)",
          transition: "background-color 200ms ease-out",
        }}
        onClick={animateClose}
      />

      <div
        className={`db-record-panel fixed top-0 right-0 z-50 h-full flex flex-col transition-transform duration-200 ease-out ${fullPage ? "db-record-panel--fullpage" : ""}`}
        style={{
          width: fullPage ? "100vw" : `${panelWidth}px`,
          minWidth: fullPage ? undefined : "360px",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          boxShadow: visible ? undefined : "none",
        }}
      >
        {!fullPage && (
          <div
            className="db-record-resize-handle"
            onMouseDown={handlePanelResizeStart}
            title="Resize panel"
          />
        )}

        <div className="db-record-header flex-shrink-0">
          <div className="db-record-title-wrap">
            <input
              className="db-record-title-input"
              value={titleDraft}
              placeholder="Untitled"
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => {
                if (titleField && titleDraft !== titleValue) {
                  handleChange(titleField.id, titleDraft || null);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.currentTarget as HTMLInputElement).blur();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setTitleDraft(titleValue);
                }
              }}
            />
          </div>
          <div className="db-record-header-actions">
            <button type="button" className="db-icon-btn-plain" onClick={togglePanelWidth} title="Resize panel">
              <ArrowLeftRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="db-icon-btn-plain"
              onClick={() => setFullPage((v) => !v)}
              title={fullPage ? "Exit full page" : "Open as page"}
            >
              {fullPage ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              className="db-icon-btn-plain"
              onClick={() => { if (record) void onDuplicate(database.id, record.id); }}
              title="Duplicate record"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="db-icon-btn-plain db-icon-btn-plain-danger"
              onClick={() => setConfirmDelete(true)}
              title="Delete record"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button type="button" className="db-icon-btn-plain" onClick={animateClose} title="Close (Esc)">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {(createdAtField || editedAtField) && (
          <div className="db-record-meta">
            {createdAtField && <span className="db-record-meta-item">Created {formatDateTime(record._createdAt ?? null)}</span>}
            {editedAtField && <span className="db-record-meta-item">Edited {formatDateTime(record._updatedAt ?? null)}</span>}
          </div>
        )}

        <div className="db-record-body flex-1 overflow-y-auto">
          {displayedHeaderFields.length > 0 && (
            <div className="db-record-section db-record-key-section px-6 pt-4 pb-1 relative">
              <div className="db-record-section-head">
                <div className="db-record-section-title">Summary</div>
                <button
                  className="db-btn db-record-editor-btn db-record-key-config-btn text-[11px] opacity-65 hover:opacity-100"
                  onClick={() => {
                    if (headerFieldsLocked) return;
                    setShowHeaderPicker((v) => !v);
                  }}
                  disabled={headerFieldsLocked}
                >
                  Customize view
                </button>
              </div>
              <div className="db-record-key-props">
                {displayedHeaderFields.map((field) => (
                  <button
                    key={field.id}
                    type="button"
                    className="db-record-key-prop"
                    onClick={() => propertyRowRefs.current.get(field.id)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  >
                    <span className="db-record-key-label">{field.name}</span>
                    <div className="db-record-key-value">
                      <SummaryFieldValue field={field} record={record} database={database} catalog={catalog} />
                    </div>
                  </button>
                ))}
              </div>

              {showHeaderPicker && !headerFieldsLocked && (
                <div
                  ref={headerPickerRef}
                  className="db-dropdown-panel db-record-header-fields-panel absolute right-6 top-9 z-20 p-2 min-w-[240px]"
                >
                  <div className="db-record-header-fields-title text-xs font-medium mb-1">Pin properties to header</div>
                  <div className="db-record-header-fields-hint text-[11px] mb-2">Choose up to 5 and drag to reorder.</div>
                  <div className="db-record-header-fields-list max-h-[220px] overflow-y-auto space-y-0.5">
                    {headerFieldOrder.map((fieldId) => {
                      const field = bodyFields.find((candidate) => candidate.id === fieldId);
                      if (!field) return null;
                      const selected = headerFieldIds.includes(field.id);
                      return (
                        <label
                          key={field.id}
                          className="db-record-header-field-row flex items-center gap-1.5 text-xs rounded px-1.5 py-1 cursor-pointer"
                          draggable
                          onDragStart={() => setHeaderDragId(field.id)}
                          onDragEnd={() => setHeaderDragId(null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (!headerDragId || headerDragId === field.id) return;
                            setHeaderFieldOrder((prev) => {
                              const next = [...prev];
                              const from = next.indexOf(headerDragId);
                              const to = next.indexOf(field.id);
                              if (from < 0 || to < 0) return prev;
                              const [moved] = next.splice(from, 1);
                              next.splice(to, 0, moved);
                              const reorderedSelected = next.filter((id) => headerFieldIds.includes(id)).slice(0, 5);
                              setHeaderFieldIds(reorderedSelected);
                              persistHeaderFields(reorderedSelected);
                              return next;
                            });
                          }}
                        >
                          <span className="db-record-header-field-handle opacity-40">⋮⋮</span>
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={!selected && headerFieldIds.length >= 5}
                            onChange={(e) => {
                              const nextSelected = e.target.checked
                                ? headerFieldOrder.filter((id) => id === field.id || headerFieldIds.includes(id)).slice(0, 5)
                                : headerFieldIds.filter((id) => id !== field.id);
                              setHeaderFieldIds(nextSelected);
                              persistHeaderFields(nextSelected);
                            }}
                          />
                          <span className="db-record-header-field-name">{field.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="db-panel-add flex items-center justify-between mt-2">
                    <button
                      className="db-btn"
                      onClick={() => {
                        setHeaderFieldIds([]);
                        setHeaderFieldOrder(bodyFields.map((field) => field.id));
                        persistHeaderFields([]);
                      }}
                    >
                      Reset
                    </button>
                    <button className="db-btn" onClick={() => setShowHeaderPicker(false)}>
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {canStartRecordWorkflow && (
            <div className="db-record-section px-6 py-3">
              <div className="db-record-section-head">
                <div className="db-record-section-title mb-0">Start Workflow</div>
                <button
                  type="button"
                  className="db-btn"
                  onClick={() => void workflowsQuery.refetch()}
                  disabled={workflowsQuery.isFetching}
                  title="Refresh workflows"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${workflowsQuery.isFetching ? "animate-spin" : ""}`} />
                </button>
              </div>
              <div className="db-record-workflow-launcher">
                <select
                  className="db-select db-record-workflow-select"
                  value={activeWorkflowId}
                  disabled={workflowsQuery.isLoading || isStartingWorkflow || workflows.length === 0}
                  onChange={(event) => setSelectedWorkflowId(event.target.value)}
                >
                  {workflows.length === 0 ? (
                    <option value="">No active workflows</option>
                  ) : (
                    workflows.map((workflow) => (
                      <option key={workflow.workflow_id} value={workflow.workflow_id}>
                        {workflow.name}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  className="db-btn db-btn-primary db-record-workflow-start"
                  onClick={() => void handleStartRecordWorkflow()}
                  disabled={!activeWorkflowId || isStartingWorkflow || workflowsQuery.isLoading}
                >
                  {isStartingWorkflow ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Start
                </button>
              </div>
              {workflowsQuery.error && (
                <div className="db-record-workflow-error">Workflow templates could not load.</div>
              )}
            </div>
          )}

          {database.id === GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns && (
            <WorkflowRunOperationsSection record={record} catalog={catalog} />
          )}

          {database.schema
            .filter((field) => field.type === "relation" && isWorkflowRunsRelationField(field))
            .map(renderRelationSection)}

          {database.schema
            .filter((field) => {
              if (field.type !== "relation") return false;
              if (isWorkflowRunsRelationField(field)) return false;
              if (isStructuralHierarchyRelationField(field, database)) return false;
              const tid = field.relation?.targetDatabaseId;
              return !tid || tid === database.id;
            })
            .map(renderRelationSection)}

          <div className="db-record-section px-6 py-3">
            <details
              className="db-record-properties-details"
              open={propertiesOpen}
              onToggle={(event) => setPropertiesOpen((event.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="db-record-properties-summary">
                <span className="db-record-section-title">Properties</span>
                <span className="db-record-section-count">{bodyFields.length}</span>
              </summary>
              <div className="db-record-prop-list">
                {bodyFields.map((field) => (
	                  <div
	                    key={field.id}
                    ref={(node) => {
                      if (node) propertyRowRefs.current.set(field.id, node);
                      else propertyRowRefs.current.delete(field.id);
                    }}
	                    className="db-record-prop-row"
	                    onClick={(event) => {
	                      const target = event.target as HTMLElement;
	                      if (target.closest("a, button, input, textarea, select, label")) return;
	                      if (field.type === "checkbox") {
	                        handleChange(field.id, record[field.id] !== true);
	                        setEditingFieldId(null);
	                        return;
	                      }
	                      if (!isEditableField(field)) return;
	                      setEditingFieldId((current) => (current === field.id ? null : field.id));
	                    }}
	                  >
                    <div className="db-record-prop-label">{field.name}</div>
                    <div className="db-record-prop-value">
                      {editingFieldId === field.id ? (
                        <InlineEditor
                          record={record}
                          field={field}
                          database={database}
                          catalog={catalog}
                          onSave={(value) => {
                            void onUpdateField(record.id, field.id, value as WorkspaceDatabaseFieldValue);
                            setEditingFieldId(null);
                          }}
                          onCancel={() => setEditingFieldId(null)}
                        />
                      ) : (
                        <TableCell
                          record={record}
                          field={field}
                          database={database}
                          catalog={catalog}
                          onToggleCheckbox={() => {
                            handleChange(field.id, record[field.id] !== true);
                            setEditingFieldId(null);
                          }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>

          {database.schema
            .filter((field) => {
              if (field.type !== "relation") return false;
              if (isWorkflowRunsRelationField(field)) return false;
              const tid = field.relation?.targetDatabaseId;
              return tid !== undefined && tid !== database.id;
            })
            .map(renderRelationSection)}

          {record ? (
            <RecordBacklinksSection
              recordId={record.id}
              databaseId={database.id}
              catalog={catalog}
              onOpenRecord={onOpenRecord}
            />
          ) : null}

          {record ? (
            <RecordActivitySection
              recordId={record.id}
              isWorkflowRun={database.id === GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns}
            />
          ) : null}

          {record ? <RecordHistorySection recordId={record.id} /> : null}

          <div className="db-record-section px-6 pb-6">
            <div className="db-record-section-head db-record-notes-head">
              <div className="db-record-notes-meta">
                <div className="db-record-section-title mb-0">Notes</div>
                <span
                  className={notesStatus === "error" ? "db-record-notes-status text-[var(--danger)]" : "db-record-notes-status"}
                >
                  {notesStatus === "saving"
                    ? "Saving..."
                    : notesStatus === "saved"
                      ? "Saved"
                      : notesStatus === "error"
                        ? "Save failed"
                      : notesStatus === "dirty"
                        ? "Editing..."
                        : ""}
                </span>
                {notesStatus === "error" ? (
                  <button
                    type="button"
                    className="font-ui text-[10px] font-medium text-[var(--accent)] hover:text-[var(--text)]"
                    onClick={() => setNotesStatus("dirty")}
                  >
                    Retry
                  </button>
                ) : null}
                <span className="db-record-editor-count">{wordCount(notesDraft)} words</span>
              </div>
            </div>
            <div className="db-record-editor db-record-notes-rich" onBlur={flushNotesSave}>
              <DatabaseRichTextEditor
                initialValue={notesDraft}
                onChange={updateNotes}
              />
            </div>
          </div>
        </div>

        <div className="db-record-footer">
          <button className="db-btn db-btn-danger" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
          {record?._isTemplate ? (
            <button
              className="db-btn db-btn-primary"
              disabled={isTemplateActionRunning}
              onClick={() => void handleCreateFromTemplate()}
              title="Create a new record from this template"
            >
              {isTemplateActionRunning ? "Creating…" : "New from template"}
            </button>
          ) : (
            <button
              className="db-btn"
              disabled={isTemplateActionRunning}
              onClick={() => void handleSaveAsTemplate()}
              title="Duplicate this record as a reusable template"
            >
              {isTemplateActionRunning ? "Saving…" : "Save as template"}
            </button>
          )}
          <span className="db-toolbar-spacer" />
          <span className="db-record-footer-note">
            {record?._isTemplate ? "Template record" : "Changes save automatically"}
          </span>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete record"
        message="This action cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function wordCount(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function SummaryFieldValue({
  field,
  record,
  database,
  catalog,
}: {
  field: WorkspaceDatabaseField;
  record: WorkspaceDatabaseModel["records"][number];
  database: WorkspaceDatabaseModel;
  catalog: WorkspaceDatabaseCatalogEntry[];
}) {
  const value = getFieldValue(record, field, database, catalog);
  const displayValue = getFieldDisplayValue(record, field, database, catalog);

  if (field.type === "status" && typeof value === "string" && value) {
    return <Badge color={resolveStatusColor(value, field)}>{value}</Badge>;
  }
  if (field.type === "select" && typeof value === "string" && value) {
    return <Badge color={resolveFieldOptionColor(field, value)}>{value}</Badge>;
  }
  if (field.type === "multiselect" && Array.isArray(value) && value.length > 0) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((v) => <Badge key={v} color={resolveFieldOptionColor(field, v)}>{v}</Badge>)}
      </div>
    );
  }
  if (field.type === "relation" && Array.isArray(value) && value.length > 0) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((id) => {
          const label = resolveRelationLabel(field, String(id), catalog);
          return <Badge key={id} color={resolveRelationColor(label)}>{label}</Badge>;
        })}
      </div>
    );
  }
  if (field.type === "checkbox") {
    return <span>{value === true ? "Yes" : "No"}</span>;
  }
  return <span className="truncate">{displayValue || "—"}</span>;
}

type WorkflowRunAction = "start" | "request_approval" | "approve" | "block" | "done";

// Governance actions require a written decision note before executing.
const RUN_NOTE_REQUIRED: WorkflowRunAction[] = ["approve", "block", "request_approval"];

function runActionsForStatus(status: string | null): WorkflowRunAction[] {
  const normalized = status?.trim().toLowerCase();
  if (normalized === "queued") return ["start", "request_approval", "block"];
  if (normalized === "in progress") return ["request_approval", "done", "block"];
  if (normalized === "needs approval") return ["approve", "block"];
  if (normalized === "blocked") return ["start"];
  return [];
}

const RUN_ACTION_LABELS: Record<WorkflowRunAction, string> = {
  start: "Start",
  request_approval: "Request approval",
  approve: "Approve",
  block: "Block",
  done: "Done",
};

function WorkflowRunOperationsSection({
  record,
  catalog,
}: {
  record: WorkspaceDatabaseModel["records"][number];
  catalog: WorkspaceDatabaseCatalogEntry[];
}) {
  const queryClient = useQueryClient();
  const [pendingAction, setPendingAction] = useState<WorkflowRunAction | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [isRunningAction, setIsRunningAction] = useState(false);
  const status = fieldText(record[WORKFLOW_RUN_FIELD_IDS.status]);
  const actor = fieldText(record[WORKFLOW_RUN_FIELD_IDS.actor]);
  const ownerRole = fieldText(record[WORKFLOW_RUN_FIELD_IDS.ownerRole]);
  const currentStep = fieldText(record[WORKFLOW_RUN_FIELD_IDS.currentStep]);
  const triggerSource = fieldText(record[WORKFLOW_RUN_FIELD_IDS.triggerSource]);
  const entityScope = fieldText(record[WORKFLOW_RUN_FIELD_IDS.entityScope]);
  const startedAt = fieldText(record[WORKFLOW_RUN_FIELD_IDS.startedAt]);
  const completedAt = fieldText(record[WORKFLOW_RUN_FIELD_IDS.completedAt]);
  const receipt = fieldText(record[WORKFLOW_RUN_FIELD_IDS.receipt]);
  const sourceDocumentIds = fieldStringArray(record[WORKFLOW_RUN_FIELD_IDS.sourceDocuments]);
  const sourceRecordIds = splitLines(fieldText(record[WORKFLOW_RUN_FIELD_IDS.sourceRecords]));
  const context = formatRunContext(fieldText(record[WORKFLOW_RUN_FIELD_IDS.context]));
  const timelineEntries = parseWorkflowRunTimeline(record._body, receipt, record._updatedAt);
  const runName = fieldText(record[WORKFLOW_RUN_FIELD_IDS.name]) ?? record.id;
  const availableActions = runActionsForStatus(status);

  function handleActionClick(action: WorkflowRunAction) {
    if (isRunningAction) return;
    if (RUN_NOTE_REQUIRED.includes(action)) {
      setPendingAction((current) => (current === action ? null : action));
      setActionNote("");
      return;
    }
    void executeAction(action);
  }

  async function executeAction(action: WorkflowRunAction, note?: string) {
    try {
      setIsRunningAction(true);
      if (action === "approve") {
        await resolveWorkflowApproval({
          workflowRunId: record.id,
          decision: "approved",
          decisionSummary: note ?? "",
          decidedBy: OPERATOR_ACTOR,
          confirmWrite: true,
        });
      } else if (action === "request_approval") {
        await requestWorkflowApproval({
          workflowRunId: record.id,
          requestedBy: OPERATOR_ACTOR,
          approvalNeeded: note ?? "",
          confirmWrite: true,
        });
      } else if (action === "block") {
        await updateWorkflowRun({
          workflowRunId: record.id,
          actor: OPERATOR_ACTOR,
          status: "Blocked",
          currentStep: "Blocked from record panel",
          summary: `Blocked ${runName}: ${note ?? "no reason recorded"}`,
          actionsTaken: ["Blocked workflow run from record panel"],
          blockedItems: [note ?? "Blocked from record panel"],
          nextStep: "Review blocker and decide next action",
          confirmWrite: true,
        });
      } else {
        const isStart = action === "start";
        await updateWorkflowRun({
          workflowRunId: record.id,
          actor: OPERATOR_ACTOR,
          status: isStart ? "In progress" : "Done",
          currentStep: isStart ? "Execution underway" : "Completed from record panel",
          summary: isStart ? `Started ${runName} from the record panel.` : `Marked ${runName} done from the record panel.`,
          actionsTaken: [isStart ? "Started workflow run from record panel" : "Marked workflow run done from record panel"],
          nextStep: isStart ? "Execute the registered workflow steps" : "Review receipt and archive if appropriate",
          confirmWrite: true,
        });
      }
      setPendingAction(null);
      setActionNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-database"] }),
        queryClient.invalidateQueries({ queryKey: ["workflow-runs"] }),
      ]);
      toast.success("Workflow run updated", { description: `${runName}` });
    } catch (actionError) {
      toastError("Workflow update failed", actionError);
    } finally {
      setIsRunningAction(false);
    }
  }

  return (
    <section className="db-record-section db-workflow-run-ops px-6 py-3">
      <div className="db-record-section-head">
        <div className="db-record-section-title mb-0">Workflow Run</div>
        {status ? (
          <span className="db-workflow-run-status">
            {status}
          </span>
        ) : null}
      </div>

      {availableActions.length > 0 ? (
        <div className="mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {availableActions.map((action) => (
              <button
                key={action}
                type="button"
                className={action === "block" ? "db-btn db-btn-danger" : action === "approve" || action === "done" ? "db-btn db-btn-primary" : "db-btn"}
                onClick={() => handleActionClick(action)}
                disabled={isRunningAction}
              >
                {isRunningAction ? "…" : RUN_ACTION_LABELS[action]}
              </button>
            ))}
          </div>
          {pendingAction ? (
            <div className="mt-2 space-y-1.5">
              <label className="font-ui text-[10.5px] font-medium text-[var(--subtext-0)]">
                {pendingAction === "approve" ? "Decision note (required)" : pendingAction === "block" ? "Blocker reason (required)" : "Decision needed (required)"}
              </label>
              <textarea
                className="db-input w-full resize-none"
                rows={2}
                autoFocus
                value={actionNote}
                onChange={(event) => setActionNote(event.target.value)}
                placeholder={
                  pendingAction === "approve"
                    ? "What is being approved and on what basis?"
                    : pendingAction === "block"
                      ? "What is blocking this run?"
                      : "What decision or permission is needed?"
                }
              />
              <div className="flex items-center justify-end gap-1.5">
                <button type="button" className="db-btn" onClick={() => { setPendingAction(null); setActionNote(""); }}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={pendingAction === "block" ? "db-btn db-btn-danger" : "db-btn db-btn-primary"}
                  disabled={!actionNote.trim() || isRunningAction}
                  onClick={() => void executeAction(pendingAction, actionNote.trim())}
                >
                  Confirm {RUN_ACTION_LABELS[pendingAction].toLowerCase()}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="db-workflow-run-routing">
        <div className="db-workflow-run-routing-card db-workflow-run-routing-card-primary">
          <div className="db-workflow-run-routing-icon">
            <UserRound className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="db-workflow-run-routing-label">Current actor</div>
            <div className="db-workflow-run-routing-value">{actor ?? "Unassigned"}</div>
          </div>
        </div>
        <div className="db-workflow-run-routing-card">
          <div className="db-workflow-run-routing-icon">
            <Route className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="db-workflow-run-routing-label">Owner role</div>
            <div className="db-workflow-run-routing-value">{ownerRole ?? "No role"}</div>
          </div>
        </div>
      </div>

      <div className="db-workflow-run-facts">
        <WorkflowRunFact label="Current step" value={currentStep} />
        <WorkflowRunFact label="Trigger" value={triggerSource} />
        <WorkflowRunFact label="Entity" value={entityScope} />
        <WorkflowRunFact label="Started" value={startedAt ? formatDateTime(startedAt) : null} />
        <WorkflowRunFact label="Completed" value={completedAt ? formatDateTime(completedAt) : null} />
      </div>

      <div className="db-workflow-run-context-grid">
        <WorkflowRunSourceList
          icon={<FileText className="h-3.5 w-3.5" />}
          title="Source documents"
          values={sourceDocumentIds}
        />
        <WorkflowRunSourceList
          icon={<GitBranch className="h-3.5 w-3.5" />}
          title="Source records"
          values={sourceRecordIds}
          resolveValue={(id) => resolveCatalogRecordLabel(id, catalog)}
        />
      </div>

      {context ? (
        <details className="db-workflow-run-context">
          <summary>Context payload</summary>
          <pre>{context}</pre>
        </details>
      ) : null}

      <div className="db-workflow-run-timeline">
        <div className="db-record-section-head">
          <div className="db-record-section-title mb-0">Receipt Timeline</div>
          <span className="db-record-section-count">{timelineEntries.length}</span>
        </div>
        {timelineEntries.length > 0 ? (
          <div className="db-workflow-run-timeline-list">
            {timelineEntries.map((entry, index) => (
              <article key={`${entry.title}-${index}`} className="db-workflow-run-timeline-entry">
                <div className="db-workflow-run-timeline-marker" />
                <div className="db-workflow-run-timeline-card">
                  <div className="db-workflow-run-timeline-title">{entry.title}</div>
                  {entry.timestamp ? <div className="db-workflow-run-timeline-time">{entry.timestamp}</div> : null}
                  <MarkdownBody content={entry.content} className="db-workflow-run-timeline-body" />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="db-workflow-run-empty">No receipts have been written yet.</div>
        )}
      </div>
    </section>
  );
}

function WorkflowRunFact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="db-workflow-run-fact">
      <span>{label}</span>
      <strong>{value || "—"}</strong>
    </div>
  );
}

function WorkflowRunSourceList({
  icon,
  title,
  values,
  resolveValue,
}: {
  icon: ReactNode;
  title: string;
  values: string[];
  resolveValue?: (value: string) => string;
}) {
  return (
    <div className="db-workflow-run-source-list">
      <div className="db-workflow-run-source-title">
        {icon}
        <span>{title}</span>
      </div>
      {values.length > 0 ? (
        <div className="db-workflow-run-source-items">
          {values.map((value) => (
            <span key={value} className="db-workflow-run-source-item">
              {resolveValue ? resolveValue(value) : value}
            </span>
          ))}
        </div>
      ) : (
        <div className="db-workflow-run-empty db-workflow-run-empty-compact">None linked</div>
      )}
    </div>
  );
}

function fieldText(value: WorkspaceDatabaseFieldValue) {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function fieldStringArray(value: WorkspaceDatabaseFieldValue) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  const single = fieldText(value);
  return single ? [single] : [];
}

function splitLines(value: string | null) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatRunContext(value: string | null) {
  if (!value) return null;
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function resolveCatalogRecordLabel(recordId: string, catalog: WorkspaceDatabaseCatalogEntry[]) {
  for (const database of catalog) {
    const record = database.records.find((candidate) => candidate.id === recordId);
    if (!record) continue;
    const titleField = database.schema.find((field) => field.type === "text");
    const title = titleField ? fieldText(record[titleField.id]) : null;
    return title ? `${title}` : recordId;
  }
  return recordId;
}

function parseWorkflowRunTimeline(
  body: string | null | undefined,
  latestReceipt: string | null,
  updatedAt: string | undefined,
) {
  const source = body?.trim() || latestReceipt?.trim() || "";
  if (!source) return [];
  const sections = source
    .split(/\n(?=##\s+)/)
    .map((section) => section.trim())
    .filter(Boolean);

  const receiptSections = sections.filter((section) => /^##\s+Workflow Run Update/i.test(section));
  if (receiptSections.length === 0) {
    return [{
      title: "Run created",
      timestamp: updatedAt ? formatDateTime(updatedAt) : null,
      content: source,
    }];
  }

  return receiptSections.map((section) => {
    const [headingLine, ...rest] = section.split(/\r?\n/);
    const title = headingLine.replace(/^##\s+/, "").trim() || "Workflow Run Update";
    const timestamp = title.replace(/^Workflow Run Update\s*-\s*/i, "").trim();
    return {
      title: "Workflow Run Update",
      timestamp,
      content: rest.join("\n").trim(),
    };
  }).reverse();
}

function resolveTargetDatabase(
  database: WorkspaceDatabaseModel,
  field: WorkspaceDatabaseField,
  catalog: WorkspaceDatabaseCatalogEntry[],
) {
  const targetDatabaseId = field.relation?.targetDatabaseId ?? database.id;
  if (targetDatabaseId === database.id) {
    return database;
  }
  const entry = catalog.find((candidate) => candidate.id === targetDatabaseId);
  if (!entry) return null;
  return {
    id: entry.id,
    name: entry.name,
    schema: entry.schema,
    records: entry.records,
    views: entry.views,
    headerFieldIds: entry.headerFieldIds,
  } satisfies WorkspaceDatabaseModel;
}

function isStructuralHierarchyRelationField(
  field: WorkspaceDatabaseField,
  database: WorkspaceDatabaseModel,
) {
  if (field.type !== "relation") return false;
  const targetDatabaseId = field.relation?.targetDatabaseId;
  if (targetDatabaseId && targetDatabaseId !== database.id) return false;
  if (!field.relation?.targetRelationFieldId) return false;

  const ownName = field.name.trim().toLowerCase();
  const reciprocalName =
    database.schema.find((candidate) => candidate.id === field.relation?.targetRelationFieldId)?.name
      .trim()
      .toLowerCase() ?? "";

  return isHierarchyRelationName(ownName) || isHierarchyRelationName(reciprocalName);
}

function isHierarchyRelationName(name: string) {
  return /^parent$/.test(name) || /^sub[-\s]?records?$/.test(name) || /^sub[-\s]?items?$/.test(name);
}

function isWorkflowRunsRelationField(field: WorkspaceDatabaseField) {
  return field.type === "relation" && field.name.trim().toLowerCase() === "workflow runs";
}

function isWorkflowSourceDatabase(databaseId: string) {
  return databaseId === GENZEN_WORKSPACE_DATABASE_IDS.tasks || databaseId === GENZEN_WORKSPACE_DATABASE_IDS.bizOps;
}
