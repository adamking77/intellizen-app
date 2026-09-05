import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Drawer } from "@/components/ui/drawer";
import { Control } from "@/components/ui/control";
import { MarkdownBody } from "@/components/ui/markdown-body";
import { Pill } from "@/components/ui/status-pill";
import { Skeleton } from "@/components/ui/skeleton";
import { GENZEN_WORKSPACE_DATABASE_IDS, getWorkspaceRecord, toWorkflowRunItem } from "@/lib/data";
import type { WorkflowCatalogItem } from "@/lib/workflow-catalog";
import { canonicalWorkflowJson, validateWorkflowDefinition } from "@/lib/workflow-schema";
import { runResultVariant } from "./workflow-presentation";
import { runDuration } from "./workflow-detail";

function structuredContext(context: string | null) {
  if (!context) return null;
  try { return JSON.stringify(JSON.parse(context), null, 2); }
  catch { return null; }
}

export function WorkflowRunDrawer({ runId, item, onClose }: { runId: string; item: WorkflowCatalogItem | null; onClose: () => void }) {
  const query = useQuery({ queryKey: ["workflow-run-detail", runId], queryFn: async () => {
    const record = await getWorkspaceRecord(runId);
    if (record.database_id !== GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns) throw new Error("This record is not a workflow run.");
    return record;
  }, refetchInterval: 15_000 });
  const run = query.data ? toWorkflowRunItem(query.data) : null;
  const contextJson = structuredContext(run?.context ?? null);
  const validSnapshot = run && validateWorkflowDefinition(run.definition_snapshot).valid;
  const drift = validSnapshot && item?.workflow.id === run?.workflow_record_id && item?.definition && canonicalWorkflowJson(run.definition_snapshot) !== canonicalWorkflowJson(item.definition);
  return <Drawer open onClose={onClose} label={run?.name ?? "Workflow run"} className="w-[min(620px,calc(100%-16px))] p-5">
    <header className="flex items-start gap-3"><h2 className="min-w-0 flex-1 text-[var(--t-title)] font-semibold">{run?.name ?? "Workflow run"}</h2><Control size="sm" variant="quiet" onClick={onClose}>Close</Control></header>
    {query.isLoading ? <Skeleton lines={8} /> : query.error ? <p role="alert" className="mt-4 text-[var(--danger)]">Could not load this run. <Control onClick={() => void query.refetch()}>Retry</Control></p> : run ? <div className="mt-4 space-y-5">
      <div className="flex flex-wrap gap-2"><Pill variant={runResultVariant(run.status)}>{run.status || "Unknown"}</Pill><span className="text-[var(--t-meta)] text-[var(--text-muted)]">{run.actor || run.owner_role || "Unassigned"}{run.trigger_source ? ` · ${run.trigger_source}` : ""}</span></div>
      <Link to={`/databases/${GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns}?record=${encodeURIComponent(run.id)}`} className="inline-flex text-[var(--t-meta)] text-[var(--accent-text)] hover:underline">{run.status?.toLowerCase() === "needs approval" ? "Review approval in run record" : "Open run record"}</Link>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[var(--t-meta)]"><dt className="text-[var(--text-muted)]">Started</dt><dd>{run.started_at ? new Date(run.started_at).toLocaleString() : "Not recorded"}</dd><dt className="text-[var(--text-muted)]">Took</dt><dd>{runDuration(run)}</dd><dt className="text-[var(--text-muted)]">Current step</dt><dd className="break-words">{run.current_step || "Not recorded"}</dd></dl>
      {drift ? <p className="text-[var(--t-meta)] text-[var(--warning)]">The Registry definition changed after this run started. This run retains its original definition snapshot.</p> : null}
      {contextJson !== null ? <details><summary className="text-[var(--t-meta)]">Run context</summary><pre className="mt-2 whitespace-pre-wrap break-words text-[var(--t-count)]">{contextJson}</pre></details> : run.context ? <section><h3 className="mb-2 font-medium">Context</h3><MarkdownBody content={run.context} /></section> : null}
      {run.receipt ? <section><h3 className="mb-2 font-medium">Receipts</h3><MarkdownBody content={run.receipt} /></section> : null}
      <section><h3 className="mb-2 font-medium">Run record</h3><MarkdownBody content={query.data?.body || "No additional run notes recorded."} /></section>
      {run.approvals ? <details><summary className="text-[var(--t-meta)]">Recorded approval details</summary><pre className="mt-2 whitespace-pre-wrap break-words text-[var(--t-count)]">{JSON.stringify(run.approvals, null, 2)}</pre></details> : null}
      {validSnapshot ? <details><summary className="text-[var(--t-meta)]">Definition used for this run</summary><pre className="mt-2 whitespace-pre-wrap break-words text-[var(--t-count)]">{JSON.stringify(run.definition_snapshot, null, 2)}</pre></details> : null}
    </div> : null}
  </Drawer>;
}
