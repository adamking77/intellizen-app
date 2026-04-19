import {
  runExaSearch,
  signalDraftFromDeepResearch,
  signalDraftFromSearchResult,
} from "@/lib/exa";
import type {
  DeepResearchResult,
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
  VaultDocument,
  VaultFile,
  WorkspaceNode,
  WorkspaceNodeSummary,
} from "@/lib/types";
import { safeHostname } from "@/lib/utils";
import { removeInvestigationDirectory } from "@/lib/vault";
import { DEFAULT_MONITORS } from "@/lib/watch-domains";
import { supabase } from "@/lib/supabase";

export async function listMonitors() {
  const { data, error } = await supabase
    .from("monitors")
    .select("*")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Monitor[];
}

export async function createMonitor(input: MonitorInsert) {
  const { data, error } = await supabase
    .from("monitors")
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
    .from("monitors")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as Monitor;
}

export async function deleteMonitor(id: number) {
  const { error } = await supabase.from("monitors").delete().eq("id", id);
  if (error) throw error;
}

export async function seedDefaultMonitors() {
  const { data, error } = await supabase.from("monitors").select("watch_domain");
  if (error) throw error;

  const existing = new Set((data ?? []).map((row) => row.watch_domain as string));
  const missing = DEFAULT_MONITORS.filter(
    (monitor) => !existing.has(monitor.watch_domain),
  );

  if (missing.length === 0) return 0;

  const { error: insertError } = await supabase.from("monitors").insert(missing);
  if (insertError) throw insertError;

  return missing.length;
}

export async function listSignals() {
  const [{ data: pSigs }, { data: iSigs }] = await Promise.all([
    supabase.from("project_signals").select("signal_id"),
    supabase.from("investigation_signals").select("signal_id"),
  ]);

  const protectedIds = [
    ...(pSigs ?? []).map((r) => r.signal_id),
    ...(iSigs ?? []).map((r) => r.signal_id),
  ];

  let query = supabase
    .from("intel_signals")
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
    .from("intel_signals")
    .select("*", { count: "exact", head: true })
    .eq("status", "new");

  if (error) throw error;
  return count ?? 0;
}

// ============================
// Operations
// ============================

export async function listOperations() {
  const { data, error } = await supabase
    .from("operations")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as Operation[];
}

export async function createOperation(input: {
  name: string;
  description?: string | null;
}) {
  const { data, error } = await supabase
    .from("operations")
    .insert([{ name: input.name, description: input.description ?? null }])
    .select("*")
    .single();

  if (error) throw error;
  return data as Operation;
}

export async function updateOperation(
  id: number,
  input: Partial<Pick<Operation, "name" | "description" | "status">>,
) {
  const { data, error } = await supabase
    .from("operations")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as Operation;
}

export async function deleteOperation(id: number) {
  const { error } = await supabase.from("operations").delete().eq("id", id);
  if (error) throw error;
}

export async function listProjects() {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function createProject(input: {
  name: string;
  type: Project["type"];
  watch_domain?: string | null;
  operation_id?: number | null;
}) {
  const { data, error } = await supabase
    .from("projects")
    .insert([
      {
        name: input.name,
        type: input.type,
        watch_domain: input.watch_domain ?? null,
        operation_id: input.operation_id ?? null,
      },
    ])
    .select("*")
    .single();

  if (error) throw error;
  return data as Project;
}

export async function updateProject(
  id: number,
  input: Partial<Pick<Project, "name" | "type" | "watch_domain" | "status" | "notes" | "operation_id">>,
) {
  const { data, error } = await supabase
    .from("projects")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as Project;
}

export async function deleteProject(id: number) {
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function listProjectSignalCounts(): Promise<Record<number, number>> {
  const { data, error } = await supabase
    .from("project_signals")
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
    .from("project_signals")
    .select("id, project_id, signal_id, notes, added_at, intel_signals(*)")
    .eq("project_id", projectId)
    .order("added_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as ProjectSignal[];
}

export async function removeSignalFromProject(projectSignalId: number) {
  const { error } = await supabase
    .from("project_signals")
    .delete()
    .eq("id", projectSignalId);

  if (error) throw error;
}

export async function dismissSignal(signalId: number) {
  const [{ count: pCount }, { count: iCount }] = await Promise.all([
    supabase.from("project_signals").select("*", { count: "exact", head: true }).eq("signal_id", signalId),
    supabase.from("investigation_signals").select("*", { count: "exact", head: true }).eq("signal_id", signalId),
  ]);
  if ((pCount ?? 0) > 0 || (iCount ?? 0) > 0) return;

  const { error } = await supabase.from("intel_signals").delete().eq("id", signalId);
  if (error) throw error;
}

export async function bulkDismissSignals(ids: number[]) {
  if (ids.length === 0) return { total: 0, cleared: 0 };

  const [{ data: pSigs }, { data: iSigs }] = await Promise.all([
    supabase.from("project_signals").select("signal_id").in("signal_id", ids),
    supabase.from("investigation_signals").select("signal_id").in("signal_id", ids),
  ]);

  const protectedIds = new Set([
    ...(pSigs ?? []).map((r) => r.signal_id),
    ...(iSigs ?? []).map((r) => r.signal_id),
  ]);

  const toDelete = ids.filter((id) => !protectedIds.has(id));
  if (toDelete.length === 0) return { total: ids.length, cleared: 0 };

  const { error } = await supabase.from("intel_signals").delete().in("id", toDelete);
  if (error) throw error;

  return { total: ids.length, cleared: toDelete.length };
}

export async function saveSignalToProject(input: {
  projectId: number;
  signalId: number;
}) {
  const { error: linkError } = await supabase.from("project_signals").upsert(
    [{ project_id: input.projectId, signal_id: input.signalId }],
    { onConflict: "project_id,signal_id", ignoreDuplicates: true },
  );

  if (linkError) throw linkError;

  const { error: signalError } = await supabase
    .from("intel_signals")
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
    .from("intel_signals")
    .select("*")
    .eq("url", url)
    .maybeSingle();

  if (error) throw error;
  return data as IntelSignal | null;
}

async function insertSignal(input: SignalDraft) {
  const { data, error } = await supabase
    .from("intel_signals")
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
      .from("intel_signals")
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
    .from("monitors")
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
    .from("graph_nodes")
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
    .from("graph_edges")
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
    .from("graph_nodes")
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
    .from("graph_nodes")
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
    .from("graph_nodes")
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
    .from("graph_nodes")
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
    .from("graph_edges")
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
    .from("graph_edges")
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
    .from("graph_edges")
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
    .from("investigations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Investigation[];
}

export async function getInvestigation(caseId: string) {
  const { data, error } = await supabase
    .from("investigations")
    .select("*")
    .eq("case_id", caseId)
    .single();

  if (error) throw error;
  return data as Investigation;
}

export async function createInvestigation(input: {
  name: string;
  projectId?: number | null;
  operationId?: number | null;
  useCase?: import("@/lib/types").InvestigationUseCase;
}) {
  const MAX_CASE_ID_ATTEMPTS = 5;

  for (let attempt = 0; attempt < MAX_CASE_ID_ATTEMPTS; attempt += 1) {
    const caseId = generateCaseId();
    const { data, error } = await supabase
      .from("investigations")
      .insert([
        {
          case_id: caseId,
          name: input.name,
          project_id: input.projectId ?? null,
          operation_id: input.operationId ?? null,
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
    .from("investigations")
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
  const { data, error } = await supabase
    .from("investigations")
    .update(input)
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
    .from("investigations")
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
    .from("investigations")
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
            .from("intel_signals")
            .upsert([{ ...draft, status: "saved" }], { onConflict: "url" })
            .select("id")
            .single();

          if (!signal) continue;

          await supabase
            .from("investigation_signals")
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
    .from("investigation_signals")
    .select("*, intel_signals(*)")
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
    .from("investigation_signals")
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
    .from("investigation_signals")
    .upsert(
      signalIds.map((signal_id) => ({ investigation_id: investigationId, signal_id, notes: null })),
      { onConflict: "investigation_id,signal_id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function removeSignalFromInvestigation(id: number) {
  const { error } = await supabase
    .from("investigation_signals")
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
    .from("investigation_signals")
    .update({
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.phaseAdded !== undefined ? { phase_added: input.phaseAdded } : {}),
    })
    .eq("id", id)
    .select("*, intel_signals(*)")
    .single();

  if (error) throw error;
  return data as unknown as InvestigationSignal;
}

// Vault Files (Reports)
export async function listVaultFiles(caseId: string) {
  const { data, error } = await supabase
    .from("vault_files")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as VaultFile[];
}

export async function createVaultFile(input: {
  caseId?: string | null;
  projectId?: number | null;
  phase?: number;
  fileType: VaultFile["file_type"];
  filePath: string;
  fileName: string;
  reportType?: VaultFile["report_type"];
  content?: string | null;
}) {
  const { data, error } = await supabase
    .from("vault_files")
    .insert([
      {
        case_id: input.caseId ?? null,
        project_id: input.projectId ?? null,
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
  return data as VaultFile;
}

export async function getVaultFile(id: number) {
  const { data, error } = await supabase
    .from("vault_files")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as VaultFile;
}

export async function updateVaultFileContent(id: number, content: string) {
  const { data, error } = await supabase
    .from("vault_files")
    .update({ content })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as VaultFile;
}

export async function deleteVaultFile(id: number) {
  const { error } = await supabase.from("vault_files").delete().eq("id", id);
  if (error) throw error;
}

export async function listProjectVaultFiles(projectId: number) {
  const { data, error } = await supabase
    .from("vault_files")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as VaultFile[];
}

export async function listAllVaultFiles() {
  const { data, error } = await supabase
    .from("vault_files")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as VaultFile[];
}

export async function createGraphExportVaultFile(input: {
  caseId?: string | null;
  projectId?: number | null;
  filePath: string;
  fileName: string;
}) {
  const { data, error } = await supabase
    .from("vault_files")
    .insert([
      {
        case_id: input.caseId ?? null,
        project_id: input.projectId ?? null,
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
  return data as VaultFile;
}

async function getWorkspaceParentContext(parentId: number | null) {
  if (parentId == null) {
    return { path: "", caseId: null as string | null, projectId: null as number | null };
  }

  const { data, error } = await supabase
    .from("workspace_nodes")
    .select("id, kind, path, case_id, project_id")
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
  };
}

export async function listWorkspaceNodes() {
  const { data, error } = await supabase
    .from("workspace_nodes")
    .select("id, parent_id, case_id, project_id, kind, name, path, created_at, updated_at")
    .order("path", { ascending: true });

  if (error) throw error;
  return (data ?? []) as WorkspaceNodeSummary[];
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
  }) {
    const existing = foldersByPath.get(input.path);
    if (existing) return existing;

    const { data, error } = await supabase
      .from("workspace_nodes")
      .insert([
        {
          parent_id: input.parentId,
          case_id: input.caseId ?? null,
          project_id: input.projectId ?? null,
          kind: "folder",
          name: input.name,
          path: input.path,
          content: null,
        },
      ])
      .select("id, parent_id, case_id, project_id, kind, name, path, created_at, updated_at")
      .single();

    if (error) throw error;

    const folder = data as WorkspaceNodeSummary;
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
    .from("workspace_nodes")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as WorkspaceNode;
}

export async function createWorkspaceFolder(input: {
  parentId?: number | null;
  name: string;
  caseId?: string | null;
  projectId?: number | null;
}) {
  const parent = await getWorkspaceParentContext(input.parentId ?? null);
  const path = parent.path ? `${parent.path}/${input.name}` : input.name;
  const caseId = input.caseId ?? parent.caseId ?? null;
  const projectId = input.projectId ?? parent.projectId ?? null;

  const { data, error } = await supabase
    .from("workspace_nodes")
    .insert([
      {
        parent_id: input.parentId ?? null,
        case_id: caseId,
        project_id: projectId,
        kind: "folder",
        name: input.name,
        path,
        content: null,
      },
    ])
    .select("*")
    .single();

  if (error) throw error;
  return data as WorkspaceNode;
}

export async function createWorkspaceFile(input: {
  parentId?: number | null;
  name: string;
  content?: string;
  caseId?: string | null;
  projectId?: number | null;
}) {
  const parent = await getWorkspaceParentContext(input.parentId ?? null);
  const path = parent.path ? `${parent.path}/${input.name}` : input.name;
  const caseId = input.caseId ?? parent.caseId ?? null;
  const projectId = input.projectId ?? parent.projectId ?? null;

  const { data, error } = await supabase
    .from("workspace_nodes")
    .insert([
      {
        parent_id: input.parentId ?? null,
        case_id: caseId,
        project_id: projectId,
        kind: "file",
        name: input.name,
        path,
        content: input.content ?? "",
      },
    ])
    .select("*")
    .single();

  if (error) throw error;
  return data as WorkspaceNode;
}

export async function updateWorkspaceFileContent(id: number, content: string) {
  const { data, error } = await supabase
    .from("workspace_nodes")
    .update({ content })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data as WorkspaceNode;
}

// ─── Vault documents (genzen-brain documents table) ────────────────────────────

export async function listStrategyFolders() {
  const { data, error } = await supabase
    .from("workspace_nodes")
    .select("id, parent_id, case_id, project_id, kind, name, path, created_at, updated_at")
    .eq("kind", "folder")
    .is("case_id", null)
    .is("project_id", null)
    .not("path", "in", '("Workspace","Projects","Investigations")')
    .not("path", "like", "Projects/%")
    .not("path", "like", "Investigations/%")
    .order("path", { ascending: true });

  if (error) throw error;
  return (data ?? []) as WorkspaceNodeSummary[];
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
      .from("workspace_nodes")
      .select("id")
      .eq("path", parentPath)
      .eq("kind", "folder")
      .maybeSingle();

    if (parentError) throw parentError;
    parentId = parent?.id ?? null;
  }

  const { data, error } = await supabase
    .from("workspace_nodes")
    .insert([
      {
        parent_id: parentId,
        case_id: null,
        project_id: null,
        kind: "folder",
        name: input.name,
        path,
        content: null,
      },
    ])
    .select("id, parent_id, case_id, project_id, kind, name, path, created_at, updated_at")
    .single();

  if (error) throw error;
  return data as WorkspaceNodeSummary;
}

export async function listVaultDocuments() {
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, source_path, document_type, domain, created_at, updated_at")
    .order("source_path");

  if (error) throw error;
  return (data ?? []) as VaultDocument[];
}

export async function getVaultDocument(id: number) {
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, source_path, document_type, domain, content, metadata, created_at, updated_at")
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
    .from("documents")
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
    .select("id, title, source_path, document_type, domain, content, metadata, created_at, updated_at")
    .single();

  if (error) throw error;
  return data as VaultDocument;
}

export async function updateVaultDocumentContent(id: number, content: string) {
  const { data, error } = await supabase
    .from("documents")
    .update({ content })
    .eq("id", id)
    .select("id, title, source_path, document_type, domain, content, metadata, created_at, updated_at")
    .single();

  if (error) throw error;
  return data as VaultDocument;
}
