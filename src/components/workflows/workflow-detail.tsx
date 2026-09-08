import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Identity } from "@/components/ui/identity";
import { MarkdownBody } from "@/components/ui/markdown-body";
import { Pill } from "@/components/ui/status-pill";
import { Control } from "@/components/ui/control";
import { Skeleton } from "@/components/ui/skeleton";
import { getWorkflowSource } from "@/lib/workflow-source";
import type { WorkflowCatalogItem } from "@/lib/workflow-catalog";
import type { WorkflowRunItem } from "@/lib/types";
import { runResultVariant } from "./workflow-presentation";

export function RunsTable({ runs, onOpenRun }: { runs: WorkflowRunItem[]; onOpenRun: (run: WorkflowRunItem) => void }) {
  if (!runs.length) return <p className="py-3 text-[length:var(--t-meta)] text-[var(--text-muted)]">No workflow runs yet. Started runs and their receipts appear in this list.</p>;
  return <div className="overflow-auto"><table className="w-full min-w-[650px] table-fixed text-left text-[length:var(--t-meta)]">
    <colgroup><col className="w-[22%]" /><col className="w-[28%]" /><col className="w-[22%]" /><col className="w-[28%]" /></colgroup>
    <thead className="text-[length:var(--t-count)] uppercase tracking-[0.12em] text-[var(--text-muted)]"><tr className="h-[var(--h-row)]"><th className="font-normal">Started</th><th className="font-normal">By</th><th className="font-normal">Result</th><th className="font-normal">Receipts</th></tr></thead>
    <tbody>{runs.map((run) => <tr key={run.id} className="h-[var(--h-line)]"><td className="pr-3 text-[var(--text-muted)]">{run.started_at ? new Date(run.started_at).toLocaleString() : "—"}</td><td className="pr-3"><Identity name={run.actor || run.owner_role || "Unassigned"} /><span className="ml-1 text-[length:var(--t-count)] text-[var(--text-muted)]">{run.trigger_source}</span></td><td className="pr-3"><Pill variant={runResultVariant(run.status)}>{run.status || "Unknown"}</Pill></td><td className="pr-3"><Control size="sm" variant="quiet" onClick={() => onOpenRun(run)} aria-label={`Open run ${run.name}${run.started_at ? ` from ${run.started_at}` : ""}`}>{run.receipt ? "Read receipts" : "Open run"}</Control></td></tr>)}</tbody>
  </table></div>;
}

export function WorkflowSource({ item }: { item: WorkflowCatalogItem }) {
  const workflow = item.workflow;
  const source = useQuery({ queryKey: ["workflow-source", workflow.id, workflow.updated_at], queryFn: () => getWorkflowSource(workflow) });
  return <div className="max-w-[65ch]">
    <p className="mb-3 text-[length:var(--t-meta)] text-[var(--text-muted)]">Owner role · {workflow.owner_role || "Unassigned"}</p>
    {source.isLoading ? <Skeleton lines={6} /> : source.error ? <p role="alert" className="text-[var(--danger)]">Could not load the full source. <Control onClick={() => void source.refetch()}>Retry</Control></p> : source.data ? <>
      {source.data.warning ? <p role="status" className="mb-3 text-[var(--warning)]">{source.data.warning}</p> : null}
      {source.data.sourcePath ? <p className="mb-3 break-all text-[length:var(--t-count)] text-[var(--text-muted)]">{source.data.sourcePath}</p> : null}
      <MarkdownBody content={source.data.content || "No SOP text has been recorded."} vaultPath={source.data.sourcePath} />
      <Link className="mt-4 inline-flex text-[length:var(--t-meta)] text-[var(--accent-text)] hover:underline" to={source.data.recordHref}>Open source record</Link>
    </> : null}
  </div>;
}
