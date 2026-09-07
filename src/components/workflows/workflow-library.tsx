import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { Control } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import type { WorkflowCatalogItem } from "@/lib/workflow-catalog";
import { usePreference } from "@/lib/settings-preferences";

type Filter = "all" | "runnable" | "draft" | "attention";
const filters = [{ value: "all" as const, label: "All" }, { value: "runnable" as const, label: "Ready" }, { value: "draft" as const, label: "Drafts" }, { value: "attention" as const, label: "Needs attention" }];

export function WorkflowLibrary({ items, onOpen, onCreate, onDraftWithAgent }: {
  items: WorkflowCatalogItem[];
  onOpen: (item: WorkflowCatalogItem) => void;
  onCreate: () => void;
  onDraftWithAgent: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [storedView, setStoredView] = usePreference("intelizen:workflow-library-view", "cards");
  const view = storedView === "list" ? "list" : "cards";
  const setView = setStoredView;
  const visible = useMemo(() => items.filter((item) => {
    if (filter === "attention" && !["blocked", "needs-review"].includes(item.state)) return false;
    if (filter !== "all" && filter !== "attention" && item.state !== filter) return false;
    return `${item.workflow.name} ${item.workflow.expected_output ?? ""} ${item.workflow.owner_role?.replaceAll("_", " ") ?? ""} ${item.definition?.steps.map((step) => step.title).join(" ") ?? ""}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [items, filter, search]);
  return <section aria-label="Workflow library" className="min-w-0">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <Segmented value={filter} options={filters} onValueChange={setFilter} label="Filter workflows" kind="choice" />
      <label className="relative w-full sm:w-64"><Search aria-hidden size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a workflow…" aria-label="Find a workflow" className="pl-8" /></label>
    </div>
    {visible.length ? <div className={view === "cards" ? "grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-3" : "divide-y divide-[var(--row-line)]"}>
      {visible.map((item) => {
        const definition = item.definition;
        const roleCount = new Set(definition?.steps.flatMap((step) => step.kind === "role-assign" ? [step.role] : [])).size;
        const state = !item.workflow.id ? "Local draft" : item.state === "runnable" ? "Ready" : item.state === "draft" ? "Draft" : item.state === "sop-only" ? "Written procedure" : "Needs attention";
        const owner = item.workflow.owner_role?.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "No owner role";
        return <button key={item.workflow.id || item.workflow.workflow_id} type="button" onClick={() => onOpen(item)} aria-label={`Edit ${item.workflow.name}`} className={view === "cards" ? "flex min-w-0 flex-col rounded-[var(--r-surface)] bg-[var(--surface)] p-4 text-left transition-colors hover:bg-[var(--hover)]" : "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-[var(--hover)]"}>
          <h2 className="text-[length:var(--t-body)] font-medium leading-snug text-[var(--text)]">{item.workflow.name}</h2>
          <p className={`${view === "cards" ? "mt-2 line-clamp-2" : "col-span-1 line-clamp-1"} text-[length:var(--t-meta)] leading-relaxed text-[var(--text-muted)]`}>{item.workflow.expected_output || "Review the definition to finish this workflow."}</p>
          <p aria-label="Workflow steps" className={`${view === "cards" ? "mt-2" : "col-span-1"} font-mono text-[length:var(--t-count)] text-[var(--text-dim)]`}>{definition ? `${definition.steps.length} ${definition.steps.length === 1 ? "step" : "steps"} · ${roleCount} ${roleCount === 1 ? "role" : "roles"}` : "Definition needs review"}</p>
          <div className={`${view === "cards" ? "mt-auto pt-4" : "row-span-2 col-start-2 row-start-1 self-center"} flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[length:var(--t-meta)]`}><span className="text-[var(--text-muted)]">{owner}</span><span className={"text-[var(--text-muted)]"}>{state}</span></div>
          {item.blockers[0] ? <p className={`${view === "cards" ? "mt-2" : "col-span-2"} text-[length:var(--t-meta)] leading-relaxed text-[var(--text-muted)]`}>{item.blockers[0].message}{item.blockers.length > 1 ? ` (${item.blockers.length - 1} more ${item.blockers.length === 2 ? "issue" : "issues"})` : ""}</p> : null}
        </button>;
      })}
    </div> : <EmptyState title={items.length ? "No matching workflows" : "No workflows yet"} description={items.length ? "Try another name or filter." : "Create a workflow, add its steps, then save or activate it. You can also draft it with an agent."} action={items.length ? undefined : { label: "New workflow", onClick: onCreate }} />}
    {items.length && !visible.length ? <Control variant="quiet" onClick={() => { setSearch(""); setFilter("all"); }}>Clear filters</Control> : null}
    <footer className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2" aria-label="Workflow library controls">
      <Segmented value={view} options={[{ value: "cards", label: "Cards" }, { value: "list", label: "List" }]} onValueChange={setView} label="Workflow library view" />
      <div className="ml-auto flex max-w-full flex-wrap justify-end gap-1"><Control size="sm" onClick={onDraftWithAgent}>Draft with an agent</Control><Control size="sm" onClick={onCreate}><Plus aria-hidden className="h-3.5 w-3.5" />New workflow</Control></div>
    </footer>
  </section>;
}
