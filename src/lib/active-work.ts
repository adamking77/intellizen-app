/**
 * Canonical working-state projection.
 *
 * Every surface that presents active workflow work should read this module,
 * so status semantics, identity matching, and deep links do not drift.
 */
import type { WorkflowRunItem, WorkflowRunStatus } from "@/lib/types";

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

export type WorkflowActorIdentity = {
  recordId?: string | null;
  agentKey?: string | null;
  displayName?: string | null;
};

const WORKFLOW_RUN_STATUSES = new Set<WorkflowRunStatus>([
  "Queued",
  "In progress",
  "Blocked",
  "Needs approval",
  "Done",
  "Deferred",
]);
const TERMINAL_STATUSES = new Set<WorkflowRunStatus>([
  "Done",
  "Deferred",
]);

function workflowRunStatus(status: string | null): WorkflowRunStatus | null {
  const normalized = status?.trim();
  return normalized && WORKFLOW_RUN_STATUSES.has(normalized as WorkflowRunStatus)
    ? (normalized as WorkflowRunStatus)
    : null;
}

export function activeWorkState(
  status: WorkflowRunStatus | null,
): ActiveWorkState {
  switch (status) {
    case "Needs approval":
      return "awaiting-approval";
    case "Blocked":
      return "blocked";
    case "Queued":
      return "queued";
    default:
      return "working";
  }
}

export function isActiveWorkflowRun(run: WorkflowRunItem) {
  const status = workflowRunStatus(run.status);
  return status !== null && !TERMINAL_STATUSES.has(status);
}

export function workflowRunsForRole(
  runs: WorkflowRunItem[],
  roleKey: string,
  agentIdentity?: WorkflowActorIdentity | null,
) {
  const actorIdentifiers = new Set(
    [
      agentIdentity?.recordId,
      agentIdentity?.agentKey,
      agentIdentity?.displayName,
    ].filter((value): value is string => Boolean(value?.trim())),
  );
  return runs.filter(
    (run) =>
      run.owner_role === roleKey ||
      (run.actor !== null && actorIdentifiers.has(run.actor)),
  );
}

export function activeWorkForRole(
  runs: WorkflowRunItem[],
  roleKey: string,
  agentIdentity?: WorkflowActorIdentity | null,
): ActiveWorkItem[] {
  return workflowRunsForRole(runs, roleKey, agentIdentity)
    .filter(isActiveWorkflowRun)
    .map((run) => ({
      id: run.id,
      workflowRecordId: run.workflow_record_id,
      title: run.name,
      state: activeWorkState(workflowRunStatus(run.status)),
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
