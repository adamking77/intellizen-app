export {
  assertWorkflowDefinitionIdentity,
  canonicalWorkflowJson,
  dryRunWorkflowDefinition,
  validatedWorkflowDefinitionHash,
  validateWorkflowDefinition,
  workflowDefinitionHash,
} from "../../shared/workflow-schema.mjs";

export type {
  WorkflowDryRunResult,
  WorkflowRoleResolution,
  WorkflowValidationError,
  WorkflowValidationResult,
} from "../../shared/workflow-schema.mjs";

export type WorkflowInputType =
  | "string"
  | "number"
  | "boolean"
  | "record-ref"
  | "document-ref"
  | "json";

export type WorkflowInput = {
  key: string;
  type: WorkflowInputType;
  database?: string;
};

export type WorkflowVerificationPolicy = {
  required: boolean;
  method?: string | null;
};

export type WorkflowRoleAssignStep = {
  id: string;
  kind: "role-assign";
  title: string;
  role: string;
  resolution: "primary-active-occupant" | "explicit-agent-override";
  agentOverride?: string | null;
  overrideReason?: string | null;
  modelOverride?: string | null;
  instructions: string;
  contextRefs?: string[];
  execution: "ephemeral" | "durable";
  mediatedAuthority?:
    | "read-only"
    | "draft-only"
    | "local-write"
    | "room-write"
    | "external-action-request";
  verification: WorkflowVerificationPolicy;
  timeoutMinutes: number;
  next: string | null;
};

export type WorkflowConditionStep = {
  id: string;
  kind: "condition";
  title: string;
  expr: string;
  then: string;
  else: string;
};

export type WorkflowApprovalStep = {
  id: string;
  kind: "approval";
  title: string;
  gate: string;
  payloadRef: string;
  next: string | null;
};

export type WorkflowArtifactStep = {
  id: string;
  kind: "artifact";
  title: string;
  action:
    | "create-doc"
    | "revise-doc"
    | "create-record"
    | "simulate-consequential-action";
  template: string;
  payloadRef?: string | null;
  next: string | null;
};

export type WorkflowDecisionStep = {
  id: string;
  kind: "decision";
  title: string;
  rationale: string;
  next: string | null;
};

export type WorkflowStep =
  | WorkflowRoleAssignStep
  | WorkflowConditionStep
  | WorkflowApprovalStep
  | WorkflowArtifactStep
  | WorkflowDecisionStep;

export type WorkflowDefinitionV1 = {
  schema: "intellizen.workflow/1";
  id: string;
  name: string;
  version: number;
  trigger: { kind: "manual" | "panel-message" };
  inputs: WorkflowInput[];
  steps: WorkflowStep[];
};
