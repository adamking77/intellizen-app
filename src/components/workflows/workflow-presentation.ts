import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import type { WorkflowCatalogItem } from "@/lib/workflow-catalog";
import type { WorkflowRunItem } from "@/lib/types";
import { workflowCronName, type CronJob } from "@/services/hermes-cron";

export function latestWorkflowRun(runs: WorkflowRunItem[], workflowId: string) {
  return runs.filter((run) => run.workflow_record_id === workflowId)
    .sort((left, right) => (Date.parse(right.started_at ?? "") || 0) - (Date.parse(left.started_at ?? "") || 0))[0];
}

export function runResultVariant(status?: string | null): "verified" | "neutral" | "waiting" | "failure" | "runtime" {
  const value = status?.toLowerCase() ?? "";
  if (value.includes("fail") || value.includes("block") || value.includes("abandon") || value.includes("reject")) return "failure";
  if (value.includes("approval")) return "waiting";
  if (value.includes("progress") || value === "running") return "runtime";
  if (value === "verified") return "verified";
  return "neutral";
}

export function workflowActor(item: WorkflowCatalogItem, roles: AgentPanelRoleTarget[]) {
  const step = item.definition?.steps.find((candidate) => candidate.kind === "role-assign");
  const target = step?.kind === "role-assign" ? roles.find((role) => step.resolution === "explicit-agent-override" ? role.agentKey === step.agentOverride : role.roleKey === step.role) : undefined;
  return { name: target?.agentName ?? target?.agentKey ?? item.workflow.default_actor, runtime: target?.adapterId ?? undefined };
}

export function workflowNextRun(item: WorkflowCatalogItem, jobs: CronJob[]) {
  const matching = jobs.filter((job) => job.name === workflowCronName(item.workflow) || job.prompt.includes(`"workflow_id": "${item.workflow.workflow_id}"`));
  if (!matching.length) return "—";
  const active = matching.filter((job) => job.enabled);
  if (!active.length) return "Paused";
  const next = active.map((job) => job.nextRunAt).filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value!))).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  return next ? new Date(next).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not reported";
}
