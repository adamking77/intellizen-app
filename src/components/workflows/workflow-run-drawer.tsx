import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Drawer } from "@/components/ui/drawer";
import { Control } from "@/components/ui/control";
import { MarkdownBody } from "@/components/ui/markdown-body";
import { Pill } from "@/components/ui/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { GENZEN_WORKSPACE_DATABASE_IDS, getWorkspaceRecord, resolveWorkflowApproval, toWorkflowRunItem } from "@/lib/data";
import { listWorkEvents } from "@/lib/data/work-receipts";
import { workflowApprovalFollowUpWarning, workflowCurrentStepLabel, workflowQuestion } from "@/lib/home-availability";
import type { WorkflowCatalogItem } from "@/lib/workflow-catalog";
import { canonicalWorkflowJson, validateWorkflowDefinition, type WorkflowDefinitionV1 } from "@/lib/workflow-schema";
import type { WorkflowRunItem } from "@/lib/types";
import { dispatchWorkflowRun } from "@/services/workflow-dispatch";
import { runResultVariant } from "./workflow-presentation";
import { runDuration } from "./workflow-detail";
import { WorkflowApprovalCard } from "./workflow-approval-card";
import { WorkflowRunPulse } from "./workflow-run-pulse";
import { meanwhileRunSummary } from "./workflow-meanwhile";

function structuredContext(context: string | null) {
  if (!context) return null;
  try { return JSON.stringify(JSON.parse(context), null, 2); }
  catch { return null; }
}

function structuredDefinition(run: Pick<WorkflowRunItem, "definition_snapshot">) {
  return validateWorkflowDefinition(run.definition_snapshot).valid
    ? run.definition_snapshot as WorkflowDefinitionV1
    : null;
}

function recordedStepStates(stepStates: unknown) {
  return stepStates && typeof stepStates === "object" && !Array.isArray(stepStates)
    ? stepStates as Record<string, unknown>
    : {};
}

function hasQueuedMeanwhileWork(run: WorkflowRunItem, hasPendingApproval: boolean) {
  if (!hasPendingApproval || !run.current_step_id) return false;
  const definition = structuredDefinition(run);
  if (!definition) return false;
  const approval = definition.steps.find((step) => step.id === run.current_step_id);
  if (approval?.kind !== "approval") return false;
  const states = recordedStepStates(run.step_states);
  return Boolean(approval.meanwhile?.some((id) => definition.steps.some((step) => step.id === id && step.kind === "role-assign") && states[id] === "queued"));
}

export function WorkflowRunDrawer({ runId, item, onClose }: { runId: string; item: WorkflowCatalogItem | null; onClose: () => void }) {
  const [fullPage, setFullPage] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);
  const [waitingBusy, setWaitingBusy] = useState(false);
  const [waitingError, setWaitingError] = useState<string | null>(null);
  const approvalAttempt = useRef(0);
  const waitingAttempt = useRef(0);
  const waitingInFlight = useRef(false);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["workflow-run-detail", runId], queryFn: async () => {
    const record = await getWorkspaceRecord(runId);
    if (record.database_id !== GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns) throw new Error("This record is not a workflow run.");
    return record;
  }, refetchInterval: 15_000 });
  const eventsQuery = useQuery({ queryKey: ["workflow-run-events", runId], queryFn: () => listWorkEvents({ workflowRunId: runId, limit: 500 }), enabled: fullPage, refetchInterval: fullPage ? 15_000 : false });
  const run = query.data ? toWorkflowRunItem(query.data) : null;
  const approvalQuestion = useMemo(() => run ? workflowQuestion(run) : null, [run]);
  const displayedCurrentStep = run ? workflowCurrentStepLabel(run) : "Not recorded";
  const canStartWaitingWork = Boolean(run && hasQueuedMeanwhileWork(run, Boolean(approvalQuestion)));
  useEffect(() => {
    approvalAttempt.current += 1;
    waitingAttempt.current += 1;
    waitingInFlight.current = false;
    setApprovalBusy(false);
    setApprovalError(null);
    setApprovalNotice(null);
    setWaitingBusy(false);
    setWaitingError(null);
  }, [runId]);
  async function answerApproval(decision: "approved" | "rejected" | "changes_requested", decisionSummary: string) {
    if (!approvalQuestion) return;
    const attempt = ++approvalAttempt.current;
    setApprovalBusy(true); setApprovalError(null);
    try {
      const result = await resolveWorkflowApproval({ workflowRunId: approvalQuestion.runId, decision, decisionSummary, decidedBy: "Adam", decisionRole: approvalQuestion.decisionRole ?? undefined, expectedRunVersion: approvalQuestion.runVersion, expectedStepId: approvalQuestion.currentStepId, approvalId: approvalQuestion.approvalId, expectedPayloadHash: approvalQuestion.payloadHash, expectedUpdatedAt: approvalQuestion.updatedAt, confirmWrite: true });
      if (approvalAttempt.current === attempt) setApprovalNotice(workflowApprovalFollowUpWarning(result));
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["workflow-run-detail", runId] }), queryClient.invalidateQueries({ queryKey: ["workflow-run-events", runId] }), queryClient.invalidateQueries({ queryKey: ["workflow-runs"] }), queryClient.invalidateQueries({ queryKey: ["activity-dashboard"] }), queryClient.invalidateQueries({ queryKey: ["home-work-events"] }), queryClient.invalidateQueries({ queryKey: ["home-tasks"] })]);
    } catch (error) { if (approvalAttempt.current === attempt) setApprovalError(error instanceof Error ? error.message : "Could not record this workflow approval."); }
    finally { if (approvalAttempt.current === attempt) setApprovalBusy(false); }
  }
  async function startWaitingWork() {
    if (waitingInFlight.current) return;
    waitingInFlight.current = true;
    const attempt = ++waitingAttempt.current;
    setWaitingBusy(true); setWaitingError(null);
    try {
      const record = await getWorkspaceRecord(runId);
      if (record.id !== runId || record.database_id !== GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns) throw new Error("This record is not the requested workflow run.");
      const freshRun = toWorkflowRunItem(record);
      if (!hasQueuedMeanwhileWork(freshRun, Boolean(workflowQuestion(freshRun)))) throw new Error("Waiting work is no longer queued for this approval.");
      await dispatchWorkflowRun(freshRun);
      await Promise.all([
        query.refetch(), eventsQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ["workflow-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["home-work-events"] }),
        queryClient.invalidateQueries({ queryKey: ["home-tasks"] }),
      ]);
    } catch (error) { if (waitingAttempt.current === attempt) setWaitingError(error instanceof Error ? error.message : "Could not start waiting work."); }
    finally {
      if (waitingAttempt.current === attempt) {
        waitingInFlight.current = false;
        setWaitingBusy(false);
      }
    }
  }
  const contextJson = structuredContext(run?.context ?? null);
  const validSnapshot = run && validateWorkflowDefinition(run.definition_snapshot).valid;
  const drift = validSnapshot && item?.workflow.id === run?.workflow_record_id && item?.definition && canonicalWorkflowJson(run.definition_snapshot) !== canonicalWorkflowJson(item.definition);
  return <Drawer open onClose={onClose} label={run?.name ?? "Workflow run"} className={`${fullPage ? "inset-2 w-auto" : "w-[min(620px,calc(100%-16px))]"} p-5`}>
    <header className="flex items-start gap-3"><h2 className="min-w-0 flex-1 text-[clamp(1.25rem,2vw,1.5rem)] font-semibold">{run?.name ?? "Workflow run"}</h2><Control size="icon" variant="quiet" aria-label={fullPage ? "Exit full-page run" : "Open full-page run"} onClick={() => setFullPage((value) => !value)}>{fullPage ? <Minimize2 aria-hidden className="h-4 w-4" /> : <Maximize2 aria-hidden className="h-4 w-4" />}</Control><Control size="sm" variant="quiet" onClick={onClose}>Close</Control></header>
    {query.isLoading ? <Skeleton lines={8} /> : query.error ? <p role="alert" className="mt-4 text-[var(--danger)]">Could not load this run. <Control onClick={() => void query.refetch()}>Retry</Control></p> : run ? <div className="mt-4 space-y-5">
      <div className="flex flex-wrap gap-2"><Pill variant={runResultVariant(run.status)}>{run.status || "Unknown"}</Pill><span className="text-[length:var(--t-meta)] text-[var(--text-muted)]">{run.actor || run.owner_role || "Unassigned"}{run.trigger_source ? ` · ${run.trigger_source}` : ""}</span></div>
      {fullPage ? <section aria-label="Run timeline" className="border-y border-[var(--border)] py-3">{eventsQuery.isLoading ? <p className="text-[length:var(--t-meta)] text-[var(--text-muted)]">Loading durable receipts…</p> : eventsQuery.error ? <p role="alert" className="text-[length:var(--t-meta)] text-[var(--danger)]">Could not load run receipts. <Control size="sm" onClick={() => void eventsQuery.refetch()}>Retry</Control></p> : <WorkflowRunPulse key={runId} events={eventsQuery.data ?? []} pendingQuestion={Boolean(approvalQuestion)} />}</section> : null}
      {fullPage && approvalQuestion ? <WorkflowApprovalCard question={approvalQuestion} meanwhile={meanwhileRunSummary(run)} busy={approvalBusy} error={approvalError} onAnswer={(decision, summary) => void answerApproval(decision, summary)} /> : null}
      {approvalNotice ? <p role="status" className="text-[length:var(--t-meta)] text-[var(--warning)]">{approvalNotice}</p> : null}
      {canStartWaitingWork ? <Control className="self-start" size="sm" disabled={waitingBusy} onClick={() => void startWaitingWork()}>{waitingBusy ? "Starting waiting work…" : "Start waiting work"}</Control> : null}
      {waitingError ? <p role="alert" className="text-[length:var(--t-meta)] text-[var(--danger)]">{waitingError}</p> : null}
      <Link to={`/databases/${GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns}?record=${encodeURIComponent(run.id)}`} className="inline-flex text-[length:var(--t-meta)] text-[var(--accent-text)] hover:underline">{run.status?.toLowerCase() === "needs approval" ? "Review approval in run record" : "Open run record"}</Link>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[length:var(--t-meta)]"><dt className="text-[var(--text-muted)]">Started</dt><dd>{run.started_at ? new Date(run.started_at).toLocaleString() : "Not recorded"}</dd><dt className="text-[var(--text-muted)]">Took</dt><dd>{runDuration(run)}</dd><dt className="text-[var(--text-muted)]">Current step</dt><dd className="break-words">{displayedCurrentStep}</dd></dl>
      {drift ? <p className="text-[length:var(--t-meta)] text-[var(--warning)]">The Registry definition changed after this run started. This run retains its original definition snapshot.</p> : null}
      {contextJson !== null ? <details><summary className="text-[length:var(--t-meta)]">Run context</summary><pre className="mt-2 whitespace-pre-wrap break-words text-[length:var(--t-count)]">{contextJson}</pre></details> : run.context ? <section><h3 className="mb-2 font-medium">Context</h3><MarkdownBody content={run.context} /></section> : null}
      {run.receipt ? <section><h3 className="mb-2 font-medium">Receipts</h3><MarkdownBody content={run.receipt} /></section> : null}
      <section><h3 className="mb-2 font-medium">Run record</h3><MarkdownBody content={query.data?.body || "No additional run notes recorded."} /></section>
      {run.approvals ? <details><summary className="text-[length:var(--t-meta)]">Recorded approval details</summary><pre className="mt-2 whitespace-pre-wrap break-words text-[length:var(--t-count)]">{JSON.stringify(run.approvals, null, 2)}</pre></details> : null}
      {validSnapshot ? <details><summary className="text-[length:var(--t-meta)]">Definition used for this run</summary><pre className="mt-2 whitespace-pre-wrap break-words text-[length:var(--t-count)]">{JSON.stringify(run.definition_snapshot, null, 2)}</pre></details> : null}
    </div> : null}
  </Drawer>;
}
