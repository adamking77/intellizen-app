import type {
  DeepResearchResult,
  GraphEntityType,
  GraphEdgeRecord,
  GraphNodeRecord,
  IntelSignal,
  Monitor,
  MonitorInsert,
  Project,
  ProjectSignal,
  SearchResultItem,
  SignalDraft,
} from "@/lib/types";
import { signalDraftFromDeepResearch, signalDraftFromSearchResult } from "@/lib/exa";
import { exa } from "@/lib/exa";
import { safeHostname } from "@/lib/utils";
import { DEFAULT_MONITORS } from "@/lib/watch-domains";
import { supabase } from "@/lib/supabase";

export async function listMonitors() {
  const { data, error } = await supabase
    .from("monitors")
    .select("*")
    .order("created_at", { ascending: true });

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
  const { data, error } = await supabase
    .from("intel_signals")
    .select("*")
    .in("status", ["new", "saved"])
    .order("created_at", { ascending: false });

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
}) {
  const { data, error } = await supabase
    .from("projects")
    .insert([
      {
        name: input.name,
        type: input.type,
        watch_domain: input.watch_domain ?? null,
      },
    ])
    .select("*")
    .single();

  if (error) throw error;
  return data as Project;
}

export async function updateProject(
  id: number,
  input: Partial<Pick<Project, "name" | "type" | "watch_domain" | "status" | "notes">>,
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
  const { error } = await supabase
    .from("intel_signals")
    .update({ status: "dismissed" })
    .eq("id", signalId);

  if (error) throw error;
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
  const { data: existing, error: existingError } = await supabase
    .from("intel_signals")
    .select("url");

  if (existingError) throw existingError;

  const seen = new Set((existing ?? []).map((row) => row.url as string));
  const response = await exa.searchAndContents(monitor.query, {
    type: "auto",
    numResults: 10,
    highlights: {
      numSentences: 3,
      highlightsPerUrl: 1,
    },
  });

  const drafts: SignalDraft[] = [];

  for (const result of response.results) {
    if (seen.has(result.url)) continue;

    seen.add(result.url);
    drafts.push({
      title: result.title ?? safeHostname(result.url),
      url: result.url,
      source: safeHostname(result.url),
      published_at: result.publishedDate ?? null,
      snippet: result.highlights?.[0] ?? null,
      watch_domain: monitor.watch_domain,
      exa_score: result.score ?? null,
      raw_payload: result,
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

export async function listGraphNodes(projectId: number) {
  const { data, error } = await supabase
    .from("graph_nodes")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as GraphNodeRecord[];
}

export async function listGraphEdges(projectId: number) {
  const { data, error } = await supabase
    .from("graph_edges")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as GraphEdgeRecord[];
}

export async function createGraphNode(input: {
  projectId: number;
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
  projectId: number;
  nodeId: string;
  position: { x: number; y: number };
}) {
  const { error } = await supabase
    .from("graph_nodes")
    .update({
      position_x: input.position.x,
      position_y: input.position.y,
    })
    .eq("project_id", input.projectId)
    .eq("node_id", input.nodeId);

  if (error) throw error;
}

export async function deleteGraphNodes(input: {
  projectId: number;
  nodeIds: string[];
}) {
  if (input.nodeIds.length === 0) return;

  const { error } = await supabase
    .from("graph_nodes")
    .delete()
    .eq("project_id", input.projectId)
    .in("node_id", input.nodeIds);

  if (error) throw error;
}

export async function createGraphEdge(input: {
  projectId: number;
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

export async function deleteGraphEdges(input: {
  projectId: number;
  edgeIds: string[];
}) {
  if (input.edgeIds.length === 0) return;

  const { error } = await supabase
    .from("graph_edges")
    .delete()
    .eq("project_id", input.projectId)
    .in("edge_id", input.edgeIds);

  if (error) throw error;
}
