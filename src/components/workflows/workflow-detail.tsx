import { Link } from "react-router-dom";

import { Control } from "@/components/ui/control";
import { Identity } from "@/components/ui/identity";
import { MarkdownBody } from "@/components/ui/markdown-body";
import { Receipt } from "@/components/ui/receipt";
import { Segmented } from "@/components/ui/segmented";
import { Pill } from "@/components/ui/status-pill";
import { WorkflowTopology } from "@/components/workflows/workflow-topology";
import { GENZEN_WORKSPACE_DATABASE_IDS } from "@/lib/data";
import { formatElapsed } from "@/lib/format-elapsed";
import { buildWorkflowTopology } from "@/lib/workflow-topology";
import type { WorkflowCatalogItem } from "@/lib/workflow-catalog";
import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import type { WorkflowRunItem } from "@/lib/types";

export type WorkflowView = "runs" | "steps" | "graph" | "schedule" | "source";

const VIEWS = [
  { value: "runs" as const, label: "Runs" },
  { value: "steps" as const, label: "Steps" },
  { value: "graph" as const, label: "Graph" },
  { value: "schedule" as const, label: "Schedule" },
  { value: "source" as const, label: "Source" },
];

export function WorkflowDetail({ item, runs, roles, view, onView, onDesign, onSchedule }: {
  item: WorkflowCatalogItem;
  runs: WorkflowRunItem[];
  roles: AgentPanelRoleTarget[];
  view: WorkflowView;
  onView: (view: WorkflowView) => void;
  onDesign: () => void;
  onSchedule: () => void;
}) {
  const workflow = item.workflow;
  const workflowRuns = runs.filter((run) => run.workflow_record_id === workflow.id);
  const topology = item.definition ? buildWorkflowTopology({ definition: item.definition, roleTargets: roles, mode: "definition", run: null }) : null;

  return (
    <section className="min-h-0 rounded-[var(--r-plane)] bg-[var(--mantle)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1"><h2 className="truncate text-[var(--t-title)] font-semibold text-[var(--text)]">{workflow.name}</h2><p className="font-mono text-[11px] text-[var(--text-muted)]">{workflow.workflow_id}</p></div>
        <Segmented value={view} options={VIEWS} onValueChange={onView} label="Workflow view" />
      </div>
      <div className="mt-4 min-h-56">
        {view === "runs" ? <RunsTable runs={workflowRuns} /> : null}
        {view === "steps" ? <div><p className="mb-3 text-[var(--t-meta)] text-[var(--text-muted)]">Edit the saved definition as a vertical sequence of typed steps.</p><Control onClick={onDesign}>{item.definition ? "Edit steps" : "Finish definition"}</Control></div> : null}
        {view === "graph" ? topology ? <div className="h-[420px] overflow-hidden rounded-[var(--r-ctl)] bg-[var(--base)]"><WorkflowTopology topology={topology} compact /></div> : <p className="text-[var(--t-meta)] text-[var(--text-muted)]">A valid definition will appear here as a graph.</p> : null}
        {view === "schedule" ? <div><p className="mb-3 text-[var(--t-meta)] text-[var(--text-muted)]">Create, pause, resume, run, or remove this workflow’s Hermes schedules.</p><Control onClick={onSchedule} disabled={!item.definition}>Manage schedule</Control></div> : null}
        {view === "source" ? <Source item={item} /> : null}
      </div>
    </section>
  );
}

function RunsTable({ runs }: { runs: WorkflowRunItem[] }) {
  if (!runs.length) return <p className="text-[var(--t-meta)] text-[var(--text-muted)]">Runs and their receipts will appear here.</p>;
  return (
    <div className="overflow-x-auto"><table className="w-full text-left text-[var(--t-meta)]"><thead className="text-[var(--t-count)] uppercase tracking-[0.12em] text-[var(--text-muted)]"><tr className="h-[var(--h-row)]"><th className="font-normal">Run</th><th className="font-normal">Actor</th><th className="font-normal">Started</th><th className="font-normal">Result</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id} className="h-[var(--h-line)]"><td><div className="text-[var(--text)]">{run.name}</div>{run.receipt ? <Receipt verb="wrote" object={run.receipt} /> : null}</td><td><Identity name={run.actor || run.owner_role || "Unassigned"} kind="hermes" /></td><td className="text-[var(--text-muted)]">{run.started_at ? formatElapsed(run.started_at) : "—"}</td><td><Pill variant={run.completed_at ? "verified" : run.status?.toLowerCase().includes("approval") ? "waiting" : "neutral"}>{run.status || "Unknown"}</Pill></td></tr>)}</tbody></table></div>
  );
}

function Source({ item }: { item: WorkflowCatalogItem }) {
  const workflow = item.workflow;
  return (
    <div className="max-w-[65ch]">
      <p className="mb-2 text-[var(--t-meta)] text-[var(--text-muted)]">Owned by {workflow.owner_role || "—"} · {workflow.source_path || "No source path"}</p>
      <MarkdownBody content={workflow.body_preview || "No SOP text has been recorded."} />
      <Link className="mt-4 inline-flex text-[var(--t-meta)] text-[var(--accent)] hover:underline" to={`/databases/${GENZEN_WORKSPACE_DATABASE_IDS.workflowRegistry}`}>Open canonical record</Link>
    </div>
  );
}
