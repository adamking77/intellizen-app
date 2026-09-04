import { supabase } from "@/lib/supabase";
import { GENZEN_WORKSPACE_DATABASE_IDS } from "@/lib/workspace-ids";

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

export function workEventsForSession(events: WorkEventItem[], sessionId: string, profile: string) {
  const keys = new Set([sessionId, `${profile}:${sessionId}`]);
  return events.filter((event) => {
    const payload = event.payload ?? {};
    return [payload.session_id, payload.sessionId, payload.session_key, payload.sessionKey]
      .some((value) => typeof value === "string" && keys.has(value));
  }).sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export async function listWorkEvents(input: { recordId?: string; workflowRunId?: string; since?: string; limit?: number }) {
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
  if (input.since) query = query.gte("created_at", input.since);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as WorkEventItem[];
}

export async function recordProposalDecision(input: {
  proposalId: string;
  docPath: string;
  decision: "accepted" | "rejected";
  hunkCount: number;
  actor: string;
}) {
  const { error } = await supabase.schema("workspace").from("work_events").insert([{
    record_id: null,
    workflow_run_id: null,
    event_kind: `proposal.${input.decision}`,
    actor: input.actor,
    durable_role: null,
    decision_role: input.actor === "Adam" ? "founder_approval_authority" : null,
    summary: `${input.decision === "accepted" ? "Accepted" : "Rejected"} ${input.hunkCount} proposal change${input.hunkCount === 1 ? "" : "s"}`,
    payload: {
      proposal_id: input.proposalId,
      doc_path: input.docPath,
      hunk_count: input.hunkCount,
    },
  }]);
  if (error) throw error;
}

export interface ReceiptIntegrityDiagnostic {
  checkedAt: string;
  runCount: number;
  expectedTransitionCount: number;
  observedTransitionCount: number;
  runsWithGaps: Array<{
    workflowRunId: string;
    expectedVersion: number;
    observedVersions: number[];
    missingVersions: number[];
  }>;
}

export async function inspectWorkflowReceiptIntegrity(): Promise<ReceiptIntegrityDiagnostic> {
  const [runsResult, eventsResult] = await Promise.all([
    supabase
      .schema("workspace")
      .from("records")
      .select("id, fields")
      .eq("database_id", GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns)
      .eq("fields->>run_schema_version", "intellizen.workflow/1"),
    supabase
      .schema("workspace")
      .from("work_events")
      .select("workflow_run_id, run_version")
      .not("workflow_run_id", "is", null)
      .not("run_version", "is", null)
      .order("run_version", { ascending: true })
      .limit(10_000),
  ]);
  if (runsResult.error) throw runsResult.error;
  if (eventsResult.error) throw eventsResult.error;

  const versionsByRun = new Map<string, Set<number>>();
  for (const event of eventsResult.data ?? []) {
    if (
      typeof event.workflow_run_id !== "string" ||
      typeof event.run_version !== "number"
    ) {
      continue;
    }
    const versions = versionsByRun.get(event.workflow_run_id) ?? new Set<number>();
    versions.add(event.run_version);
    versionsByRun.set(event.workflow_run_id, versions);
  }

  let expectedTransitionCount = 0;
  let observedTransitionCount = 0;
  const runsWithGaps: ReceiptIntegrityDiagnostic["runsWithGaps"] = [];
  for (const row of runsResult.data ?? []) {
    const fields =
      row.fields && typeof row.fields === "object" && !Array.isArray(row.fields)
        ? (row.fields as Record<string, unknown>)
        : {};
    const expectedVersion =
      typeof fields.run_version === "number" ? fields.run_version : 0;
    const observedVersions = Array.from(versionsByRun.get(row.id) ?? []).sort(
      (left, right) => left - right,
    );
    const missingVersions = Array.from(
      { length: expectedVersion },
      (_, index) => index + 1,
    ).filter((version) => !observedVersions.includes(version));
    expectedTransitionCount += expectedVersion;
    observedTransitionCount += observedVersions.length;
    if (missingVersions.length) {
      runsWithGaps.push({
        workflowRunId: row.id,
        expectedVersion,
        observedVersions,
        missingVersions,
      });
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    runCount: runsResult.data?.length ?? 0,
    expectedTransitionCount,
    observedTransitionCount,
    runsWithGaps,
  };
}
