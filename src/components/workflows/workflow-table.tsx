import { Control } from "@/components/ui/control";
import { Identity } from "@/components/ui/identity";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/ui/status-pill";
import { formatElapsed } from "@/lib/format-elapsed";
import type { WorkflowCatalogItem } from "@/lib/workflow-catalog";
import type { WorkflowRunItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export function workflowStateVariant(state: WorkflowCatalogItem["state"]): "verified" | "neutral" | "waiting" | "failure" | "runtime" {
  if (state === "runnable") return "verified";
  if (state === "blocked") return "failure";
  if (state === "draft" || state === "needs-review") return "waiting";
  return "runtime";
}

export function workflowStateLabel(state: WorkflowCatalogItem["state"]) {
  if (state === "sop-only") return "SOP only";
  if (state === "needs-review") return "Needs review";
  return state[0].toUpperCase() + state.slice(1);
}

function runVariant(status?: string | null): "verified" | "neutral" | "waiting" | "failure" {
  const value = status?.toLowerCase() ?? "";
  if (value.includes("complete") || value.includes("success")) return "verified";
  if (value.includes("approval") || value.includes("progress")) return "waiting";
  if (value.includes("fail") || value.includes("block") || value.includes("abandon")) return "failure";
  return "neutral";
}

export function WorkflowTable({
  items,
  runs,
  selectedId,
  search,
  running,
  onSearch,
  onSelect,
  onRun,
  onFinish,
  onMakeRunnable,
}: {
  items: WorkflowCatalogItem[];
  runs: WorkflowRunItem[];
  selectedId: string | null;
  search: string;
  running: boolean;
  onSearch: (value: string) => void;
  onSelect: (item: WorkflowCatalogItem) => void;
  onRun: (item: WorkflowCatalogItem) => void;
  onFinish: (item: WorkflowCatalogItem) => void;
  onMakeRunnable: (item: WorkflowCatalogItem) => void;
}) {
  const filtered = items.filter(({ workflow }) => [workflow.name, workflow.workflow_id, workflow.owner_role, workflow.default_actor]
    .some((value) => value?.toLowerCase().includes(search.trim().toLowerCase())));
  const latest = (workflowId: string) => runs
    .filter((run) => run.workflow_record_id === workflowId)
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))[0];

  return (
    <section className="min-h-0 overflow-hidden rounded-[var(--r-plane)] bg-[var(--mantle)]">
      <div className="flex min-h-[var(--h-line)] items-center gap-3 px-3 py-2">
        <Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search workflows" aria-label="Search workflows" className="max-w-72" />
        <span className="ml-auto font-mono text-[var(--t-count)] text-[var(--text-muted)]">{filtered.length} workflows</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left font-ui text-[var(--t-meta)]">
          <thead className="text-[var(--t-count)] uppercase tracking-[0.12em] text-[var(--text-muted)]">
            <tr className="h-[var(--h-row)]">
              <th className="px-3 font-normal">Workflow</th><th className="px-3 font-normal">Runs as</th><th className="px-3 font-normal">Last ran</th><th className="px-3 font-normal">Result</th><th className="px-3 font-normal">Next</th><th className="px-3"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const last = latest(item.workflow.id);
              const actor = item.workflow.default_actor || item.workflow.owner_role || "Unassigned";
              return (
                <tr
                  key={item.workflow.id}
                  onClick={() => onSelect(item)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onSelect(item);
                  }}
                  tabIndex={0}
                  aria-selected={selectedId === item.workflow.id}
                  className={cn("h-[var(--h-line)] cursor-pointer focus-visible:bg-[var(--hover)]", selectedId === item.workflow.id ? "bg-[var(--selected)]" : "hover:bg-[var(--hover)]")}
                >
                  <td className="px-3"><div className="font-medium text-[var(--text)]">{item.workflow.name}</div><div className="font-mono text-[11px] text-[var(--text-muted)]">{item.workflow.workflow_id}</div></td>
                  <td className="px-3"><Identity name={actor} runtime={item.workflow.owner_role ?? undefined} kind="hermes" /></td>
                  <td className="whitespace-nowrap px-3 text-[var(--text-muted)]">{last?.started_at ? formatElapsed(last.started_at) : "Never"}</td>
                  <td className="px-3"><Pill variant={last ? runVariant(last.status) : workflowStateVariant(item.state)}>{last?.status || workflowStateLabel(item.state)}</Pill></td>
                  <td className="max-w-56 truncate px-3 text-[var(--text-muted)]">{last?.current_step || "—"}</td>
                  <td className="px-3 text-right" onClick={(event) => event.stopPropagation()}>
                    {item.state === "sop-only" ? <Control size="sm" variant="quiet" onClick={() => onMakeRunnable(item)}>Make runnable</Control>
                      : item.state === "draft" || item.state === "needs-review" ? <Control size="sm" onClick={() => onFinish(item)}>Finish</Control>
                        : <Control size="sm" variant="primary" loading={running} disabled={!item.runnable} onClick={() => onRun(item)}>{item.runnable ? "Run" : "Blocked"}</Control>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!filtered.length ? <p className="px-3 py-5 text-[var(--t-meta)] text-[var(--text-muted)]">No workflows match this search.</p> : null}
    </section>
  );
}
