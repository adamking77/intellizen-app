import {
  validateWorkflowDefinition,
  type WorkflowDefinitionV1,
  type WorkflowStep,
} from "@/lib/workflow-schema";

export type DesignerStepKind = WorkflowStep["kind"];

export function createWorkflowDesignerDraft(input: {
  id: string;
  name: string;
  ownerRole?: string | null;
}): WorkflowDefinitionV1 {
  const role = input.ownerRole || "operations_director";
  return {
    schema: "intellizen.workflow/1",
    id: input.id,
    name: input.name,
    version: 1,
    trigger: { kind: "manual" },
    inputs: [],
    steps: [
      {
        id: "step_1",
        kind: "role-assign",
        title: "Complete assigned work",
        role,
        resolution: "primary-active-occupant",
        agentOverride: null,
        overrideReason: null,
        modelOverride: null,
        instructions: "Complete the bounded workflow objective and return a structured result.",
        contextRefs: [],
        execution: role === "operations_director" ? "durable" : "ephemeral",
        verification: { required: false, method: null },
        timeoutMinutes: 30,
        next: null,
      },
    ],
  };
}

function nextStepId(definition: WorkflowDefinitionV1) {
  let index = definition.steps.length + 1;
  while (definition.steps.some((step) => step.id === `step_${index}`)) index += 1;
  return `step_${index}`;
}

function attachStep(previous: WorkflowStep, target: string): WorkflowStep {
  if (previous.kind === "condition") {
    return { ...previous, then: target };
  }
  return { ...previous, next: target };
}

export function addWorkflowDesignerStep(
  definition: WorkflowDefinitionV1,
  kind: DesignerStepKind,
): WorkflowDefinitionV1 {
  const id = nextStepId(definition);
  const previous = definition.steps[definition.steps.length - 1];
  const priorResult = previous?.id ?? "step_1";
  let step: WorkflowStep;
  if (kind === "role-assign") {
    step = {
      id,
      kind,
      title: "Assigned work",
      role: "chief_engineer",
      resolution: "primary-active-occupant",
      agentOverride: null,
      overrideReason: null,
      modelOverride: null,
      instructions: "Complete this bounded step and return a structured result.",
      contextRefs: [],
      execution: "ephemeral",
      verification: { required: false, method: null },
      timeoutMinutes: 30,
      next: null,
    };
  } else if (kind === "condition") {
    step = {
      id,
      kind,
      title: "Check prior step",
      expr: `steps.${priorResult}.state == 'completed'`,
      then: "complete",
      else: "blocked",
    };
  } else if (kind === "approval") {
    step = {
      id,
      kind,
      title: "Founder approval",
      gate: "founder_approval_authority",
      payloadRef: `steps.${priorResult}.result`,
      next: null,
    };
  } else if (kind === "artifact") {
    step = {
      id,
      kind,
      title: "Create artifact",
      action: "create-doc",
      template: "internal-note",
      payloadRef: `steps.${priorResult}.result`,
      next: null,
    };
  } else {
    step = {
      id,
      kind,
      title: "Record decision",
      rationale: "Record the decision and its evidence.",
      next: null,
    };
  }
  return {
    ...definition,
    steps: [
      ...definition.steps.slice(0, -1),
      ...(previous ? [attachStep(previous, id)] : []),
      step,
    ],
  };
}

export function updateWorkflowDesignerStep(
  definition: WorkflowDefinitionV1,
  step: WorkflowStep,
) {
  return {
    ...definition,
    steps: definition.steps.map((candidate) =>
      candidate.id === step.id ? step : candidate,
    ),
  };
}

const AUTHORITY = [
  "read-only",
  "draft-only",
  "local-write",
  "room-write",
  "external-action-request",
] as const;

function maxAuthority(definition: WorkflowDefinitionV1 | null) {
  if (!definition) return null;
  let highest = -1;
  for (const step of definition.steps) {
    if (step.kind !== "role-assign" || !step.mediatedAuthority) continue;
    highest = Math.max(highest, AUTHORITY.indexOf(step.mediatedAuthority));
  }
  return highest >= 0 ? AUTHORITY[highest] : null;
}

export function workflowAuthorityDiff(
  previous: WorkflowDefinitionV1 | null,
  next: WorkflowDefinitionV1,
) {
  const before = maxAuthority(previous);
  const after = maxAuthority(next);
  const previousGates = new Set(
    previous?.steps.flatMap((step) =>
      step.kind === "approval" ? [step.gate] : [],
    ) ?? [],
  );
  const addedApprovalGates = next.steps.flatMap((step) =>
    step.kind === "approval" && !previousGates.has(step.gate)
      ? [step.gate]
      : [],
  );
  return {
    before,
    after,
    authorityExpanded:
      after !== null &&
      (before === null || AUTHORITY.indexOf(after) > AUTHORITY.indexOf(before)),
    addedApprovalGates,
  };
}

export function parseWorkflowDesignerJson(value: string) {
  const definition = JSON.parse(value) as WorkflowDefinitionV1;
  const validation = validateWorkflowDefinition(definition);
  if (!validation.valid) {
    throw new Error(
      validation.errors
        .map((error) => `${error.path}: ${error.message}`)
        .join("; "),
    );
  }
  return definition;
}
