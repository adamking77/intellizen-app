import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import type { WorkflowRunItem } from "@/lib/types";
import type {
  WorkflowDefinitionV1,
  WorkflowDryRunResult,
  WorkflowStep,
} from "@/lib/workflow-schema";

export type WorkflowTopologyMode = "definition" | "dry-run" | "run";

export type WorkflowTopologyNodeKind =
  | "trigger"
  | "action"
  | "decision"
  | "approval"
  | "handoff"
  | "artifact"
  | "verification"
  | "terminal";

export type WorkflowTopologyNodeState =
  | "neutral"
  | "ready"
  | "queued"
  | "running"
  | "blocked"
  | "needs-approval"
  | "verified"
  | "completed"
  | "failed";

export type WorkflowTopologyNode = {
  id: string;
  stepId: string | null;
  kind: WorkflowTopologyNodeKind;
  title: string;
  detail: string | null;
  role: string | null;
  occupant: string | null;
  execution: string | null;
  state: WorkflowTopologyNodeState;
  blocker: string | null;
  position: { x: number; y: number };
};

export type WorkflowTopologyEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle: "next" | "then" | "else";
  label: string | null;
};

export type WorkflowTopology = {
  mode: WorkflowTopologyMode;
  nodes: WorkflowTopologyNode[];
  edges: WorkflowTopologyEdge[];
};

const TERMINALS = new Set(["complete", "blocked", "escalate"]);

function stepTargets(step: WorkflowStep) {
  if (step.kind === "condition") {
    return [
      { target: step.then, handle: "then" as const, label: "true" },
      { target: step.else, handle: "else" as const, label: "false" },
    ];
  }
  return [{
    target: step.next ?? "complete",
    handle: "next" as const,
    label: null,
  }];
}

function topologyId(stepId: string) {
  return TERMINALS.has(stepId) ? `terminal:${stepId}` : `step:${stepId}`;
}

function nodeKind(
  definition: WorkflowDefinitionV1,
  step: WorkflowStep,
): WorkflowTopologyNodeKind {
  if (step.kind === "condition" || step.kind === "decision") return "decision";
  if (step.kind === "approval") return "approval";
  if (step.kind === "artifact") return "artifact";
  if (step.role === "verifier") {
    return "verification";
  }
  const previousRoleStep = definition.steps
    .slice(0, definition.steps.indexOf(step))
    .reverse()
    .find((candidate) => candidate.kind === "role-assign");
  if (previousRoleStep?.kind === "role-assign" && previousRoleStep.role !== step.role) {
    return "handoff";
  }
  return "action";
}

function resolvedRole(
  step: WorkflowStep,
  roleTargets: AgentPanelRoleTarget[],
) {
  if (step.kind !== "role-assign") return null;
  if (step.resolution === "explicit-agent-override") {
    return (
      roleTargets.find((target) => target.agentKey === step.agentOverride) ??
      roleTargets.find((target) => target.roleKey === step.role) ??
      null
    );
  }
  return roleTargets.find((target) => target.roleKey === step.role) ?? null;
}

function recordValue(value: unknown, key: string) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function runStepState(run: WorkflowRunItem | null, step: WorkflowStep) {
  if (!run) return null;
  const stateValue = recordValue(run.step_states, step.id);
  const explicit =
    typeof stateValue === "string"
      ? stateValue
      : recordValue(stateValue, "state");
  if (typeof explicit === "string") return explicit.toLowerCase();
  if (run.current_step_id === step.id) {
    const status = (run.status ?? "").toLowerCase();
    if (status.includes("approval")) return "needs-approval";
    if (status.includes("block")) return "blocked";
    return "running";
  }
  return "queued";
}

function normalizeNodeState(value: string | null): WorkflowTopologyNodeState {
  if (!value) return "neutral";
  if (value.includes("approval")) return "needs-approval";
  if (value.includes("block")) return "blocked";
  if (value.includes("verif")) return "verified";
  if (value.includes("complete") || value === "done") return "completed";
  if (value.includes("fail") || value.includes("cancel")) return "failed";
  if (value.includes("run") || value.includes("progress")) return "running";
  if (value.includes("queue") || value.includes("not-started")) return "queued";
  return "ready";
}

function dryRunBlocker(
  dryRun: WorkflowDryRunResult | null,
  step: WorkflowStep,
  index: number,
) {
  if (!dryRun) return null;
  const match = dryRun.errors.find(
    (error) =>
      error.path.startsWith(`steps.${step.id}`) ||
      error.path.startsWith(`steps[${index}]`),
  );
  return match ? match.message : null;
}

function layout(
  nodes: Array<Omit<WorkflowTopologyNode, "position">>,
  edges: WorkflowTopologyEdge[],
) {
  const levels = new Map<string, number>([["trigger", 0]]);
  const queue = ["trigger"];
  while (queue.length > 0) {
    const source = queue.shift() as string;
    const sourceLevel = levels.get(source) ?? 0;
    for (const edge of edges.filter((candidate) => candidate.source === source)) {
      const nextLevel = sourceLevel + 1;
      if ((levels.get(edge.target) ?? -1) < nextLevel) {
        levels.set(edge.target, nextLevel);
        queue.push(edge.target);
      }
    }
  }
  const byLevel = new Map<number, string[]>();
  for (const node of nodes) {
    const level = levels.get(node.id) ?? 1;
    byLevel.set(level, [...(byLevel.get(level) ?? []), node.id]);
  }
  return nodes.map((node) => {
    const level = levels.get(node.id) ?? 1;
    const siblings = byLevel.get(level) ?? [node.id];
    const index = siblings.indexOf(node.id);
    const row = Math.floor(level / 4);
    const offset = level % 4;
    const column = row % 2 === 0 ? offset : 3 - offset;
    return {
      ...node,
      position: {
        x: column * 245,
        y:
          row * 125 +
          (index - (siblings.length - 1) / 2) * 100,
      },
    };
  });
}

export function buildWorkflowTopology(input: {
  definition: WorkflowDefinitionV1;
  roleTargets?: AgentPanelRoleTarget[];
  mode?: WorkflowTopologyMode;
  dryRun?: WorkflowDryRunResult | null;
  run?: WorkflowRunItem | null;
}): WorkflowTopology {
  const mode = input.mode ?? "definition";
  const roleTargets = input.roleTargets ?? [];
  const edges: WorkflowTopologyEdge[] = [];
  const first = input.definition.steps[0];
  if (first) {
    edges.push({
      id: `trigger->${first.id}`,
      source: "trigger",
      target: topologyId(first.id),
      sourceHandle: "next",
      label: input.definition.trigger.kind,
    });
  }

  const terminalIds = new Set<string>();
  for (const step of input.definition.steps) {
    for (const target of stepTargets(step)) {
      if (TERMINALS.has(target.target)) terminalIds.add(target.target);
      edges.push({
        id: `${step.id}:${target.handle}->${target.target}`,
        source: topologyId(step.id),
        target: topologyId(target.target),
        sourceHandle: target.handle,
        label: target.label,
      });
    }
  }

  const nodesWithoutPosition: Array<Omit<WorkflowTopologyNode, "position">> = [
    {
      id: "trigger",
      stepId: null,
      kind: "trigger",
      title: "Trigger",
      detail: input.definition.trigger.kind,
      role: null,
      occupant: null,
      execution: null,
      state: mode === "definition" ? "neutral" : "ready",
      blocker: null,
    },
    ...input.definition.steps.map((step, index) => {
      const target = resolvedRole(step, roleTargets);
      const blocker =
        mode === "dry-run"
          ? dryRunBlocker(input.dryRun ?? null, step, index)
          : null;
      const state =
        mode === "run"
          ? normalizeNodeState(runStepState(input.run ?? null, step))
          : mode === "dry-run"
            ? blocker
              ? "blocked"
              : "ready"
            : "neutral";
      return {
        id: topologyId(step.id),
        stepId: step.id,
        kind: nodeKind(input.definition, step),
        title: step.title,
        detail: step.kind,
        role: step.kind === "role-assign" ? step.role : null,
        occupant: target?.agentName ?? target?.agentKey ?? null,
        execution: step.kind === "role-assign" ? step.execution : null,
        state,
        blocker,
      };
    }),
    ...Array.from(terminalIds).map((terminal) => ({
      id: topologyId(terminal),
      stepId: null,
      kind: "terminal" as const,
      title:
        terminal === "complete"
          ? "Complete"
          : terminal === "blocked"
            ? "Blocked"
            : "Escalate",
      detail: "terminal",
      role: null,
      occupant: null,
      execution: null,
      state:
        mode === "run" &&
        (input.run?.status ?? "").toLowerCase().includes(terminal)
          ? terminal === "complete"
            ? ("completed" as const)
            : ("blocked" as const)
          : ("neutral" as const),
      blocker: null,
    })),
  ];

  return {
    mode,
    nodes: layout(nodesWithoutPosition, edges),
    edges,
  };
}
