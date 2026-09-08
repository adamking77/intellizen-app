import { describe, expect, it, vi } from "vitest";

import type {
  WorkflowApprovalStep,
  WorkflowDefinitionV1,
  WorkflowRoleAssignStep,
  WorkflowStep,
} from "@/lib/workflow-schema";
import {
  type ResolvedWorkflowRole,
  type WorkflowAssignmentSnapshot,
  WorkflowDispatchError,
  type WorkflowRunnerPort,
  type WorkflowSideSettlementRequest,
  type WorkflowStepState,
} from "@/services/workflow-runner";
import { runApprovalMeanwhile } from "./workflow-meanwhile-runtime";

const approvalStep: WorkflowApprovalStep = {
  id: "approval",
  kind: "approval",
  title: "Founder approval",
  gate: "founder",
  payloadRef: "steps.prior.result",
  meanwhile: ["side"],
  reminder: "never",
  next: null,
};

const sideStep: WorkflowRoleAssignStep = {
  id: "side",
  kind: "role-assign",
  title: "Check references",
  role: "researcher",
  resolution: "primary-active-occupant",
  instructions: "Check the supplied references.",
  execution: "ephemeral",
  mediatedAuthority: "read-only",
  verification: { required: false },
  timeoutMinutes: 10,
  next: null,
};

const definition: WorkflowDefinitionV1 = {
  schema: "intellizen.workflow/1",
  id: "meanwhile-test",
  name: "Meanwhile test",
  version: 1,
  trigger: { kind: "manual" },
  inputs: [],
  steps: [approvalStep, sideStep],
};

const codexResolution: ResolvedWorkflowRole = {
  role: "researcher",
  roleRecordId: "role-researcher",
  roleAuthorityCeiling: "read-only",
  ownerGate: "allowlist",
  delegationPolicy: "leaf-worker",
  verificationEligible: false,
  agent: "codex",
  agentRecordId: "agent-codex",
  bindingRef: "codex-acp",
  adapterId: "acp",
  providerEngine: "codex",
  resolvedModel: null,
  execution: "ephemeral",
  providerAuthority: "read-only",
  unmanagedAuthority: "none",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function fixture(input: {
  state?: WorkflowStepState;
  resolveRole?: WorkflowRunnerPort["resolveRole"];
  dispatch?: WorkflowRunnerPort["dispatch"];
  settleSideStep?: NonNullable<WorkflowRunnerPort["settleSideStep"]>;
} = {}) {
  const stepStates: Record<string, WorkflowStepState> = { approval: "running", side: input.state ?? "queued" };
  const stepResults: Record<string, unknown> = {};
  const assignments: Record<string, WorkflowAssignmentSnapshot> = {};
  const transitions: Array<{
    sideStepId: string;
    nextSideStepState: WorkflowStepState;
    eventKind: string;
    idempotencyKey: string;
  }> = [];
  let id = 0;
  const port = {
    now: () => "2026-09-07T00:00:00.000Z",
    newId: () => `id-${++id}`,
    resolveRole: input.resolveRole ?? (async () => codexResolution),
    dispatch: input.dispatch ?? (async () => ({ sessionId: "session-side", result: { checked: true } })),
    ...(input.settleSideStep ? { settleSideStep: input.settleSideStep } : {}),
  };
  return {
    stepStates,
    stepResults,
    assignments,
    transitions,
    port,
    run: () => runApprovalMeanwhile({
      approvalStep,
      steps: new Map<string, WorkflowStep>([[approvalStep.id, approvalStep], [sideStep.id, sideStep]]),
      stepStates,
      stepResults,
      assignments,
      runner: {
        runId: "run-1",
        actor: "founder",
        definition,
        inputs: {},
        maxContextBytes: 12_000,
        executionIdentity: { executionVersion: 1, definitionHash: "a".repeat(64) },
      },
      port,
      transitionSideStep: async (request) => {
        transitions.push(request);
        stepStates[request.sideStepId] = request.nextSideStepState;
      },
      dispatchFailure: (error) => new WorkflowDispatchError({ reason: "runtime_failed", message: error instanceof Error ? error.message : "failed" }),
    }),
  };
}

describe("runApprovalMeanwhile", () => {
  it("claims a queued side step once, returns while its provider is pending, and settles that assignment", async () => {
    const provider = deferred<{ sessionId: string; result: unknown }>();
    const settled = deferred<void>();
    const settlements: WorkflowSideSettlementRequest[] = [];
    const dispatch = vi.fn(async () => provider.promise);
    const settleSideStep = async (request: WorkflowSideSettlementRequest) => {
      settlements.push(request);
      settled.resolve();
      return { runVersion: 2 };
    };
    const flow = fixture({ dispatch, settleSideStep });

    await flow.run();

    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ readOnly: true }));
    expect(flow.transitions).toEqual([expect.objectContaining({
      sideStepId: "side",
      nextSideStepState: "running",
      eventKind: "meanwhile_assignment_created",
      idempotencyKey: `run:run-1:execution:1:${"a".repeat(64)}:meanwhile:side:started`,
    })]);
    expect(settlements).toEqual([]);
    const assignmentId = flow.assignments.side.assignmentId;

    provider.resolve({ sessionId: "session-side", result: { checked: true } });
    await settled.promise;

    expect(settlements).toEqual([expect.objectContaining({ sideStepId: "side", assignmentId, nextSideStepState: "completed", eventKind: "meanwhile_completed", eventPayload: expect.objectContaining({ assignmentId, runtimeSessionId: "session-side" }) })]);
  });

  it.each(["running", "completed"] as const)("does not redispatch an existing %s side step on restart", async (state) => {
    const dispatch = vi.fn(async () => ({ sessionId: "unexpected", result: {} }));
    const flow = fixture({ state, dispatch });
    flow.assignments.side = {} as WorkflowAssignmentSnapshot;

    await flow.run();

    expect(dispatch).not.toHaveBeenCalled();
    expect(flow.transitions).toEqual([]);
  });

  it("blocks an unsupported binding without dispatching it", async () => {
    const dispatch = vi.fn(async () => ({ sessionId: "unexpected", result: {} }));
    const flow = fixture({
      dispatch,
      resolveRole: async () => ({ ...codexResolution, adapterId: "hermes", providerEngine: undefined }),
    });

    await flow.run();

    expect(dispatch).not.toHaveBeenCalled();
    expect(flow.transitions).toEqual([expect.objectContaining({ sideStepId: "side", nextSideStepState: "blocked", eventKind: "meanwhile_blocked" })]);
  });
});
