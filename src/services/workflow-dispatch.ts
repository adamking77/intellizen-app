import {
  GENZEN_WORKSPACE_DATABASE_IDS,
  OPERATOR_ACTOR,
} from "@/lib/data";
import { runAcpPrompt } from "@/engine/acp-session";
import {
  listExecutionTargets,
  type ExecutionTarget,
} from "@/engine/execution-targets";
import { supabase } from "@/lib/supabase";
import type { WorkflowRunItem } from "@/lib/types";
import { requiredNonNegativeInteger } from "@/lib/validated-number";
import {
  assertWorkflowDefinitionIdentity,
  validateWorkflowDefinition,
  type WorkflowDefinitionV1,
  type WorkflowRoleAssignStep,
} from "@/lib/workflow-schema";
import { getGatewayClient } from "@/engine/gateway";
import { runPrompt } from "@/engine/session";
import { workflowDispatchPrompt } from "@/services/agent";
import {
  WorkflowDispatchCoordinator,
  WorkflowDispatchError,
  type ResolvedWorkflowRole,
  type WorkflowRoleResolutionBlocker,
  type WorkflowRunnerPort,
  type WorkflowTransitionRequest,
} from "@/services/workflow-runner";

type WorkspaceRoleRecord = {
  id: string;
  database_id: string;
  fields: Record<string, unknown>;
};

const productionCoordinator = new WorkflowDispatchCoordinator();

function fieldString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstRelation(value: unknown) {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
}

function parseStructuredResult(text: string) {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced) as unknown;
  } catch {
    return { text: text.trim() };
  }
}

function authorityCeiling(value: unknown): ResolvedWorkflowRole["roleAuthorityCeiling"] | null {
  return [
    "read-only",
    "draft-only",
    "local-write",
    "room-write",
    "external-action-request",
  ].includes(String(value))
    ? (value as ResolvedWorkflowRole["roleAuthorityCeiling"])
    : null;
}

function ownerGate(value: unknown): ResolvedWorkflowRole["ownerGate"] | null {
  return ["owner-only", "operator-managed", "allowlist", "disabled"].includes(
    String(value),
  )
    ? (value as ResolvedWorkflowRole["ownerGate"])
    : null;
}

function delegationPolicy(
  value: unknown,
): ResolvedWorkflowRole["delegationPolicy"] | null {
  return ["leaf-worker", "coordinator"].includes(String(value))
    ? (value as ResolvedWorkflowRole["delegationPolicy"])
    : null;
}

export function assertProductionWorkflowArtifacts(
  definition: WorkflowDefinitionV1,
) {
  const unsupported = definition.steps.find(
    (step) =>
      step.kind === "artifact" &&
      step.action !== "simulate-consequential-action",
  );
  if (unsupported?.kind === "artifact") {
    throw new Error(
      `Artifact action ${unsupported.action} is not enabled in the Wave 1 production dispatcher. Use an explicit preview and confirm-write surface.`,
    );
  }
}

async function loadRoleResolver(targets: ExecutionTarget[]) {
  const databaseIds = [
    GENZEN_WORKSPACE_DATABASE_IDS.roles,
    GENZEN_WORKSPACE_DATABASE_IDS.agents,
    GENZEN_WORKSPACE_DATABASE_IDS.roleAssignments,
  ];
  const { data, error } = await supabase
    .schema("workspace")
    .from("records")
    .select("id,database_id,fields")
    .in("database_id", databaseIds);
  if (error) throw new Error(error.message);
  const records = (data ?? []) as WorkspaceRoleRecord[];
  const roles = new Map(
    records
      .filter(
        (record) =>
          record.database_id === GENZEN_WORKSPACE_DATABASE_IDS.roles,
      )
      .map((record) => [fieldString(record.fields.role_key), record]),
  );
  const agents = new Map(
    records
      .filter(
        (record) =>
          record.database_id === GENZEN_WORKSPACE_DATABASE_IDS.agents,
      )
      .map((record) => [fieldString(record.fields.agent_key), record]),
  );
  const agentsById = new Map(
    [...agents.values()].map((record) => [record.id, record]),
  );
  const assignments = records.filter(
    (record) =>
      record.database_id ===
        GENZEN_WORKSPACE_DATABASE_IDS.roleAssignments &&
      record.fields.role_assignment_status === "active",
  );
  const assignmentForRole = (roleId: string) =>
    assignments.find(
      (assignment) =>
        firstRelation(assignment.fields.role_assignment_role) === roleId,
    );
  const assignmentForAgent = (agentId: string) =>
    assignments.find(
      (assignment) =>
        firstRelation(assignment.fields.role_assignment_agent) === agentId,
    );
  const targetsByAgent = new Map(targets.map((target) => [target.agentKey, target]));
  const blocked = (
    reason: WorkflowRoleResolutionBlocker["reason"],
    message: string,
  ): WorkflowRoleResolutionBlocker => ({ blocked: true, reason, message });

  return async (
    step: WorkflowRoleAssignStep,
  ): Promise<ResolvedWorkflowRole | WorkflowRoleResolutionBlocker> => {
    const role = roles.get(step.role);
    const authority = authorityCeiling(role?.fields.role_authority_ceiling);
    const gate = ownerGate(role?.fields.role_owner_gate);
    const delegation = delegationPolicy(
      role?.fields.role_delegation_policy,
    );
    if (!role || role.fields.role_status !== "active") {
      return blocked(
        "role_unavailable",
        `Role ${step.role} is missing or inactive.`,
      );
    }
    if (!authority || !gate || !delegation) {
      return blocked(
        "role_contract_invalid",
        `Role ${step.role} has an incomplete authority contract.`,
      );
    }

    let assignment = assignmentForRole(role.id);
    let agent = assignment
      ? agentsById.get(
          firstRelation(assignment.fields.role_assignment_agent) ?? "",
        )
      : undefined;
    if (step.resolution === "explicit-agent-override") {
      agent = agents.get(step.agentOverride ?? "");
      assignment = agent ? assignmentForAgent(agent.id) : undefined;
    }
    if (!agent || agent.fields.agent_status !== "active") {
      return blocked(
        "agent_unavailable",
        `Role ${step.role} has no active eligible occupant.`,
      );
    }
    const agentKey = fieldString(agent.fields.agent_key);
    if (!agentKey) {
      return blocked(
        "agent_unavailable",
        `Role ${step.role} resolves to an agent without a stable key.`,
      );
    }

    const target = targetsByAgent.get(agentKey);
    if (!target) {
      return blocked(
        "binding_unavailable",
        `Agent ${agentKey} has no available Hermes profile or ACP target for ${step.role}.`,
      );
    }
    if (step.modelOverride && step.modelOverride !== target.model) {
      return blocked(
        "model_not_allowed",
        `Model ${step.modelOverride} is not the configured model for ${target.ref}.`,
      );
    }
    return {
      role: step.role,
      roleRecordId: role.id,
      roleAuthorityCeiling: authority,
      ownerGate: gate,
      delegationPolicy: delegation,
      verificationEligible:
        role.fields.role_verification_eligible === true,
      agent: agentKey,
      agentRecordId: agent.id,
      bindingRef: target.ref,
      adapterId: target.kind,
      resolvedModel: target.model,
      execution: target.execution,
      providerAuthority: target.kind === "hermes" ? "Hermes profile and API run controls" : "ACP agent permission protocol",
      unmanagedAuthority: target.kind === "hermes" ? "Hermes host process and current macOS user" : "ACP adapter process and current macOS user",
    };
  };
}

function workflowPrompt(input: {
  renderedContext: string;
  step: WorkflowRoleAssignStep;
}) {
  return [
    input.renderedContext,
    "",
    input.step.instructions,
    "",
    input.step.role === "verifier"
      ? 'Return only JSON: {"status":"passed|failed|inconclusive","method":"...","evidence":["..."],"notes":"..."}.'
      : 'Return only JSON: {"status":"completed","result":"...","constraints":["..."]}.',
    "Do not call tools unless the delegation envelope explicitly grants them.",
    "Do not send, publish, deploy, contact anyone, or claim unperformed verification.",
  ].join("\n");
}

async function productionPort(
  targets: ExecutionTarget[],
): Promise<WorkflowRunnerPort> {
  const targetsByRef = new Map(targets.map((target) => [target.ref, target]));
  const resolveRole = await loadRoleResolver(targets);
  return {
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
    acquireLease: async (input) => {
      const { data, error } = await supabase
        .schema("workspace")
        .rpc("acquire_workflow_dispatch_lease", {
          p_workflow_run_id: input.runId,
          p_expected_run_version: input.expectedRunVersion,
          p_dispatcher_session: input.dispatcherSession,
          p_lease_ttl_seconds: 300,
          p_idempotency_key: input.idempotencyKey,
          p_request_hash: input.requestHash,
          p_actor: input.actor,
        });
      if (error) throw new Error(error.message);
      return {
        runVersion: requiredNonNegativeInteger(data?.run_version, "Run version"),
        fencingToken: requiredNonNegativeInteger(
          data?.fencing_token,
          "Dispatcher fencing token",
        ),
      };
    },
    transition: async (input: WorkflowTransitionRequest) => {
      const { data, error } = await supabase
        .schema("workspace")
        .rpc("transition_workflow_step", {
          p_workflow_run_id: input.runId,
          p_expected_run_version: input.expectedRunVersion,
          p_expected_step_id: input.expectedStepId,
          p_expected_step_state: input.expectedStepState,
          p_next_step_id: input.nextStepId,
          p_next_step_state: input.nextStepState,
          p_next_run_status: input.nextRunStatus,
          p_dispatcher_session: input.dispatcherSession,
          p_fencing_token: input.fencingToken,
          p_idempotency_key: input.idempotencyKey,
          p_request_hash: input.requestHash,
          p_actor: input.actor,
          p_event_kind: input.eventKind,
          p_event_summary: input.eventSummary,
          p_event_payload: input.eventPayload,
          p_approval_mutation: input.approvalMutation ?? null,
        });
      if (error) throw new Error(error.message);
      return {
        runVersion: requiredNonNegativeInteger(data?.run_version, "Run version"),
        fencingToken: requiredNonNegativeInteger(
          data?.fencing_token,
          "Dispatcher fencing token",
        ),
      };
    },
    releaseLease: async (input) => {
      const { data, error } = await supabase
        .schema("workspace")
        .rpc("release_workflow_dispatch_lease", {
          p_workflow_run_id: input.runId,
          p_dispatcher_session: input.dispatcherSession,
          p_fencing_token: input.fencingToken,
          p_actor: input.actor,
          p_idempotency_key: input.idempotencyKey,
          p_request_hash: input.requestHash,
        });
      if (error) throw new Error(error.message);
      return {
        runVersion: requiredNonNegativeInteger(data?.run_version, "Run version"),
      };
    },
    resolveRole,
    dispatch: async ({ step, assignment, renderedContext, signal }) => {
      const target = targetsByRef.get(assignment.selectedBinding);
      if (!target) {
        throw new WorkflowDispatchError({
          reason: "runtime_failed",
          message: "The selected Hermes or ACP target is unavailable.",
          resultKnown: false,
        });
      }
      const text = workflowDispatchPrompt({
        instructions:
          "Execute one bounded internal IntelliZen workflow assignment. Stay inside the supplied envelope.",
        prompt: workflowPrompt({ renderedContext, step }),
      });
      try {
        const turn = target.kind === "hermes"
          ? await runPrompt(getGatewayClient(), {
            profile: target.targetId,
            text,
            timeoutMs: step.timeoutMinutes * 60_000,
            signal,
          })
          : await runAcpPrompt({
            agentId: target.targetId,
            text,
            timeoutMs: step.timeoutMinutes * 60_000,
            signal,
          });
        return {
          sessionId: turn.sessionId,
          result: parseStructuredResult(turn.text),
          usage: null,
        };
      } catch (error) {
        throw new WorkflowDispatchError({
          reason: signal?.aborted ? "cancelled" : "ambiguous_delivery",
          message: error instanceof Error ? error.message : `${target.ref} assignment failed.`,
          resultKnown: false,
        });
      }
    },
    decideApproval: async () => null,
    performArtifact: async ({ runId, step, simulated }) => {
      if (
        !simulated ||
        step.action !== "simulate-consequential-action"
      ) {
        throw new Error(
          "Unconfirmed artifact writes are disabled in the Wave 1 production dispatcher.",
        );
      }
      return {
        artifactRef: `simulation://intellizen/workflow/${runId}/${step.id}`,
        simulated: true,
      };
    },
  };
}

function parsedRunContext(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function dispatchWorkflowRun(
  run: WorkflowRunItem,
  signal?: AbortSignal,
) {
  if (
    run.schema_version !== "intellizen.workflow/1" ||
    run.run_version == null
  ) {
    return null;
  }
  const definition = run.definition_snapshot as WorkflowDefinitionV1;
  const validation = validateWorkflowDefinition(definition);
  if (!validation.valid) {
    throw new Error("The stored Workflow Run definition snapshot is invalid.");
  }
  await assertWorkflowDefinitionIdentity(definition, run.definition_hash);
  assertProductionWorkflowArtifacts(definition);
  const context = parsedRunContext(run.context);
  const inputs =
    context.context &&
    typeof context.context === "object" &&
    !Array.isArray(context.context)
      ? (context.context as Record<string, unknown>)
      : {};
  const targets = await listExecutionTargets();
  const port = await productionPort(targets);
  return productionCoordinator.start(
    {
      runId: run.id,
      runVersion: run.run_version,
      actor: fieldString(context.requested_by) ?? OPERATOR_ACTOR,
      definition,
      inputs,
      sourceRecords:
        run.source_records
          ?.split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean) ?? [],
      sourcePaths: [],
      sourceTools: [],
      signal,
    },
    port,
  );
}
