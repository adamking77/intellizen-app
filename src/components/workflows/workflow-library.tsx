import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Control } from "@/components/ui/control";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import type { WorkflowCatalogItem } from "@/lib/workflow-catalog";

type Filter = "all" | "runnable" | "draft" | "attention";
const filters = [{ value: "all" as const, label: "All" }, { value: "runnable" as const, label: "Ready" }, { value: "draft" as const, label: "Drafts" }, { value: "attention" as const, label: "Needs attention" }];

export function WorkflowLibrary({ items, onOpen, onCreate }: {
  items: WorkflowCatalogItem[];
  onOpen: (item: WorkflowCatalogItem) => void;
  onCreate: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
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
    {visible.length ? <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-3">
      {visible.map((item) => {
        const definition = item.definition;
        const roleCount = new Set(definition?.steps.flatMap((step) => step.kind === "role-assign" ? [step.role] : [])).size;
        const state = !item.workflow.id ? "Local draft" : item.state === "runnable" ? "Ready" : item.state === "draft" ? "Draft" : item.state === "sop-only" ? "Written procedure" : "Needs attention";
        const owner = item.workflow.owner_role?.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "No owner role";
        return <button key={item.workflow.id || item.workflow.workflow_id} type="button" onClick={() => onOpen(item)} aria-label={`Edit ${item.workflow.name}`} className="flex min-w-0 flex-col rounded-[var(--r-ctl)] bg-[var(--mantle)] p-4 text-left transition-colors hover:bg-[var(--hover)]">
          <h2 className="text-[var(--t-body)] font-medium leading-snug text-[var(--text)]">{item.workflow.name}</h2>
          <p className="mt-2 line-clamp-2 text-[var(--t-meta)] leading-relaxed text-[var(--text-muted)]">{item.workflow.expected_output || (definition ? `${definition.steps.length} ${definition.steps.length === 1 ? "step" : "steps"} · ${roleCount} ${roleCount === 1 ? "agent role" : "agent roles"}` : "Review the definition to finish this workflow.")}</p>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-4 text-[var(--t-meta)]"><span className="text-[var(--text-muted)]">{owner}</span><span className={item.blockers.length ? "text-[var(--warning)]" : "text-[var(--text-muted)]"}>{state}</span></div>
          {item.blockers[0] ? <p className="mt-2 text-[var(--t-meta)] leading-relaxed text-[var(--warning)]">{item.blockers[0].message}{item.blockers.length > 1 ? ` (${item.blockers.length - 1} more ${item.blockers.length === 2 ? "issue" : "issues"})` : ""}</p> : null}
        </button>;
      })}
    </div> : <EmptyState title={items.length ? "No matching workflows" : "Build your first workflow"} description={items.length ? "Try another name or filter." : "Start with a visual draft, then shape the steps yourself or with an agent."} action={items.length ? undefined : { label: "New workflow", onClick: onCreate }} />}
    {items.length && !visible.length ? <Control variant="quiet" onClick={() => { setSearch(""); setFilter("all"); }}>Clear filters</Control> : null}
  </section>;
}
