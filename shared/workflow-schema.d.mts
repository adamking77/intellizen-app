export type WorkflowValidationError = {
  path: string;
  code: string;
  message: string;
};

export type WorkflowValidationResult = {
  valid: boolean;
  errors: WorkflowValidationError[];
  entryStepId: string | null;
  reachableStepIds: string[];
};

export type WorkflowRoleResolution = {
  role: string;
  roleStatus: "active" | "retired";
  agent: string | null;
  agentStatus: "active" | "paused" | "retired" | null;
  bindingRef: string | null;
  adapterId: string | null;
  authReady: boolean;
  execution: "ephemeral" | "durable" | null;
  resolution: "primary-active-occupant" | "explicit-agent-override";
};

export type WorkflowDryRunResult = {
  valid: boolean;
  errors: WorkflowValidationError[];
  dispatches: false;
  sequence: Array<Record<string, unknown>>;
  approvals: Array<Record<string, unknown>>;
};

export function validateWorkflowDefinition(
  definition: unknown,
): WorkflowValidationResult;

export function dryRunWorkflowDefinition(input: {
  definition: unknown;
  roleResolutions?: Record<string, WorkflowRoleResolution>;
  knownApprovalRoles?: string[];
}): WorkflowDryRunResult;

export function workflowDefinitionHash(definition: unknown): Promise<string>;

export function canonicalWorkflowJson(definition: unknown): string;
