import type { WorkEventItem } from "@/lib/data/work-receipts";

export type WorkflowRunTrace = { agent: string; events: WorkEventItem[] };

function assignmentId(event: WorkEventItem) {
  return event.assignment_id ?? (typeof event.payload.assignmentId === "string" ? event.payload.assignmentId : null);
}

function assignmentAgent(event: WorkEventItem) {
  const assignment = event.payload.assignment;
  if (assignment && typeof assignment === "object" && typeof (assignment as { selectedAgent?: unknown }).selectedAgent === "string") return (assignment as { selectedAgent: string }).selectedAgent;
  const resolution = event.payload.resolution;
  if (resolution && typeof resolution === "object" && typeof (resolution as { selectedAgent?: unknown }).selectedAgent === "string") return (resolution as { selectedAgent: string }).selectedAgent;
  return /assignment_created$/.test(event.event_kind) ? event.actor : null;
}

export function workflowRunReceiptOrder(events: WorkEventItem[]) {
  const order = (event: WorkEventItem) => event.run_version ?? (event.event_kind === "workflow_run_started" ? 0 : Number.MAX_SAFE_INTEGER);
  return [...events].sort((left, right) => order(left) - order(right) || left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id));
}

export function workflowRunTimeline(events: WorkEventItem[]) {
  const ordered = workflowRunReceiptOrder(events);
  const agentsByAssignment = new Map<string, string>();
  for (const event of ordered) {
    const id = assignmentId(event), agent = assignmentAgent(event);
    if (id && agent) agentsByAssignment.set(id, agent);
  }
  const traces = new Map<string, WorkEventItem[]>();
  for (const event of ordered) {
    const agent = (assignmentId(event) && agentsByAssignment.get(assignmentId(event)!)) ?? assignmentAgent(event);
    if (!agent) continue;
    traces.set(agent, [...(traces.get(agent) ?? []), event]);
  }
  return [...traces.entries()].map(([agent, agentEvents]): WorkflowRunTrace => ({ agent, events: agentEvents }));
}
