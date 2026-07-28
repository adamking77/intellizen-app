import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import type { WorkflowTemplateItem } from "@/lib/types";
import {
  validateWorkflowDefinition,
  type WorkflowDefinitionV1,
  type WorkflowRoleAssignStep,
} from "@/lib/workflow-schema";

export type WorkflowCatalogState =
  | "runnable"
  | "draft"
  | "blocked"
  | "needs-review"
  | "sop-only";

export type WorkflowBlockerKind =
  | "definition"
  | "role"
  | "assignment"
  | "binding"
  | "runtime"
  | "approval";

export type WorkflowBlocker = {
  kind: WorkflowBlockerKind;
  stepId: string | null;
  message: string;
};

export type WorkflowCatalogItem = {
  workflow: WorkflowTemplateItem;
  state: WorkflowCatalogState;
  executable: boolean;
  runnable: boolean;
  definition: WorkflowDefinitionV1 | null;
  blockers: WorkflowBlocker[];
};

function displayRole(roleKey: string) {
  return roleKey.replace(/_/g, " ");
}

function resolveRoleStep(
  step: WorkflowRoleAssignStep,
  roleTargets: AgentPanelRoleTarget[],
): WorkflowBlocker[] {
  const role = roleTargets.find((target) => target.roleKey === step.role);
  if (!role) {
    return [{
      kind: "role",
      stepId: step.id,
      message: `${step.title}: role “${displayRole(step.role)}” is not active.`,
    }];
  }

  const runtimeTarget =
    step.resolution === "explicit-agent-override"
      ? roleTargets.find((target) => target.agentKey === step.agentOverride)
      : role;
  if (!runtimeTarget?.agentKey) {
    return [{
      kind: "assignment",
      stepId: step.id,
      message:
        step.resolution === "explicit-agent-override"
          ? `${step.title}: override agent “${step.agentOverride ?? "unset"}” has no active assignment.`
          : `${step.title}: ${role.roleName} has no active occupant.`,
    }];
  }
  if (!runtimeTarget.bindingRef || !runtimeTarget.adapterId) {
    return [{
      kind: "binding",
      stepId: step.id,
      message: `${step.title}: ${runtimeTarget.agentName ?? runtimeTarget.agentKey} has no runtime binding.`,
    }];
  }
  if (
    runtimeTarget.state !== "ready" ||
    runtimeTarget.execution !== step.execution
  ) {
    return [{
      kind: "runtime",
      stepId: step.id,
      message: `${step.title}: ${runtimeTarget.bindingRef} cannot provide ${step.execution} execution.`,
    }];
  }
  return [];
}

export function classifyWorkflow(
  workflow: WorkflowTemplateItem,
  roleTargets: AgentPanelRoleTarget[],
): WorkflowCatalogItem {
  if (workflow.definition === null || workflow.definition === undefined) {
    return {
      workflow,
      state: "sop-only",
      executable: false,
      runnable: false,
      definition: null,
      blockers: [],
    };
  }

  const validation = validateWorkflowDefinition(workflow.definition);
  if (!validation.valid) {
    return {
      workflow,
      state: "needs-review",
      executable: false,
      runnable: false,
      definition: null,
      blockers: validation.errors.map((error) => ({
        kind: "definition",
        stepId: null,
        message: `${error.path}: ${error.message}`,
      })),
    };
  }

  const definition = workflow.definition as WorkflowDefinitionV1;
  if (workflow.status !== "Active") {
    return {
      workflow,
      state: "draft",
      executable: true,
      runnable: false,
      definition,
      blockers: [],
    };
  }

  const blockers: WorkflowBlocker[] = [];
  for (const step of definition.steps) {
    if (step.kind === "role-assign") {
      blockers.push(...resolveRoleStep(step, roleTargets));
    }
    if (
      step.kind === "approval" &&
      !roleTargets.some((role) => role.roleKey === step.gate)
    ) {
      blockers.push({
        kind: "approval",
        stepId: step.id,
        message: `${step.title}: approval role “${displayRole(step.gate)}” is not active.`,
      });
    }
  }

  return {
    workflow,
    state: blockers.length > 0 ? "blocked" : "runnable",
    executable: true,
    runnable: blockers.length === 0,
    definition,
    blockers,
  };
}

export function buildWorkflowCatalog(
  workflows: WorkflowTemplateItem[],
  roleTargets: AgentPanelRoleTarget[],
) {
  return workflows.map((workflow) => classifyWorkflow(workflow, roleTargets));
}

export function runnableWorkflows(
  workflows: WorkflowTemplateItem[],
  roleTargets: AgentPanelRoleTarget[],
) {
  return buildWorkflowCatalog(workflows, roleTargets)
    .filter((item) => item.runnable)
    .map((item) => item.workflow);
}
