import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { listAgentProjects, listAgentWork, listWorkflows } from "@/lib/data";
import type { AgentProjectItem, AgentWorkItem, WorkflowTemplateItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";

interface RoleSummary {
  name: string;
  currentActors: string[];
  backupActors: string[];
  functionalLanes: string[];
  workflows: WorkflowTemplateItem[];
  workItems: AgentWorkItem[];
  projects: AgentProjectItem[];
  approvalPolicies: string[];
  sourceContexts: string[];
}

function addToSet(set: Set<string>, value: string | null | undefined) {
  const trimmed = value?.trim();
  if (trimmed && trimmed !== "none") set.add(trimmed);
}

function textArray(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function roleKey(value: string | null | undefined) {
  return value?.trim() || null;
}

function formatElapsed(iso: string | null | undefined) {
  if (!iso) return "unknown";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function firstLines(values: string[], limit = 3) {
  return values
    .flatMap((value) => value.split("\n"))
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function buildRoleSummaries(
  workflows: WorkflowTemplateItem[],
  workItems: AgentWorkItem[],
  projects: AgentProjectItem[],
) {
  const roleMap = new Map<string, {
    currentActors: Set<string>;
    backupActors: Set<string>;
    functionalLanes: Set<string>;
    workflows: WorkflowTemplateItem[];
    workItems: AgentWorkItem[];
    projects: AgentProjectItem[];
    approvalPolicies: Set<string>;
    sourceContexts: Set<string>;
  }>();

  function ensure(name: string) {
    const existing = roleMap.get(name);
    if (existing) return existing;
    const created = {
      currentActors: new Set<string>(),
      backupActors: new Set<string>(),
      functionalLanes: new Set<string>(),
      workflows: [] as WorkflowTemplateItem[],
      workItems: [] as AgentWorkItem[],
      projects: [] as AgentProjectItem[],
      approvalPolicies: new Set<string>(),
      sourceContexts: new Set<string>(),
    };
    roleMap.set(name, created);
    return created;
  }

  for (const workflow of workflows) {
    const role = roleKey(workflow.owner_role);
    if (!role) continue;
    const summary = ensure(role);
    summary.workflows.push(workflow);
    addToSet(summary.currentActors, workflow.default_actor);
    addToSet(summary.approvalPolicies, workflow.approval_gates);
    addToSet(summary.sourceContexts, workflow.source_path);
    for (const related of workflow.related_databases) addToSet(summary.sourceContexts, related);
  }

  for (const work of workItems) {
    const role = roleKey(work.durable_role);
    if (!role) continue;
    const summary = ensure(role);
    summary.workItems.push(work);
    addToSet(summary.currentActors, work.current_actor);
    for (const assignee of textArray(work.assignee)) addToSet(summary.currentActors, assignee);
    addToSet(summary.backupActors, work.backup_actor);
    addToSet(summary.functionalLanes, work.functional_lane);
    addToSet(summary.approvalPolicies, work.approval_needed);
    addToSet(summary.sourceContexts, work.initiative_name);
  }

  for (const project of projects) {
    for (const summary of roleMap.values()) {
      if (
        summary.currentActors.has(project.agent_owner ?? "") ||
        project.assignee.some((actor) => summary.currentActors.has(actor))
      ) {
        summary.projects.push(project);
      }
    }
  }

  return Array.from(roleMap.entries())
    .map(([name, summary]): RoleSummary => ({
      name,
      currentActors: Array.from(summary.currentActors).sort(),
      backupActors: Array.from(summary.backupActors).sort(),
      functionalLanes: Array.from(summary.functionalLanes).sort(),
      workflows: summary.workflows,
      workItems: summary.workItems,
      projects: summary.projects,
      approvalPolicies: Array.from(summary.approvalPolicies).sort(),
      sourceContexts: Array.from(summary.sourceContexts).sort(),
    }))
    .sort((left, right) => right.workflows.length + right.workItems.length - (left.workflows.length + left.workItems.length));
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-2">
      <div className="font-mono text-[20px] leading-none text-[var(--text)]">{value}</div>
      <div className="mt-1 font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">{label}</div>
    </div>
  );
}

function InfoCell({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-2">
      <div className="font-ui text-[10px] font-semibold uppercase text-[var(--overlay-1)]">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {values.length > 0 ? (
          values.map((value) => <Badge key={value} variant="outline">{value}</Badge>)
        ) : (
          <span className="font-ui text-[12px] text-[var(--overlay-1)]">Not recorded</span>
        )}
      </div>
    </div>
  );
}

function RoleCard({ role, selected, onSelect }: { role: RoleSummary; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-md border px-3 py-3 text-left transition-colors",
        selected
          ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-[var(--mantle)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-wash)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 font-ui text-[13px] font-semibold leading-snug text-[var(--text)]">{role.name}</p>
          <p className="mt-1 font-ui text-[11px] text-[var(--overlay-1)]">
            {role.workflows.length} workflows · {role.workItems.length} work items
          </p>
        </div>
        <Badge variant={role.approvalPolicies.length ? "warning" : "secondary"} className="shrink-0">
          {role.approvalPolicies.length ? "Gated" : "Open"}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(role.currentActors.length ? role.currentActors : ["No actor"]).slice(0, 3).map((actor) => (
          <Badge key={actor} variant="outline">{actor}</Badge>
        ))}
      </div>
    </button>
  );
}

export function RolesView() {
  const entityFilter = useAppStore((state) => state.entityFilter);
  const [search, setSearch] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);

  const workflowsQuery = useQuery({
    queryKey: ["roles-screen", "workflows", entityFilter],
    queryFn: () => listWorkflows({ entity: entityFilter, includeInactive: true, limit: 100 }),
    refetchInterval: 60_000,
  });
  const workQuery = useQuery({
    queryKey: ["roles-screen", "work", entityFilter],
    queryFn: () => listAgentWork({ entity: entityFilter, includeDone: false, limit: 120 }),
    refetchInterval: 60_000,
  });
  const projectsQuery = useQuery({
    queryKey: ["roles-screen", "projects", entityFilter],
    queryFn: () => listAgentProjects({ entity: entityFilter, includeDone: false, limit: 60 }),
    refetchInterval: 60_000,
  });

  const workflows = workflowsQuery.data ?? [];
  const workItems = workQuery.data ?? [];
  const projects = projectsQuery.data ?? [];
  const roles = useMemo(() => buildRoleSummaries(workflows, workItems, projects), [projects, workItems, workflows]);

  const filteredRoles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return roles;
    return roles.filter((role) =>
      [
        role.name,
        ...role.currentActors,
        ...role.backupActors,
        ...role.functionalLanes,
        ...role.sourceContexts,
      ].some((value) => value.toLowerCase().includes(query)),
    );
  }, [roles, search]);

  useEffect(() => {
    if (filteredRoles.length === 0) {
      setSelectedName(null);
      return;
    }
    if (!selectedName || !filteredRoles.some((role) => role.name === selectedName)) {
      setSelectedName(filteredRoles[0].name);
    }
  }, [filteredRoles, selectedName]);

  const selected = filteredRoles.find((role) => role.name === selectedName) ?? filteredRoles[0] ?? null;
  const isLoading = workflowsQuery.isLoading || workQuery.isLoading || projectsQuery.isLoading;
  const error = workflowsQuery.error ?? workQuery.error ?? projectsQuery.error;

  if (error) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
        <div className="border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
          <span className="text-label">Roles unavailable</span>
          <p className="mt-2 font-ui text-[13px] text-[var(--danger)]">
            {error instanceof Error ? error.message : "Roles could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--base)]">
      <div className="flex shrink-0 items-end justify-between gap-6 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4">
        <div>
          <span className="text-label">Roles</span>
          <p className="mt-1 font-ui text-[12px] text-[var(--overlay-1)]">
            derived from Workflow Registry and workspace receipts
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            void workflowsQuery.refetch();
            void workQuery.refetch();
            void projectsQuery.refetch();
          }}
          disabled={workflowsQuery.isFetching || workQuery.isFetching || projectsQuery.isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", (workflowsQuery.isFetching || workQuery.isFetching || projectsQuery.isFetching) && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-[var(--border)] bg-[var(--base)] px-6 py-4 lg:grid-cols-4">
        <Metric label="Roles" value={roles.length} />
        <Metric label="Workflows" value={workflows.length} />
        <Metric label="Routed work" value={roles.reduce((count, role) => count + role.workItems.length, 0)} />
        <Metric label="Approval policies" value={roles.reduce((count, role) => count + role.approvalPolicies.length, 0)} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <aside className="flex h-[42%] w-full shrink-0 flex-col border-b border-[var(--border)] bg-[var(--base)] lg:h-auto lg:w-[390px] lg:border-b-0 lg:border-r">
          <div className="border-b border-[var(--border)] p-4">
            <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2.5">
              <Search className="h-3.5 w-3.5 text-[var(--overlay-1)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search roles"
                className="min-w-0 flex-1 bg-transparent font-ui text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--overlay-1)]"
              />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-2 font-ui text-[12px] text-[var(--overlay-1)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading roles...
              </div>
            ) : filteredRoles.length > 0 ? (
              <div className="space-y-2">
                {filteredRoles.map((role) => (
                  <RoleCard
                    key={role.name}
                    role={role}
                    selected={role.name === selected?.name}
                    onSelect={() => setSelectedName(role.name)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-[var(--border)] px-4 py-8 text-center font-ui text-[12px] text-[var(--overlay-1)]">
                No roles match this search.
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          {selected ? (
            <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
              <section className="border-b border-[var(--border)] pb-5">
                <div className="flex items-start justify-between gap-5">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant={selected.approvalPolicies.length ? "warning" : "secondary"}>
                        {selected.approvalPolicies.length ? "Approval gated" : "No gate recorded"}
                      </Badge>
                      <Badge variant="outline">{selected.workflows.length} workflows</Badge>
                      <Badge variant="outline">{selected.workItems.length} work items</Badge>
                    </div>
                    <h1 className="font-ui text-[24px] font-semibold leading-tight text-[var(--text)]">{selected.name}</h1>
                    <p className="mt-2 font-ui text-[13px] text-[var(--overlay-1)]">
                      {selected.currentActors.length ? selected.currentActors.join(", ") : "No current actor recorded"}
                    </p>
                  </div>
                  <Link to="/workflows" className={cn(buttonVariants({ size: "sm", variant: "accent-outline" }), "shrink-0")}>
                    Workflows
                  </Link>
                </div>
              </section>

              <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <InfoCell label="Current actors" values={selected.currentActors} />
                <InfoCell label="Backup actors" values={selected.backupActors} />
                <InfoCell label="Functional lanes" values={selected.functionalLanes} />
                <InfoCell label="Source context" values={selected.sourceContexts.slice(0, 6)} />
              </section>

              <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
                <div className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Approval Limits
                    </div>
                    <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-3">
                      {selected.approvalPolicies.length > 0 ? (
                        firstLines(selected.approvalPolicies, 8).map((line) => (
                          <p key={line} className="font-ui text-[12px] leading-relaxed text-[var(--subtext-0)]">{line}</p>
                        ))
                      ) : (
                        <p className="font-ui text-[12px] text-[var(--overlay-1)]">No approval policy recorded in linked workflows or receipts.</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">
                      <BriefcaseBusiness className="h-3.5 w-3.5" />
                      Linked Workflows
                    </div>
                    <div className="space-y-2">
                      {selected.workflows.length > 0 ? selected.workflows.map((workflow) => (
                        <div key={workflow.id} className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <p className="min-w-0 truncate font-ui text-[12px] font-semibold text-[var(--text)]">{workflow.name}</p>
                            <Badge variant={workflow.status === "Active" ? "success" : "secondary"}>{workflow.status ?? "Unset"}</Badge>
                          </div>
                          <p className="mt-1 truncate font-mono text-[10px] text-[var(--overlay-1)]">{workflow.workflow_id}</p>
                        </div>
                      )) : (
                        <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 font-ui text-[12px] text-[var(--overlay-1)]">
                          No linked workflows.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Routed Work
                    </div>
                    <div className="space-y-2">
                      {selected.workItems.length > 0 ? selected.workItems.slice(0, 10).map((item) => (
                        <div key={item.id} className="rounded-md border border-[var(--border)] bg-[var(--mantle)] px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <p className="line-clamp-2 min-w-0 font-ui text-[12px] font-semibold leading-snug text-[var(--text)]">{item.title}</p>
                            <Badge variant="outline">{item.status ?? "Unset"}</Badge>
                          </div>
                          <p className="mt-1 font-ui text-[10px] text-[var(--overlay-1)]">
                            {item.current_actor ?? "No actor"} · {item.next_step ?? "No next step"} · {formatElapsed(item.updated_at)}
                          </p>
                        </div>
                      )) : (
                        <p className="rounded-md border border-dashed border-[var(--border)] px-3 py-4 font-ui text-[12px] text-[var(--overlay-1)]">
                          No routed work currently exposes this durable role.
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 font-ui text-[11px] font-semibold uppercase text-[var(--overlay-1)]">
                      <UsersRound className="h-3.5 w-3.5" />
                      Role Coverage
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <InfoCell label="Projects" values={selected.projects.map((project) => project.title).slice(0, 4)} />
                      <InfoCell label="Action surface" values={["workspace.records", "Workflow Registry", "Workflow Runs", "Agent Panel"]} />
                    </div>
                  </div>
                </div>
              </section>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-[var(--border)] font-ui text-[13px] text-[var(--overlay-1)]">
              Select a role to inspect actor coverage, approval limits, workflows, and routed work.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
