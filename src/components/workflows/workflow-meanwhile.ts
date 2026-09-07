import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import type { WorkflowRunItem } from "@/lib/types";
import { validateWorkflowDefinition, type WorkflowApprovalStep, type WorkflowDefinitionV1, type WorkflowRoleAssignStep } from "@/lib/workflow-schema";

export const MEANWHILE_BINDING_BLOCKER = "Meanwhile work requires a Codex ACP binding with enforced read-only mode.";

export function meanwhileRunSummary(run: Pick<WorkflowRunItem, "definition_snapshot" | "current_step_id" | "step_states">) {
  if (!validateWorkflowDefinition(run.definition_snapshot).valid) return "Independent work details are unavailable.";
  const definition = run.definition_snapshot as WorkflowDefinitionV1;
  const approval = definition.steps.find((step) => step.id === run.current_step_id);
  if (approval?.kind !== "approval" || !approval.meanwhile?.length) return "No independent work is scheduled for this approval.";
  const states = run.step_states && typeof run.step_states === "object" && !Array.isArray(run.step_states)
    ? run.step_states as Record<string, unknown> : {};
  return approval.meanwhile.map((id) => {
    const title = definition.steps.find((step) => step.id === id)?.title ?? id;
    const state = states[id];
    const label = state === "running" ? "started; no completion recorded"
      : state === "queued" ? "waiting to start"
      : state === "completed" ? "completed"
      : state === "blocked" || state === "failed" || state === "cancelled" || state === "abandoned" ? state
      : "status not recorded";
    return `${title} — ${label}`;
  }).join(" · ");
}

/** The schema is the authority for whether a side step is safe to schedule. */
export function eligibleMeanwhileSteps(definition: WorkflowDefinitionV1, approval: WorkflowApprovalStep) {
  const approvalIndex = definition.steps.findIndex((step) => step.id === approval.id);
  return definition.steps.flatMap((candidate) => {
    if (candidate.kind !== "role-assign" || candidate.id === approval.id) return [];
    const next = {
      ...definition,
      steps: definition.steps.map((step) => step.id === approval.id && step.kind === "approval"
        ? { ...step, meanwhile: step.meanwhile?.includes(candidate.id) ? step.meanwhile : [...(step.meanwhile ?? []), candidate.id] }
        : step),
    };
    const field = `steps[${approvalIndex}].meanwhile[`;
    return validateWorkflowDefinition(next).errors.some((error) => error.path.startsWith(field)) ? [] : [candidate];
  });
}

export function meanwhileBindingBlocker(step: WorkflowRoleAssignStep, roleTargets: AgentPanelRoleTarget[]) {
  const binding = step.resolution === "explicit-agent-override"
    ? roleTargets.find((target) => target.agentKey === step.agentOverride)
    : roleTargets.find((target) => target.roleKey === step.role);
  return binding?.state === "ready" && binding.adapterId === "acp" && binding.engine?.toLowerCase() === "codex"
    ? null
    : MEANWHILE_BINDING_BLOCKER;
}
