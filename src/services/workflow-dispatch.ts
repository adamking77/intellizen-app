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
import { listWorkEvents } from "@/lib/data/work-receipts";
import { requiredNonNegativeInteger } from "@/lib/validated-number";
import {
  assertWorkflowDefinitionIdentity,
  validateWorkflowDefinition,
  workflowDefinitionHash,
  type WorkflowDefinitionV1,
  type WorkflowRoleAssignStep,
} from "@/lib/workflow-schema";
import { getGatewayClient } from "@/engine/gateway";
import { runPrompt } from "@/engine/session";
import { workflowDispatchPrompt } from "@/services/agent";
import {
  attachWorkflowTransitionContinuation,
  loadWorkflowRunContinuation,
  type WorkflowExecutionIdentity,
  type WorkflowRunContinuation,
} from "@/lib/workflow-continuation";
import {
  WorkflowDispatchCoordinator,
  WorkflowDispatchError,
  type ResolvedWorkflowRole,
  type WorkflowRoleResolutionBlocker,
  type WorkflowRunnerPort,
  type WorkflowApproval,
  type WorkflowAssignmentSnapshot,
  type WorkflowSideTransitionRequest,
  type WorkflowSideSettlementRequest,
  type WorkflowStepState,
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

export function workflowAcpIsolation(assignmentId: string) {
  return {
    caller: `workflow:${assignmentId}`,
    mode: "read-only" as const,
    isolated: true,
  };
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
      providerEngine: target.engine,
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
  identity: WorkflowExecutionIdentity,
): Promise<WorkflowRunnerPort> {
  const targetsByRef = new Map(targets.map((target) => [target.ref, target]));
  const resolveRole = await loadRoleResolver(targets);
  return {
    now: () => new Date().toISOString(),
    newId: () => crypto.randomUUID(),
    acquireLease: async (input) => {
      let request = input;
      let result = await supabase
        .schema("workspace")
        .rpc("acquire_workflow_dispatch_lease", {
          p_workflow_run_id: request.runId,
          p_expected_run_version: request.expectedRunVersion,
          p_dispatcher_session: request.dispatcherSession,
          p_lease_ttl_seconds: 300,
          p_idempotency_key: request.idempotencyKey,
          p_request_hash: request.requestHash,
          p_actor: request.actor,
        });
      if (result.error?.message.includes("version mismatch")) {
        const { data: runData, error: runError } = await supabase
          .schema("workspace")
          .from("records")
          .select("fields")
          .eq("id", input.runId)
          .single();
        if (runError) throw new Error(runError.message);
        const currentVersion = requiredNonNegativeInteger(
          recordValue(runData?.fields)?.run_version,
          "Run version",
        );
        const { data: intervening, error: eventError } = await supabase
          .schema("workspace")
          .from("work_events")
          .select("event_kind,run_version")
          .eq("workflow_run_id", input.runId)
          .gt("run_version", input.expectedRunVersion)
          .lte("run_version", currentVersion);
        if (eventError) throw new Error(eventError.message);
        if (!intervening?.length || intervening.some((event) =>
          typeof event.event_kind !== "string" || !event.event_kind.startsWith("meanwhile_")
        )) {
          throw new Error(result.error.message);
        }
        const withoutHash = { ...input, expectedRunVersion: currentVersion };
        request = {
          ...withoutHash,
          requestHash: await workflowDefinitionHash(withoutHash),
        };
        result = await supabase.schema("workspace").rpc("acquire_workflow_dispatch_lease", {
          p_workflow_run_id: request.runId,
          p_expected_run_version: request.expectedRunVersion,
          p_dispatcher_session: request.dispatcherSession,
          p_lease_ttl_seconds: 300,
          p_idempotency_key: request.idempotencyKey,
          p_request_hash: request.requestHash,
          p_actor: request.actor,
        });
      }
      const { data, error } = result;
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
      const transition = attachWorkflowTransitionContinuation(input, identity);
      const rpcRequest = {
        p_workflow_run_id: transition.runId,
        p_expected_run_version: transition.expectedRunVersion,
        p_expected_step_id: transition.expectedStepId,
        p_expected_step_state: transition.expectedStepState,
        p_next_step_id: transition.nextStepId,
        p_next_step_state: transition.nextStepState,
        p_next_run_status: transition.nextRunStatus,
        p_dispatcher_session: transition.dispatcherSession,
        p_fencing_token: transition.fencingToken,
        p_idempotency_key: transition.idempotencyKey,
        p_actor: transition.actor,
        p_event_kind: transition.eventKind,
        p_event_summary: transition.eventSummary,
        p_event_payload: transition.eventPayload,
        p_approval_mutation: transition.approvalMutation ?? null,
      };
      const { data, error } = await supabase
        .schema("workspace")
        .rpc("transition_workflow_step", {
          ...rpcRequest,
          p_request_hash: await workflowDefinitionHash(rpcRequest),
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
    transitionSideStep: async (input: WorkflowSideTransitionRequest) => {
      const { data, error } = await supabase
        .schema("workspace")
        .rpc("transition_workflow_side_step", {
          p_workflow_run_id: input.runId,
          p_expected_run_version: input.expectedRunVersion,
          p_approval_step_id: input.approvalStepId,
          p_expected_approval_state: input.expectedApprovalState,
          p_side_step_id: input.sideStepId,
          p_expected_side_step_state: input.expectedSideStepState,
          p_next_side_step_state: input.nextSideStepState,
          p_dispatcher_session: input.dispatcherSession,
          p_fencing_token: input.fencingToken,
          p_idempotency_key: input.idempotencyKey,
          p_request_hash: input.requestHash,
          p_actor: input.actor,
          p_event_kind: input.eventKind,
          p_event_summary: input.eventSummary,
          p_event_payload: input.eventPayload,
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
    settleSideStep: async (input: WorkflowSideSettlementRequest) => {
      const deadline = Date.now() + 30 * 60_000;
      let delayMs = 500;
      while (true) {
        const { data, error } = await supabase.schema("workspace").rpc(
          "settle_workflow_side_step",
          {
          p_workflow_run_id: input.runId,
          p_approval_step_id: input.approvalStepId,
          p_side_step_id: input.sideStepId,
          p_expected_side_step_state: input.expectedSideStepState,
          p_next_side_step_state: input.nextSideStepState,
          p_assignment_id: input.assignmentId,
          p_idempotency_key: input.idempotencyKey,
          p_request_hash: input.requestHash,
          p_actor: input.actor,
          p_event_kind: input.eventKind,
          p_event_summary: input.eventSummary,
          p_event_payload: input.eventPayload,
          },
        );
        if (!error) {
          return {
            runVersion: requiredNonNegativeInteger(data?.run_version, "Run version"),
          };
        }
        if (!error.message.includes("waits for active dispatcher lease") || Date.now() >= deadline) {
          throw new Error(error.message);
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        delayMs = Math.min(delayMs * 2, 10_000);
      }
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
    dispatch: async ({ step, assignment, renderedContext, signal, readOnly }) => {
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
            ...(readOnly ? workflowAcpIsolation(assignment.assignmentId) : {}),
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

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

const WORKFLOW_STEP_STATES = new Set<WorkflowStepState>([
  "queued", "running", "awaiting_input", "suspended", "blocked",
  "completed", "failed", "cancelled", "abandoned",
]);

async function loadWorkflowRuntimeSnapshot(
  run: WorkflowRunItem,
  continuation: WorkflowRunContinuation,
) {
  const stepStates = Object.fromEntries(
    Object.entries(continuation.stepStates).filter(
      (entry): entry is [string, WorkflowStepState] =>
        typeof entry[1] === "string" && WORKFLOW_STEP_STATES.has(entry[1] as WorkflowStepState),
    ),
  );
  const approvals = Object.fromEntries(
    Object.entries(recordValue(run.approvals) ?? {}).filter(([, value]) => {
      const approval = recordValue(value);
      return typeof approval?.approvalId === "string" && typeof approval.stepId === "string";
    }),
  ) as Record<string, WorkflowApproval>;
  const assignments: Record<string, WorkflowAssignmentSnapshot> = {};
  const stepResults: Record<string, unknown> = { ...continuation.stepResults };
  const events = await listWorkEvents({ workflowRunId: run.id, limit: 10_000 });
  events.sort((left, right) =>
    (left.run_version ?? 0) - (right.run_version ?? 0)
      || left.created_at.localeCompare(right.created_at)
      || left.id.localeCompare(right.id)
  );
  for (const event of events) {
    const payload = recordValue(event.payload) ?? {};
    const assignmentPayload = recordValue(payload.assignment);
    const resolution = recordValue(payload.resolution);
    const envelope = recordValue(payload.envelope);
    const assignmentEnvelope = recordValue(assignmentPayload?.envelope);
    const stepId = event.step_id
      ?? fieldString(recordValue(assignmentEnvelope?.parent)?.stepId)
      ?? fieldString(recordValue(envelope?.parent)?.stepId);
    if (!stepId) continue;
    if (assignmentPayload) {
      assignments[stepId] = assignmentPayload as WorkflowAssignmentSnapshot;
    } else if (event.event_kind === "assignment_created" && resolution && envelope) {
      assignments[stepId] = {
        assignmentId: fieldString(payload.assignmentId) ?? event.assignment_id ?? "",
        requestedRole: fieldString(resolution.requestedRole) ?? "",
        selectedAgent: fieldString(resolution.selectedAgent) ?? event.actor,
        selectedBinding: fieldString(resolution.selectedBinding) ?? "",
        resolutionRule: resolution.resolutionRule as WorkflowAssignmentSnapshot["resolutionRule"],
        resolutionTimestamp: fieldString(resolution.resolutionTimestamp) ?? event.created_at,
        agentOverride: fieldString(resolution.agentOverride),
        overrideReason: fieldString(resolution.overrideReason),
        runtimeSessionId: event.runtime_session_id ?? null,
        envelope: envelope as WorkflowAssignmentSnapshot["envelope"],
        contextEvidence: (recordValue(payload.contextEvidence)
          ?? {
            sources: [],
            renderedContextHash: "",
            renderedBytes: 0,
            maxBytes: 0,
          }) as WorkflowAssignmentSnapshot["contextEvidence"],
      };
    }
    const assignment = assignments[stepId];
    if (assignment && event.runtime_session_id) {
      assignment.runtimeSessionId = event.runtime_session_id;
    }
  }
  return { stepStates, stepResults, assignments, approvals };
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
  const continuation = await loadWorkflowRunContinuation(run.id);
  const definition = continuation.definitionSnapshot as WorkflowDefinitionV1;
  const validation = validateWorkflowDefinition(definition);
  if (!validation.valid) {
    throw new Error("The stored Workflow Run definition snapshot is invalid.");
  }
  await assertWorkflowDefinitionIdentity(
    definition,
    continuation.identity.definitionHash,
  );
  assertProductionWorkflowArtifacts(definition);
  const context = parsedRunContext(run.context);
  const inputs =
    context.context &&
    typeof context.context === "object" &&
    !Array.isArray(context.context)
      ? (context.context as Record<string, unknown>)
      : {};
  const targets = await listExecutionTargets();
  const port = await productionPort(targets, continuation.identity);
  const snapshot = await loadWorkflowRuntimeSnapshot(run, continuation);
  return productionCoordinator.start(
    {
      runId: run.id,
      runVersion: continuation.runVersion,
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
      currentStepId: continuation.currentStepId,
      executionIdentity: continuation.identity,
      ...snapshot,
      signal,
    },
    port,
  );
}
