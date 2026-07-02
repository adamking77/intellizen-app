import {
  runExaSearch,
  signalDraftFromDeepResearch,
  signalDraftFromSearchResult,
} from "@/lib/exa";
import {
  appendMarkdownSection,
  formatAgentWorkTimestamp,
  latestBodyField,
  latestMarkdownSection,
  markdownList,
} from "@/lib/agent-work-text";
import { resolveStatusColor } from "@/lib/database-colors";
import type {
  CanvasDocument,
  CanvasDocumentData,
  CanvasDocumentSummary,
  DeepResearchResult,
  AgentWorkFollowupInput,
  AgentWorkItem,
  AgentWorkOutcome,
  AgentProjectItem,
  AgentWorkReceiptInput,
  DelegateAgentWorkInput,
  DelegateAgentWorkResult,
  StartWorkflowInput,
  UpdateWorkflowRunInput,
  FionaInboxItem,
  GraphEntityType,
  GraphEdgeRecord,
  GraphNodeRecord,
  IntelSignal,
  Investigation,
  InvestigationSignal,
  Monitor,
  MonitorInsert,
  Operation,
  Project,
  ProjectSignal,
  SearchResultItem,
  SignalDraft,
  TaxonomyMetadata,
  VoiceDraftTaskInput,
  VaultDocument,
  VaultFile,
  WorkspaceDatabase,
  WorkspaceDatabaseBundle,
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseField,
  WorkspaceDatabaseFieldValue,
  WorkspaceDatabaseModel,
  WorkspaceDatabaseRecord,
  WorkspaceDatabaseRecordModel,
  WorkspaceDatabaseSummary,
  WorkspaceDatabaseView,
  WorkspaceDatabaseViewConfig,
  WorkflowRunItem,
  WorkflowRunStatus,
  WorkflowTemplateItem,
  WorkspaceNode,
  WorkspaceNodeSummary,
} from "@/lib/types";
import { safeHostname } from "@/lib/utils";
import { removeInvestigationDirectory } from "@/lib/vault";
import { DEFAULT_MONITORS } from "@/lib/watch-domains";
import { supabase } from "@/lib/supabase";
import { submitWorkflow } from "@/services/agent";

const SYSTEM_WORKSPACE_DATABASE_ICONS = {
  operations: "intel-system:operations",
  projects: "intel-system:projects",
} as const;

export const GENZEN_WORKSPACE_DATABASE_IDS = {
  bizOps: "0b4edfb0-d632-4e4e-987f-3e6ec24b57b3",
  tasks: "654acc9c-0270-49e2-86f7-788e25c59a76",
  workflowRegistry: "c1000000-0000-0000-0000-000000000001",
  workflowRuns: "c1000000-0000-0000-0000-000000000002",
} as const;

export const WORKFLOW_RUN_VIEW_IDS = {
  runBoard: "c2000000-0000-0000-0000-000000000102",
  approvalQueue: "c2000000-0000-0000-0000-000000000103",
} as const;

// Single-user desktop identity: UI-originated actions are attributed to the
// operator. Replace with a real session identity when IntelliZen gains one.
export const OPERATOR_ACTOR = "Adam";
export const FOUNDER_APPROVAL_ROLE = "founder_approval_authority";

const AGENT_TASK_FIELDS = {
  name: "task_name",
  status: "task_status",
  assignee: "task_assignee",
  priority: "task_priority",
  stage: "task_stage",
  area: "task_area",
  project: "task_project",
  workflowRuns: "task_workflow_runs",
} as const;

const AGENT_BIZ_OPS_FIELDS = {
  name: "initiative_name",
  stage: "initiative_stage",
  priority: "initiative_priority",
  assignee: "initiative_assignee",
  agentOwner: "initiative_agent_owner",
  weekTheme: "initiative_week_theme",
  tasks: "biz_ops_tasks",
  workflowRuns: "initiative_workflow_runs",
} as const;

const WORKFLOW_REGISTRY_FIELDS = {
  name: "workflow_name",
  workflowId: "workflow_id",
  status: "workflow_status",
  entity: "workflow_entity",
  ownerRole: "workflow_owner_role",
  defaultActor: "workflow_default_actor",
  sourceDocumentId: "workflow_source_document_id",
  sourcePath: "workflow_source_path",
  trigger: "workflow_trigger",
  requiredInputs: "workflow_required_inputs",
  defaultRouting: "workflow_default_routing",
  approvalGates: "workflow_approval_gates",
  expectedOutput: "workflow_expected_output",
  relatedDatabases: "workflow_related_databases",
  receiptTemplate: "workflow_receipt_template",
  successCriteria: "workflow_success_criteria",
  failureBehavior: "workflow_failure_behavior",
  runs: "workflow_runs",
} as const;

const WORKFLOW_RUN_FIELDS = {
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

const OPERATIONS_DB_FIELDS = {
  legacyId: "legacy_operation_id",
  name: "name",
  description: "description",
  status: "status",
  projects: "projects",
  createdAt: "created_at",
  updatedAt: "updated_at",
} as const;

const PROJECTS_DB_FIELDS = {
  legacyId: "legacy_project_id",
  name: "name",
  type: "type",
  watchDomain: "watch_domain",
  status: "status",
  notes: "notes",
  operation: "operation",
  createdAt: "created_at",
  updatedAt: "updated_at",
} as const;

let operationalWorkspaceSyncPromise: Promise<void> | null = null;
let operationalWorkspaceLastSyncedAt = 0;
let operationalWorkspaceSyncDirty = false;

const OPERATIONAL_WORKSPACE_SYNC_MAX_AGE_MS = 10 * 60_000;
const WORKSPACE_CATALOG_RECORD_LIMIT = 500;
const WORKSPACE_BUNDLE_RECORD_LIMIT = 250;
const WORKSPACE_FILTER_PREFETCH_LIMIT = 250;

type OperationalSystemKind = keyof typeof SYSTEM_WORKSPACE_DATABASE_ICONS;

function workspaceFilteredReadEnd(rowLimit: number) {
  const serverLimit = Math.min(Math.max(rowLimit * 3, rowLimit), WORKSPACE_FILTER_PREFETCH_LIMIT);
  return Math.max(serverLimit, 1) - 1;
}

function markOperationalWorkspaceSyncDirty() {
  operationalWorkspaceSyncDirty = true;
}

function shouldSyncOperationalWorkspaceDatabases(force = false) {
  if (force) return true;
  if (operationalWorkspaceSyncDirty) return true;
  if (!operationalWorkspaceLastSyncedAt) return true;
  return Date.now() - operationalWorkspaceLastSyncedAt >= OPERATIONAL_WORKSPACE_SYNC_MAX_AGE_MS;
}

export async function listMonitors() {
  const { data, error } = await supabase
    .schema("intel").from("monitors")
    .select("*")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Monitor[];
}

export async function createMonitor(input: MonitorInsert) {
  const { data, error } = await supabase
    .schema("intel").from("monitors")
    .insert([{ ...input, status: input.status ?? "active" }])
    .select("*")
    .single();

  if (error) throw error;
  return data as Monitor;
}

export async function updateMonitor(
  id: number,
  input: Partial<Pick<Monitor, "name" | "query" | "watch_domain" | "frequency" | "status">>,
) {
  const { data, error } = await supabase
    .schema("intel").from("monitors")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as Monitor;
}

export async function deleteMonitor(id: number) {
  const { error } = await supabase.schema("intel").from("monitors").delete().eq("id", id);
  if (error) throw error;
}

export async function seedDefaultMonitors() {
  const { data, error } = await supabase.schema("intel").from("monitors").select("watch_domain");
  if (error) throw error;

  const existing = new Set((data ?? []).map((row) => row.watch_domain as string));
  const missing = DEFAULT_MONITORS.filter(
    (monitor) => !existing.has(monitor.watch_domain),
  );

  if (missing.length === 0) return 0;

  const { error: insertError } = await supabase.schema("intel").from("monitors").insert(missing);
  if (insertError) throw insertError;

  return missing.length;
}

export async function listSignals() {
  const [{ data: pSigs }, { data: iSigs }] = await Promise.all([
    supabase.schema("intel").from("project_signals").select("signal_id"),
    supabase.schema("intel").from("investigation_signals").select("signal_id"),
  ]);

  const protectedIds = [
    ...(pSigs ?? []).map((r) => r.signal_id),
    ...(iSigs ?? []).map((r) => r.signal_id),
  ];

  let query = supabase
    .schema("intel").from("signals")
    .select("*")
    .in("status", ["new", "saved"])
    .order("created_at", { ascending: false });

  if (protectedIds.length > 0) {
    query = query.not("id", "in", `(${protectedIds.join(",")})`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as IntelSignal[];
}

export async function getUnreadSignalCount() {
  const { count, error } = await supabase
    .schema("intel").from("signals")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  if (error) throw error;
  return count ?? 0;
}

export async function listFionaInboxItems(input?: { limit?: number; statuses?: string[] }) {
  let query = supabase
    .schema("comms").from("fiona_inbox")
    .select("id, from_agent, task, context, priority, status, result, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(input?.limit ?? 50);

  if (input?.statuses?.length) {
    query = query.in("status", input.statuses);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as FionaInboxItem[];
}

export async function getPendingFionaInboxCount() {
  const { count, error } = await supabase
    .schema("comms").from("fiona_inbox")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (error) throw error;
  return count ?? 0;
}

// ============================
// Operations
// ============================

export async function listOperations() {
  const { data, error } = await supabase
    .schema("anchors").from("operations")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  const operations = (data ?? []) as Operation[];
  let recordMap = new Map<number, { recordId: string }>();
  try {
    recordMap = await getOperationalWorkspaceRecordMap("operations");
  } catch (recordError) {
    console.warn("Operations workspace record map unavailable", recordError);
  }
  return operations.map((operation) => ({
    ...operation,
    record_id: recordMap.get(operation.id)?.recordId ?? null,
  }));
}

export async function createOperation(input: {
  name: string;
  description?: string | null;
  taxonomy?: TaxonomyMetadata;
}) {
  const { data, error } = await supabase
    .schema("anchors").from("operations")
    .insert([{ name: input.name, description: input.description ?? null, taxonomy: input.taxonomy ?? {} }])
    .select("*")
    .single();

  if (error) throw error;
  markOperationalWorkspaceSyncDirty();
  void syncOperationalWorkspaceDatabases().catch((syncError) => {
    console.error("Failed to sync operations workspace database", syncError);
  });
  return data as Operation;
}

export async function updateOperation(
  id: number,
  input: Partial<Pick<Operation, "name" | "description" | "status" | "taxonomy">>,
) {
  const { data, error } = await supabase
    .schema("anchors").from("operations")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  markOperationalWorkspaceSyncDirty();
  void syncOperationalWorkspaceDatabases().catch((syncError) => {
    console.error("Failed to sync operations workspace database", syncError);
  });
  return data as Operation;
}

export async function deleteOperation(id: number) {
  const { error } = await supabase.schema("anchors").from("operations").delete().eq("id", id);
  if (error) throw error;
  markOperationalWorkspaceSyncDirty();
  void syncOperationalWorkspaceDatabases().catch((syncError) => {
    console.error("Failed to sync operations workspace database", syncError);
  });
}

export async function listProjects() {
  const { data, error } = await supabase
    .schema("anchors").from("projects")
    .select("*")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  const projects = (data ?? []) as Project[];
  let projectRecordMap = new Map<number, { recordId: string }>();
  let operationRecordMap = new Map<number, { recordId: string }>();
  try {
    projectRecordMap = await getOperationalWorkspaceRecordMap("projects");
    operationRecordMap = await getOperationalWorkspaceRecordMap("operations");
  } catch (recordError) {
    console.warn("Operational workspace record maps unavailable", recordError);
  }
  return projects.map((project) => ({
    ...project,
    record_id: projectRecordMap.get(project.id)?.recordId ?? null,
    operation_record_id: project.operation_id != null
      ? (operationRecordMap.get(project.operation_id)?.recordId ?? null)
      : null,
  }));
}

export async function createProject(input: {
  name: string;
  type: Project["type"];
  watch_domain?: string | null;
  operation_id?: number | null;
  taxonomy?: TaxonomyMetadata;
}) {
  const { data, error } = await supabase
    .schema("anchors").from("projects")
    .insert([
      {
        name: input.name,
        type: input.type,
        watch_domain: input.watch_domain ?? null,
        operation_id: input.operation_id ?? null,
        taxonomy: input.taxonomy ?? {},
      },
    ])
    .select("*")
    .single();

  if (error) throw error;
  markOperationalWorkspaceSyncDirty();
  void syncOperationalWorkspaceDatabases().catch((syncError) => {
    console.error("Failed to sync projects workspace database", syncError);
  });
  return data as Project;
}

export async function updateProject(
  id: number,
  input: Partial<Pick<Project, "name" | "type" | "watch_domain" | "status" | "notes" | "operation_id" | "taxonomy">>,
) {
  const { data, error } = await supabase
    .schema("anchors").from("projects")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  markOperationalWorkspaceSyncDirty();
  void syncOperationalWorkspaceDatabases().catch((syncError) => {
    console.error("Failed to sync projects workspace database", syncError);
  });
  return data as Project;
}

export async function deleteProject(id: number) {
  const { error } = await supabase
    .schema("anchors").from("projects")
    .delete()
    .eq("id", id);

  if (error) throw error;
  markOperationalWorkspaceSyncDirty();
  void syncOperationalWorkspaceDatabases().catch((syncError) => {
    console.error("Failed to sync projects workspace database", syncError);
  });
}

export async function listProjectSignalCounts(): Promise<Record<number, number>> {
  const { data, error } = await supabase
    .schema("intel").from("project_signals")
    .select("project_id");

  if (error) throw error;
  const counts: Record<number, number> = {};
  for (const row of (data ?? []) as { project_id: number }[]) {
    counts[row.project_id] = (counts[row.project_id] ?? 0) + 1;
  }
  return counts;
}

export async function listProjectSignals(projectId: number) {
  const { data, error } = await supabase
    .schema("intel").from("project_signals")
    .select("id, project_id, signal_id, notes, added_at, signals(*)")
    .eq("project_id", projectId)
    .order("added_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as ProjectSignal[];
}

export async function removeSignalFromProject(projectSignalId: number) {
  const { error } = await supabase
    .schema("intel").from("project_signals")
    .delete()
    .eq("id", projectSignalId);

  if (error) throw error;
}

export async function dismissSignal(signalId: number) {
  const [{ count: pCount }, { count: iCount }] = await Promise.all([
    supabase.schema("intel").from("project_signals").select("id", { count: "exact", head: true }).eq("signal_id", signalId),
    supabase.schema("intel").from("investigation_signals").select("id", { count: "exact", head: true }).eq("signal_id", signalId),
  ]);
  if ((pCount ?? 0) > 0 || (iCount ?? 0) > 0) return;

  const { error } = await supabase.schema("intel").from("signals").delete().eq("id", signalId);
  if (error) throw error;
}

export async function bulkDismissSignals(ids: number[]) {
  if (ids.length === 0) return { total: 0, cleared: 0 };

  const [{ data: pSigs }, { data: iSigs }] = await Promise.all([
    supabase.schema("intel").from("project_signals").select("signal_id").in("signal_id", ids),
    supabase.schema("intel").from("investigation_signals").select("signal_id").in("signal_id", ids),
  ]);

  const protectedIds = new Set([
    ...(pSigs ?? []).map((r) => r.signal_id),
    ...(iSigs ?? []).map((r) => r.signal_id),
  ]);

  const toDelete = ids.filter((id) => !protectedIds.has(id));
  if (toDelete.length === 0) return { total: ids.length, cleared: 0 };

  const { error } = await supabase.schema("intel").from("signals").delete().in("id", toDelete);
  if (error) throw error;

  return { total: ids.length, cleared: toDelete.length };
}

export async function saveSignalToProject(input: {
  projectId: number;
  signalId: number;
}) {
  const { error: linkError } = await supabase.schema("intel").from("project_signals").upsert(
    [{ project_id: input.projectId, signal_id: input.signalId }],
    { onConflict: "project_id,signal_id", ignoreDuplicates: true },
  );

  if (linkError) throw linkError;

  const { error: signalError } = await supabase
    .schema("intel").from("signals")
    .update({ status: "saved" })
    .eq("id", input.signalId);

  if (signalError) throw signalError;
}

export async function saveDraftToProject(input: {
  projectId: number;
  draft: SignalDraft;
}) {
  const existing = await findSignalByUrl(input.draft.url);
  const signal =
    existing ??
    (await insertSignal({
      ...input.draft,
      source: input.draft.source ?? safeHostname(input.draft.url),
      status: "saved",
    }));

  await saveSignalToProject({ projectId: input.projectId, signalId: signal.id });
  return signal;
}

export async function saveSearchResultToProject(input: {
  projectId: number;
  result: SearchResultItem | DeepResearchResult;
}) {
  const draft =
    "content" in input.result
      ? signalDraftFromDeepResearch(input.result)
      : signalDraftFromSearchResult(input.result);

  return saveDraftToProject({ projectId: input.projectId, draft });
}

async function findSignalByUrl(url: string) {
  const { data, error } = await supabase
    .schema("intel").from("signals")
    .select("*")
    .eq("url", url)
    .maybeSingle();

  if (error) throw error;
  return data as IntelSignal | null;
}

async function insertSignal(input: SignalDraft) {
  const { data, error } = await supabase
    .schema("intel").from("signals")
    .upsert([
      {
        ...input,
        status: input.status ?? "new",
      },
    ], {
      onConflict: "url",
      ignoreDuplicates: true,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as IntelSignal;
}

export async function runMonitorNow(monitor: Monitor) {
  const response = await runExaSearch({
    mode: "web",
    query: monitor.query,
  });

  if (!Array.isArray(response)) {
    throw new Error("Monitor search returned Deep Research output unexpectedly.");
  }

  const seenInBatch = new Set<string>();
  const drafts: SignalDraft[] = [];

  for (const result of response) {
    if (seenInBatch.has(result.url)) continue;
    seenInBatch.add(result.url);
    drafts.push({
      title: result.title,
      url: result.url,
      source: result.source ?? safeHostname(result.url),
      published_at: result.published_at,
      snippet: result.snippet,
      watch_domain: monitor.watch_domain,
      exa_score: result.exa_score,
      raw_payload: result.raw_payload,
    });
  }

  let insertedCount = 0;

  if (drafts.length > 0) {
    const { data: insertedRows, error: insertError } = await supabase
      .schema("intel").from("signals")
      .upsert(
        drafts.map((draft) => ({
          ...draft,
          monitor_id: monitor.id,
          status: "new",
        })),
        {
          onConflict: "url",
          ignoreDuplicates: true,
        },
      )
      .select("id");

    if (insertError) throw insertError;
    insertedCount = insertedRows?.length ?? 0;
  }

  const { error: updateError } = await supabase
    .schema("intel").from("monitors")
    .update({
      last_run: new Date().toISOString(),
      signal_count: monitor.signal_count + insertedCount,
    })
    .eq("id", monitor.id);

  if (updateError) throw updateError;

  return insertedCount;
}

export async function refreshInbox() {
  const monitors = (await listMonitors()).filter((monitor) => monitor.status === "active");
  let inserted = 0;

  for (const monitor of monitors) {
    inserted += await runMonitorNow(monitor);
  }

  return inserted;
}

export async function listGraphNodes(projectId: number | null) {
  let query = supabase
    .schema("intel").from("graph_nodes")
    .select("*")
    .order("created_at", { ascending: true });
  
  if (projectId === null) {
    query = query.is("project_id", null);
  } else {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as GraphNodeRecord[];
}

export async function listGraphEdges(projectId: number | null) {
  let query = supabase
    .schema("intel").from("graph_edges")
    .select("*")
    .order("created_at", { ascending: true });
  
  if (projectId === null) {
    query = query.is("project_id", null);
  } else {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as GraphEdgeRecord[];
}

export async function createGraphNode(input: {
  projectId: number | null;
  nodeId: string;
  label: string;
  entityType: GraphEntityType;
  position: { x: number; y: number };
}) {
  const { data, error } = await supabase
    .schema("intel").from("graph_nodes")
    .insert([
      {
        project_id: input.projectId,
        node_id: input.nodeId,
        label: input.label,
        entity_type: input.entityType,
        position_x: input.position.x,
        position_y: input.position.y,
      },
    ])
    .select("*")
    .single();

  if (error) throw error;
  return data as GraphNodeRecord;
}

export async function updateGraphNodePosition(input: {
  projectId: number | null;
  nodeId: string;
  position: { x: number; y: number };
}) {
  let query = supabase
    .schema("intel").from("graph_nodes")
    .update({
      position_x: input.position.x,
      position_y: input.position.y,
    })
    .eq("node_id", input.nodeId);
  
  if (input.projectId === null) {
    query = query.is("project_id", null);
  } else {
    query = query.eq("project_id", input.projectId);
  }

  const { error } = await query;
  if (error) throw error;
}

export async function updateGraphNode(input: {
  projectId: number | null;
  nodeId: string;
  label: string;
  entityType: GraphEntityType;
}) {
  let query = supabase
    .schema("intel").from("graph_nodes")
    .update({
      label: input.label,
      entity_type: input.entityType,
    })
    .eq("node_id", input.nodeId);
  
  if (input.projectId === null) {
    query = query.is("project_id", null);
  } else {
    query = query.eq("project_id", input.projectId);
  }

  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data as GraphNodeRecord;
}

export async function deleteGraphNodes(input: {
  projectId: number | null;
  nodeIds: string[];
}) {
  if (input.nodeIds.length === 0) return;

  let query = supabase
    .schema("intel").from("graph_nodes")
    .delete()
    .in("node_id", input.nodeIds);
  
  if (input.projectId === null) {
    query = query.is("project_id", null);
  } else {
    query = query.eq("project_id", input.projectId);
  }

  const { error } = await query;
  if (error) throw error;
}

export async function createGraphEdge(input: {
  projectId: number | null;
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
}) {
  const { data, error } = await supabase
    .schema("intel").from("graph_edges")
    .insert([
      {
        project_id: input.projectId,
        edge_id: input.edgeId,
        source_node_id: input.sourceNodeId,
        target_node_id: input.targetNodeId,
        label: input.label,
      },
    ])
    .select("*")
    .single();

  if (error) throw error;
  return data as GraphEdgeRecord;
}

export async function updateGraphEdge(input: {
  projectId: number | null;
  edgeId: string;
  label: string | null;
}) {
  let query = supabase
    .schema("intel").from("graph_edges")
    .update({
      label: input.label,
    })
    .eq("edge_id", input.edgeId);
  
  if (input.projectId === null) {
    query = query.is("project_id", null);
  } else {
    query = query.eq("project_id", input.projectId);
  }

  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data as GraphEdgeRecord;
}

export async function deleteGraphEdges(input: {
  projectId: number | null;
  edgeIds: string[];
}) {
  if (input.edgeIds.length === 0) return;

  let query = supabase
    .schema("intel").from("graph_edges")
    .delete()
    .in("edge_id", input.edgeIds);
  
  if (input.projectId === null) {
    query = query.is("project_id", null);
  } else {
    query = query.eq("project_id", input.projectId);
  }

  const { error } = await query;
  if (error) throw error;
}

// ============================
// V2: Investigations
// ============================

export async function listInvestigations() {
  const { data, error } = await supabase
    .schema("intel").from("investigations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  const investigations = (data ?? []) as Investigation[];
  return Promise.all(
    investigations.map(async (investigation) => ({
      ...investigation,
      project_record_id:
        investigation.project_record_id ?? await getOperationalWorkspaceRecordIdByLegacyId("projects", investigation.project_id),
      operation_record_id:
        investigation.operation_record_id ?? await getOperationalWorkspaceRecordIdByLegacyId("operations", investigation.operation_id),
    })),
  );
}

export async function getInvestigation(caseId: string) {
  const { data, error } = await supabase
    .schema("intel").from("investigations")
    .select("*")
    .eq("case_id", caseId)
    .single();

  if (error) throw error;
  const investigation = data as Investigation;
  return {
    ...investigation,
    project_record_id:
      investigation.project_record_id ?? await getOperationalWorkspaceRecordIdByLegacyId("projects", investigation.project_id),
    operation_record_id:
      investigation.operation_record_id ?? await getOperationalWorkspaceRecordIdByLegacyId("operations", investigation.operation_id),
  } satisfies Investigation;
}

export async function createInvestigation(input: {
  name: string;
  projectId?: number | null;
  projectRecordId?: string | null;
  operationId?: number | null;
  operationRecordId?: string | null;
  useCase?: import("@/lib/types").InvestigationUseCase;
}) {
  const MAX_CASE_ID_ATTEMPTS = 5;

  for (let attempt = 0; attempt < MAX_CASE_ID_ATTEMPTS; attempt += 1) {
    const caseId = generateCaseId();
    const projectId = input.projectId ?? await getOperationalLegacyIdByRecordId("projects", input.projectRecordId);
    const operationId = input.operationId ?? await getOperationalLegacyIdByRecordId("operations", input.operationRecordId);
    const projectRecordId = input.projectRecordId ?? await getOperationalWorkspaceRecordIdByLegacyId("projects", projectId);
    const operationRecordId = input.operationRecordId ?? await getOperationalWorkspaceRecordIdByLegacyId("operations", operationId);
    const { data, error } = await supabase
      .schema("intel").from("investigations")
      .insert([
        {
          case_id: caseId,
          name: input.name,
          project_id: projectId ?? null,
          project_record_id: projectRecordId ?? null,
          operation_id: operationId ?? null,
          operation_record_id: operationRecordId ?? null,
          use_case: input.useCase ?? "scoping",
          current_phase: 1,
          status: "active",
        },
      ])
      .select("*")
      .single();

    if (!error) return data as Investigation;

    const isLastAttempt = attempt === MAX_CASE_ID_ATTEMPTS - 1;
    if (!isInvestigationCaseIdConflict(error) || isLastAttempt) {
      throw error;
    }
  }

  throw new Error("Failed to create investigation with a unique case ID.");
}

export async function deleteInvestigation(caseId: string) {
  const { error } = await supabase
    .schema("intel").from("investigations")
    .delete()
    .eq("case_id", caseId);

  if (error) throw error;

  try {
    await removeInvestigationDirectory(caseId);
    return { vaultCleanupError: null as string | null };
  } catch (vaultError) {
    const message = vaultError instanceof Error ? vaultError.message : String(vaultError);
    return { vaultCleanupError: message };
  }
}

function generateCaseId() {
  const year = new Date().getFullYear();
  const millis = Date.now().toString(36).slice(-4).toUpperCase();
  const random = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, "0");
  return `case-${year}-${millis}-${random}`;
}

function isInvestigationCaseIdConflict(error: { code?: string; message?: string }) {
  if (error.code === "23505") return true;
  return (error.message ?? "").toLowerCase().includes("case_id");
}

export async function updateInvestigation(
  caseId: string,
  input: Partial<Omit<Investigation, "id" | "case_id" | "created_at" | "updated_at">>
) {
  const projectId = input.project_id !== undefined
    ? input.project_id
    : input.project_record_id !== undefined
      ? await getOperationalLegacyIdByRecordId("projects", input.project_record_id)
      : undefined;
  const operationId = input.operation_id !== undefined
    ? input.operation_id
    : input.operation_record_id !== undefined
      ? await getOperationalLegacyIdByRecordId("operations", input.operation_record_id)
      : undefined;
  const projectRecordId = input.project_record_id !== undefined
    ? input.project_record_id
    : input.project_id !== undefined
      ? await getOperationalWorkspaceRecordIdByLegacyId("projects", input.project_id)
      : undefined;
  const operationRecordId = input.operation_record_id !== undefined
    ? input.operation_record_id
    : input.operation_id !== undefined
      ? await getOperationalWorkspaceRecordIdByLegacyId("operations", input.operation_id)
      : undefined;
  const nextInput = {
    ...input,
    ...(projectId !== undefined ? { project_id: projectId } : {}),
    ...(projectRecordId !== undefined ? { project_record_id: projectRecordId } : {}),
    ...(operationId !== undefined ? { operation_id: operationId } : {}),
    ...(operationRecordId !== undefined ? { operation_record_id: operationRecordId } : {}),
  };
  const { data, error } = await supabase
    .schema("intel").from("investigations")
    .update(nextInput)
    .eq("case_id", caseId)
    .select("*")
    .single();

  if (error) throw error;
  return data as Investigation;
}

export async function updateInvestigationPhase(
  caseId: string,
  phase: number,
  gateData?: Record<string, boolean>
) {
  const { data, error } = await supabase
    .schema("intel").from("investigations")
    .update({
      current_phase: phase,
      ...(gateData ? { phase_gates: gateData } : {}),
    })
    .eq("case_id", caseId)
    .select("*")
    .single();

  if (error) throw error;
  return data as Investigation;
}

async function resolveProjectReference(input: {
  projectId?: number | null;
  projectRecordId?: string | null;
}) {
  const projectId =
    input.projectId ?? await getOperationalLegacyIdByRecordId("projects", input.projectRecordId);
  const projectRecordId =
    input.projectRecordId ?? await getOperationalWorkspaceRecordIdByLegacyId("projects", projectId);
  return {
    projectId: projectId ?? null,
    projectRecordId: projectRecordId ?? null,
  };
}

async function attachProjectRecordId<T extends { project_id: number | null; project_record_id?: string | null }>(
  row: T,
): Promise<T & { project_record_id: string | null }> {
  const projectRecordId =
    row.project_record_id ??
    await getOperationalWorkspaceRecordIdByLegacyId("projects", row.project_id);
  return {
    ...row,
    project_record_id: projectRecordId ?? null,
  };
}

async function attachProjectRecordIds<T extends { project_id: number | null; project_record_id?: string | null }>(
  rows: T[],
): Promise<Array<T & { project_record_id: string | null }>> {
  const projectRecordMap = await getOperationalWorkspaceRecordMap("projects");
  return rows.map((row) => ({
    ...row,
    project_record_id:
      row.project_record_id ??
      (row.project_id != null ? (projectRecordMap.get(row.project_id)?.recordId ?? null) : null),
  }));
}

// Phase 1: Brief
export async function saveInvestigationBrief(
  caseId: string,
  brief: {
    subjectDefinition: string;
    scopeNotes: string;
    seedEntities: string[];
    humintInput?: string | null;
    useCase?: import("@/lib/types").InvestigationUseCase;
    proportionality: boolean;
    legality: boolean;
    accountability: boolean;
    necessity: boolean;
  }
) {
  const { data, error } = await supabase
    .schema("intel").from("investigations")
    .update({
      subject_definition: brief.subjectDefinition,
      scope_notes: brief.scopeNotes,
      seed_entities: brief.seedEntities,
      humint_input: brief.humintInput ?? null,
      ...(brief.useCase ? { use_case: brief.useCase } : {}),
      plan_proportionality: brief.proportionality,
      plan_legality: brief.legality,
      plan_accountability: brief.accountability,
      plan_necessity: brief.necessity,
    })
    .eq("case_id", caseId)
    .select("*")
    .single();

  if (error) throw error;
  return data as Investigation;
}

// Exa collection for standalone investigations (no parent project)
export async function collectSignalsForInvestigation(
  investigationId: number,
  seedEntities: string[],
): Promise<{ added: number; errors: string[] }> {
  const errors: string[] = [];
  let added = 0;

  for (const entity of seedEntities) {
    for (const mode of ["web", "news"] as const) {
      try {
        const results = await runExaSearch({ mode, query: entity });
        if (!Array.isArray(results)) continue;

        for (const result of results as import("@/lib/types").SearchResultItem[]) {
          const draft = signalDraftFromSearchResult(result, "investigation");

          const { data: signal } = await supabase
            .schema("intel").from("signals")
            .upsert([{ ...draft, status: "saved" }], { onConflict: "url" })
            .select("id")
            .single();

          if (!signal) continue;

          await supabase
            .schema("intel").from("investigation_signals")
            .upsert(
              [{ investigation_id: investigationId, signal_id: signal.id }],
              { onConflict: "investigation_id,signal_id", ignoreDuplicates: true },
            );

          added += 1;
        }
      } catch (err) {
        errors.push(`${entity} (${mode}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return { added, errors };
}

// Investigation Signals (Phase 2: Collect)
export async function listInvestigationSignals(investigationId: number) {
  const { data, error } = await supabase
    .schema("intel").from("investigation_signals")
    .select("*, signals(*)")
    .eq("investigation_id", investigationId)
    .order("added_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as InvestigationSignal[];
}

export async function addSignalToInvestigation(input: {
  investigationId: number;
  signalId: number;
  notes?: string;
}) {
  const { error } = await supabase
    .schema("intel").from("investigation_signals")
    .upsert(
      [
        {
          investigation_id: input.investigationId,
          signal_id: input.signalId,
          notes: input.notes ?? null,
        },
      ],
      { onConflict: "investigation_id,signal_id", ignoreDuplicates: true }
    );

  if (error) throw error;
}

export async function bulkAddSignalsToInvestigation(
  investigationId: number,
  signalIds: number[],
) {
  if (signalIds.length === 0) return;
  const { error } = await supabase
    .schema("intel").from("investigation_signals")
    .upsert(
      signalIds.map((signal_id) => ({ investigation_id: investigationId, signal_id, notes: null })),
      { onConflict: "investigation_id,signal_id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function removeSignalFromInvestigation(id: number) {
  const { error } = await supabase
    .schema("intel").from("investigation_signals")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function updateInvestigationSignal(
  id: number,
  input: {
    notes?: string | null;
    phaseAdded?: number;
  },
) {
  const { data, error } = await supabase
    .schema("intel").from("investigation_signals")
    .update({
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.phaseAdded !== undefined ? { phase_added: input.phaseAdded } : {}),
    })
    .eq("id", id)
    .select("*, signals(*)")
    .single();

  if (error) throw error;
  return data as unknown as InvestigationSignal;
}

// Vault Files (Reports)
export async function listVaultFiles(caseId: string) {
  const { data, error } = await supabase
    .schema("ingest").from("vault_files")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return attachProjectRecordIds((data ?? []) as VaultFile[]);
}

export async function createVaultFile(input: {
  caseId?: string | null;
  projectId?: number | null;
  projectRecordId?: string | null;
  phase?: number;
  fileType: VaultFile["file_type"];
  filePath: string;
  fileName: string;
  reportType?: VaultFile["report_type"];
  content?: string | null;
}) {
  const { projectId, projectRecordId } = await resolveProjectReference({
    projectId: input.projectId,
    projectRecordId: input.projectRecordId,
  });
  const { data, error } = await supabase
    .schema("ingest").from("vault_files")
    .insert([
      {
        case_id: input.caseId ?? null,
        project_id: projectId,
        project_record_id: projectRecordId,
        phase: input.phase ?? null,
        file_type: input.fileType,
        file_path: input.filePath,
        file_name: input.fileName,
        report_type: input.reportType ?? null,
        content: input.content ?? null,
      },
    ])
    .select("*")
    .single();

  if (error) throw error;
  return attachProjectRecordId(data as VaultFile);
}

export async function getVaultFile(id: number) {
  const { data, error } = await supabase
    .schema("ingest").from("vault_files")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return attachProjectRecordId(data as VaultFile);
}

export async function updateVaultFileContent(id: number, content: string) {
  const { data, error } = await supabase
    .schema("ingest").from("vault_files")
    .update({ content })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return attachProjectRecordId(data as VaultFile);
}

export async function deleteVaultFile(id: number) {
  const { error } = await supabase.schema("ingest").from("vault_files").delete().eq("id", id);
  if (error) throw error;
}

export async function listProjectVaultFiles(projectId: number) {
  const projectRecordId = await getOperationalWorkspaceRecordIdByLegacyId("projects", projectId);
  const projectFilters = [`project_id.eq.${projectId}`];
  if (projectRecordId) {
    projectFilters.push(`project_record_id.eq.${projectRecordId}`);
  }
  const { data, error } = await supabase
    .schema("ingest").from("vault_files")
    .select("*")
    .or(projectFilters.join(","))
    .order("created_at", { ascending: false });

  if (error) throw error;
  return attachProjectRecordIds((data ?? []) as VaultFile[]);
}

export async function listAllVaultFiles() {
  const { data, error } = await supabase
    .schema("ingest").from("vault_files")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return attachProjectRecordIds((data ?? []) as VaultFile[]);
}

export async function createGraphExportVaultFile(input: {
  caseId?: string | null;
  projectId?: number | null;
  projectRecordId?: string | null;
  filePath: string;
  fileName: string;
}) {
  const { projectId, projectRecordId } = await resolveProjectReference({
    projectId: input.projectId,
    projectRecordId: input.projectRecordId,
  });
  const { data, error } = await supabase
    .schema("ingest").from("vault_files")
    .insert([
      {
        case_id: input.caseId ?? null,
        project_id: projectId,
        project_record_id: projectRecordId,
        file_type: "graph_export",
        file_path: input.filePath,
        file_name: input.fileName,
        phase: null,
        report_type: null,
      },
    ])
    .select("*")
    .single();

  if (error) throw error;
  return attachProjectRecordId(data as VaultFile);
}

async function getWorkspaceParentContext(parentId: number | null) {
  if (parentId == null) {
    return {
      path: "",
      caseId: null as string | null,
      projectId: null as number | null,
      projectRecordId: null as string | null,
    };
  }

  const { data, error } = await supabase
    .schema("workspace").from("nodes")
    .select("id, kind, path, case_id, project_id, project_record_id")
    .eq("id", parentId)
    .single();

  if (error) throw error;
  if (!data || data.kind !== "folder") {
    throw new Error("Parent folder not found");
  }

  return {
    path: data.path as string,
    caseId: (data.case_id as string | null) ?? null,
    projectId: (data.project_id as number | null) ?? null,
    projectRecordId:
      (data.project_record_id as string | null) ??
      await getOperationalWorkspaceRecordIdByLegacyId("projects", (data.project_id as number | null) ?? null),
  };
}

export async function listWorkspaceNodes() {
  const { data, error } = await supabase
    .schema("workspace").from("nodes")
    .select("id, parent_id, case_id, project_id, project_record_id, kind, name, path, created_at, updated_at")
    .order("path", { ascending: true });

  if (error) throw error;
  return attachProjectRecordIds((data ?? []) as WorkspaceNodeSummary[]);
}

export async function ensureWorkspaceSystemNodes() {
  const [existingNodes, projects, investigations] = await Promise.all([
    listWorkspaceNodes(),
    listProjects(),
    listInvestigations(),
  ]);

  const foldersByPath = new Map(
    existingNodes
      .filter((node) => node.kind === "folder")
      .map((node) => [node.path, node]),
  );

  async function ensureFolder(input: {
    name: string;
    path: string;
    parentId: number | null;
    caseId?: string | null;
    projectId?: number | null;
    projectRecordId?: string | null;
  }) {
    const existing = foldersByPath.get(input.path);
    if (existing) return existing;

    const { projectId, projectRecordId } = await resolveProjectReference({
      projectId: input.projectId,
      projectRecordId: input.projectRecordId,
    });

    const { data, error } = await supabase
      .schema("workspace").from("nodes")
      .insert([
        {
          parent_id: input.parentId,
          case_id: input.caseId ?? null,
          project_id: projectId,
          project_record_id: projectRecordId,
          kind: "folder",
          name: input.name,
          path: input.path,
          content: null,
        },
      ])
      .select("id, parent_id, case_id, project_id, project_record_id, kind, name, path, created_at, updated_at")
      .single();

    if (error) throw error;

    const folder = await attachProjectRecordId(data as WorkspaceNodeSummary);
    foldersByPath.set(folder.path, folder);
    return folder;
  }

  const workspaceRoot = await ensureFolder({
    name: "Workspace",
    path: "Workspace",
    parentId: null,
  });

  const projectsRoot = await ensureFolder({
    name: "Projects",
    path: "Projects",
    parentId: null,
  });

  const investigationsRoot = await ensureFolder({
    name: "Investigations",
    path: "Investigations",
    parentId: null,
  });

  for (const project of projects) {
    await ensureFolder({
      name: project.name,
      path: `Projects/${project.id}`,
      parentId: projectsRoot.id,
      projectId: project.id,
      projectRecordId: project.record_id ?? null,
    });
  }

  for (const investigation of investigations) {
    await ensureFolder({
      name: investigation.name,
      path: `Investigations/${investigation.case_id}`,
      parentId: investigationsRoot.id,
      caseId: investigation.case_id,
    });
  }

  return {
    workspaceRootId: workspaceRoot.id,
    projectsRootId: projectsRoot.id,
    investigationsRootId: investigationsRoot.id,
  };
}

export async function getWorkspaceNode(id: number) {
  const { data, error } = await supabase
    .schema("workspace").from("nodes")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return attachProjectRecordId(data as WorkspaceNode);
}

export async function createWorkspaceFolder(input: {
  parentId?: number | null;
  name: string;
  caseId?: string | null;
  projectId?: number | null;
  projectRecordId?: string | null;
}) {
  const parent = await getWorkspaceParentContext(input.parentId ?? null);
  const path = parent.path ? `${parent.path}/${input.name}` : input.name;
  const caseId = input.caseId ?? parent.caseId ?? null;
  const { projectId, projectRecordId } = await resolveProjectReference({
    projectId: input.projectId ?? parent.projectId ?? null,
    projectRecordId: input.projectRecordId ?? parent.projectRecordId ?? null,
  });

  const { data, error } = await supabase
    .schema("workspace").from("nodes")
    .insert([
      {
        parent_id: input.parentId ?? null,
        case_id: caseId,
        project_id: projectId,
        project_record_id: projectRecordId,
        kind: "folder",
        name: input.name,
        path,
        content: null,
      },
    ])
    .select("*")
    .single();

  if (error) throw error;
  return attachProjectRecordId(data as WorkspaceNode);
}

export async function createWorkspaceFile(input: {
  parentId?: number | null;
  name: string;
  content?: string;
  caseId?: string | null;
  projectId?: number | null;
  projectRecordId?: string | null;
}) {
  const parent = await getWorkspaceParentContext(input.parentId ?? null);
  const path = parent.path ? `${parent.path}/${input.name}` : input.name;
  const caseId = input.caseId ?? parent.caseId ?? null;
  const { projectId, projectRecordId } = await resolveProjectReference({
    projectId: input.projectId ?? parent.projectId ?? null,
    projectRecordId: input.projectRecordId ?? parent.projectRecordId ?? null,
  });

  const { data, error } = await supabase
    .schema("workspace").from("nodes")
    .insert([
      {
        parent_id: input.parentId ?? null,
        case_id: caseId,
        project_id: projectId,
        project_record_id: projectRecordId,
        kind: "file",
        name: input.name,
        path,
        content: input.content ?? "",
      },
    ])
    .select("*")
    .single();

  if (error) throw error;
  return attachProjectRecordId(data as WorkspaceNode);
}

export async function updateWorkspaceFileContent(id: number, content: string) {
  const { data, error } = await supabase
    .schema("workspace").from("nodes")
    .update({ content })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return attachProjectRecordId(data as WorkspaceNode);
}

// ─── Workspace databases ──────────────────────────────────────────────────────

const DEFAULT_DATABASE_VIEW_CONFIG: WorkspaceDatabaseViewConfig = {
  sort: [],
  filter: [],
  hiddenFields: [],
};

function coerceViewConfig(value: unknown): WorkspaceDatabaseViewConfig {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_DATABASE_VIEW_CONFIG };
  }

  const candidate = value as Partial<WorkspaceDatabaseViewConfig>;
  const rawChartPalette = candidate.chartPalette as string | undefined;
  return {
    groupBy: typeof candidate.groupBy === "string" ? candidate.groupBy : undefined,
    sort: Array.isArray(candidate.sort)
      ? candidate.sort.filter(
          (
            item,
          ): item is {
            fieldId: string;
            direction: "asc" | "desc";
          } =>
            Boolean(item) &&
            typeof item === "object" &&
            "fieldId" in item &&
            typeof item.fieldId === "string" &&
            "direction" in item &&
            (item.direction === "asc" || item.direction === "desc"),
        )
      : [],
    filter: Array.isArray(candidate.filter)
      ? candidate.filter.filter(
          (
            item,
          ): item is {
            fieldId: string;
            op: string;
            value: string;
          } =>
            Boolean(item) &&
            typeof item === "object" &&
            "fieldId" in item &&
            typeof item.fieldId === "string" &&
            "op" in item &&
            typeof item.op === "string" &&
            "value" in item &&
            typeof item.value === "string",
        )
      : [],
    hiddenFields: Array.isArray(candidate.hiddenFields)
      ? candidate.hiddenFields.filter((item): item is string => typeof item === "string")
      : [],
    fieldOrder: Array.isArray(candidate.fieldOrder)
      ? candidate.fieldOrder.filter((item): item is string => typeof item === "string")
      : undefined,
    columnWidths:
      candidate.columnWidths && typeof candidate.columnWidths === "object"
        ? Object.fromEntries(
            Object.entries(candidate.columnWidths).filter(
              (entry): entry is [string, number] =>
                typeof entry[0] === "string" && typeof entry[1] === "number",
            ),
          )
        : undefined,
    listPropertyWidth:
      typeof candidate.listPropertyWidth === "number" ? candidate.listPropertyWidth : undefined,
    cardCoverField: typeof candidate.cardCoverField === "string" ? candidate.cardCoverField : undefined,
    cardFields: Array.isArray(candidate.cardFields)
      ? candidate.cardFields.filter((item): item is string => typeof item === "string")
      : undefined,
    chartType:
      candidate.chartType === "bar" ||
      candidate.chartType === "line" ||
      candidate.chartType === "donut" ||
      candidate.chartType === "pie" ||
      candidate.chartType === "gauge"
        ? candidate.chartType
        : undefined,
    chartValueField: typeof candidate.chartValueField === "string" ? candidate.chartValueField : undefined,
    chartValueFields: Array.isArray(candidate.chartValueFields)
      ? candidate.chartValueFields.filter((item): item is string => typeof item === "string")
      : undefined,
    chartAggregation:
      candidate.chartAggregation === "count" ||
      candidate.chartAggregation === "sum" ||
      candidate.chartAggregation === "avg" ||
      candidate.chartAggregation === "min" ||
      candidate.chartAggregation === "max"
        ? candidate.chartAggregation
        : undefined,
    chartSeriesMode:
      candidate.chartSeriesMode === "single" || candidate.chartSeriesMode === "multi"
        ? candidate.chartSeriesMode
        : undefined,
    chartOrientation:
      candidate.chartOrientation === "vertical" || candidate.chartOrientation === "horizontal"
        ? candidate.chartOrientation
        : undefined,
    chartLineVariant:
      candidate.chartLineVariant === "standard" || candidate.chartLineVariant === "profitLoss"
        ? candidate.chartLineVariant
        : undefined,
    chartShowXAxis:
      typeof candidate.chartShowXAxis === "boolean" ? candidate.chartShowXAxis : undefined,
    chartShowYAxis:
      typeof candidate.chartShowYAxis === "boolean" ? candidate.chartShowYAxis : undefined,
    chartGoalValue:
      typeof candidate.chartGoalValue === "number" && Number.isFinite(candidate.chartGoalValue)
        ? candidate.chartGoalValue
        : undefined,
    chartShowLegend:
      typeof candidate.chartShowLegend === "boolean" ? candidate.chartShowLegend : undefined,
    chartShowGrid:
      typeof candidate.chartShowGrid === "boolean" ? candidate.chartShowGrid : undefined,
    chartPalette:
      rawChartPalette === "blue"
        ? "blue"
        : rawChartPalette === "rose" || rawChartPalette === "pastel"
          ? "rose"
          : rawChartPalette === "gold" || rawChartPalette === "warm"
            ? "gold"
            : rawChartPalette === "teal" || rawChartPalette === "cool"
              ? "teal"
              : undefined,
    chartRange:
      candidate.chartRange === "30d" ||
      candidate.chartRange === "90d" ||
      candidate.chartRange === "365d" ||
      candidate.chartRange === "all"
        ? candidate.chartRange
        : undefined,
    timelineStartField:
      typeof candidate.timelineStartField === "string" ? candidate.timelineStartField : undefined,
    timelineEndField:
      typeof candidate.timelineEndField === "string" ? candidate.timelineEndField : undefined,
    timelineProgressField:
      typeof candidate.timelineProgressField === "string" ? candidate.timelineProgressField : undefined,
    timelineLabelField:
      typeof candidate.timelineLabelField === "string" ? candidate.timelineLabelField : undefined,
    timelineColorField:
      typeof candidate.timelineColorField === "string" ? candidate.timelineColorField : undefined,
    timelineViewMode:
      candidate.timelineViewMode === "Day" ||
      candidate.timelineViewMode === "Week" ||
      candidate.timelineViewMode === "Month" ||
      candidate.timelineViewMode === "Year"
        ? candidate.timelineViewMode
        : undefined,
  };
}

function hydrateWorkspaceDatabaseRecord(record: WorkspaceDatabaseRecord): WorkspaceDatabaseRecordModel {
  return {
    id: record.id,
    _body: record.body ?? undefined,
    _createdAt: record.created_at,
    _updatedAt: record.updated_at,
    _isTemplate: record.taxonomy?.is_template === true || undefined,
    ...(record.fields ?? {}),
  };
}

function hydrateWorkspaceDatabaseModel(
  database: WorkspaceDatabase,
  views: WorkspaceDatabaseView[],
  records: WorkspaceDatabaseRecord[],
): WorkspaceDatabaseModel {
  return {
    id: database.id,
    name: database.name,
    icon: database.icon,
    schema: database.schema,
    taxonomy: database.taxonomy,
    headerFieldIds: database.header_field_ids ?? undefined,
    views: views.map(hydrateWorkspaceDatabaseViewModel),
    records: records.map(hydrateWorkspaceDatabaseRecord),
  };
}

function hydrateWorkspaceDatabaseViewModel(view: WorkspaceDatabaseView): WorkspaceDatabaseModel["views"][number] {
  return {
    id: view.id,
    name: view.name,
    type: view.type,
    groupBy: view.config.groupBy,
    cardCoverField: view.config.cardCoverField,
    cardFields: view.config.cardFields,
    sort: view.config.sort,
    filter: view.config.filter,
    hiddenFields: view.config.hiddenFields,
    fieldOrder: view.config.fieldOrder,
    columnWidths: view.config.columnWidths,
    listPropertyWidth: view.config.listPropertyWidth,
    chartType: view.config.chartType,
    chartValueField: view.config.chartValueField,
    chartValueFields: view.config.chartValueFields,
    chartAggregation: view.config.chartAggregation,
    chartSeriesMode: view.config.chartSeriesMode,
    chartOrientation: view.config.chartOrientation,
    chartLineVariant: view.config.chartLineVariant,
    chartShowXAxis: view.config.chartShowXAxis,
    chartShowYAxis: view.config.chartShowYAxis,
    chartGoalValue: view.config.chartGoalValue,
    chartShowLegend: view.config.chartShowLegend,
    chartShowGrid: view.config.chartShowGrid,
    chartPalette: view.config.chartPalette,
    chartRange: view.config.chartRange,
    timelineStartField: view.config.timelineStartField,
    timelineEndField: view.config.timelineEndField,
    timelineProgressField: view.config.timelineProgressField,
    timelineLabelField: view.config.timelineLabelField,
    timelineColorField: view.config.timelineColorField,
    timelineViewMode: view.config.timelineViewMode,
  };
}

function defaultWorkspaceSchema(name?: string): WorkspaceDatabaseField[] {
  const titleFieldId = crypto.randomUUID();
  const statusFieldId = crypto.randomUUID();
  return [
    {
      id: titleFieldId,
      name: name?.trim() ? `${name.trim()} name` : "Name",
      type: "text",
    },
    {
      id: statusFieldId,
      name: "Status",
      type: "status",
      options: ["Not started", "In progress", "Done"],
      optionColors: {
        "Not started": resolveStatusColor("Not started"),
        "In progress": resolveStatusColor("In progress"),
        Done: resolveStatusColor("Done"),
      },
    },
    {
      id: crypto.randomUUID(),
      name: "Notes",
      type: "text",
    },
    {
      id: crypto.randomUUID(),
      name: "Created",
      type: "createdAt",
    },
    {
      id: crypto.randomUUID(),
      name: "Updated",
      type: "lastEditedAt",
    },
  ];
}

function defaultWorkspaceViewConfig(schema: WorkspaceDatabaseField[]): WorkspaceDatabaseViewConfig {
  return {
    sort: [],
    filter: [],
    hiddenFields: [],
    fieldOrder: schema.map((field) => field.id),
  };
}

type WorkspaceDatabaseRow = {
  id: string;
  name: string;
  icon: string | null;
  schema: WorkspaceDatabaseField[];
  header_field_ids: string[] | null;
  taxonomy: TaxonomyMetadata | null;
  created_at: string;
  updated_at: string;
};

type WorkspaceDatabaseViewRow = {
  id: string;
  database_id: string;
  name: string;
  type: WorkspaceDatabaseView["type"];
  config: unknown;
  position: number;
  created_at: string;
  updated_at: string;
};

type WorkspaceDatabaseRecordRow = {
  id: string;
  database_id: string;
  fields: Record<string, WorkspaceDatabaseFieldValue>;
  body: string | null;
  taxonomy: TaxonomyMetadata | null;
  created_at: string;
  updated_at: string;
};

function toWorkspaceDatabase(row: WorkspaceDatabaseRow): WorkspaceDatabase {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    schema: row.schema ?? [],
    header_field_ids: row.header_field_ids ?? [],
    taxonomy: row.taxonomy ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toWorkspaceDatabaseView(row: WorkspaceDatabaseViewRow): WorkspaceDatabaseView {
  return {
    id: row.id,
    database_id: row.database_id,
    name: row.name,
    type: row.type,
    config: coerceViewConfig(row.config),
    position: row.position,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toWorkspaceDatabaseRecord(row: WorkspaceDatabaseRecordRow): WorkspaceDatabaseRecord {
  return {
    id: row.id,
    database_id: row.database_id,
    fields: row.fields ?? {},
    body: row.body,
    taxonomy: row.taxonomy ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function updateWorkspaceRecordFields(
  id: string,
  nextFields: Record<string, WorkspaceDatabaseFieldValue>,
  nextBody?: string | null,
  nextTaxonomy?: TaxonomyMetadata,
) {
  const update: {
    fields: Record<string, WorkspaceDatabaseFieldValue>;
    body?: string | null;
    taxonomy?: TaxonomyMetadata;
  } = {
    fields: nextFields,
  };

  if (nextBody !== undefined) {
    update.body = nextBody;
  }
  if (nextTaxonomy !== undefined) {
    update.taxonomy = nextTaxonomy;
  }

  const { data, error } = await supabase
    .schema("workspace").from("records")
    .update(update)
    .eq("id", id)
    .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
    .single();

  if (error) throw error;
  return toWorkspaceDatabaseRecord(data as WorkspaceDatabaseRecordRow);
}

function buildOperationsWorkspaceSchema(projectsDatabaseId?: string): WorkspaceDatabaseField[] {
  return [
    {
      id: OPERATIONS_DB_FIELDS.legacyId,
      name: "Legacy ID",
      type: "number",
    },
    {
      id: OPERATIONS_DB_FIELDS.name,
      name: "Operation",
      type: "text",
    },
    {
      id: OPERATIONS_DB_FIELDS.status,
      name: "Status",
      type: "select",
      options: ["active", "on_hold", "archived"],
      optionColors: {
        active: "#10b981",
        on_hold: "#89b4fa",
        archived: "#6b7280",
      },
    },
    {
      id: OPERATIONS_DB_FIELDS.description,
      name: "Description",
      type: "text",
    },
    {
      id: OPERATIONS_DB_FIELDS.projects,
      name: "Projects",
      type: "relation",
      relation: {
        targetDatabaseId: projectsDatabaseId,
        targetRelationFieldId: PROJECTS_DB_FIELDS.operation,
      },
    },
    {
      id: OPERATIONS_DB_FIELDS.createdAt,
      name: "Created",
      type: "createdAt",
    },
    {
      id: OPERATIONS_DB_FIELDS.updatedAt,
      name: "Updated",
      type: "lastEditedAt",
    },
  ];
}

function buildProjectsWorkspaceSchema(operationsDatabaseId?: string): WorkspaceDatabaseField[] {
  return [
    {
      id: PROJECTS_DB_FIELDS.legacyId,
      name: "Legacy ID",
      type: "number",
    },
    {
      id: PROJECTS_DB_FIELDS.name,
      name: "Project",
      type: "text",
    },
    {
      id: PROJECTS_DB_FIELDS.status,
      name: "Status",
      type: "select",
      options: ["active", "on_hold", "archived"],
      optionColors: {
        active: "#10b981",
        on_hold: "#89b4fa",
        archived: "#6b7280",
      },
    },
    {
      id: PROJECTS_DB_FIELDS.type,
      name: "Type",
      type: "select",
      options: ["report", "scoping", "research", "client_case"],
    },
    {
      id: PROJECTS_DB_FIELDS.watchDomain,
      name: "Watch domain",
      type: "text",
    },
    {
      id: PROJECTS_DB_FIELDS.operation,
      name: "Operation",
      type: "relation",
      relation: {
        targetDatabaseId: operationsDatabaseId,
        targetRelationFieldId: OPERATIONS_DB_FIELDS.projects,
      },
    },
    {
      id: PROJECTS_DB_FIELDS.notes,
      name: "Notes",
      type: "text",
    },
    {
      id: PROJECTS_DB_FIELDS.createdAt,
      name: "Created",
      type: "createdAt",
    },
    {
      id: PROJECTS_DB_FIELDS.updatedAt,
      name: "Updated",
      type: "lastEditedAt",
    },
  ];
}

function fieldsEqual(
  left: Record<string, WorkspaceDatabaseFieldValue>,
  right: Record<string, WorkspaceDatabaseFieldValue>,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function taxonomyEqual(left?: TaxonomyMetadata | null, right?: TaxonomyMetadata | null) {
  return JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
}

export function isOperationalSystemWorkspaceIcon(icon: string | null | undefined): icon is (typeof SYSTEM_WORKSPACE_DATABASE_ICONS)[OperationalSystemKind] {
  return Boolean(icon && Object.values(SYSTEM_WORKSPACE_DATABASE_ICONS).includes(icon as (typeof SYSTEM_WORKSPACE_DATABASE_ICONS)[OperationalSystemKind]));
}

function getOperationalSystemKindFromIcon(icon: string | null | undefined): OperationalSystemKind | null {
  if (icon === SYSTEM_WORKSPACE_DATABASE_ICONS.operations) return "operations";
  if (icon === SYSTEM_WORKSPACE_DATABASE_ICONS.projects) return "projects";
  return null;
}

async function getWorkspaceDatabaseSummaryById(id: string) {
  const { data, error } = await supabase
    .schema("workspace").from("databases")
    .select("id, name, icon, schema, header_field_ids, taxonomy, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error) throw error;
  return toWorkspaceDatabase(data as WorkspaceDatabaseRow);
}

function defaultRecordTaxonomy(database: WorkspaceDatabaseSummary): TaxonomyMetadata {
  return {
    ...database.taxonomy,
    object_type: "database_record",
    routing_rule: database.taxonomy?.routing_rule ?? "named_database_wins",
  };
}

async function getOperationalSystemKindForDatabaseId(id: string) {
  const database = await getWorkspaceDatabaseSummaryById(id);
  return getOperationalSystemKindFromIcon(database.icon);
}

async function findWorkspaceRecordByLegacyId(
  databaseId: string,
  legacyFieldId: string,
  legacyId: number,
) {
  const { data, error } = await supabase
    .schema("workspace").from("records")
    .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
    .eq("database_id", databaseId);

  if (error) throw error;
  const row = ((data ?? []) as WorkspaceDatabaseRecordRow[]).find(
    (candidate) => candidate.fields?.[legacyFieldId] === legacyId,
  );
  return row ? toWorkspaceDatabaseRecord(row) : null;
}

async function getOperationalWorkspaceRecordIdByLegacyId(
  kind: OperationalSystemKind,
  legacyId: number | null | undefined,
) {
  if (legacyId == null) return null;
  const { operationsDatabase, projectsDatabase } = await ensureOperationalWorkspaceDatabases();
  const databaseId = kind === "operations" ? operationsDatabase.id : projectsDatabase.id;
  const legacyFieldId = kind === "operations" ? OPERATIONS_DB_FIELDS.legacyId : PROJECTS_DB_FIELDS.legacyId;
  const record = await findWorkspaceRecordByLegacyId(databaseId, legacyFieldId, legacyId);
  return record?.id ?? null;
}

async function getOperationalLegacyIdByRecordId(
  kind: OperationalSystemKind,
  recordId: string | null | undefined,
) {
  if (!recordId) return null;
  const legacyFieldId = kind === "operations" ? OPERATIONS_DB_FIELDS.legacyId : PROJECTS_DB_FIELDS.legacyId;
  const { data, error } = await supabase
    .schema("workspace").from("records")
    .select("id, fields")
    .eq("id", recordId)
    .maybeSingle();

  if (error) throw error;
  const legacyId = data?.fields?.[legacyFieldId];
  return typeof legacyId === "number" ? legacyId : null;
}

async function getOperationalWorkspaceRecordMap(kind: OperationalSystemKind) {
  const { operationsDatabase, projectsDatabase } = await ensureOperationalWorkspaceDatabases();
  const databaseId = kind === "operations" ? operationsDatabase.id : projectsDatabase.id;
  const legacyFieldId = kind === "operations" ? OPERATIONS_DB_FIELDS.legacyId : PROJECTS_DB_FIELDS.legacyId;
  const relationFieldId = kind === "projects" ? PROJECTS_DB_FIELDS.operation : undefined;
  const { data, error } = await supabase
    .schema("workspace").from("records")
    .select("id, fields")
    .eq("database_id", databaseId);

  if (error) throw error;

  const byLegacyId = new Map<number, { recordId: string; relationIds?: string[] }>();
  for (const row of (data ?? []) as Array<{ id: string; fields: Record<string, WorkspaceDatabaseFieldValue> }>) {
    const legacyId = row.fields?.[legacyFieldId];
    if (typeof legacyId !== "number") continue;
    const relationIds = relationFieldId && Array.isArray(row.fields?.[relationFieldId])
      ? (row.fields[relationFieldId] as string[])
      : undefined;
    byLegacyId.set(legacyId, { recordId: row.id, relationIds });
  }
  return byLegacyId;
}

async function getLegacyIdMapForWorkspaceRecords(recordIds: string[], legacyFieldId: string) {
  if (recordIds.length === 0) return new Map<string, number>();
  const { data, error } = await supabase
    .schema("workspace").from("records")
    .select("id, fields")
    .in("id", recordIds);

  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ id: string; fields: Record<string, WorkspaceDatabaseFieldValue> }>) {
    const legacyId = row.fields?.[legacyFieldId];
    if (typeof legacyId === "number") {
      map.set(row.id, legacyId);
    }
  }
  return map;
}

function sanitizeOperationStatus(value: WorkspaceDatabaseFieldValue) {
  if (value === "archived") return "archived";
  if (value === "on_hold" || value === "on hold") return "on_hold";
  return "active";
}

function sanitizeProjectStatus(value: WorkspaceDatabaseFieldValue) {
  if (value === "archived") return "archived";
  if (value === "on_hold" || value === "on hold") return "on_hold";
  return "active";
}

function sanitizeProjectType(value: WorkspaceDatabaseFieldValue): Project["type"] {
  return value === "report" || value === "scoping" || value === "client_case" ? value : "research";
}

async function ensureOperationalWorkspaceDatabases() {
  const { data, error } = await supabase
    .schema("workspace").from("databases")
    .select("id, name, icon, schema, header_field_ids, taxonomy, created_at, updated_at")
    .in("icon", [SYSTEM_WORKSPACE_DATABASE_ICONS.operations, SYSTEM_WORKSPACE_DATABASE_ICONS.projects]);

  if (error) throw error;

  const existing = new Map(
    ((data ?? []) as WorkspaceDatabaseRow[]).map((row) => [row.icon ?? "", toWorkspaceDatabase(row)]),
  );

  let operationsDatabase = existing.get(SYSTEM_WORKSPACE_DATABASE_ICONS.operations);
  let projectsDatabase = existing.get(SYSTEM_WORKSPACE_DATABASE_ICONS.projects);

  if (!operationsDatabase) {
    const created = await createWorkspaceDatabase({
      name: "Operations",
      icon: SYSTEM_WORKSPACE_DATABASE_ICONS.operations,
      schema: buildOperationsWorkspaceSchema(),
      taxonomy: {
        entity: "genzen",
        entity_label: "GenZen",
        area: "internal_ops",
        area_label: "Internal Ops",
        folder: "Operations",
        object_type: "system_database",
        routing_rule: "intellizen_operations_surface",
      },
    });
    operationsDatabase = created.database;
    await Promise.all([
      updateWorkspaceDatabaseHeaderFields(created.database.id, [OPERATIONS_DB_FIELDS.name], true),
      updateWorkspaceView(created.views[0].id, {
        config: {
          ...created.views[0].config,
          hiddenFields: [OPERATIONS_DB_FIELDS.legacyId],
          fieldOrder: [
            OPERATIONS_DB_FIELDS.name,
            OPERATIONS_DB_FIELDS.status,
            OPERATIONS_DB_FIELDS.description,
            OPERATIONS_DB_FIELDS.projects,
            OPERATIONS_DB_FIELDS.createdAt,
            OPERATIONS_DB_FIELDS.updatedAt,
            OPERATIONS_DB_FIELDS.legacyId,
          ],
        },
      }),
    ]);
  }

  if (!projectsDatabase) {
    const created = await createWorkspaceDatabase({
      name: "Projects",
      icon: SYSTEM_WORKSPACE_DATABASE_ICONS.projects,
      schema: buildProjectsWorkspaceSchema(operationsDatabase?.id),
      taxonomy: {
        entity: "genzen",
        entity_label: "GenZen",
        area: "internal_ops",
        area_label: "Internal Ops",
        folder: "Projects",
        object_type: "system_database",
        routing_rule: "intellizen_projects_surface",
      },
    });
    projectsDatabase = created.database;
    await Promise.all([
      updateWorkspaceDatabaseHeaderFields(created.database.id, [PROJECTS_DB_FIELDS.name], true),
      updateWorkspaceView(created.views[0].id, {
        config: {
          ...created.views[0].config,
          hiddenFields: [PROJECTS_DB_FIELDS.legacyId],
          fieldOrder: [
            PROJECTS_DB_FIELDS.name,
            PROJECTS_DB_FIELDS.status,
            PROJECTS_DB_FIELDS.type,
            PROJECTS_DB_FIELDS.watchDomain,
            PROJECTS_DB_FIELDS.operation,
            PROJECTS_DB_FIELDS.notes,
            PROJECTS_DB_FIELDS.createdAt,
            PROJECTS_DB_FIELDS.updatedAt,
            PROJECTS_DB_FIELDS.legacyId,
          ],
        },
      }),
    ]);
  }

  if (!operationsDatabase || !projectsDatabase) {
    throw new Error("Operational workspace databases could not be created.");
  }

  const nextOperationsSchema = buildOperationsWorkspaceSchema(projectsDatabase.id);
  const nextProjectsSchema = buildProjectsWorkspaceSchema(operationsDatabase.id);

  if (JSON.stringify(operationsDatabase.schema) !== JSON.stringify(nextOperationsSchema)) {
    operationsDatabase = await updateWorkspaceDatabaseSchema(operationsDatabase.id, nextOperationsSchema, true);
  }

  if (JSON.stringify(projectsDatabase.schema) !== JSON.stringify(nextProjectsSchema)) {
    projectsDatabase = await updateWorkspaceDatabaseSchema(projectsDatabase.id, nextProjectsSchema, true);
  }

  return {
    operationsDatabase,
    projectsDatabase,
  };
}

async function syncOperationalWorkspaceDatabasesInner() {
  const { operationsDatabase, projectsDatabase } = await ensureOperationalWorkspaceDatabases();

  const [
    { data: operationRows, error: operationsError },
    { data: projectRows, error: projectsError },
    { data: operationRecordRows, error: operationRecordsError },
    { data: projectRecordRows, error: projectRecordsError },
  ] = await Promise.all([
    supabase.schema("anchors").from("operations").select("*").order("id", { ascending: true }),
    supabase.schema("anchors").from("projects").select("*").order("id", { ascending: true }),
    supabase
      .schema("workspace").from("records")
      .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
      .eq("database_id", operationsDatabase.id),
    supabase
      .schema("workspace").from("records")
      .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
      .eq("database_id", projectsDatabase.id),
  ]);

  if (operationsError) throw operationsError;
  if (projectsError) throw projectsError;
  if (operationRecordsError) throw operationRecordsError;
  if (projectRecordsError) throw projectRecordsError;

  const operations = (operationRows ?? []) as Operation[];
  const projects = (projectRows ?? []) as Project[];
  const operationRecords = ((operationRecordRows ?? []) as WorkspaceDatabaseRecordRow[]).map(toWorkspaceDatabaseRecord);
  const projectRecords = ((projectRecordRows ?? []) as WorkspaceDatabaseRecordRow[]).map(toWorkspaceDatabaseRecord);

  const operationRecordByLegacyId = new Map<number, WorkspaceDatabaseRecord>();
  for (const record of operationRecords) {
    const legacyId = record.fields[OPERATIONS_DB_FIELDS.legacyId];
    if (typeof legacyId === "number") {
      operationRecordByLegacyId.set(legacyId, record);
    }
  }

  const projectRecordByLegacyId = new Map<number, WorkspaceDatabaseRecord>();
  for (const record of projectRecords) {
    const legacyId = record.fields[PROJECTS_DB_FIELDS.legacyId];
    if (typeof legacyId === "number") {
      projectRecordByLegacyId.set(legacyId, record);
    }
  }

  for (const operation of operations) {
    const nextTaxonomy = operation.taxonomy ?? defaultRecordTaxonomy(operationsDatabase);
    const nextFields: Record<string, WorkspaceDatabaseFieldValue> = {
      [OPERATIONS_DB_FIELDS.legacyId]: operation.id,
      [OPERATIONS_DB_FIELDS.name]: operation.name,
      [OPERATIONS_DB_FIELDS.status]: operation.status,
      [OPERATIONS_DB_FIELDS.description]: operation.description ?? null,
      [OPERATIONS_DB_FIELDS.projects]: [],
    };
    const existing = operationRecordByLegacyId.get(operation.id);
    if (!existing) {
      const created = await createWorkspaceRecord({
        databaseId: operationsDatabase.id,
        fields: nextFields,
        taxonomy: nextTaxonomy,
        skipSystemSync: true,
      });
      operationRecordByLegacyId.set(operation.id, created);
      continue;
    }
    if (!fieldsEqual(existing.fields, nextFields) || !taxonomyEqual(existing.taxonomy, nextTaxonomy)) {
      const updated = await updateWorkspaceRecord(existing.id, { fields: nextFields, taxonomy: nextTaxonomy }, true);
      operationRecordByLegacyId.set(operation.id, updated);
    }
  }

  for (const project of projects) {
    const nextTaxonomy = project.taxonomy ?? defaultRecordTaxonomy(projectsDatabase);
    const relatedOperationRecord = project.operation_id != null
      ? operationRecordByLegacyId.get(project.operation_id)
      : undefined;
    const nextFields: Record<string, WorkspaceDatabaseFieldValue> = {
      [PROJECTS_DB_FIELDS.legacyId]: project.id,
      [PROJECTS_DB_FIELDS.name]: project.name,
      [PROJECTS_DB_FIELDS.status]: project.status,
      [PROJECTS_DB_FIELDS.type]: project.type,
      [PROJECTS_DB_FIELDS.watchDomain]: project.watch_domain ?? null,
      [PROJECTS_DB_FIELDS.notes]: project.notes ?? null,
      [PROJECTS_DB_FIELDS.operation]: relatedOperationRecord ? [relatedOperationRecord.id] : [],
    };
    const existing = projectRecordByLegacyId.get(project.id);
    if (!existing) {
      const created = await createWorkspaceRecord({
        databaseId: projectsDatabase.id,
        fields: nextFields,
        taxonomy: nextTaxonomy,
        skipSystemSync: true,
      });
      projectRecordByLegacyId.set(project.id, created);
      continue;
    }
    if (!fieldsEqual(existing.fields, nextFields) || !taxonomyEqual(existing.taxonomy, nextTaxonomy)) {
      const updated = await updateWorkspaceRecord(existing.id, { fields: nextFields, taxonomy: nextTaxonomy }, true);
      projectRecordByLegacyId.set(project.id, updated);
    }
  }

  const projectsByOperationId = new Map<number, string[]>();
  for (const project of projects) {
    if (project.operation_id == null) continue;
    const projectRecord = projectRecordByLegacyId.get(project.id);
    if (!projectRecord) continue;
    const bucket = projectsByOperationId.get(project.operation_id) ?? [];
    bucket.push(projectRecord.id);
    projectsByOperationId.set(project.operation_id, bucket);
  }

  for (const operation of operations) {
    const existing = operationRecordByLegacyId.get(operation.id);
    if (!existing) continue;
    const nextTaxonomy = operation.taxonomy ?? defaultRecordTaxonomy(operationsDatabase);
    const nextFields: Record<string, WorkspaceDatabaseFieldValue> = {
      [OPERATIONS_DB_FIELDS.legacyId]: operation.id,
      [OPERATIONS_DB_FIELDS.name]: operation.name,
      [OPERATIONS_DB_FIELDS.status]: operation.status,
      [OPERATIONS_DB_FIELDS.description]: operation.description ?? null,
      [OPERATIONS_DB_FIELDS.projects]: projectsByOperationId.get(operation.id) ?? [],
    };
    if (!fieldsEqual(existing.fields, nextFields) || !taxonomyEqual(existing.taxonomy, nextTaxonomy)) {
      await updateWorkspaceRecord(existing.id, { fields: nextFields, taxonomy: nextTaxonomy }, true);
    }
  }

  const validOperationIds = new Set(operations.map((operation) => operation.id));
  const validProjectIds = new Set(projects.map((project) => project.id));

  for (const record of operationRecords) {
    const legacyId = record.fields[OPERATIONS_DB_FIELDS.legacyId];
    if (typeof legacyId === "number" && !validOperationIds.has(legacyId)) {
      await deleteWorkspaceRecord(record.id, true);
    }
  }

  for (const record of projectRecords) {
    const legacyId = record.fields[PROJECTS_DB_FIELDS.legacyId];
    if (typeof legacyId === "number" && !validProjectIds.has(legacyId)) {
      await deleteWorkspaceRecord(record.id, true);
    }
  }
}

export async function syncOperationalWorkspaceDatabases(options?: { force?: boolean }) {
  if (!shouldSyncOperationalWorkspaceDatabases(options?.force)) {
    return;
  }
  if (!operationalWorkspaceSyncPromise) {
    operationalWorkspaceSyncPromise = syncOperationalWorkspaceDatabasesInner()
      .then(() => {
        operationalWorkspaceLastSyncedAt = Date.now();
        operationalWorkspaceSyncDirty = false;
      })
      .catch((error) => {
        operationalWorkspaceSyncDirty = true;
        throw error;
      })
      .finally(() => {
        operationalWorkspaceSyncPromise = null;
      });
  }
  return operationalWorkspaceSyncPromise;
}

export async function listWorkspaceDatabases() {
  const { data, error } = await supabase
    .schema("workspace").from("databases")
    .select("id, name, icon, schema, header_field_ids, taxonomy, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as WorkspaceDatabaseRow[]).map(toWorkspaceDatabase) as WorkspaceDatabaseSummary[];
}

export async function listWorkspaceDatabaseCatalog() {
  const [
    { data: databaseRows, error: databaseError },
    { data: recordRows, error: recordError },
    { data: viewRows, error: viewError },
  ] =
    await Promise.all([
      supabase
        .schema("workspace").from("databases")
        .select("id, name, icon, schema, header_field_ids, taxonomy, created_at, updated_at")
        .order("name", { ascending: true }),
      supabase
        .schema("workspace").from("records")
        .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(0, WORKSPACE_CATALOG_RECORD_LIMIT - 1),
      supabase
        .schema("workspace").from("views")
        .select("id, database_id, name, type, config, position, created_at, updated_at")
        .order("database_id", { ascending: true })
        .order("position", { ascending: true }),
    ]);

  if (databaseError) throw databaseError;
  if (recordError) throw recordError;
  if (viewError) throw viewError;

  const recordsByDatabase = new Map<string, WorkspaceDatabaseRecordModel[]>();
  for (const row of (recordRows ?? []) as WorkspaceDatabaseRecordRow[]) {
    const record = hydrateWorkspaceDatabaseRecord(toWorkspaceDatabaseRecord(row));
    const bucket = recordsByDatabase.get(row.database_id) ?? [];
    bucket.push(record);
    recordsByDatabase.set(row.database_id, bucket);
  }

  const viewsByDatabase = new Map<string, WorkspaceDatabaseModel["views"]>();
  for (const row of (viewRows ?? []) as WorkspaceDatabaseViewRow[]) {
    const view = hydrateWorkspaceDatabaseViewModel(toWorkspaceDatabaseView(row));
    const bucket = viewsByDatabase.get(row.database_id) ?? [];
    bucket.push(view);
    viewsByDatabase.set(row.database_id, bucket);
  }

  return ((databaseRows ?? []) as WorkspaceDatabaseRow[]).map((row) => {
    const database = toWorkspaceDatabase(row);
    return {
      id: database.id,
      name: database.name,
      schema: database.schema,
      headerFieldIds: database.header_field_ids ?? [],
      taxonomy: database.taxonomy,
      records: recordsByDatabase.get(database.id) ?? [],
      views: viewsByDatabase.get(database.id) ?? [],
    } satisfies WorkspaceDatabaseCatalogEntry;
  });
}

async function fetchWorkspaceDatabaseBundleRows(id: string) {
  const [
    { data: databaseRow, error: databaseError },
    { data: viewRows, error: viewError },
    { data: recordRows, error: recordError },
  ] = await Promise.all([
    supabase
      .schema("workspace").from("databases")
      .select("id, name, icon, schema, header_field_ids, taxonomy, created_at, updated_at")
      .eq("id", id)
      .single(),
    supabase
      .schema("workspace").from("views")
      .select("id, database_id, name, type, config, position, created_at, updated_at")
      .eq("database_id", id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .schema("workspace").from("records")
      .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
      .eq("database_id", id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(0, WORKSPACE_BUNDLE_RECORD_LIMIT - 1),
  ]);

  if (databaseError) throw databaseError;
  if (viewError) throw viewError;
  if (recordError) throw recordError;

  return {
    databaseRow: databaseRow as WorkspaceDatabaseRow,
    viewRows: (viewRows ?? []) as WorkspaceDatabaseViewRow[],
    recordRows: (recordRows ?? []) as WorkspaceDatabaseRecordRow[],
  };
}

function buildWorkspaceDatabaseBundleFromRows(input: {
  databaseRow: WorkspaceDatabaseRow;
  viewRows: WorkspaceDatabaseViewRow[];
  recordRows: WorkspaceDatabaseRecordRow[];
}) {
  const database = toWorkspaceDatabase(input.databaseRow);
  const views = input.viewRows.map(toWorkspaceDatabaseView);
  const records = input.recordRows.map(toWorkspaceDatabaseRecord);

  return {
    database,
    views,
    records,
    model: hydrateWorkspaceDatabaseModel(database, views, records),
  } satisfies WorkspaceDatabaseBundle;
}

export async function getWorkspaceDatabaseBundle(id: string) {
  const initialRows = await fetchWorkspaceDatabaseBundleRows(id);
  const initialDatabase = toWorkspaceDatabase(initialRows.databaseRow);

  if (
    isOperationalSystemWorkspaceIcon(initialDatabase.icon) &&
    shouldSyncOperationalWorkspaceDatabases()
  ) {
    await syncOperationalWorkspaceDatabases();
    return buildWorkspaceDatabaseBundleFromRows(await fetchWorkspaceDatabaseBundleRows(id));
  }

  return buildWorkspaceDatabaseBundleFromRows(initialRows);
}

export async function createWorkspaceDatabase(input?: {
  name?: string;
  icon?: string | null;
  schema?: WorkspaceDatabaseField[];
  taxonomy?: TaxonomyMetadata;
}) {
  const schema = input?.schema ?? defaultWorkspaceSchema(input?.name);
  const databaseName = input?.name?.trim() || "Untitled database";
  const taxonomy: TaxonomyMetadata = {
    entity: "genzen",
    entity_label: "GenZen",
    area: "internal_ops",
    area_label: "Internal Ops",
    folder: databaseName,
    object_type: "database",
    routing_rule: "named_database_wins",
    ...(input?.taxonomy ?? {}),
  };
  const { data: databaseRow, error: databaseError } = await supabase
    .schema("workspace").from("databases")
    .insert([
      {
        name: databaseName,
        icon: input?.icon ?? null,
        schema,
        header_field_ids: [],
        taxonomy,
      },
    ])
    .select("id, name, icon, schema, header_field_ids, taxonomy, created_at, updated_at")
    .single();

  if (databaseError) throw databaseError;

  const database = toWorkspaceDatabase(databaseRow as WorkspaceDatabaseRow);
  const { data: viewRow, error: viewError } = await supabase
    .schema("workspace").from("views")
    .insert([
      {
        database_id: database.id,
        name: "All items",
        type: "table",
        config: defaultWorkspaceViewConfig(schema),
        position: 0,
      },
    ])
    .select("id, database_id, name, type, config, position, created_at, updated_at")
    .single();

  if (viewError) throw viewError;

  const view = toWorkspaceDatabaseView(viewRow as WorkspaceDatabaseViewRow);
  return {
    database,
    views: [view],
    records: [],
    model: hydrateWorkspaceDatabaseModel(database, [view], []),
  } satisfies WorkspaceDatabaseBundle;
}

export async function updateWorkspaceDatabase(
  id: string,
  input: Partial<Pick<WorkspaceDatabase, "name" | "icon" | "taxonomy">>,
) {
  const database = await getWorkspaceDatabaseSummaryById(id);
  if (isOperationalSystemWorkspaceIcon(database.icon)) {
    throw new Error("System databases cannot be renamed or reconfigured.");
  }
  const { data, error } = await supabase
    .schema("workspace").from("databases")
    .update(input)
    .eq("id", id)
    .select("id, name, icon, schema, header_field_ids, taxonomy, created_at, updated_at")
    .single();

  if (error) throw error;
  return toWorkspaceDatabase(data as WorkspaceDatabaseRow);
}

export async function updateWorkspaceDatabaseSchema(id: string, schema: WorkspaceDatabaseField[], allowSystem = false) {
  const database = await getWorkspaceDatabaseSummaryById(id);
  if (!allowSystem && isOperationalSystemWorkspaceIcon(database.icon)) {
    throw new Error("System database schemas are managed automatically.");
  }
  const { data, error } = await supabase
    .schema("workspace").from("databases")
    .update({ schema })
    .eq("id", id)
    .select("id, name, icon, schema, header_field_ids, taxonomy, created_at, updated_at")
    .single();

  if (error) throw error;
  return toWorkspaceDatabase(data as WorkspaceDatabaseRow);
}

export async function updateWorkspaceDatabaseHeaderFields(id: string, fieldIds: string[], allowSystem = false) {
  const database = await getWorkspaceDatabaseSummaryById(id);
  if (!allowSystem && isOperationalSystemWorkspaceIcon(database.icon)) {
    throw new Error("System database header fields are managed automatically.");
  }
  const { data, error } = await supabase
    .schema("workspace").from("databases")
    .update({ header_field_ids: fieldIds })
    .eq("id", id)
    .select("id, name, icon, schema, header_field_ids, taxonomy, created_at, updated_at")
    .single();

  if (error) throw error;
  return toWorkspaceDatabase(data as WorkspaceDatabaseRow);
}

export async function deleteWorkspaceDatabase(id: string) {
  const database = await getWorkspaceDatabaseSummaryById(id);
  if (isOperationalSystemWorkspaceIcon(database.icon)) {
    throw new Error("System databases cannot be deleted.");
  }

  const { error: recordError } = await supabase
    .schema("workspace").from("records")
    .delete()
    .eq("database_id", id);
  if (recordError) throw recordError;

  const { error: viewError } = await supabase
    .schema("workspace").from("views")
    .delete()
    .eq("database_id", id);
  if (viewError) throw viewError;

  const { error: databaseError } = await supabase
    .schema("workspace").from("databases")
    .delete()
    .eq("id", id);
  if (databaseError) throw databaseError;
}

export async function createWorkspaceView(input: {
  databaseId: string;
  name: string;
  type?: WorkspaceDatabaseView["type"];
  config?: WorkspaceDatabaseViewConfig;
}) {
  const { data: existing, error: existingError } = await supabase
    .schema("workspace").from("views")
    .select("position")
    .eq("database_id", input.databaseId)
    .order("position", { ascending: false })
    .limit(1);

  if (existingError) throw existingError;

  const { data, error } = await supabase
    .schema("workspace").from("views")
    .insert([
      {
        database_id: input.databaseId,
        name: input.name.trim() || "New view",
        type: input.type ?? "table",
        config: input.config ?? { ...DEFAULT_DATABASE_VIEW_CONFIG },
        position: ((existing ?? [])[0]?.position as number | undefined ?? -1) + 1,
      },
    ])
    .select("id, database_id, name, type, config, position, created_at, updated_at")
    .single();

  if (error) throw error;
  return toWorkspaceDatabaseView(data as WorkspaceDatabaseViewRow);
}

export async function updateWorkspaceView(
  id: string,
  input: Partial<Pick<WorkspaceDatabaseView, "name" | "type" | "position">> & {
    config?: WorkspaceDatabaseViewConfig;
  },
) {
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.type !== undefined) update.type = input.type;
  if (input.position !== undefined) update.position = input.position;
  if (input.config !== undefined) update.config = input.config;

  const { data, error } = await supabase
    .schema("workspace").from("views")
    .update(update)
    .eq("id", id)
    .select("id, database_id, name, type, config, position, created_at, updated_at")
    .single();

  if (error) throw error;
  return toWorkspaceDatabaseView(data as WorkspaceDatabaseViewRow);
}

export async function deleteWorkspaceView(id: string) {
  const { error } = await supabase.schema("workspace").from("views").delete().eq("id", id);
  if (error) throw error;
}

export async function createWorkspaceRecord(input: {
  databaseId: string;
  fields?: Record<string, WorkspaceDatabaseFieldValue>;
  body?: string | null;
  taxonomy?: TaxonomyMetadata;
  skipSystemSync?: boolean;
}) {
  if (!input.skipSystemSync) {
    const { operationsDatabase, projectsDatabase } = await ensureOperationalWorkspaceDatabases();
    if (input.databaseId === operationsDatabase.id) {
      const taxonomy: TaxonomyMetadata = {
        ...defaultRecordTaxonomy(operationsDatabase),
        ...(input.taxonomy ?? {}),
        object_type: "operation",
      };
      const { data, error } = await supabase
        .schema("anchors").from("operations")
        .insert([
          {
            name: String(input.fields?.[OPERATIONS_DB_FIELDS.name] ?? "Untitled operation").trim() || "Untitled operation",
            description:
              typeof input.fields?.[OPERATIONS_DB_FIELDS.description] === "string"
                ? input.fields[OPERATIONS_DB_FIELDS.description]
                : null,
            status: sanitizeOperationStatus(input.fields?.[OPERATIONS_DB_FIELDS.status]),
            taxonomy,
          },
        ])
        .select("*")
        .single();

      if (error) throw error;
      const operation = data as Operation;

      const linkedProjectIds = Array.isArray(input.fields?.[OPERATIONS_DB_FIELDS.projects])
        ? (input.fields?.[OPERATIONS_DB_FIELDS.projects] as string[])
        : [];
      if (linkedProjectIds.length > 0) {
        const projectIdMap = await getLegacyIdMapForWorkspaceRecords(linkedProjectIds, PROJECTS_DB_FIELDS.legacyId);
        for (const projectId of projectIdMap.values()) {
          const { error: linkError } = await supabase
            .schema("anchors").from("projects")
            .update({ operation_id: operation.id })
            .eq("id", projectId);
          if (linkError) throw linkError;
        }
      }

      await syncOperationalWorkspaceDatabases();
      const record = await findWorkspaceRecordByLegacyId(operationsDatabase.id, OPERATIONS_DB_FIELDS.legacyId, operation.id);
      if (!record) throw new Error("Operation workspace record was not created.");
      if (input.body !== undefined) {
        return updateWorkspaceRecordFields(record.id, record.fields, input.body);
      }
      return record;
    }

    if (input.databaseId === projectsDatabase.id) {
      const taxonomy: TaxonomyMetadata = {
        ...defaultRecordTaxonomy(projectsDatabase),
        ...(input.taxonomy ?? {}),
        object_type: "intellizen_project",
      };
      const linkedOperationIds = Array.isArray(input.fields?.[PROJECTS_DB_FIELDS.operation])
        ? (input.fields?.[PROJECTS_DB_FIELDS.operation] as string[])
        : [];
      const operationIdMap = await getLegacyIdMapForWorkspaceRecords(linkedOperationIds.slice(0, 1), OPERATIONS_DB_FIELDS.legacyId);
      const operationId = linkedOperationIds[0] ? (operationIdMap.get(linkedOperationIds[0]) ?? null) : null;

      const { data, error } = await supabase
        .schema("anchors").from("projects")
        .insert([
          {
            name: String(input.fields?.[PROJECTS_DB_FIELDS.name] ?? "Untitled project").trim() || "Untitled project",
            type: sanitizeProjectType(input.fields?.[PROJECTS_DB_FIELDS.type]),
            watch_domain:
              typeof input.fields?.[PROJECTS_DB_FIELDS.watchDomain] === "string"
                ? input.fields[PROJECTS_DB_FIELDS.watchDomain]
                : null,
            status: sanitizeProjectStatus(input.fields?.[PROJECTS_DB_FIELDS.status]),
            notes:
              typeof input.fields?.[PROJECTS_DB_FIELDS.notes] === "string"
                ? input.fields[PROJECTS_DB_FIELDS.notes]
                : null,
            operation_id: operationId,
            taxonomy,
          },
        ])
        .select("*")
        .single();

      if (error) throw error;
      const project = data as Project;

      await syncOperationalWorkspaceDatabases();
      const record = await findWorkspaceRecordByLegacyId(projectsDatabase.id, PROJECTS_DB_FIELDS.legacyId, project.id);
      if (!record) throw new Error("Project workspace record was not created.");
      if (input.body !== undefined) {
        return updateWorkspaceRecordFields(record.id, record.fields, input.body);
      }
      return record;
    }
  }

  const sourceDatabase = await getWorkspaceDatabaseSummaryById(input.databaseId);
  const taxonomy = {
    ...defaultRecordTaxonomy(sourceDatabase),
    ...(input.taxonomy ?? {}),
  };

  const { data, error } = await supabase
    .schema("workspace").from("records")
    .insert([
      {
        database_id: input.databaseId,
        fields: input.fields ?? {},
        body: input.body ?? null,
        taxonomy,
      },
    ])
    .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
    .single();

  if (error) throw error;
  return toWorkspaceDatabaseRecord(data as WorkspaceDatabaseRecordRow);
}

export async function createWorkspaceRecords(
  input: Array<{
    databaseId: string;
    fields?: Record<string, WorkspaceDatabaseFieldValue>;
    body?: string | null;
    taxonomy?: TaxonomyMetadata;
  }>,
) {
  if (input.length === 0) return [] as WorkspaceDatabaseRecord[];
  const databaseIds = Array.from(new Set(input.map((record) => record.databaseId)));
  const { data: databaseRows, error: databaseError } = await supabase
    .schema("workspace").from("databases")
    .select("id, name, icon, schema, header_field_ids, taxonomy, created_at, updated_at")
    .in("id", databaseIds);

  if (databaseError) throw databaseError;
  const databasesById = new Map(
    ((databaseRows ?? []) as WorkspaceDatabaseRow[]).map((row) => {
      const database = toWorkspaceDatabase(row);
      return [database.id, database] as const;
    }),
  );

  const { data, error } = await supabase
    .schema("workspace").from("records")
    .insert(
      input.map((record) => {
        const database = databasesById.get(record.databaseId);
        return {
          database_id: record.databaseId,
          fields: record.fields ?? {},
          body: record.body ?? null,
          taxonomy: {
            ...(database ? defaultRecordTaxonomy(database) : {}),
            ...(record.taxonomy ?? {}),
          },
        };
      }),
    )
    .select("id, database_id, fields, body, taxonomy, created_at, updated_at");

  if (error) throw error;
  return ((data ?? []) as WorkspaceDatabaseRecordRow[]).map(toWorkspaceDatabaseRecord);
}

export async function updateWorkspaceRecord(
  id: string,
  input: Partial<Pick<WorkspaceDatabaseRecord, "body">> & {
    fields?: Record<string, WorkspaceDatabaseFieldValue>;
    fieldId?: string;
    value?: WorkspaceDatabaseFieldValue;
    taxonomy?: TaxonomyMetadata;
  },
  skipSystemSync = false,
) {
  const { data: existing, error: existingError } = await supabase
    .schema("workspace").from("records")
    .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
    .eq("id", id)
    .single();

  if (existingError) throw existingError;

  const current = toWorkspaceDatabaseRecord(existing as WorkspaceDatabaseRecordRow);
  const nextFields = input.fields
    ? input.fields
    : input.fieldId
      ? { ...current.fields, [input.fieldId]: input.value }
      : current.fields;

  if (!skipSystemSync) {
    const systemKind = await getOperationalSystemKindForDatabaseId(current.database_id);
    if (systemKind === "operations") {
      const legacyId = current.fields[OPERATIONS_DB_FIELDS.legacyId];
      if (typeof legacyId === "number") {
        const updatePayload: Partial<Pick<Operation, "name" | "description" | "status" | "taxonomy">> = {
          name: String(nextFields[OPERATIONS_DB_FIELDS.name] ?? current.fields[OPERATIONS_DB_FIELDS.name] ?? "Untitled operation").trim() || "Untitled operation",
          description:
            typeof nextFields[OPERATIONS_DB_FIELDS.description] === "string"
              ? String(nextFields[OPERATIONS_DB_FIELDS.description])
              : null,
          status: sanitizeOperationStatus(nextFields[OPERATIONS_DB_FIELDS.status]),
        };
        if (input.taxonomy !== undefined) {
          updatePayload.taxonomy = { ...input.taxonomy, object_type: "operation" };
        }
        const { error } = await supabase.schema("anchors").from("operations").update(updatePayload).eq("id", legacyId);
        if (error) throw error;

        if (Array.isArray(nextFields[OPERATIONS_DB_FIELDS.projects])) {
          const desiredProjectMap = await getLegacyIdMapForWorkspaceRecords(
            nextFields[OPERATIONS_DB_FIELDS.projects] as string[],
            PROJECTS_DB_FIELDS.legacyId,
          );
          const desiredProjectIds = new Set(desiredProjectMap.values());
          const { data: currentProjects, error: currentProjectsError } = await supabase
            .schema("anchors").from("projects")
            .select("id")
            .eq("operation_id", legacyId);
          if (currentProjectsError) throw currentProjectsError;
          const currentProjectIds = new Set(((currentProjects ?? []) as Array<{ id: number }>).map((project) => project.id));
          for (const projectId of Array.from(currentProjectIds).filter((candidate) => !desiredProjectIds.has(candidate))) {
            const { error: unlinkError } = await supabase
              .schema("anchors").from("projects")
              .update({ operation_id: null })
              .eq("id", projectId);
            if (unlinkError) throw unlinkError;
          }
          for (const projectId of Array.from(desiredProjectIds).filter((candidate) => !currentProjectIds.has(candidate))) {
            const { error: linkError } = await supabase
              .schema("anchors").from("projects")
              .update({ operation_id: legacyId })
              .eq("id", projectId);
            if (linkError) throw linkError;
          }
        }

        await syncOperationalWorkspaceDatabases();
        const { operationsDatabase } = await ensureOperationalWorkspaceDatabases();
        const record = await findWorkspaceRecordByLegacyId(operationsDatabase.id, OPERATIONS_DB_FIELDS.legacyId, legacyId);
        if (!record) throw new Error("Operation workspace record could not be refreshed.");
        if (input.body !== undefined) {
          return updateWorkspaceRecordFields(record.id, record.fields, input.body);
        }
        return record;
      }
    }

    if (systemKind === "projects") {
      const legacyId = current.fields[PROJECTS_DB_FIELDS.legacyId];
      if (typeof legacyId === "number") {
        const relationIds = Array.isArray(nextFields[PROJECTS_DB_FIELDS.operation])
          ? (nextFields[PROJECTS_DB_FIELDS.operation] as string[])
          : [];
        const operationIdMap = await getLegacyIdMapForWorkspaceRecords(relationIds.slice(0, 1), OPERATIONS_DB_FIELDS.legacyId);
        const nextOperationId = relationIds[0] ? (operationIdMap.get(relationIds[0]) ?? null) : null;
        const updatePayload: Partial<Pick<Project, "name" | "type" | "watch_domain" | "status" | "notes" | "operation_id" | "taxonomy">> = {
          name: String(nextFields[PROJECTS_DB_FIELDS.name] ?? current.fields[PROJECTS_DB_FIELDS.name] ?? "Untitled project").trim() || "Untitled project",
          type: sanitizeProjectType(nextFields[PROJECTS_DB_FIELDS.type]),
          watch_domain:
            typeof nextFields[PROJECTS_DB_FIELDS.watchDomain] === "string"
              ? String(nextFields[PROJECTS_DB_FIELDS.watchDomain])
              : null,
          status: sanitizeProjectStatus(nextFields[PROJECTS_DB_FIELDS.status]),
          notes:
            typeof nextFields[PROJECTS_DB_FIELDS.notes] === "string"
              ? String(nextFields[PROJECTS_DB_FIELDS.notes])
              : null,
          operation_id: nextOperationId,
        };
        if (input.taxonomy !== undefined) {
          updatePayload.taxonomy = { ...input.taxonomy, object_type: "intellizen_project" };
        }
        const { error } = await supabase.schema("anchors").from("projects").update(updatePayload).eq("id", legacyId);
        if (error) throw error;

        await syncOperationalWorkspaceDatabases();
        const { projectsDatabase } = await ensureOperationalWorkspaceDatabases();
        const record = await findWorkspaceRecordByLegacyId(projectsDatabase.id, PROJECTS_DB_FIELDS.legacyId, legacyId);
        if (!record) throw new Error("Project workspace record could not be refreshed.");
        if (input.body !== undefined) {
          return updateWorkspaceRecordFields(record.id, record.fields, input.body);
        }
        return record;
      }
    }
  }

  return updateWorkspaceRecordFields(id, nextFields, input.body ?? current.body, input.taxonomy);
}

function asStringArray(value: WorkspaceDatabaseFieldValue): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" && value ? [value] : [];
}

function fieldString(value: WorkspaceDatabaseFieldValue): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function newRecordId(prefix = "delegation") {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Atomically append a markdown section to a record body (and optionally merge
 * a partial fields patch) through the workspace.append_record_section RPC.
 * Concurrent appends serialize server-side instead of clobbering each other.
 */
async function appendRecordSectionAtomic(
  recordId: string,
  section: string,
  fieldsPatch?: Record<string, WorkspaceDatabaseFieldValue>,
) {
  const { data, error } = await supabase.schema("workspace").rpc("append_record_section", {
    p_record_id: recordId,
    p_section: section,
    p_fields_patch: fieldsPatch ?? null,
  });
  if (error) throw error;
  return toWorkspaceDatabaseRecord(data as WorkspaceDatabaseRecordRow);
}

interface WorkEventInput {
  recordId?: string | null;
  workflowRunId?: string | null;
  eventKind: string;
  actor: string;
  durableRole?: string | null;
  decisionRole?: string | null;
  summary?: string | null;
  payload?: Record<string, unknown>;
}

/**
 * Insert into the append-only workspace.work_events audit log. Best-effort:
 * the body-section receipt remains the primary record, so an audit failure
 * warns instead of failing the operation.
 */
async function recordWorkEvent(input: WorkEventInput) {
  const { error } = await supabase.schema("workspace").from("work_events").insert([
    {
      record_id: input.recordId ?? null,
      workflow_run_id: input.workflowRunId ?? null,
      event_kind: input.eventKind,
      actor: input.actor,
      durable_role: input.durableRole ?? null,
      decision_role: input.decisionRole ?? null,
      summary: input.summary ?? null,
      payload: input.payload ?? {},
    },
  ]);
  if (error) console.warn(`work_events insert failed (${input.eventKind}):`, error.message);
}

function firstRelationId(value: WorkspaceDatabaseFieldValue) {
  return asStringArray(value)[0] ?? null;
}

type AgentWorkInitiativeMeta = {
  name: string;
  assignees: string[];
  agentOwner: string | null;
};

function toAgentWorkItem(
  record: WorkspaceDatabaseRecord,
  initiativeMeta = new Map<string, AgentWorkInitiativeMeta>(),
): AgentWorkItem {
  const initiativeId = firstRelationId(record.fields[AGENT_TASK_FIELDS.project]);
  const initiative = initiativeId ? initiativeMeta.get(initiativeId) : undefined;
  const title = fieldString(record.fields[AGENT_TASK_FIELDS.name]) ?? "Untitled work";
  const body = record.body ?? "";
  const assignee = Array.isArray(record.fields[AGENT_TASK_FIELDS.assignee])
    ? asStringArray(record.fields[AGENT_TASK_FIELDS.assignee])
    : fieldString(record.fields[AGENT_TASK_FIELDS.assignee]);
  const currentActorFromFields = Array.isArray(assignee)
    ? assignee[0] ?? initiative?.agentOwner ?? null
    : assignee ?? initiative?.agentOwner ?? null;
  return {
    id: record.id,
    source: "workspace.records",
    database_id: record.database_id,
    title,
    status: fieldString(record.fields[AGENT_TASK_FIELDS.status]),
    stage: fieldString(record.fields[AGENT_TASK_FIELDS.stage]),
    assignee,
    priority: fieldString(record.fields[AGENT_TASK_FIELDS.priority]),
    area: record.fields[AGENT_TASK_FIELDS.area],
    initiative_id: initiativeId,
    initiative_name: initiative?.name ?? null,
    initiative_agent_owner: initiative?.agentOwner ?? null,
    durable_role: latestBodyField(body, ["Durable role"]),
    functional_lane: latestBodyField(body, ["Functional lane"]) ?? fieldString(record.fields[AGENT_TASK_FIELDS.area]),
    current_actor: latestBodyField(body, ["Current actor", "Actor"]) ?? currentActorFromFields,
    backup_actor: latestBodyField(body, ["Backup actor"]),
    approval_needed: latestBodyField(body, ["Approval needed before", "Approval needed"]),
    next_step: latestBodyField(body, ["Next step"]),
    latest_note: latestMarkdownSection(body, ["Agent Delegation", "Agent Note", "Agent Claim"]),
    latest_receipt: latestMarkdownSection(body, ["Agent Receipt", "Workflow Run Update", "Voice Draft Intake"]),
    body_preview: body.slice(0, 500),
    updated_at: record.updated_at,
  };
}

function toAgentProjectItem(record: WorkspaceDatabaseRecord): AgentProjectItem {
  return {
    id: record.id,
    source: "workspace.records",
    database_id: record.database_id,
    title: fieldString(record.fields[AGENT_BIZ_OPS_FIELDS.name]) ?? "Untitled project",
    stage: fieldString(record.fields[AGENT_BIZ_OPS_FIELDS.stage]),
    priority: fieldString(record.fields[AGENT_BIZ_OPS_FIELDS.priority]),
    assignee: asStringArray(record.fields[AGENT_BIZ_OPS_FIELDS.assignee]),
    agent_owner: fieldString(record.fields[AGENT_BIZ_OPS_FIELDS.agentOwner]),
    week_theme: fieldString(record.fields[AGENT_BIZ_OPS_FIELDS.weekTheme]),
    task_ids: asStringArray(record.fields[AGENT_BIZ_OPS_FIELDS.tasks]),
    body_preview: (record.body ?? "").slice(0, 500),
    updated_at: record.updated_at,
  };
}

async function getWorkspaceRecord(id: string) {
  const { data, error } = await supabase
    .schema("workspace").from("records")
    .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error) throw error;
  return toWorkspaceDatabaseRecord(data as WorkspaceDatabaseRecordRow);
}

async function appendWorkspaceRecordRelation(recordId: string, fieldId: string, relatedRecordId: string) {
  const record = await getWorkspaceRecord(recordId);
  const existing = asStringArray(record.fields[fieldId]);
  await updateWorkspaceRecord(
    recordId,
    {
      fields: {
        ...record.fields,
        [fieldId]: Array.from(new Set([...existing, relatedRecordId])),
      },
      body: record.body,
      taxonomy: record.taxonomy,
    },
    true,
  );
}

export async function listAgentProjects(input: {
  actor?: string | null;
  stages?: string[];
  includeDone?: boolean;
  limit?: number;
} = {}) {
  const rowLimit = Math.max(input.limit ?? 50, 1);
  const { data, error } = await supabase
    .schema("workspace").from("records")
    .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
    .eq("database_id", GENZEN_WORKSPACE_DATABASE_IDS.bizOps)
    .order("updated_at", { ascending: false })
    .range(0, workspaceFilteredReadEnd(rowLimit));

  if (error) throw error;
  const rows = ((data ?? []) as WorkspaceDatabaseRecordRow[]).map(toWorkspaceDatabaseRecord);
  const filtered = rows.filter((record) => {
    const stage = fieldString(record.fields[AGENT_BIZ_OPS_FIELDS.stage]) ?? "";
    if (!input.includeDone && stage === "Done") return false;
    if (input.stages?.length && !input.stages.includes(stage)) return false;

    if (input.actor) {
      const agentOwner = fieldString(record.fields[AGENT_BIZ_OPS_FIELDS.agentOwner]);
      const fallbackAssignees = asStringArray(record.fields[AGENT_BIZ_OPS_FIELDS.assignee]);
      if (agentOwner ? agentOwner !== input.actor : !fallbackAssignees.includes(input.actor)) {
        return false;
      }
    }

    return true;
  });

  return filtered
    .slice(0, rowLimit)
    .map((record) => toAgentProjectItem(record));
}

async function getInitiativeMetaMap(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) return new Map<string, AgentWorkInitiativeMeta>();

  const { data, error } = await supabase
    .schema("workspace").from("records")
    .select("id, fields")
    .eq("database_id", GENZEN_WORKSPACE_DATABASE_IDS.bizOps)
    .in("id", uniqueIds);

  if (error) throw error;
  return new Map(
    ((data ?? []) as Array<{ id: string; fields: Record<string, WorkspaceDatabaseFieldValue> }>).map((record) => [
      record.id,
      {
        name: fieldString(record.fields?.[AGENT_BIZ_OPS_FIELDS.name]) ?? "Untitled initiative",
        assignees: asStringArray(record.fields?.[AGENT_BIZ_OPS_FIELDS.assignee]),
        agentOwner: fieldString(record.fields?.[AGENT_BIZ_OPS_FIELDS.agentOwner]),
      },
    ]),
  );
}

export async function listAgentWork(input: {
  actor?: string | null;
  initiativeId?: string | null;
  statuses?: string[];
  includeDone?: boolean;
  limit?: number;
} = {}) {
  const rowLimit = Math.max(input.limit ?? 50, 1);
  let query = supabase
    .schema("workspace").from("records")
    .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
    .eq("database_id", GENZEN_WORKSPACE_DATABASE_IDS.tasks)
    .order("updated_at", { ascending: false })
    .range(0, workspaceFilteredReadEnd(rowLimit));
  // Server-side push-down (GIN-indexed jsonb): exact status filters and the
  // done-exclusion run in Postgres instead of over-fetching for client trims.
  if (input.statuses?.length) {
    query = query.in(`fields->>${AGENT_TASK_FIELDS.status}`, input.statuses);
  } else if (!input.includeDone) {
    // Keep null-status rows (SQL != drops them), matching client semantics.
    query = query.or(`fields->>${AGENT_TASK_FIELDS.status}.neq.Done,fields->>${AGENT_TASK_FIELDS.status}.is.null`);
  }
  const { data, error } = await query;

  if (error) throw error;
  const rows = ((data ?? []) as WorkspaceDatabaseRecordRow[]).map(toWorkspaceDatabaseRecord);
  const initiativeMeta = await getInitiativeMetaMap(
    rows.map((record) => firstRelationId(record.fields[AGENT_TASK_FIELDS.project])).filter(Boolean) as string[],
  );
  const filtered = rows.filter((record) => {
    const status = fieldString(record.fields[AGENT_TASK_FIELDS.status]) ?? "";
    if (!input.includeDone && status === "Done") return false;
    if (input.statuses?.length && !input.statuses.includes(status)) return false;

    if (input.actor) {
      const assignees = asStringArray(record.fields[AGENT_TASK_FIELDS.assignee]);
      if (assignees.includes(input.actor)) return true;
      if (assignees.length > 0) return false;

      const initiativeId = firstRelationId(record.fields[AGENT_TASK_FIELDS.project]);
      const initiative = initiativeId ? initiativeMeta.get(initiativeId) : undefined;
      const inheritsFromProject =
        initiative?.agentOwner === input.actor ||
        (!initiative?.agentOwner && initiative?.assignees.includes(input.actor));
      if (!inheritsFromProject) return false;
    }

    if (input.initiativeId) {
      const initiatives = asStringArray(record.fields[AGENT_TASK_FIELDS.project]);
      if (!initiatives.includes(input.initiativeId)) return false;
    }

    return true;
  });
  const limited = filtered.slice(0, rowLimit);

  return limited.map((record) => toAgentWorkItem(record, initiativeMeta));
}

function titleFromVoiceTranscript(transcript: string) {
  const normalized = transcript.replace(/\s+/g, " ").trim();
  const firstSentence = normalized.split(/[.!?]\s/)[0]?.trim() || normalized;
  const title = firstSentence.length > 86 ? `${firstSentence.slice(0, 83).trim()}...` : firstSentence;
  return title || "Voice draft task";
}

export async function createVoiceDraftTask(input: VoiceDraftTaskInput) {
  const transcript = input.transcript.trim();
  if (!transcript) {
    throw new Error("Voice transcript is required.");
  }

  const title = titleFromVoiceTranscript(transcript);
  const body = `## Voice Draft Intake - ${formatAgentWorkTimestamp()}

Requested by: ${input.requestedBy}
Source: IntelliZen Agent Panel voice intake
Voice provider: ${input.sourceProvider ?? "unknown"}
Route: ${input.sourceRoute ?? "unknown"}
Approval needed before: none

Transcript:
${transcript}

Next step:
Review, assign, or attach this draft to a registered workflow.`;

  const fields: Record<string, WorkspaceDatabaseFieldValue> = {
    [AGENT_TASK_FIELDS.name]: title,
    [AGENT_TASK_FIELDS.status]: "Not started",
    [AGENT_TASK_FIELDS.stage]: "Backlog",
    [AGENT_TASK_FIELDS.priority]: "Medium",
    [AGENT_TASK_FIELDS.area]: "Voice Intake",
  };

  if (!input.confirmWrite) {
    return {
      dry_run: true,
      message: "Preview only. Re-run with confirmWrite: true to create a voice draft task.",
      next_task: toAgentWorkItem({
        id: "preview",
        database_id: GENZEN_WORKSPACE_DATABASE_IDS.tasks,
        fields,
        body,
        taxonomy: {
          entity: "genzen",
          source: "agent_panel_voice_intake",
          object_type: "task",
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    };
  }

  const record = await createWorkspaceRecord({
    databaseId: GENZEN_WORKSPACE_DATABASE_IDS.tasks,
    fields,
    body,
    taxonomy: {
      entity: "genzen",
      source: "agent_panel_voice_intake",
      object_type: "task",
    },
    skipSystemSync: true,
  });

  await recordWorkEvent({
    recordId: record.id,
    eventKind: "voice_intake",
    actor: input.requestedBy,
    summary: input.transcript.slice(0, 300),
    payload: {
      source_route: input.sourceRoute ?? null,
      source_provider: input.sourceProvider ?? null,
    },
  });

  return {
    dry_run: false,
    task_id: record.id,
    task: toAgentWorkItem(record),
  };
}

export async function getAgentWorkItem(workItemId: string) {
  const record = await getWorkspaceRecord(workItemId);
  const initiativeId = firstRelationId(record.fields[AGENT_TASK_FIELDS.project]);
  const initiativeMeta = await getInitiativeMetaMap(initiativeId ? [initiativeId] : []);
  return toAgentWorkItem(record, initiativeMeta);
}

export async function claimAgentWork(input: {
  workItemId: string;
  claimedByActor: string;
  durableRole: string;
  functionalLane: string;
  backupActor?: string | null;
  reason: string;
  sourcesChecked?: string[];
  approvalNeededBefore?: string | null;
  reassign?: boolean;
}) {
  const record = await getWorkspaceRecord(input.workItemId);
  const currentAssignees = asStringArray(record.fields[AGENT_TASK_FIELDS.assignee]);
  const fieldsPatch: Record<string, WorkspaceDatabaseFieldValue> = {
    [AGENT_TASK_FIELDS.status]: "In progress",
    [AGENT_TASK_FIELDS.stage]: "Doing",
  };
  if (currentAssignees.length === 0 || input.reassign) {
    fieldsPatch[AGENT_TASK_FIELDS.assignee] = input.claimedByActor;
  }
  const section = `## Agent Claim - ${formatAgentWorkTimestamp()}

Task: ${fieldString(record.fields[AGENT_TASK_FIELDS.name]) ?? record.id}
Durable role: ${input.durableRole}
Functional lane: ${input.functionalLane}
Current actor: ${input.claimedByActor}
Backup actor: ${input.backupActor ?? "none"}
Reason for claim: ${input.reason}
Sources checked:
${markdownList(input.sourcesChecked)}
Approval needed before: ${input.approvalNeededBefore ?? "none"}`;

  const updated = await appendRecordSectionAtomic(record.id, section, fieldsPatch);
  await recordWorkEvent({
    recordId: record.id,
    eventKind: "claim",
    actor: input.claimedByActor,
    durableRole: input.durableRole,
    summary: input.reason,
    payload: {
      functional_lane: input.functionalLane,
      backup_actor: input.backupActor ?? null,
      sources_checked: input.sourcesChecked ?? [],
      approval_needed_before: input.approvalNeededBefore ?? null,
      reassign: Boolean(input.reassign),
    },
  });
  return toAgentWorkItem(updated);
}

export async function appendAgentWorkNote(input: {
  workItemId: string;
  actor: string;
  durableRole: string;
  functionalLane: string;
  note: string;
  sources?: string[];
  openQuestions?: string[];
}) {
  const section = `## Agent Note - ${formatAgentWorkTimestamp()}

Actor: ${input.actor}
Durable role: ${input.durableRole}
Functional lane: ${input.functionalLane}
Note:
${input.note}
Sources:
${markdownList(input.sources)}
Open questions:
${markdownList(input.openQuestions)}`;

  const updated = await appendRecordSectionAtomic(input.workItemId, section);
  await recordWorkEvent({
    recordId: input.workItemId,
    eventKind: "note",
    actor: input.actor,
    durableRole: input.durableRole,
    summary: input.note.slice(0, 300),
    payload: {
      functional_lane: input.functionalLane,
      sources: input.sources ?? [],
      open_questions: input.openQuestions ?? [],
    },
  });
  return toAgentWorkItem(updated);
}

export async function closeAgentWork(input: {
  workItemId: string;
  actor: string;
  durableRole: string;
  functionalLane: string;
  currentActor?: string;
  backupActor?: string | null;
  outcome: AgentWorkOutcome;
  receipt: AgentWorkReceiptInput;
  followups?: AgentWorkFollowupInput[];
}) {
  const record = await getWorkspaceRecord(input.workItemId);
  const statusByOutcome: Record<AgentWorkOutcome, string> = {
    done: "Done",
    blocked: "Blocked",
    deferred: "Not started",
    needs_approval: "In progress",
  };
  const stageByOutcome: Record<AgentWorkOutcome, string> = {
    done: "Done",
    blocked: fieldString(record.fields[AGENT_TASK_FIELDS.stage]) ?? "Doing",
    deferred: fieldString(record.fields[AGENT_TASK_FIELDS.stage]) ?? "Backlog",
    needs_approval: "Review",
  };
  const fieldsPatch: Record<string, WorkspaceDatabaseFieldValue> = {
    [AGENT_TASK_FIELDS.status]: statusByOutcome[input.outcome],
    [AGENT_TASK_FIELDS.stage]: stageByOutcome[input.outcome],
  };
  const section = `## Agent Receipt - ${formatAgentWorkTimestamp()}

Task: ${fieldString(record.fields[AGENT_TASK_FIELDS.name]) ?? record.id}
Outcome: ${input.outcome}
Durable role: ${input.durableRole}
Functional lane: ${input.functionalLane}
Current actor: ${input.currentActor ?? input.actor}
Backup actor: ${input.backupActor ?? "none"}
Sources used:
${markdownList(input.receipt.sources_used)}
Actions taken:
${markdownList(input.receipt.actions_taken)}
Files touched:
${markdownList(input.receipt.files_touched)}
Records touched:
${markdownList(input.receipt.records_touched)}
Artifacts created:
${markdownList(input.receipt.artifacts_created)}
Verification:
${markdownList(input.receipt.verification)}
Approval needed: ${input.receipt.approval_needed ?? "none"}
Blocked items:
${markdownList(input.receipt.blocked_items)}
Follow-up tasks:
${markdownList(input.receipt.follow_up_tasks ?? input.followups?.map((followup) => followup.title))}
Next step: ${input.receipt.next_step ?? "none"}

Summary:
${input.receipt.summary}`;

  const updated = await appendRecordSectionAtomic(record.id, section, fieldsPatch);
  await recordWorkEvent({
    recordId: record.id,
    eventKind: "receipt",
    actor: input.currentActor ?? input.actor,
    durableRole: input.durableRole,
    summary: input.receipt.summary.slice(0, 300),
    payload: {
      outcome: input.outcome,
      functional_lane: input.functionalLane,
      receipt: input.receipt,
    },
  });
  return toAgentWorkItem(updated);
}

export async function delegateAgentWork(input: DelegateAgentWorkInput): Promise<DelegateAgentWorkResult> {
  const requestedRole = input.requestedRole.trim();
  const reason = input.reason.trim();
  const expectedOutput = input.expectedOutput.trim();
  const returnPath = input.returnPath.trim();
  if (!requestedRole) throw new Error("Requested role is required.");
  if (!reason) throw new Error("Reason is required.");
  if (!expectedOutput) throw new Error("Expected output is required.");
  if (!returnPath) throw new Error("Return path is required.");

  const parent = await getWorkspaceRecord(input.parentWorkItemId);
  if (parent.database_id !== GENZEN_WORKSPACE_DATABASE_IDS.tasks) {
    throw new Error("Delegation parent must be a task workspace record.");
  }

  const delegationId = newRecordId("delegation");
  const parentTitle = fieldString(parent.fields[AGENT_TASK_FIELDS.name]) ?? parent.id;
  const sourceRecords = Array.from(new Set([parent.id, ...(input.sourceContext?.records ?? [])].filter(Boolean)));
  const sourceDocuments = input.sourceContext?.documents ?? [];
  const sourceArtifacts = input.sourceContext?.artifacts ?? [];
  const childTitle = expectedOutput.length > 86 ? `Delegated: ${expectedOutput.slice(0, 75).trim()}...` : `Delegated: ${expectedOutput}`;
  const allowedTools = input.allowedTools?.map((tool) => tool.trim()).filter(Boolean);
  const approvalLimits = input.approvalLimits?.map((limit) => limit.trim()).filter(Boolean);
  const parentProject = parent.fields[AGENT_TASK_FIELDS.project];
  const parentPriority = fieldString(parent.fields[AGENT_TASK_FIELDS.priority]) ?? "Medium";

  const childFields: Record<string, WorkspaceDatabaseFieldValue> = {
    [AGENT_TASK_FIELDS.name]: childTitle,
    [AGENT_TASK_FIELDS.status]: "Not started",
    [AGENT_TASK_FIELDS.stage]: "Backlog",
    [AGENT_TASK_FIELDS.priority]: parentPriority,
    [AGENT_TASK_FIELDS.area]: requestedRole,
  };
  if (input.requestedActor?.trim()) childFields[AGENT_TASK_FIELDS.assignee] = input.requestedActor.trim();
  if (parentProject !== null && parentProject !== undefined) childFields[AGENT_TASK_FIELDS.project] = parentProject;

  const childBody = `## Agent Delegation - ${formatAgentWorkTimestamp()}

Delegation ID: ${delegationId}
Parent task: ${parentTitle}
Parent task ID: ${parent.id}
Requested role: ${requestedRole}
Requested actor: ${input.requestedActor?.trim() || "unassigned"}
Reason:
${reason}

Source records:
${markdownList(sourceRecords)}
Source documents:
${markdownList(sourceDocuments)}
Source artifacts:
${markdownList(sourceArtifacts)}
Expected output:
${expectedOutput}
Allowed tools:
${markdownList(allowedTools)}
Approval limits:
${markdownList(approvalLimits)}
Receipt required: ${input.receiptRequired === false ? "no" : "yes"}
Return path:
${returnPath}`;

  const childPreviewRecord: WorkspaceDatabaseRecord = {
    id: "preview",
    database_id: GENZEN_WORKSPACE_DATABASE_IDS.tasks,
    fields: childFields,
    body: childBody,
    taxonomy: {
      entity: "genzen",
      source: "agent_delegation",
      object_type: "task",
      tags: ["delegation", requestedRole],
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!input.confirmWrite) {
    return {
      dry_run: true,
      child_work_item_id: null,
      delegation_id: delegationId,
      status: "preview",
      child_work_item: toAgentWorkItem(childPreviewRecord),
      parent_work_item: toAgentWorkItem(parent),
    };
  }

  const child = await createWorkspaceRecord({
    databaseId: GENZEN_WORKSPACE_DATABASE_IDS.tasks,
    fields: childFields,
    body: childBody,
    taxonomy: {
      entity: "genzen",
      source: "agent_delegation",
      object_type: "task",
      tags: ["delegation", requestedRole],
    },
    skipSystemSync: true,
  });

  const parentSection = `## Agent Delegation - ${formatAgentWorkTimestamp()}

Delegation ID: ${delegationId}
Parent task: ${parentTitle}
Child task: ${fieldString(child.fields[AGENT_TASK_FIELDS.name]) ?? child.id}
Child task ID: ${child.id}
Requested role: ${requestedRole}
Requested actor: ${input.requestedActor?.trim() || "unassigned"}
Reason:
${reason}
Expected output:
${expectedOutput}
Allowed tools:
${markdownList(allowedTools)}
Approval limits:
${markdownList(approvalLimits)}
Receipt required: ${input.receiptRequired === false ? "no" : "yes"}
Return path:
${returnPath}`;

  const updatedParent = await appendRecordSectionAtomic(parent.id, parentSection);
  await recordWorkEvent({
    recordId: parent.id,
    eventKind: "delegation",
    actor: input.requestedActor?.trim() || requestedRole,
    durableRole: requestedRole,
    summary: reason,
    payload: {
      delegation_id: delegationId,
      child_task_id: child.id,
      expected_output: expectedOutput,
      allowed_tools: allowedTools ?? [],
      approval_limits: approvalLimits ?? [],
      return_path: returnPath,
      receipt_required: input.receiptRequired !== false,
    },
  });

  return {
    dry_run: false,
    child_work_item_id: child.id,
    delegation_id: delegationId,
    status: "created",
    child_work_item: toAgentWorkItem(child),
    parent_work_item: toAgentWorkItem(updatedParent),
  };
}

function toWorkflowTemplateItem(record: WorkspaceDatabaseRecord): WorkflowTemplateItem {
  return {
    id: record.id,
    workflow_id: fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.workflowId]) ?? record.id,
    name: fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.name]) ?? "Untitled workflow",
    status: fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.status]),
    entity: fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.entity]),
    owner_role: fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.ownerRole]),
    default_actor: fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.defaultActor]),
    source_document_id: record.fields[WORKFLOW_REGISTRY_FIELDS.sourceDocumentId],
    source_path: fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.sourcePath]),
    trigger: fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.trigger]),
    required_inputs: fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.requiredInputs]),
    default_routing: fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.defaultRouting]),
    approval_gates: fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.approvalGates]),
    expected_output: fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.expectedOutput]),
    related_databases: asStringArray(record.fields[WORKFLOW_REGISTRY_FIELDS.relatedDatabases]),
    receipt_template: fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.receiptTemplate]),
    success_criteria: fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.successCriteria]),
    failure_behavior: fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.failureBehavior]),
    run_ids: asStringArray(record.fields[WORKFLOW_REGISTRY_FIELDS.runs]),
    body_preview: (record.body ?? "").slice(0, 500),
    updated_at: record.updated_at,
  };
}

function toWorkflowRunItem(record: WorkspaceDatabaseRecord): WorkflowRunItem {
  return {
    id: record.id,
    name: fieldString(record.fields[WORKFLOW_RUN_FIELDS.name]) ?? "Untitled workflow run",
    status: fieldString(record.fields[WORKFLOW_RUN_FIELDS.status]),
    workflow_record_id: firstRelationId(record.fields[WORKFLOW_RUN_FIELDS.workflow]),
    task_id: firstRelationId(record.fields[WORKFLOW_RUN_FIELDS.task]),
    biz_ops_id: firstRelationId(record.fields[WORKFLOW_RUN_FIELDS.bizOps]),
    entity_scope: fieldString(record.fields[WORKFLOW_RUN_FIELDS.entityScope]),
    owner_role: fieldString(record.fields[WORKFLOW_RUN_FIELDS.ownerRole]),
    actor: fieldString(record.fields[WORKFLOW_RUN_FIELDS.actor]),
    trigger_source: fieldString(record.fields[WORKFLOW_RUN_FIELDS.triggerSource]),
    current_step: fieldString(record.fields[WORKFLOW_RUN_FIELDS.currentStep]),
    source_documents: asStringArray(record.fields[WORKFLOW_RUN_FIELDS.sourceDocuments]),
    source_records: fieldString(record.fields[WORKFLOW_RUN_FIELDS.sourceRecords]),
    context: fieldString(record.fields[WORKFLOW_RUN_FIELDS.context]),
    receipt: fieldString(record.fields[WORKFLOW_RUN_FIELDS.receipt]),
    started_at: fieldString(record.fields[WORKFLOW_RUN_FIELDS.startedAt]),
    completed_at: fieldString(record.fields[WORKFLOW_RUN_FIELDS.completedAt]),
    body_preview: (record.body ?? "").slice(0, 500),
    updated_at: record.updated_at,
  };
}

export async function listWorkflowRuns(input: {
  status?: string | null;
  actor?: string | null;
  workflowId?: string | null;
  taskId?: string | null;
  bizOpsId?: string | null;
  includeCompleted?: boolean;
  limit?: number;
} = {}) {
  const rowLimit = Math.max(input.limit ?? 50, 1);
  const { data, error } = await supabase
    .schema("workspace").from("records")
    .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
    .eq("database_id", GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns)
    .order("updated_at", { ascending: false })
    .range(0, workspaceFilteredReadEnd(rowLimit));

  if (error) throw error;
  const workflowRecordId = input.workflowId ? await resolveWorkflowRecordId(input.workflowId) : null;
  const records = ((data ?? []) as WorkspaceDatabaseRecordRow[]).map(toWorkspaceDatabaseRecord);
  return records
    .filter((record) => {
      const status = fieldString(record.fields[WORKFLOW_RUN_FIELDS.status]) ?? "";
      if (!input.includeCompleted && ["Done", "Deferred"].includes(status)) return false;
      if (input.status && status !== input.status) return false;
      if (input.actor && fieldString(record.fields[WORKFLOW_RUN_FIELDS.actor]) !== input.actor) return false;
      if (workflowRecordId && firstRelationId(record.fields[WORKFLOW_RUN_FIELDS.workflow]) !== workflowRecordId) return false;
      if (input.taskId && !asStringArray(record.fields[WORKFLOW_RUN_FIELDS.task]).includes(input.taskId)) return false;
      if (input.bizOpsId && !asStringArray(record.fields[WORKFLOW_RUN_FIELDS.bizOps]).includes(input.bizOpsId)) return false;
      return true;
    })
    .slice(0, rowLimit)
    .map(toWorkflowRunItem);
}

async function resolveWorkflowRecordId(workflowIdOrRecordId: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workflowIdOrRecordId)) {
    return workflowIdOrRecordId;
  }
  const workflow = await getWorkflowTemplateByWorkflowId(workflowIdOrRecordId);
  return workflow.id;
}

function workflowRunUpdateSection(input: UpdateWorkflowRunInput) {
  return `## Workflow Run Update - ${formatAgentWorkTimestamp()}

Actor: ${input.actor}
Status: ${input.status ?? "unchanged"}
Current step: ${input.currentStep ?? "unchanged"}
Sources:
${markdownList(input.sources)}
Actions taken:
${markdownList(input.actionsTaken)}
Verification:
${markdownList(input.verification)}
Blocked items:
${markdownList(input.blockedItems)}
Approval needed: ${input.approvalNeeded ?? "none"}
Next step: ${input.nextStep ?? "none"}

Summary:
${input.summary}`;
}

function taskStateForWorkflowRunStatus(status?: WorkflowRunStatus) {
  if (status === "Done") return { status: "Done", stage: "Done" };
  if (status === "Blocked") return { status: "Blocked", stage: "Doing" };
  if (status === "Deferred") return { status: "Deferred", stage: "Backlog" };
  if (status === "Needs approval") return { status: "Needs approval", stage: "Review" };
  if (status === "In progress") return { status: "In progress", stage: "Doing" };
  return null;
}

export async function updateWorkflowRun(input: UpdateWorkflowRunInput) {
  const run = await getWorkspaceRecord(input.workflowRunId);
  if (run.database_id !== GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns) {
    throw new Error("Workflow run not found.");
  }

  const section = workflowRunUpdateSection(input);
  const runName = fieldString(run.fields[WORKFLOW_RUN_FIELDS.name]) ?? run.id;
  const fieldsPatch: Record<string, WorkspaceDatabaseFieldValue> = {
    ...(input.status ? { [WORKFLOW_RUN_FIELDS.status]: input.status } : {}),
    ...(input.currentStep !== undefined ? { [WORKFLOW_RUN_FIELDS.currentStep]: input.currentStep } : {}),
    [WORKFLOW_RUN_FIELDS.receipt]: section,
    ...(["Done", "Blocked", "Deferred"].includes(input.status ?? "")
      ? { [WORKFLOW_RUN_FIELDS.completedAt]: new Date().toISOString() }
      : {}),
  };
  const taskId = firstRelationId(run.fields[WORKFLOW_RUN_FIELDS.task]);
  const syncTask = input.syncTask !== false && Boolean(taskId);
  const taskState = taskStateForWorkflowRunStatus(input.status);
  // Compact pointer for the linked task: keeps the parseable heading without
  // duplicating the full receipt into a second growing record body.
  const taskPointerSection = `## Workflow Run Update - ${formatAgentWorkTimestamp()}

Workflow run: ${runName} (${run.id})
Actor: ${input.actor}
Status: ${input.status ?? "unchanged"}
Current step: ${input.currentStep ?? "unchanged"}
Approval needed: ${input.approvalNeeded ?? "none"}
Next step: ${input.nextStep ?? "none"}
Summary: ${input.summary}
Details: see the Workflow Runs record receipt timeline.`;

  if (!input.confirmWrite) {
    return {
      dry_run: true,
      message: "Preview only. Re-run with confirmWrite: true to update the Workflow Runs record.",
      workflow_run_id: run.id,
      next_run: toWorkflowRunItem({
        ...run,
        fields: { ...run.fields, ...fieldsPatch },
        body: appendMarkdownSection(run.body, section),
      }),
      task_sync: syncTask
        ? {
            task_id: taskId,
            next_status: taskState?.status ?? "unchanged",
            next_stage: taskState?.stage ?? "unchanged",
            body_appended: true,
          }
        : null,
      appended_section: section,
    };
  }

  const updatedRun = await appendRecordSectionAtomic(run.id, section, fieldsPatch);

  let syncedTask: AgentWorkItem | null = null;
  if (syncTask && taskId) {
    const taskPatch: Record<string, WorkspaceDatabaseFieldValue> | undefined = taskState
      ? {
          [AGENT_TASK_FIELDS.status]: taskState.status,
          [AGENT_TASK_FIELDS.stage]: taskState.stage,
        }
      : undefined;
    const updatedTask = await appendRecordSectionAtomic(taskId, taskPointerSection, taskPatch);
    syncedTask = toAgentWorkItem(updatedTask);
  }

  await recordWorkEvent({
    recordId: taskId ?? run.id,
    workflowRunId: run.id,
    eventKind: input.eventKind ?? "workflow_run_update",
    actor: input.actor,
    decisionRole: input.decisionRole ?? null,
    summary: input.summary.slice(0, 300),
    payload: {
      status: input.status ?? null,
      current_step: input.currentStep ?? null,
      approval_needed: input.approvalNeeded ?? null,
      blocked_items: input.blockedItems ?? [],
      verification: input.verification ?? [],
      actions_taken: input.actionsTaken ?? [],
      next_step: input.nextStep ?? null,
      synced_task_id: syncedTask?.id ?? null,
    },
  });

  return {
    dry_run: false,
    run: toWorkflowRunItem(updatedRun),
    synced_task: syncedTask,
  };
}

/**
 * Move a Workflow Run to Needs approval with a concrete decision request.
 * Same contract as the MCP request_workflow_approval tool.
 */
export async function requestWorkflowApproval(input: {
  workflowRunId: string;
  requestedBy: string;
  approvalNeeded: string;
  approvalType?: string | null;
  summary?: string | null;
  confirmWrite?: boolean;
}) {
  const approvalNeeded = input.approvalNeeded.trim();
  if (!approvalNeeded) throw new Error("Approval request needs a concrete decision to make.");
  const approvalType = input.approvalType?.trim() || "workflow";
  return updateWorkflowRun({
    workflowRunId: input.workflowRunId,
    actor: input.requestedBy,
    status: "Needs approval",
    currentStep: `Approval requested: ${approvalNeeded}`,
    summary: input.summary ?? `${approvalType} approval requested: ${approvalNeeded}`,
    actionsTaken: [`Requested ${approvalType} approval`],
    approvalNeeded,
    nextStep: "Await approval decision",
    eventKind: "approval_request",
    confirmWrite: input.confirmWrite,
  });
}

export type WorkflowApprovalDecision = "approved" | "rejected" | "changes_requested";

/**
 * Record an approval decision. decidedBy is required: approval decisions are
 * never attributed to a default identity.
 */
export async function resolveWorkflowApproval(input: {
  workflowRunId: string;
  decision: WorkflowApprovalDecision;
  decisionSummary: string;
  decidedBy: string;
  decisionRole?: string;
  approvalType?: string | null;
  confirmWrite?: boolean;
}) {
  const decidedBy = input.decidedBy.trim();
  if (!decidedBy) throw new Error("resolveWorkflowApproval requires decidedBy: approval decisions must name the decision maker.");
  const decisionSummary = input.decisionSummary.trim();
  if (!decisionSummary) throw new Error("resolveWorkflowApproval requires a decision summary.");

  const approvalType = input.approvalType?.trim() || "workflow";
  const decisionLabel = input.decision.replace("_", " ");
  const nextStatus: WorkflowRunStatus =
    input.decision === "approved" ? "In progress" : input.decision === "changes_requested" ? "Needs approval" : "Blocked";

  return updateWorkflowRun({
    workflowRunId: input.workflowRunId,
    actor: decidedBy,
    status: nextStatus,
    currentStep: `Approval ${decisionLabel}: ${approvalType}`,
    summary: `${approvalType} approval ${decisionLabel} by ${decidedBy}: ${decisionSummary}`,
    actionsTaken: [`Resolved ${approvalType} approval as ${decisionLabel}`],
    blockedItems: input.decision === "approved" ? undefined : [decisionSummary],
    approvalNeeded: input.decision === "approved" ? null : decisionSummary,
    nextStep: input.decision === "approved" ? "Resume workflow execution" : "Revise and return for approval",
    eventKind: "approval_decision",
    decisionRole: input.decisionRole ?? FOUNDER_APPROVAL_ROLE,
    confirmWrite: input.confirmWrite,
  });
}

export async function listWorkflows(input: {
  entity?: string | null;
  ownerRole?: string | null;
  status?: string | null;
  includeInactive?: boolean;
  limit?: number;
} = {}) {
  const rowLimit = Math.max(input.limit ?? 50, 1);
  const { data, error } = await supabase
    .schema("workspace").from("records")
    .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
    .eq("database_id", GENZEN_WORKSPACE_DATABASE_IDS.workflowRegistry)
    .order("updated_at", { ascending: false })
    .range(0, workspaceFilteredReadEnd(rowLimit));

  if (error) throw error;
  const records = ((data ?? []) as WorkspaceDatabaseRecordRow[]).map(toWorkspaceDatabaseRecord);
  return records
    .filter((record) => {
      const status = fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.status]) ?? "";
      if (!input.includeInactive && status !== "Active") return false;
      if (input.status && status !== input.status) return false;
      if (input.entity && fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.entity]) !== input.entity) return false;
      if (input.ownerRole && fieldString(record.fields[WORKFLOW_REGISTRY_FIELDS.ownerRole]) !== input.ownerRole) {
        return false;
      }
      return true;
    })
    .slice(0, rowLimit)
    .map(toWorkflowTemplateItem);
}

async function getWorkflowTemplateByWorkflowId(workflowId: string) {
  const { data, error } = await supabase
    .schema("workspace").from("records")
    .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
    .eq("database_id", GENZEN_WORKSPACE_DATABASE_IDS.workflowRegistry)
    .eq(`fields->>${WORKFLOW_REGISTRY_FIELDS.workflowId}`, workflowId)
    .single();

  if (error) throw error;
  return toWorkspaceDatabaseRecord(data as WorkspaceDatabaseRecordRow);
}

function workflowRuntimeDispatchSection(input: {
  status: "submitted" | "queued" | "failed";
  actor: string | null;
  workflowRunId: string;
  messageId?: string;
  inboxItemId?: string;
  error?: unknown;
}) {
  const details: string[] = [];
  if (input.messageId) details.push(`- Gateway delivery: ${input.messageId}`);
  if (input.inboxItemId) details.push(`- Fallback inbox item: ${input.inboxItemId}`);
  if (input.error instanceof Error && input.error.message) details.push(`- Error: ${input.error.message}`);
  if (!details.length) details.push("- No delivery identifier returned.");

  const summary =
    input.status === "submitted"
      ? "Agent Gateway accepted the run for local Hermes execution."
      : input.status === "queued"
        ? "Agent Gateway was unavailable; the run was queued through the Fiona inbox fallback."
        : "Runtime dispatch did not complete. The Workflow Run remains durable for retry.";

  return `## Workflow Run Update

Timestamp: ${new Date().toISOString()}
Actor: IntelliZen App
Status: ${input.status === "failed" ? "Queued" : "In progress"}
Current step: ${input.status === "failed" ? "Runtime dispatch needs retry" : "Dispatched to local runtime"}
Summary: ${summary}

Actions taken:
- Created Workflow Run ${input.workflowRunId}.
- Routed execution to ${input.actor ?? "the configured workflow actor"} through the Agent Gateway boundary.

Verification:
${details.join("\n")}`;
}

export async function startWorkflow(input: StartWorkflowInput) {
  const workflow = await getWorkflowTemplateByWorkflowId(input.workflowId);
  const workflowItem = toWorkflowTemplateItem(workflow);
  const sourceDocumentIds = Array.from(
    new Set([
      ...(input.sourceDocuments ?? []).map((value) => String(value)),
      ...(workflowItem.source_document_id ? [String(workflowItem.source_document_id)] : []),
    ]),
  );
  const sourceRecords = Array.from(
    new Set([
      ...(input.sourceRecords ?? []),
      ...(input.taskId ? [input.taskId] : []),
      ...(input.bizOpsId ? [input.bizOpsId] : []),
    ]),
  );
  const runName = `${workflowItem.name} - ${formatAgentWorkTimestamp()}`;
  const currentStep = input.requiresApproval ? "Queued for approval" : "Queued";
  const fields: Record<string, WorkspaceDatabaseFieldValue> = {
    [WORKFLOW_RUN_FIELDS.name]: runName,
    [WORKFLOW_RUN_FIELDS.status]: input.requiresApproval ? "Needs approval" : "Queued",
    [WORKFLOW_RUN_FIELDS.workflow]: [workflow.id],
    [WORKFLOW_RUN_FIELDS.task]: input.taskId ? [input.taskId] : [],
    [WORKFLOW_RUN_FIELDS.bizOps]: input.bizOpsId ? [input.bizOpsId] : [],
    [WORKFLOW_RUN_FIELDS.entityScope]: input.entityScope ?? workflowItem.entity,
    [WORKFLOW_RUN_FIELDS.ownerRole]: workflowItem.owner_role,
    [WORKFLOW_RUN_FIELDS.actor]: workflowItem.default_actor,
    [WORKFLOW_RUN_FIELDS.triggerSource]: input.triggerSource,
    [WORKFLOW_RUN_FIELDS.currentStep]: currentStep,
    [WORKFLOW_RUN_FIELDS.sourceDocuments]: sourceDocumentIds,
    [WORKFLOW_RUN_FIELDS.sourceRecords]: sourceRecords.join("\n"),
    [WORKFLOW_RUN_FIELDS.context]: JSON.stringify({
      requested_by: input.requestedBy,
      workflow_id: input.workflowId,
      context: input.context ?? {},
      config: input.config ?? {},
    }),
    [WORKFLOW_RUN_FIELDS.receipt]: "",
    [WORKFLOW_RUN_FIELDS.startedAt]: new Date().toISOString(),
    [WORKFLOW_RUN_FIELDS.completedAt]: null,
  };
  const body = `# ${runName}

Workflow: ${workflowItem.workflow_id}
Requested by: ${input.requestedBy}
Trigger source: ${input.triggerSource}
Owner role: ${workflowItem.owner_role ?? "none"}
Default actor: ${workflowItem.default_actor ?? "none"}
Approval gates: ${workflowItem.approval_gates ?? "none"}
Expected output: ${workflowItem.expected_output ?? "none"}

Source records:
${markdownList(sourceRecords)}

Source documents:
${markdownList(sourceDocumentIds)}

Context:
${JSON.stringify(input.context ?? {}, null, 2)}`;

  if (!input.confirmWrite) {
    return {
      dry_run: true,
      message: "Preview only. Re-run with confirmWrite: true to create a Workflow Runs record.",
      workflow: workflowItem,
      next_run: {
        name: runName,
        status: fields[WORKFLOW_RUN_FIELDS.status],
        current_step: currentStep,
        actor: workflowItem.default_actor,
        owner_role: workflowItem.owner_role,
        source_documents: sourceDocumentIds,
        source_records: sourceRecords,
      },
    };
  }

  let created = await createWorkspaceRecord(
    {
      databaseId: GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns,
      fields,
      body,
      taxonomy: {
        entity: "genzen",
        area: "operations",
        object_type: "workflow_run",
        workflow_id: input.workflowId,
      },
      skipSystemSync: true,
    },
  );
  const existingRuns = asStringArray(workflow.fields[WORKFLOW_REGISTRY_FIELDS.runs]);
  await updateWorkspaceRecord(
    workflow.id,
    {
      fields: {
        ...workflow.fields,
        [WORKFLOW_REGISTRY_FIELDS.runs]: Array.from(new Set([...existingRuns, created.id])),
      },
      body: workflow.body,
      taxonomy: workflow.taxonomy,
    },
    true,
  );

  if (input.taskId) {
    await appendWorkspaceRecordRelation(input.taskId, AGENT_TASK_FIELDS.workflowRuns, created.id);
  }
  if (input.bizOpsId) {
    await appendWorkspaceRecordRelation(input.bizOpsId, AGENT_BIZ_OPS_FIELDS.workflowRuns, created.id);
  }

  await recordWorkEvent({
    recordId: input.taskId ?? created.id,
    workflowRunId: created.id,
    eventKind: "workflow_run_started",
    actor: input.requestedBy,
    durableRole: workflowItem.owner_role,
    summary: runName,
    payload: {
      workflow_id: input.workflowId,
      trigger_source: input.triggerSource,
      entity_scope: input.entityScope ?? workflowItem.entity ?? null,
      task_id: input.taskId ?? null,
      biz_ops_id: input.bizOpsId ?? null,
      requires_approval: Boolean(input.requiresApproval),
    },
  });

  if (!input.requiresApproval) {
    try {
      const dispatch = await submitWorkflow({
        workflowId: input.workflowId,
        task: `Execute Workflow Run ${created.id}: ${runName}. Update the Workflow Run with receipts and sync the linked Task when work progresses.`,
        context: {
          type: "workflow_run",
          id: created.id,
          route: "workflow_runs",
          payload: {
            workflow_run_id: created.id,
            workflow_record_id: workflow.id,
            workflow_id: input.workflowId,
            task_id: input.taskId ?? null,
            biz_ops_id: input.bizOpsId ?? null,
            source_records: sourceRecords,
            source_documents: sourceDocumentIds,
            trigger_source: input.triggerSource,
            requested_by: input.requestedBy,
            context: input.context ?? {},
          },
        },
        priority: "normal",
        config: {
          confirm_write_required: true,
          sync_task: true,
          ...(input.config ?? {}),
        },
        prompt:
          input.dispatchPrompt ??
          "Use the configured IntelliZen workspace tools to continue this Workflow Run. Keep writes bounded to the supplied workflow_run_id and linked records, append receipts for every state change, and request approval before any external-facing artifact or irreversible action.",
      });
      const section = workflowRuntimeDispatchSection({
        status: dispatch.status,
        actor: workflowItem.default_actor,
        workflowRunId: created.id,
        messageId: dispatch.messageId,
        inboxItemId: dispatch.inboxItemId,
      });
      created = await appendRecordSectionAtomic(created.id, section, {
        [WORKFLOW_RUN_FIELDS.status]: "In progress",
        [WORKFLOW_RUN_FIELDS.currentStep]: "Dispatched to local runtime",
        [WORKFLOW_RUN_FIELDS.receipt]: appendMarkdownSection(
          fieldString(created.fields[WORKFLOW_RUN_FIELDS.receipt]),
          section,
        ),
      });
      await recordWorkEvent({
        recordId: input.taskId ?? created.id,
        workflowRunId: created.id,
        eventKind: "dispatch",
        actor: input.requestedBy,
        summary: `Dispatched ${runName} (${dispatch.status})`,
        payload: {
          workflow_id: input.workflowId,
          dispatch_status: dispatch.status,
          message_id: dispatch.messageId ?? null,
          inbox_item_id: dispatch.inboxItemId ?? null,
          dispatch_error: dispatch.dispatchError ?? null,
        },
      });
    } catch (error) {
      const section = workflowRuntimeDispatchSection({
        status: "failed",
        actor: workflowItem.default_actor,
        workflowRunId: created.id,
        error,
      });
      created = await appendRecordSectionAtomic(created.id, section, {
        [WORKFLOW_RUN_FIELDS.currentStep]: "Runtime dispatch needs retry",
        [WORKFLOW_RUN_FIELDS.receipt]: appendMarkdownSection(
          fieldString(created.fields[WORKFLOW_RUN_FIELDS.receipt]),
          section,
        ),
      });
      await recordWorkEvent({
        recordId: input.taskId ?? created.id,
        workflowRunId: created.id,
        eventKind: "dispatch",
        actor: input.requestedBy,
        summary: `Dispatch failed for ${runName}`,
        payload: {
          workflow_id: input.workflowId,
          dispatch_status: "failed",
          dispatch_error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  return {
    dry_run: false,
    workflow_run_id: created.id,
    session_id: null,
    status: fieldString(created.fields[WORKFLOW_RUN_FIELDS.status])?.toLowerCase().replace(/\s+/g, "_") ?? "queued",
    current_step: fieldString(created.fields[WORKFLOW_RUN_FIELDS.currentStep]),
    run: toWorkflowRunItem(created),
  };
}

// ============================
// Record activity, history, and templates (Phase B)
// ============================

export interface WorkEventItem {
  id: string;
  record_id: string | null;
  workflow_run_id: string | null;
  event_kind: string;
  actor: string;
  durable_role: string | null;
  decision_role: string | null;
  summary: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export async function listWorkEvents(input: { recordId?: string; workflowRunId?: string; limit?: number }) {
  let query = supabase
    .schema("workspace").from("work_events")
    .select("id, record_id, workflow_run_id, event_kind, actor, durable_role, decision_role, summary, payload, created_at")
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 30);
  if (input.recordId && input.workflowRunId) {
    query = query.or(`record_id.eq.${input.recordId},workflow_run_id.eq.${input.workflowRunId}`);
  } else if (input.recordId) {
    query = query.eq("record_id", input.recordId);
  } else if (input.workflowRunId) {
    query = query.eq("workflow_run_id", input.workflowRunId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as WorkEventItem[];
}

export interface RecordRevisionItem {
  id: string;
  record_id: string;
  database_id: string;
  fields: Record<string, WorkspaceDatabaseFieldValue>;
  body: string | null;
  taxonomy: TaxonomyMetadata;
  op: "update" | "delete";
  revised_at: string;
}

export async function listRecordRevisions(recordId: string, limit = 20) {
  const { data, error } = await supabase
    .schema("workspace").from("record_revisions")
    .select("id, record_id, database_id, fields, body, taxonomy, op, revised_at")
    .eq("record_id", recordId)
    .order("revised_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as RecordRevisionItem[];
}

/** Restore a record to a prior revision. The restore itself is captured as a new revision. */
export async function restoreRecordRevision(revision: RecordRevisionItem) {
  return updateWorkspaceRecord(
    revision.record_id,
    { fields: revision.fields, body: revision.body ?? "", taxonomy: revision.taxonomy },
    true,
  );
}

/** Latest delete-revision per record that no longer exists (the trash). */
export async function listDeletedRecords(databaseId: string, limit = 25) {
  const { data, error } = await supabase
    .schema("workspace").from("record_revisions")
    .select("id, record_id, database_id, fields, body, taxonomy, op, revised_at")
    .eq("database_id", databaseId)
    .eq("op", "delete")
    .order("revised_at", { ascending: false })
    .limit(limit * 3);
  if (error) throw error;
  const revisions = (data ?? []) as RecordRevisionItem[];
  const latestByRecord = new Map<string, RecordRevisionItem>();
  for (const revision of revisions) {
    if (!latestByRecord.has(revision.record_id)) latestByRecord.set(revision.record_id, revision);
  }
  const candidates = Array.from(latestByRecord.values()).slice(0, limit);
  if (candidates.length === 0) return [];
  const { data: living, error: livingError } = await supabase
    .schema("workspace").from("records")
    .select("id")
    .in("id", candidates.map((candidate) => candidate.record_id));
  if (livingError) throw livingError;
  const livingIds = new Set(((living ?? []) as Array<{ id: string }>).map((row) => row.id));
  return candidates.filter((candidate) => !livingIds.has(candidate.record_id));
}

/** Re-insert a deleted record from its trash revision, keeping the original id. */
export async function restoreDeletedRecord(revision: RecordRevisionItem) {
  const { data, error } = await supabase
    .schema("workspace").from("records")
    .insert([
      {
        id: revision.record_id,
        database_id: revision.database_id,
        fields: revision.fields,
        body: revision.body,
        taxonomy: revision.taxonomy,
      },
    ])
    .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
    .single();
  if (error) throw error;
  return toWorkspaceDatabaseRecord(data as WorkspaceDatabaseRecordRow);
}

/** Duplicate a record as a reusable template (taxonomy.is_template = true). */
export async function saveRecordAsTemplate(recordId: string) {
  const record = await getWorkspaceRecord(recordId);
  return createWorkspaceRecord({
    databaseId: record.database_id,
    fields: record.fields,
    body: record.body,
    taxonomy: { ...(record.taxonomy ?? {}), is_template: true },
    skipSystemSync: true,
  });
}

/** Create a fresh record from a template record (clears the template flag). */
export async function createRecordFromTemplate(templateRecordId: string) {
  const template = await getWorkspaceRecord(templateRecordId);
  const taxonomy = { ...(template.taxonomy ?? {}) };
  delete taxonomy.is_template;
  return createWorkspaceRecord({
    databaseId: template.database_id,
    fields: template.fields,
    body: template.body,
    taxonomy,
    skipSystemSync: true,
  });
}

export async function deleteWorkspaceRecord(id: string, skipSystemSync = false) {
  if (!skipSystemSync) {
    const { data: existing, error: existingError } = await supabase
      .schema("workspace").from("records")
      .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
      .eq("id", id)
      .single();

    if (existingError) throw existingError;
    const current = toWorkspaceDatabaseRecord(existing as WorkspaceDatabaseRecordRow);
    const systemKind = await getOperationalSystemKindForDatabaseId(current.database_id);

    if (systemKind === "operations") {
      const legacyId = current.fields[OPERATIONS_DB_FIELDS.legacyId];
      if (typeof legacyId === "number") {
        const { error } = await supabase.schema("anchors").from("operations").delete().eq("id", legacyId);
        if (error) throw error;
        await syncOperationalWorkspaceDatabases();
        return;
      }
    }

    if (systemKind === "projects") {
      const legacyId = current.fields[PROJECTS_DB_FIELDS.legacyId];
      if (typeof legacyId === "number") {
        const { error } = await supabase.schema("anchors").from("projects").delete().eq("id", legacyId);
        if (error) throw error;
        await syncOperationalWorkspaceDatabases();
        return;
      }
    }
  }

  const { error } = await supabase.schema("workspace").from("records").delete().eq("id", id);
  if (error) throw error;
}

export async function updateWorkspaceRelationLinks(input: {
  databaseId: string;
  recordId: string;
  relationFieldId: string;
  recordIds: string[];
}) {
  const systemKind = await getOperationalSystemKindForDatabaseId(input.databaseId);
  if (
    (systemKind === "operations" && input.relationFieldId === OPERATIONS_DB_FIELDS.projects) ||
    (systemKind === "projects" && input.relationFieldId === PROJECTS_DB_FIELDS.operation)
  ) {
    return updateWorkspaceRecord(input.recordId, {
      fieldId: input.relationFieldId,
      value: [...new Set(input.recordIds.filter(Boolean))],
    });
  }

  const bundle = await getWorkspaceDatabaseBundle(input.databaseId);
  const sourceField = bundle.database.schema.find((field) => field.id === input.relationFieldId);
  if (!sourceField || sourceField.type !== "relation") {
    throw new Error("Relation field not found.");
  }

  const sourceRecord = bundle.records.find((record) => record.id === input.recordId);
  if (!sourceRecord) {
    throw new Error("Record not found.");
  }

  const normalizedIds = [...new Set(input.recordIds.filter(Boolean))];
  const currentIds = Array.isArray(sourceRecord.fields[input.relationFieldId])
    ? ((sourceRecord.fields[input.relationFieldId] as string[]) ?? [])
    : [];

  const updatedSource = await updateWorkspaceRecordFields(input.recordId, {
    ...sourceRecord.fields,
    [input.relationFieldId]: normalizedIds,
  });

  const targetDatabaseId = sourceField.relation?.targetDatabaseId ?? input.databaseId;
  const backlinkFieldId = sourceField.relation?.targetRelationFieldId;
  if (!backlinkFieldId || (targetDatabaseId === input.databaseId && backlinkFieldId === input.relationFieldId)) {
    return updatedSource;
  }

  const affectedIds = [...new Set([...currentIds, ...normalizedIds])];
  if (affectedIds.length === 0) {
    return updatedSource;
  }

  const { data: targetRows, error: targetError } = await supabase
    .schema("workspace").from("records")
    .select("id, database_id, fields, body, taxonomy, created_at, updated_at")
    .eq("database_id", targetDatabaseId)
    .in("id", affectedIds);

  if (targetError) throw targetError;

  for (const row of (targetRows ?? []) as WorkspaceDatabaseRecordRow[]) {
    const targetRecord = toWorkspaceDatabaseRecord(row);
    const existingLinks = Array.isArray(targetRecord.fields[backlinkFieldId])
      ? ([...((targetRecord.fields[backlinkFieldId] as string[]) ?? [])] as string[])
      : [];
    const shouldLink = normalizedIds.includes(targetRecord.id);
    const hasLink = existingLinks.includes(input.recordId);

    if (shouldLink && !hasLink) {
      existingLinks.push(input.recordId);
      await updateWorkspaceRecordFields(targetRecord.id, {
        ...targetRecord.fields,
        [backlinkFieldId]: existingLinks,
      });
    }

    if (!shouldLink && hasLink) {
      await updateWorkspaceRecordFields(targetRecord.id, {
        ...targetRecord.fields,
        [backlinkFieldId]: existingLinks.filter((id) => id !== input.recordId),
      });
    }
  }

  return updatedSource;
}

// ─── Canvas documents ──────────────────────────────────────────────────────────

export async function listCanvasDocuments() {
  const { data, error } = await supabase
    .schema("workspace").from("canvases")
    .select("id, name, project_id, project_record_id, case_id, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw error;
  return attachProjectRecordIds((data ?? []) as CanvasDocumentSummary[]);
}

export async function getCanvasDocument(id: number) {
  const { data, error } = await supabase
    .schema("workspace").from("canvases")
    .select("id, name, project_id, project_record_id, case_id, content_json, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error) throw error;
  return attachProjectRecordId(data as CanvasDocument);
}

export async function createCanvasDocument(input?: {
  name?: string;
  projectId?: number | null;
  projectRecordId?: string | null;
  caseId?: string | null;
  contentJson?: CanvasDocumentData;
}) {
  const { projectId, projectRecordId } = await resolveProjectReference({
    projectId: input?.projectId,
    projectRecordId: input?.projectRecordId,
  });
  const { data, error } = await supabase
    .schema("workspace").from("canvases")
    .insert([
      {
        name: input?.name?.trim() || "Untitled canvas",
        project_id: projectId,
        project_record_id: projectRecordId,
        case_id: input?.caseId ?? null,
        content_json:
          input?.contentJson ??
          ({
            nodes: [],
            edges: [],
            sogo: {
              background: "dots",
              snapToGrid: false,
            },
          } satisfies CanvasDocumentData),
      },
    ])
    .select("id, name, project_id, project_record_id, case_id, content_json, created_at, updated_at")
    .single();

  if (error) throw error;
  return attachProjectRecordId(data as CanvasDocument);
}

export async function updateCanvasDocument(
  id: number,
  input: Partial<{
    name: string;
    projectId: number | null;
    projectRecordId: string | null;
    caseId: string | null;
    contentJson: CanvasDocumentData;
  }>,
) {
  const update: Record<string, unknown> = {};
  if (input.name !== undefined) update.name = input.name;
  if (input.projectId !== undefined || input.projectRecordId !== undefined) {
    const { projectId, projectRecordId } = await resolveProjectReference({
      projectId: input.projectId,
      projectRecordId: input.projectRecordId,
    });
    update.project_id = projectId;
    update.project_record_id = projectRecordId;
  }
  if (input.caseId !== undefined) update.case_id = input.caseId;
  if (input.contentJson !== undefined) update.content_json = input.contentJson;

  const { data, error } = await supabase
    .schema("workspace").from("canvases")
    .update(update)
    .eq("id", id)
    .select("id, name, project_id, project_record_id, case_id, content_json, created_at, updated_at")
    .single();

  if (error) throw error;
  return attachProjectRecordId(data as CanvasDocument);
}

export async function updateCanvasDocumentContent(id: number, contentJson: CanvasDocumentData) {
  const { data, error } = await supabase
    .schema("workspace").from("canvases")
    .update({ content_json: contentJson })
    .eq("id", id)
    .select("id, name, project_id, project_record_id, case_id, content_json, created_at, updated_at")
    .single();

  if (error) throw error;
  return attachProjectRecordId(data as CanvasDocument);
}

export async function deleteCanvasDocument(id: number) {
  const { error } = await supabase.schema("workspace").from("canvases").delete().eq("id", id);
  if (error) throw error;
}

// ─── Vault documents (genzen-brain documents table) ────────────────────────────

export async function listStrategyFolders() {
  const { data, error } = await supabase
    .schema("workspace").from("nodes")
    .select("id, parent_id, case_id, project_id, project_record_id, kind, name, path, created_at, updated_at")
    .eq("kind", "folder")
    .is("case_id", null)
    .is("project_id", null)
    .is("project_record_id", null)
    .not("path", "in", '("Workspace","Projects","Investigations")')
    .not("path", "like", "Projects/%")
    .not("path", "like", "Investigations/%")
    .order("path", { ascending: true });

  if (error) throw error;
  return attachProjectRecordIds((data ?? []) as WorkspaceNodeSummary[]);
}

export async function createStrategyFolder(input: {
  name: string;
  parentPath?: string | null;
}) {
  let parentId: number | null = null;
  const parentPath = input.parentPath?.trim() || null;
  const path = parentPath ? `${parentPath}/${input.name}` : input.name;

  if (parentPath) {
    const { data: parent, error: parentError } = await supabase
      .schema("workspace").from("nodes")
      .select("id")
      .eq("path", parentPath)
      .eq("kind", "folder")
      .maybeSingle();

    if (parentError) throw parentError;
    parentId = parent?.id ?? null;
  }

  const { data, error } = await supabase
    .schema("workspace").from("nodes")
    .insert([
      {
        parent_id: parentId,
        case_id: null,
        project_id: null,
        project_record_id: null,
        kind: "folder",
        name: input.name,
        path,
        content: null,
      },
    ])
    .select("id, parent_id, case_id, project_id, project_record_id, kind, name, path, created_at, updated_at")
    .single();

  if (error) throw error;
  return attachProjectRecordId(data as WorkspaceNodeSummary);
}

export async function listVaultDocuments() {
  const { data, error } = await supabase
    .schema("knowledge").from("documents")
    .select("id, title, source_path, document_type, domain, taxonomy, created_at, updated_at")
    .order("source_path");

  if (error) throw error;
  return (data ?? []) as VaultDocument[];
}

export async function getVaultDocument(id: number) {
  const { data, error } = await supabase
    .schema("knowledge").from("documents")
    .select("id, title, source_path, document_type, domain, taxonomy, content, metadata, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as VaultDocument;
}

export async function createVaultDocument(input: {
  title: string;
  sourcePath: string;
  content?: string;
  documentType?: string;
  domain?: string;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabase
    .schema("knowledge").from("documents")
    .insert([
      {
        title: input.title,
        source_path: input.sourcePath,
        document_type: input.documentType ?? "strategy",
        domain: input.domain ?? "internal",
        content: input.content ?? "",
        metadata: input.metadata ?? {},
      },
    ])
    .select("id, title, source_path, document_type, domain, taxonomy, content, metadata, created_at, updated_at")
    .single();

  if (error) throw error;
  return data as VaultDocument;
}

export async function updateVaultDocumentContent(id: number, content: string) {
  const { data, error } = await supabase
    .schema("knowledge").from("documents")
    .update({ content })
    .eq("id", id)
    .select("id, title, source_path, document_type, domain, taxonomy, content, metadata, created_at, updated_at")
    .single();

  if (error) throw error;
  return data as VaultDocument;
}

export async function deleteVaultDocument(id: number) {
  const { error } = await supabase.schema("knowledge").from("documents").delete().eq("id", id);
  if (error) throw error;
}
