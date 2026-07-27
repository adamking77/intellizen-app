const WORKFLOW_SCHEMA = "intellizen.workflow/1";
const STEP_ID = /^[a-z][a-z0-9_-]{0,63}$/;
const WORKFLOW_ID = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const INPUT_KEY = /^[a-z][a-z0-9_]{0,63}$/;
const CONDITION =
  /^steps\.([a-z][a-z0-9_-]*)\.state == '(queued|running|awaiting-input|needs-approval|blocked|completed|failed|cancelled|abandoned)'$/;
const PAYLOAD_REF = /^steps\.([a-z][a-z0-9_-]*)\.result$/;
const TERMINALS = new Set(["complete", "blocked", "escalate"]);
const KINDS = new Set([
  "role-assign",
  "condition",
  "approval",
  "artifact",
  "decision",
]);
const EXECUTION = new Set(["ephemeral", "durable"]);
const ARTIFACT_ACTIONS = new Set([
  "create-doc",
  "revise-doc",
  "create-record",
  "simulate-consequential-action",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function add(errors, path, code, message) {
  errors.push({ path, code, message });
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function stepTargets(step) {
  if (step.kind === "condition") return [step.then, step.else];
  return step.next == null ? [] : [step.next];
}

function validateCommonStep(step, index, errors) {
  const path = `steps[${index}]`;
  if (!isRecord(step)) {
    add(errors, path, "invalid_step", "Step must be an object.");
    return false;
  }
  if (!STEP_ID.test(step.id ?? "")) {
    add(errors, `${path}.id`, "invalid_step_id", "Step id is invalid.");
  }
  if (!KINDS.has(step.kind)) {
    add(errors, `${path}.kind`, "unsupported_step_kind", "Step kind is not supported in workflow schema v1.");
  }
  if (!nonEmpty(step.title)) {
    add(errors, `${path}.title`, "missing_title", "Step title is required.");
  }
  return true;
}

function validateRoleAssign(step, index, errors, inputKeys) {
  const path = `steps[${index}]`;
  if (!nonEmpty(step.role)) add(errors, `${path}.role`, "missing_role", "Role is required.");
  if (!["primary-active-occupant", "explicit-agent-override"].includes(step.resolution)) {
    add(errors, `${path}.resolution`, "invalid_resolution", "Role resolution is invalid.");
  }
  if (step.resolution === "explicit-agent-override") {
    if (!nonEmpty(step.agentOverride)) {
      add(errors, `${path}.agentOverride`, "missing_agent_override", "Explicit resolution requires agentOverride.");
    }
    if (!nonEmpty(step.overrideReason)) {
      add(errors, `${path}.overrideReason`, "missing_override_reason", "Explicit resolution requires overrideReason.");
    }
  } else if (step.agentOverride != null || step.overrideReason != null) {
    add(errors, path, "unexpected_agent_override", "Primary occupant resolution cannot carry an agent override.");
  }
  if (!nonEmpty(step.instructions)) {
    add(errors, `${path}.instructions`, "missing_instructions", "Role assignment instructions are required.");
  }
  if (!EXECUTION.has(step.execution)) {
    add(errors, `${path}.execution`, "invalid_execution", "Execution must be ephemeral or durable.");
  }
  if (!Number.isSafeInteger(step.timeoutMinutes) || step.timeoutMinutes < 1 || step.timeoutMinutes > 240) {
    add(errors, `${path}.timeoutMinutes`, "invalid_timeout", "Timeout must be an integer from 1 to 240 minutes.");
  }
  if (!isRecord(step.verification) || typeof step.verification.required !== "boolean") {
    add(errors, `${path}.verification`, "invalid_verification", "Verification policy is required.");
  } else if (step.verification.required && !nonEmpty(step.verification.method)) {
    add(errors, `${path}.verification.method`, "missing_verification_method", "Required verification must name a method.");
  }
  if (step.contextRefs != null && !Array.isArray(step.contextRefs)) {
    add(errors, `${path}.contextRefs`, "invalid_context_refs", "contextRefs must be an array.");
  } else {
    for (const [contextIndex, reference] of (step.contextRefs ?? []).entries()) {
      if (!nonEmpty(reference)) {
        add(errors, `${path}.contextRefs[${contextIndex}]`, "invalid_context_ref", "Context reference is invalid.");
      } else if (reference.startsWith("input.") && !inputKeys.has(reference.slice("input.".length))) {
        add(errors, `${path}.contextRefs[${contextIndex}]`, "unknown_input", `Unknown input reference "${reference}".`);
      }
    }
  }
}

function validateCondition(step, index, errors) {
  const path = `steps[${index}]`;
  if (!CONDITION.test(step.expr ?? "")) {
    add(
      errors,
      `${path}.expr`,
      "invalid_condition",
      "Condition must be a workflow step-state equality check.",
    );
  }
  if (!nonEmpty(step.then) || !nonEmpty(step.else)) {
    add(errors, path, "invalid_condition_target", "Condition requires then and else targets.");
  }
}

function validateApproval(step, index, errors) {
  const path = `steps[${index}]`;
  if (!nonEmpty(step.gate)) {
    add(errors, `${path}.gate`, "missing_approval_gate", "Approval gate role is required.");
  }
  if (!PAYLOAD_REF.test(step.payloadRef ?? "")) {
    add(errors, `${path}.payloadRef`, "invalid_payload_ref", "Approval payloadRef must target a prior step result.");
  }
}

function validateArtifact(step, index, errors) {
  const path = `steps[${index}]`;
  if (!ARTIFACT_ACTIONS.has(step.action)) {
    add(errors, `${path}.action`, "invalid_artifact_action", "Artifact action is not supported.");
  }
  if (!nonEmpty(step.template)) {
    add(errors, `${path}.template`, "missing_artifact_template", "Artifact template is required.");
  }
}

function validateDecision(step, index, errors) {
  const path = `steps[${index}]`;
  if (!nonEmpty(step.rationale)) {
    add(errors, `${path}.rationale`, "missing_decision_rationale", "Decision rationale is required.");
  }
}

export function validateWorkflowDefinition(definition) {
  const errors = [];
  if (!isRecord(definition)) {
    add(errors, "$", "invalid_definition", "Workflow definition must be an object.");
    return { valid: false, errors, entryStepId: null, reachableStepIds: [] };
  }
  if (definition.schema !== WORKFLOW_SCHEMA) {
    add(errors, "schema", "unsupported_schema", `Schema must be ${WORKFLOW_SCHEMA}.`);
  }
  if (!WORKFLOW_ID.test(definition.id ?? "")) {
    add(errors, "id", "invalid_workflow_id", "Workflow id is invalid.");
  }
  if (!nonEmpty(definition.name)) add(errors, "name", "missing_name", "Workflow name is required.");
  if (!Number.isSafeInteger(definition.version) || definition.version < 1) {
    add(errors, "version", "invalid_version", "Workflow version must be a positive integer.");
  }
  if (!isRecord(definition.trigger) || !["manual", "panel-message"].includes(definition.trigger.kind)) {
    add(errors, "trigger", "invalid_trigger", "Workflow trigger must be manual or panel-message.");
  }
  if (!Array.isArray(definition.inputs)) {
    add(errors, "inputs", "invalid_inputs", "Workflow inputs must be an array.");
  }
  const inputKeys = new Set();
  for (const [index, input] of (Array.isArray(definition.inputs) ? definition.inputs : []).entries()) {
    const path = `inputs[${index}]`;
    if (!isRecord(input) || !INPUT_KEY.test(input.key ?? "")) {
      add(errors, path, "invalid_input", "Workflow input is invalid.");
      continue;
    }
    if (inputKeys.has(input.key)) add(errors, `${path}.key`, "duplicate_input", `Duplicate input "${input.key}".`);
    inputKeys.add(input.key);
    if (!["string", "number", "boolean", "record-ref", "document-ref", "json"].includes(input.type)) {
      add(errors, `${path}.type`, "invalid_input_type", "Workflow input type is invalid.");
    }
    if (input.type === "record-ref" && !nonEmpty(input.database)) {
      add(errors, `${path}.database`, "missing_input_database", "record-ref input requires a database.");
    }
  }
  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    add(errors, "steps", "missing_steps", "Workflow requires at least one step.");
    return { valid: false, errors, entryStepId: null, reachableStepIds: [] };
  }

  const byId = new Map();
  for (const [index, step] of definition.steps.entries()) {
    if (!validateCommonStep(step, index, errors)) continue;
    if (byId.has(step.id)) {
      add(errors, `steps[${index}].id`, "duplicate_step_id", `Duplicate step id "${step.id}".`);
    }
    byId.set(step.id, step);
    if (step.kind === "role-assign") validateRoleAssign(step, index, errors, inputKeys);
    else if (step.kind === "condition") validateCondition(step, index, errors);
    else if (step.kind === "approval") validateApproval(step, index, errors);
    else if (step.kind === "artifact") validateArtifact(step, index, errors);
    else if (step.kind === "decision") validateDecision(step, index, errors);
    if (step.kind !== "condition" && step.next !== null && !nonEmpty(step.next)) {
      add(errors, `steps[${index}].next`, "invalid_next", "next must be a step id or null.");
    }
  }

  for (const [index, step] of definition.steps.entries()) {
    if (!isRecord(step)) continue;
    for (const target of stepTargets(step)) {
      if (!TERMINALS.has(target) && !byId.has(target)) {
        add(errors, `steps[${index}]`, "unknown_step_target", `Unknown step target "${target}".`);
      }
    }
    if (step.kind === "condition") {
      const stateRef = CONDITION.exec(step.expr ?? "")?.[1];
      if (stateRef && !byId.has(stateRef)) {
        add(errors, `steps[${index}].expr`, "unknown_condition_step", `Condition references unknown step "${stateRef}".`);
      }
    }
    if (step.kind === "approval") {
      const payloadStep = PAYLOAD_REF.exec(step.payloadRef ?? "")?.[1];
      if (payloadStep && !byId.has(payloadStep)) {
        add(errors, `steps[${index}].payloadRef`, "unknown_payload_step", `Approval references unknown step "${payloadStep}".`);
      }
    }
    if (step.kind === "role-assign" && step.verification?.required) {
      const verifierId = /^verifier-step:([a-z][a-z0-9_-]*)$/.exec(step.verification.method ?? "")?.[1];
      const verifier = verifierId ? byId.get(verifierId) : null;
      if (!verifierId || !verifier || verifier.kind !== "role-assign" || verifier.role !== "verifier") {
        add(
          errors,
          `steps[${index}].verification.method`,
          "unreachable_verification",
          "Verification method must name a verifier role step.",
        );
      }
    }
  }

  const entryStepId = isRecord(definition.steps[0]) && nonEmpty(definition.steps[0].id)
    ? definition.steps[0].id
    : null;
  const reachable = new Set();
  const visiting = new Set();
  const visited = new Set();
  let terminalReachable = false;

  function visit(stepId) {
    if (TERMINALS.has(stepId)) {
      terminalReachable = true;
      return;
    }
    if (!byId.has(stepId)) return;
    reachable.add(stepId);
    if (visiting.has(stepId)) {
      add(errors, `steps.${stepId}`, "workflow_cycle", `Workflow contains a cycle at "${stepId}".`);
      return;
    }
    if (visited.has(stepId)) return;
    visiting.add(stepId);
    const step = byId.get(stepId);
    const targets = stepTargets(step);
    if (targets.length === 0) terminalReachable = true;
    for (const target of targets) visit(target);
    visiting.delete(stepId);
    visited.add(stepId);
  }
  if (entryStepId) visit(entryStepId);
  for (const stepId of byId.keys()) {
    if (!reachable.has(stepId)) {
      add(errors, `steps.${stepId}`, "unreachable_step", `Step "${stepId}" is not reachable from the entry step.`);
    }
  }
  if (!terminalReachable) {
    add(errors, "steps", "no_terminal_path", "Workflow has no reachable terminal path.");
  }

  return {
    valid: errors.length === 0,
    errors,
    entryStepId,
    reachableStepIds: [...reachable],
  };
}

export function dryRunWorkflowDefinition({
  definition,
  roleResolutions = {},
  knownApprovalRoles = [],
}) {
  const validation = validateWorkflowDefinition(definition);
  const errors = [...validation.errors];
  const sequence = [];
  const approvals = [];
  if (!isRecord(definition) || !Array.isArray(definition.steps)) {
    return { valid: false, errors, dispatches: false, sequence, approvals };
  }
  const knownGates = new Set(knownApprovalRoles);
  for (const step of definition.steps) {
    if (!isRecord(step)) continue;
    if (step.kind === "role-assign") {
      const resolution = roleResolutions[step.role];
      const explicitMatches =
        step.resolution === "explicit-agent-override" &&
        resolution?.agent === step.agentOverride;
      const available =
        resolution?.roleStatus === "active" &&
        resolution.agentStatus === "active" &&
        nonEmpty(resolution.bindingRef) &&
        resolution.authReady === true &&
        resolution.execution === step.execution &&
        (step.resolution === "primary-active-occupant" || explicitMatches);
      if (!available) {
        add(
          errors,
          `steps.${step.id}.role`,
          "role_unavailable",
          `Role "${step.role}" has no eligible ${step.execution} runtime resolution.`,
        );
      }
      sequence.push({
        stepId: step.id,
        kind: step.kind,
        title: step.title,
        role: step.role,
        agent: resolution?.agent ?? null,
        bindingRef: resolution?.bindingRef ?? null,
        adapterId: resolution?.adapterId ?? null,
        execution: step.execution,
        mediatedAuthority: step.mediatedAuthority ?? null,
        verificationRequired: step.verification?.required === true,
        dispatches: false,
      });
    } else if (step.kind === "approval") {
      if (!knownGates.has(step.gate)) {
        add(errors, `steps.${step.id}.gate`, "unknown_approval_gate", `Unknown approval role "${step.gate}".`);
      }
      const approval = {
        stepId: step.id,
        gate: step.gate,
        payloadRef: step.payloadRef,
        payloadBound: true,
      };
      approvals.push(approval);
      sequence.push({ ...approval, kind: step.kind, title: step.title, dispatches: false });
    } else {
      sequence.push({
        stepId: step.id,
        kind: step.kind,
        title: step.title,
        ...(step.kind === "condition"
          ? { expression: step.expr, then: step.then, else: step.else }
          : {}),
        ...(step.kind === "artifact"
          ? { action: step.action, simulated: step.action === "simulate-consequential-action" }
          : {}),
        dispatches: false,
      });
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    dispatches: false,
    sequence,
    approvals,
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

export function canonicalWorkflowJson(definition) {
  return JSON.stringify(stable(definition));
}

export async function workflowDefinitionHash(definition) {
  const bytes = new TextEncoder().encode(canonicalWorkflowJson(definition));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
