import type { WorkflowRunItem } from "@/lib/types";

export type ActiveWorkState =
  | "working"
  | "blocked"
  | "awaiting-approval"
  | "queued";

export type ActiveWorkItem = {
  id: string;
  workflowRecordId: string | null;
  title: string;
  state: ActiveWorkState;
  status: string;
  currentStep: string | null;
  roleKey: string | null;
  actor: string | null;
  updatedAt: string;
  canonicalPath: string;
};

const TERMINAL_STATUSES = new Set(["done", "deferred", "cancelled", "failed"]);

export function activeWorkState(status: string | null): ActiveWorkState {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized.includes("approval")) return "awaiting-approval";
  if (normalized.includes("block")) return "blocked";
  if (normalized.includes("queue") || normalized.includes("not started")) {
    return "queued";
  }
  return "working";
}

export function isActiveWorkflowRun(run: WorkflowRunItem) {
  return !TERMINAL_STATUSES.has((run.status ?? "").trim().toLowerCase());
}

export function workflowRunsForRole(
  runs: WorkflowRunItem[],
  roleKey: string,
  agentName?: string | null,
) {
  const normalizedAgent = agentName?.trim().toLowerCase() ?? "";
  return runs.filter(
    (run) =>
      run.owner_role === roleKey ||
      (normalizedAgent && run.actor?.trim().toLowerCase() === normalizedAgent),
  );
}

export function activeWorkForRole(
  runs: WorkflowRunItem[],
  roleKey: string,
  agentName?: string | null,
): ActiveWorkItem[] {
  return workflowRunsForRole(runs, roleKey, agentName)
    .filter(isActiveWorkflowRun)
    .map((run) => ({
      id: run.id,
      workflowRecordId: run.workflow_record_id,
      title: run.name,
      state: activeWorkState(run.status),
      status: run.status ?? "In progress",
      currentStep: run.current_step,
      roleKey: run.owner_role,
      actor: run.actor,
      updatedAt: run.updated_at,
      canonicalPath: `/workflows?run=${run.id}`,
    }))
    .sort(
      (left, right) =>
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );
}
