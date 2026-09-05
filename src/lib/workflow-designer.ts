import { validateWorkflowDefinition } from "@/lib/workflow-schema";
import type {
  WorkflowDefinitionV1,
  WorkflowStep,
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

export type WorkflowInsertion = { afterStepId: string | null; branch?: "then" | "else" };

function createWorkflowDesignerStep(id: string, kind: DesignerStepKind, priorResult: string | null): WorkflowStep {
  let step: WorkflowStep;
  if (!priorResult && (kind === "condition" || kind === "approval")) throw new Error(`${kind === "condition" ? "A condition" : "An approval"} requires a prior step. Add a step before this one.`);
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
      ...(priorResult ? { payloadRef: `steps.${priorResult}.result` } : {}),
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
  return step;
}

export function addWorkflowDesignerStep(
  definition: WorkflowDefinitionV1,
  kind: DesignerStepKind,
  insertion?: WorkflowInsertion,
): WorkflowDefinitionV1 {
  const id = nextStepId(definition);
  const afterId = insertion ? insertion.afterStepId : definition.steps.at(-1)?.id;
  const previous = definition.steps.find((candidate) => candidate.id === afterId);
  if (afterId && !previous) return definition;
  const branch = insertion?.branch ?? "then";
  const successor = previous ? (previous.kind === "condition" ? previous[branch] : previous.next) : definition.steps[0]?.id ?? null;
  let step = createWorkflowDesignerStep(id, kind, previous?.id ?? null);
  step = step.kind === "condition" ? { ...step, then: successor ?? "complete" } : { ...step, next: successor };
  const steps = definition.steps.map((candidate) => {
    if (candidate.id !== previous?.id) return candidate;
    return candidate.kind === "condition" ? { ...candidate, [branch]: id } : { ...candidate, next: id };
  });
  const index = previous ? steps.findIndex((candidate) => candidate.id === previous.id) + 1 : 0;
  steps.splice(index, 0, step);
  return { ...definition, steps };
}

/** Change kind in place; choosing between divergent branches is always explicit. */
export function changeWorkflowDesignerStepKind(
  definition: WorkflowDefinitionV1,
  stepId: string,
  kind: DesignerStepKind,
  branch?: "then" | "else",
): WorkflowDefinitionV1 {
  const original = definition.steps.find((step) => step.id === stepId);
  if (!original || original.kind === kind) return definition;
  if (original.kind === "condition" && original.then !== original.else && !branch) {
    throw new Error("Choose the Yes or No branch to keep before changing this condition's type.");
  }
  const successor = original.kind === "condition" ? original[branch ?? "then"] : original.next;
  const predecessor = definition.steps[0]?.id === stepId ? null : definition.steps.find((step) => step.id !== stepId && (step.kind === "condition" ? step.then === stepId || step.else === stepId : step.next === stepId));
  const defaults = createWorkflowDesignerStep(stepId, kind, predecessor?.id ?? null);
  const replacement: WorkflowStep = defaults.kind === "condition"
    ? { ...defaults, title: original.title, then: successor ?? "complete" }
    : { ...defaults, title: original.title, next: successor };
  return { ...definition, steps: definition.steps.map((step) => step.id === stepId ? replacement : step) };
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

export function connectWorkflowDesignerEdge(
  definition: WorkflowDefinitionV1,
  input: {
    sourceStepId: string;
    target: string;
    handle: "next" | "then" | "else";
  },
): WorkflowDefinitionV1 {
  const source = definition.steps.find(
    (step) => step.id === input.sourceStepId,
  );
  if (!source) return definition;
  if (source.kind === "condition") {
    return updateWorkflowDesignerStep(definition, {
      ...source,
      [input.handle === "else" ? "else" : "then"]: input.target,
    });
  }
  return updateWorkflowDesignerStep(definition, {
    ...source,
    next: input.target,
  });
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

export type WorkflowDesignerRecovery = { definition: WorkflowDefinitionV1; baseUpdatedAt: string; positionsVersion?: number; positions?: Record<string, { x: number; y: number }> };
const RECOVERY_PREFIX = "workflow-designer:";
function recoveryValue(raw: string | null): WorkflowDesignerRecovery | null {
  try {
    const value = JSON.parse(raw ?? "null") as WorkflowDesignerRecovery | null;
    if (!value || typeof value.baseUpdatedAt !== "string") return null;
    const definition = value.definition;
    const valid = validateWorkflowDefinition(definition).valid;
    // Preserve incomplete field edits, while rejecting values the editor cannot safely render.
    if (!valid && !(definition?.schema === "intellizen.workflow/1" && typeof definition.id === "string" && typeof definition.name === "string" && typeof definition.version === "number" && ["manual", "panel-message"].includes(definition.trigger?.kind) && Array.isArray(definition.inputs) && definition.inputs.every((input) => input && typeof input.key === "string" && typeof input.type === "string") && Array.isArray(definition.steps) && definition.steps.every((step) => {
      if (!step || typeof step.id !== "string" || typeof step.title !== "string") return false;
      if (step.kind === "role-assign") return typeof step.role === "string" && typeof step.instructions === "string" && typeof step.verification?.required === "boolean";
      if (step.kind === "condition") return typeof step.expr === "string" && typeof step.then === "string" && typeof step.else === "string";
      if (step.kind === "approval") return typeof step.gate === "string" && typeof step.payloadRef === "string";
      if (step.kind === "artifact") return typeof step.action === "string" && typeof step.template === "string";
      return step.kind === "decision" && typeof step.rationale === "string";
    }))) return null;
    const positions = Object.fromEntries(Object.entries(value.positionsVersion === 2 ? value.positions ?? {} : {}).filter(([, position]) => position && Number.isFinite(position.x) && Number.isFinite(position.y)));
    return { definition, baseUpdatedAt: value.baseUpdatedAt, positionsVersion: 2, positions };
  } catch { return null; }
}
export function recoverWorkflowDesignerDraft(recordId: string): WorkflowDesignerRecovery | null {
  const key = `${RECOVERY_PREFIX}${recordId || "new"}`;
  try { const local = recoveryValue(localStorage.getItem(key)); if (local) return local; } catch { /* Try the prior session-only storage. */ }
  try {
    const prior = recoveryValue(sessionStorage.getItem(key));
    if (prior) { try { localStorage.setItem(key, JSON.stringify(prior)); sessionStorage.removeItem(key); } catch { /* The session fallback remains usable. */ } }
    return prior;
  } catch { return null; }
}
export function storeWorkflowDesignerDraft(recordId: string, value: WorkflowDesignerRecovery) {
  const key = `${RECOVERY_PREFIX}${recordId || "new"}`;
  try { localStorage.setItem(key, JSON.stringify(value)); return; } catch { /* Fall back when persistent storage is unavailable. */ }
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* The in-memory draft remains available. */ }
}
export function clearWorkflowDesignerDraft(recordId: string) {
  const key = `${RECOVERY_PREFIX}${recordId || "new"}`;
  try { localStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
  try { sessionStorage.removeItem(key); } catch { /* Storage may be unavailable. */ }
}
export function listRecoveredWorkflowDesignerDrafts() {
  const keys = new Set<string>();
  for (const provider of [() => localStorage, () => sessionStorage]) {
    try { const storage = provider(); for (let index = 0; index < storage.length; index++) { const key = storage.key(index); if (key?.startsWith(RECOVERY_PREFIX)) keys.add(key.slice(RECOVERY_PREFIX.length)); } } catch { /* Skip unavailable storage. */ }
  }
  return [...keys].flatMap((recordId) => { const value = recoverWorkflowDesignerDraft(recordId); return value ? [{ recordId, ...value }] : []; });
}
