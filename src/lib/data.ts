import type {
  DeepResearchResult,
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
    .insert([
      {
        ...input,
        status: input.status ?? "new",
      },
    ])
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

  const drafts = response.results
    .filter((result) => !seen.has(result.url))
    .map<SignalDraft>((result) => ({
      title: result.title ?? safeHostname(result.url),
      url: result.url,
      source: safeHostname(result.url),
      published_at: result.publishedDate ?? null,
      snippet: result.highlights?.[0] ?? null,
      watch_domain: monitor.watch_domain,
      exa_score: result.score ?? null,
      raw_payload: result,
    }));

  if (drafts.length > 0) {
    const { error: insertError } = await supabase.from("intel_signals").insert(
      drafts.map((draft) => ({
        ...draft,
        monitor_id: monitor.id,
        status: "new",
      })),
    );

    if (insertError) throw insertError;
  }

  const { error: updateError } = await supabase
    .from("monitors")
    .update({
      last_run: new Date().toISOString(),
      signal_count: monitor.signal_count + drafts.length,
    })
    .eq("id", monitor.id);

  if (updateError) throw updateError;

  return drafts.length;
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
