import type { ProfileThread } from "@/engine/session-store";
import type { Decision } from "@/engine/transcript";
import type { HermesProfile } from "@/engine/profiles";
import type { GroupChatRoom } from "@/rooms/group-chat";
import type { GroupPrompt } from "@/rooms/types";
import type { ActivityDashboardModel, ActivitySources } from "@/lib/activity-dashboard";
import type { WorkEventItem } from "@/lib/data/work-receipts";
import type { HierarchyNode } from "@/lib/hierarchy";
import type { WorkspaceDatabaseRecord, WorkspaceDatabaseRecordModel } from "@/lib/types";
import type { WorkflowRunItem } from "@/lib/types";
import type { SessionMode } from "@/lib/session-mode";
import { validateWorkflowDefinition, type WorkflowDefinitionV1 } from "@/lib/workflow-schema";

export type { SessionMode } from "@/lib/session-mode";

export const SESSION_MODE_LABEL: Record<SessionMode, string> = {
  thinking: "Thinking",
  deciding: "Deciding",
  executing: "Executing",
  not_today: "Not today",
};

export type HomeQuestion =
  | { key: string; source: "profile"; profile: string; sessionId: string | null; owner: string; decision: Decision }
  | { key: string; source: "room"; roomId: string; memberKey: string; owner: string; decision: Decision }
  | {
    key: string;
    source: "workflow";
    runId: string;
    approvalId: string | null;
    runVersion: number | null;
    currentStepId: string | null;
    currentStep: string | null;
    updatedAt: string;
    payloadHash: string | null;
    decisionRole: string | null;
    payloadSnapshot: unknown;
    hasPayloadSnapshot: boolean;
    owner: string;
    title: string;
    detail: string;
    at: number;
  };

export function collectHomeQuestions(input: {
  threads: Record<string, ProfileThread>;
  profiles: Record<string, HermesProfile>;
  rooms: Record<string, GroupChatRoom>;
  prompts: Record<string, GroupPrompt>;
  runs?: WorkflowRunItem[];
}): HomeQuestion[] {
  const questions: HomeQuestion[] = [];
  for (const [profile, thread] of Object.entries(input.threads)) {
    const owner = input.profiles[profile]?.displayName || profile;
    for (const decision of thread.transcript.pending) {
      questions.push({
        key: `profile:${profile}:${thread.sessionId ?? thread.storedSessionId ?? "none"}:${decision.requestId}`,
        source: "profile",
        profile,
        sessionId: thread.sessionId ?? thread.storedSessionId ?? null,
        owner,
        decision,
      });
    }
  }
  for (const prompt of Object.values(input.prompts)) {
    const room = input.rooms[prompt.group];
    if (!room || room.tombstone) continue;
    questions.push({
      key: `room:${prompt.group}:${prompt.memberKey}:${prompt.decision.requestId}`,
      source: "room",
      roomId: prompt.group,
      memberKey: prompt.memberKey,
      owner: prompt.member,
      decision: prompt.decision,
    });
  }
  for (const run of input.runs ?? []) {
    const workflow = workflowQuestion(run);
    if (workflow) questions.push(workflow);
  }
  return questions.sort((left, right) => questionAt(right) - questionAt(left) || left.key.localeCompare(right.key));
}

function profileAgentId(profile: string) {
  return profile.startsWith("acp:") ? profile : `hermes:${profile}`;
}

function roomMemberAgentId(room: GroupChatRoom | undefined, memberKey: string) {
  const member = room?.members?.find((candidate) => candidate.name === memberKey);
  return member ? `${member.door === "acp" ? "acp" : "hermes"}:${member.name}` : null;
}

/** Quieting changes Home's local projection only. Workflow owner labels and
 * unknown room members are retained because a name is not durable identity. */
export function filterRestingHomeQuestions(
  questions: HomeQuestion[],
  rooms: Record<string, GroupChatRoom>,
  restingAgents: string[],
) {
  const resting = new Set(restingAgents);
  return questions.filter((question) => {
    if (question.source === "workflow") return true;
    const agentId = question.source === "profile"
      ? profileAgentId(question.profile)
      : roomMemberAgentId(rooms[question.roomId], question.memberKey);
    return !agentId || !resting.has(agentId);
  });
}

export function filterRestingActivity(
  model: ActivityDashboardModel | null,
  rooms: Record<string, GroupChatRoom>,
  restingAgents: string[],
) {
  if (!model || restingAgents.length === 0) return model;
  const resting = new Set(restingAgents);
  return {
    ...model,
    progress: model.progress.filter((item) => {
      const agentId = item.target.type === "profile"
        ? profileAgentId(item.target.id)
        : item.target.type === "room"
          ? roomMemberAgentId(rooms[item.target.id], rooms[item.target.id]?.turn ?? "")
          : null;
      return !agentId || !resting.has(agentId);
    }),
  };
}

function questionAt(question: HomeQuestion) {
  return question.source === "workflow" ? question.at : question.decision.at;
}

export function workflowCurrentStepLabel(run: WorkflowRunItem) {
  const definition = validateWorkflowDefinition(run.definition_snapshot).valid
    ? run.definition_snapshot as WorkflowDefinitionV1
    : null;
  if (definition && run.current_step_id) {
    const step = definition.steps.find((candidate) => candidate.id === run.current_step_id);
    const states = run.step_states && typeof run.step_states === "object" && !Array.isArray(run.step_states)
      ? run.step_states as Record<string, unknown>
      : {};
    const state = states[run.current_step_id];
    return `${step?.title ?? run.current_step_id} — ${typeof state === "string" ? state.replaceAll("_", " ") : "state not recorded"}`;
  }
  return run.current_step || "Not recorded";
}

/**
 * The current structured step is the only authority for a pending approval.
 * Older runs predate that identity, so their recorded pending approval stays
 * available as a legacy fallback.
 */
export function workflowQuestion(run: WorkflowRunItem): Extract<HomeQuestion, { source: "workflow" }> | null {
  if (run.status?.toLowerCase() !== "needs approval") return null;
  const approvals = run.approvals && typeof run.approvals === "object" && !Array.isArray(run.approvals)
    ? Object.values(run.approvals as Record<string, unknown>)
    : [];
  const structured = run.schema_version === "intellizen.workflow/1";
  const pending = structured
    ? run.current_step_id
      ? approvals.find((approval) => approval && typeof approval === "object"
        && (approval as { stepId?: unknown }).stepId === run.current_step_id
        && (approval as { decision?: unknown }).decision === null)
      : undefined
    : approvals.find((approval) => approval && typeof approval === "object" && (approval as { decision?: unknown }).decision === null);
  if (structured && (!pending || typeof pending !== "object")) return null;
  const approval = pending && typeof pending === "object" ? pending as Record<string, unknown> : {};
  const approvalId = typeof approval.approvalId === "string" ? approval.approvalId : null;
  const payloadHash = typeof approval.payloadHash === "string" ? approval.payloadHash : null;
  const decisionRole = typeof approval.requiredRole === "string" ? approval.requiredRole : null;
  const hasPayloadSnapshot = Object.prototype.hasOwnProperty.call(approval, "payloadSnapshot");
  const at = Number.isFinite(Date.parse(run.updated_at)) ? Date.parse(run.updated_at) : 0;
  const currentStep = workflowCurrentStepLabel(run);
  return {
    key: `workflow:${run.id}:${approvalId ?? run.current_step_id ?? "approval"}:${run.run_version ?? run.updated_at}`,
    source: "workflow",
    runId: run.id,
    approvalId,
    runVersion: run.run_version,
    currentStepId: run.current_step_id,
    currentStep,
    updatedAt: run.updated_at,
    payloadHash,
    decisionRole,
    payloadSnapshot: approval.payloadSnapshot,
    hasPayloadSnapshot,
    owner: run.actor || run.owner_role || "Workflow",
    title: run.name,
    detail: currentStep,
    at,
  };
}

export function workflowApprovalFollowUpWarning(result: unknown) {
  if (typeof result !== "object" || result === null) return null;
  const record = result as Record<string, unknown>;
  const warnings = ["lease_release_error", "receipt_error", "task_sync_error", "resume_error"]
    .map((key) => typeof record[key] === "string" ? record[key].trim() : "")
    .filter(Boolean);
  return warnings.length ? `The approval was recorded; follow-up needs attention: ${warnings.join(" · ")}` : null;
}

export function sourceProblems(sources: ActivitySources, eventsError?: unknown): string[] {
  const problems = [
    sources.runs.error,
    sources.connections.error,
    sources.hierarchy.error,
    sources.profiles.error,
    sources.sessionFolders.error,
    ...Object.values(sources.usage).map((source) => source.error),
    eventsError instanceof Error ? eventsError.message : typeof eventsError === "string" ? eventsError : undefined,
  ].filter((message): message is string => Boolean(message));
  return Array.from(new Set(problems));
}

export function activitySentence(input: {
  model: ActivityDashboardModel | null;
  questions: HomeQuestion[];
  events: WorkEventItem[] | undefined;
  eventsState: "unseen" | "loading" | "ready";
  sourceErrors: string[];
}): { sentence: string; meanwhile: string; counts: string } {
  const { model, questions, events, eventsState, sourceErrors } = input;
  if (sourceErrors.length) {
    return {
      sentence: "Some activity sources could not be read.",
      meanwhile: sourceErrors.join(" · "),
      counts: "Activity is incomplete",
    };
  }
  if (!model) {
    return { sentence: "Activity is still loading.", meanwhile: "The current agent and workflow state has not arrived yet.", counts: "Loading" };
  }
  const activeConversations = model.progress;
  const queuedWorkflows = model.openWorkflows.filter((workflow) => workflow.state === "Queued");
  const inProgressWorkflows = model.openWorkflows.filter((workflow) => workflow.state === "In progress");
  const eventCount = events?.length ?? 0;
  const questionText = questions.length === 0
    ? "There are no questions for you."
    : `There ${questions.length === 1 ? "is one question" : `are ${questions.length} questions`} for you.`;
  const movement = activeConversations.length
    ? `${activeConversations.length === 1 ? `${activeConversations[0].owner} has an active conversation` : `${activeConversations.length} active conversations are underway`}.`
    : "No active agent conversations are reported.";
  const workflowState = [
    inProgressWorkflows.length ? `${inProgressWorkflows.length} workflow${inProgressWorkflows.length === 1 ? "" : "s"} ${inProgressWorkflows.length === 1 ? "is" : "are"} in progress.` : "",
    queuedWorkflows.length ? `${queuedWorkflows.length} workflow${queuedWorkflows.length === 1 ? "" : "s"} ${queuedWorkflows.length === 1 ? "is" : "are"} queued.` : "",
  ].filter(Boolean).join(" ");
  return {
    sentence: `${movement}${workflowState ? ` ${workflowState}` : ""} ${questionText}`,
    meanwhile: eventsState === "unseen"
      ? "No earlier Home visit is recorded yet."
      : eventsState === "loading"
        ? "Updates since your last visit are still loading."
      : eventCount
      ? `${eventCount >= 100 ? "At least 100" : eventCount} ${eventCount === 1 ? "update was" : "updates were"} recorded since your last visit.`
      : "No updates were recorded since your last visit.",
    counts: `${activeConversations.length} active conversations · ${questions.length} questions · ${eventsState === "ready" && eventCount >= 100 ? "100+" : eventCount} new updates`,
  };
}

export const TASK_FIELDS = {
  title: "task_name",
  trigger: "task_trigger",
  doneWhen: "task_done_when",
  effort: "task_effort",
  scopeNodeId: "task_scope_node_id",
  kind: "task_kind",
  status: "task_status",
} as const;

type TaskRecord = Pick<WorkspaceDatabaseRecord, "id" | "fields"> | WorkspaceDatabaseRecordModel;

export interface HomeTask {
  id: string;
  title: string;
  trigger: string | null;
  doneWhen: string | null;
  effort: string | null;
  scopeNodeId: string | null;
  scopeValid: boolean;
  keepingOut: boolean;
  completed: boolean;
}

function fieldText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fieldMap(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function projectHomeTasks(records: TaskRecord[], hierarchy: HierarchyNode[] | null, selectedScopeId: string | null): HomeTask[] {
  const validScopeIds = hierarchy === null
    ? null
    : new Set(hierarchy.filter((node) => node.kind === "workspace" || node.kind === "project").map((node) => node.id));
  return records.map((record) => {
    const fields = fieldMap("fields" in record ? record.fields : record);
    const scopeNodeId = fieldText(fields[TASK_FIELDS.scopeNodeId]);
    return {
      id: record.id,
      title: fieldText(fields[TASK_FIELDS.title]) ?? "Untitled task",
      trigger: fieldText(fields[TASK_FIELDS.trigger]),
      doneWhen: fieldText(fields[TASK_FIELDS.doneWhen]),
      effort: fieldText(fields[TASK_FIELDS.effort]),
      scopeNodeId,
      scopeValid: scopeNodeId === null || validScopeIds === null || validScopeIds.has(scopeNodeId),
      keepingOut: fieldText(fields[TASK_FIELDS.kind]) === "keeping_out",
      completed: ["done", "completed"].includes((fieldText(fields[TASK_FIELDS.status]) ?? "").toLowerCase()),
    };
  }).filter((task) => {
    // A scoped view always retains unscoped and invalidly scoped tasks so
    // legacy and repairable work is never made unreachable by this projection.
    if (!selectedScopeId || !task.scopeNodeId || !task.scopeValid) return true;
    // Without ancestry, retain only exact and unscoped work. This avoids
    // leaking another project's scoped task into the selected project.
    if (hierarchy === null) return task.scopeNodeId === selectedScopeId;
    return scopeContains(hierarchy, selectedScopeId, task.scopeNodeId);
  });
}

/** Set aside changes only this local presentation. Unscoped work and work in
 * another project remain visible, and an unavailable hierarchy never implies
 * an ancestry relation. */
export function filterSetAsideHomeTasks(tasks: HomeTask[], hierarchy: HierarchyNode[] | null, setAsideScopeIds: string[]): HomeTask[] {
  if (setAsideScopeIds.length === 0) return tasks;
  return tasks.filter((task) => {
    if (!task.scopeNodeId) return true;
    const scopeNodeId = task.scopeNodeId;
    return !setAsideScopeIds.some((scopeId) => hierarchy === null
      ? scopeNodeId === scopeId
      : scopeContains(hierarchy, scopeId, scopeNodeId));
  });
}

function scopeContains(hierarchy: HierarchyNode[], ancestorId: string, nodeId: string) {
  const parentById = new Map(hierarchy.map((node) => [node.id, node.parent_id]));
  const seen = new Set<string>();
  let current: string | null = nodeId;
  while (current && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = parentById.get(current) ?? null;
  }
  return false;
}

export function groupTasksByTrigger(tasks: HomeTask[]): Array<{ trigger: string; tasks: HomeTask[] }> {
  const groups = new Map<string, HomeTask[]>();
  for (const task of tasks.filter((task) => !task.keepingOut && !task.completed)) {
    const trigger = task.trigger ?? "No trigger recorded";
    const list = groups.get(trigger) ?? [];
    list.push(task);
    groups.set(trigger, list);
  }
  return Array.from(groups, ([trigger, grouped]) => ({ trigger, tasks: grouped }));
}
