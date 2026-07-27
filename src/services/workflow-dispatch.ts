import {
  GENZEN_WORKSPACE_DATABASE_IDS,
  OPERATOR_ACTOR,
} from "@/lib/data";
import {
  assertClaudeWorkerIsolation,
  codexExecArgs,
  getRuntimeAdapter,
  type NormalizedRuntimeEvent,
} from "@/lib/runtime-adapters";
import { supabase } from "@/lib/supabase";
import type { WorkflowRunItem } from "@/lib/types";
import {
  validateWorkflowDefinition,
  type WorkflowDefinitionV1,
  type WorkflowRoleAssignStep,
} from "@/lib/workflow-schema";
import {
  listRuntimeBindings,
  type RuntimeBinding,
} from "@/services/runtime-bindings";
import { runtimeChatResultFromEvents } from "@/services/runtime-chat";
import {
  prepareRuntimeAssignment,
  runRuntime,
} from "@/services/runtimes";
import { runHermesWorkflowAssignment } from "@/services/runtimes/hermes";
import {
  WorkflowDispatchCoordinator,
  WorkflowDispatchError,
  type ResolvedWorkflowRole,
  type WorkflowRunnerPort,
  type WorkflowTransitionRequest,
} from "@/services/workflow-runner";

type WorkspaceRoleRecord = {
  id: string;
  database_id: string;
  fields: Record<string, unknown>;
};

const productionCoordinator = new WorkflowDispatchCoordinator();

function requiredNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

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

async function loadRoleResolver(bindings: RuntimeBinding[]) {
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
        firstRelation(assignment.fields.role_assignment_agent) === agentId &&
        fieldString(assignment.fields.role_assignment_binding_ref),
    );
  const bindingsById = new Map(
    bindings.map((binding) => [binding.bindingId, binding]),
  );

  return async (
    step: WorkflowRoleAssignStep,
  ): Promise<ResolvedWorkflowRole | null> => {
    const role = roles.get(step.role);
    const authority = authorityCeiling(role?.fields.role_authority_ceiling);
    const gate = ownerGate(role?.fields.role_owner_gate);
    const delegation = delegationPolicy(
      role?.fields.role_delegation_policy,
    );
    if (
      !role ||
      role.fields.role_status !== "active" ||
      !authority ||
      !gate ||
      !delegation
    ) {
      return null;
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
    if (!agent || agent.fields.agent_status !== "active") return null;
    const agentKey = fieldString(agent.fields.agent_key);
    if (!agentKey) return null;

    if (
      step.role === "operations_director" &&
      agentKey === "fiona" &&
      step.resolution === "primary-active-occupant"
    ) {
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
        bindingRef: "hermes-fiona",
        adapterId: "hermes",
        resolvedModel: null,
        execution: "durable",
        providerAuthority: "Fiona Hermes profile and API run controls",
        unmanagedAuthority: "Hermes host process and current macOS user",
      };
    }

    const bindingRef = fieldString(
      assignment?.fields.role_assignment_binding_ref,
    );
    const binding = bindingRef ? bindingsById.get(bindingRef) : null;
    if (
      !binding ||
      !["codex-cli", "claude-cli"].includes(binding.adapterId)
    ) {
      return null;
    }
    const resolvedModel = step.modelOverride ?? binding.modelPolicy.default;
    if (
      step.modelOverride &&
      !binding.modelPolicy.allowed.includes(step.modelOverride)
    ) {
      return null;
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
      bindingRef: binding.bindingId,
      adapterId: binding.adapterId as "codex-cli" | "claude-cli",
      resolvedModel,
      execution: "ephemeral",
      providerAuthority:
        binding.adapterId === "codex-cli"
          ? "Codex workspace-write sandbox and worker-only profile"
          : "Claude safe mode, explicit worker tools, and worker-only profile",
      unmanagedAuthority: "Current macOS user outside the provider sandbox",
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

function normalizedRuntimeResult(events: NormalizedRuntimeEvent[]) {
  const result = runtimeChatResultFromEvents(events);
  if (!result.sessionId) {
    throw new Error("Runtime assignment did not return a provider session ID.");
  }
  return {
    sessionId: result.sessionId,
    result: parseStructuredResult(result.text),
    usage: result.usage,
  };
}

async function productionPort(
  bindings: RuntimeBinding[],
): Promise<WorkflowRunnerPort> {
  const bindingsById = new Map(
    bindings.map((binding) => [binding.bindingId, binding]),
  );
  const resolveRole = await loadRoleResolver(bindings);
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
        runVersion: requiredNumber(data?.run_version, "Run version"),
        fencingToken: requiredNumber(
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
        runVersion: requiredNumber(data?.run_version, "Run version"),
        fencingToken: requiredNumber(
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
        runVersion: requiredNumber(data?.run_version, "Run version"),
      };
    },
    resolveRole,
    dispatch: async ({ step, assignment, renderedContext }) => {
      if (assignment.selectedBinding === "hermes-fiona") {
        try {
          const runtime = await runHermesWorkflowAssignment({
            prompt: workflowPrompt({ renderedContext, step }),
            instructions:
              "Execute one bounded internal IntelliZen workflow assignment. Stay inside the supplied envelope.",
            timeoutMs: step.timeoutMinutes * 60_000,
          });
          return {
            sessionId: runtime.runId,
            result: parseStructuredResult(runtime.output),
            usage: runtime.usage,
          };
        } catch (error) {
          throw new WorkflowDispatchError({
            reason: "ambiguous_delivery",
            message:
              error instanceof Error
                ? error.message
                : "Hermes workflow assignment failed.",
            resultKnown: false,
          });
        }
      }

      const binding = bindingsById.get(assignment.selectedBinding);
      if (
        !binding ||
        (binding.adapterId !== "codex-cli" &&
          binding.adapterId !== "claude-cli")
      ) {
        throw new WorkflowDispatchError({
          reason: "runtime_failed",
          message: "The resolved local runtime binding is unavailable.",
          resultKnown: false,
        });
      }
      const grantRoot = binding.workingDirGrants[0];
      if (!grantRoot) {
        throw new WorkflowDispatchError({
          reason: "runtime_failed",
          message: "The runtime binding has no working-directory grant.",
          resultKnown: false,
        });
      }
      const prepared = await prepareRuntimeAssignment(
        grantRoot,
        assignment.assignmentId,
      );
      const adapter = getRuntimeAdapter(binding.adapterId);
      const stdout: string[] = [];
      const runId = `workflow-${assignment.assignmentId}`;
      const exit = await runRuntime(
        {
          runId,
          binary: binding.canonicalBinary,
          args:
            binding.adapterId === "codex-cli"
              ? codexExecArgs(prepared.path)
              : binding.argTemplates,
          workingDirectory: prepared.path,
          stdin: workflowPrompt({ renderedContext, step }),
          timeoutMs: step.timeoutMinutes * 60_000,
          environment:
            binding.adapterId === "codex-cli"
              ? {
                  CODEX_HOME: binding.workerProfileHome,
                  NO_COLOR: "1",
                  TERM: "dumb",
                }
              : {
                  CLAUDE_CONFIG_DIR: binding.workerProfileHome,
                  NO_COLOR: "1",
                  TERM: "dumb",
                },
        },
        (event) => {
          if (event.kind === "stdout" && event.text) stdout.push(event.text);
        },
      );
      if (exit.reason === "timed_out") {
        throw new WorkflowDispatchError({
          reason: "timed_out",
          message: "The local runtime assignment timed out.",
          resultKnown: false,
        });
      }
      if (exit.reason === "cancelled") {
        throw new WorkflowDispatchError({
          reason: "cancelled",
          message: "The local runtime assignment was cancelled.",
          resultKnown: false,
        });
      }
      if (exit.reason !== "completed") {
        throw new WorkflowDispatchError({
          reason: "runtime_failed",
          message: "The local runtime assignment failed.",
          resultKnown: false,
        });
      }
      const events = adapter.normalize(stdout);
      if (binding.adapterId === "claude-cli") {
        assertClaudeWorkerIsolation(events);
      }
      return normalizedRuntimeResult(events);
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

export async function dispatchWorkflowRun(run: WorkflowRunItem) {
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
  assertProductionWorkflowArtifacts(definition);
  const context = parsedRunContext(run.context);
  const inputs =
    context.context &&
    typeof context.context === "object" &&
    !Array.isArray(context.context)
      ? (context.context as Record<string, unknown>)
      : {};
  const bindings = (await listRuntimeBindings()).bindings;
  const port = await productionPort(bindings);
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
    },
    port,
  );
}
