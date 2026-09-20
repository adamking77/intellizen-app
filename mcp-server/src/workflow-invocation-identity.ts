const PRINCIPAL_ENV = "INTELLIZEN_MCP_CALLER_PRINCIPAL";
const START_WORKFLOW_ENV = "INTELLIZEN_MCP_START_WORKFLOW";

export type WorkflowInvocationIdentity = Readonly<{
  principalActor: string;
  mayStartWorkflow: boolean;
  source: "operator-launch-config";
}>;

function configuredValue(value: string | undefined, name: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || trimmed.length > 80 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new Error(`${name} is missing or invalid.`);
  }
  return trimmed;
}

/**
 * Read once when the operator-owned MCP launcher creates the server process.
 * Tool arguments must never be passed to this function.
 */
export function workflowInvocationIdentityFromLaunchConfig(
  env: NodeJS.ProcessEnv,
): WorkflowInvocationIdentity {
  const principalActor = configuredValue(env[PRINCIPAL_ENV], PRINCIPAL_ENV);
  const startWorkflow = env[START_WORKFLOW_ENV]?.trim() ?? "";
  if (startWorkflow !== "allow" && startWorkflow !== "deny") {
    throw new Error(`${START_WORKFLOW_ENV} must be allow or deny.`);
  }
  return Object.freeze({
    principalActor,
    mayStartWorkflow: startWorkflow === "allow",
    source: "operator-launch-config" as const,
  });
}

export function assertWorkflowInvocationIdentity(
  identity: WorkflowInvocationIdentity,
  requestedBy: unknown,
) {
  if (!identity.mayStartWorkflow) {
    throw new Error(
      `Authenticated MCP caller ${identity.principalActor} is not allowed to start workflows.`,
    );
  }
  if (requestedBy !== identity.principalActor) {
    throw new Error(
      `start_workflow requested_by must match authenticated MCP caller ${identity.principalActor}.`,
    );
  }
}
