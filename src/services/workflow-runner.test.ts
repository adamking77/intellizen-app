import { describe, expect, it } from "vitest";

import type { WorkflowDefinitionV1, WorkflowRoleAssignStep } from "@/lib/workflow-schema";
import {
  runWorkflow,
  type ResolvedWorkflowRole,
  type WorkflowRunnerPort,
  type WorkflowTransitionRequest,
} from "@/services/workflow-runner";

const definition: WorkflowDefinitionV1 = {
  schema: "intellizen.workflow/1",
  id: "v2-gate4-runner-proof",
  name: "V2 Gate 4 runner proof",
  version: 1,
  trigger: { kind: "manual" },
  inputs: [],
  steps: [
    {
      id: "coordinate",
      kind: "role-assign",
      title: "Coordinate",
      role: "operations_director",
      resolution: "primary-active-occupant",
      instructions: "Coordinate the bounded proof.",
      execution: "durable",
      mediatedAuthority: "draft-only",
      verification: { required: false },
      timeoutMinutes: 30,
      next: "draft",
    },
    {
      id: "draft",
      kind: "role-assign",
      title: "Draft",
      role: "chief_engineer",
      resolution: "primary-active-occupant",
      instructions: "Produce a bounded draft.",
      execution: "ephemeral",
      mediatedAuthority: "draft-only",
      verification: { required: true, method: "verifier-step:verify" },
      timeoutMinutes: 30,
      next: "draft_ok",
    },
    {
      id: "draft_ok",
      kind: "condition",
      title: "Draft completed",
      expr: "steps.draft.state == 'completed'",
      then: "verify",
      else: "blocked",
    },
    {
      id: "verify",
      kind: "role-assign",
      title: "Verify",
      role: "verifier",
      resolution: "explicit-agent-override",
      agentOverride: "keel",
      overrideReason: "Distinct verifier assignment for the Gate 4 proof.",
      instructions: "Verify the draft.",
      execution: "ephemeral",
      mediatedAuthority: "read-only",
      verification: { required: false },
      timeoutMinutes: 30,
      next: "verification_decision",
    },
    {
      id: "verification_decision",
      kind: "decision",
      title: "Record verification",
      rationale: "Record evidence from the distinct verifier assignment.",
      next: "approve",
    },
    {
      id: "approve",
      kind: "approval",
      title: "Founder approval",
      gate: "founder_approval_authority",
      payloadRef: "steps.verify.result",
      next: "simulate",
    },
    {
      id: "simulate",
      kind: "artifact",
      title: "Safe simulation",
      action: "simulate-consequential-action",
      template: "gate4-safe-simulation",
      payloadRef: "steps.verify.result",
      next: null,
    },
  ],
};

function resolution(step: WorkflowRoleAssignStep): ResolvedWorkflowRole | null {
  const byRole: Record<string, ResolvedWorkflowRole> = {
    operations_director: {
      role: "operations_director",
      roleRecordId: "role-operations",
      roleAuthorityCeiling: "room-write",
      ownerGate: "operator-managed",
      delegationPolicy: "coordinator",
      verificationEligible: false,
      agent: "fiona",
      agentRecordId: "agent-fiona",
      bindingRef: "hermes-fiona",
      adapterId: "hermes",
      resolvedModel: null,
      execution: "durable",
      providerAuthority: "Hermes profile controls",
      unmanagedAuthority: "Hermes host process",
    },
    chief_engineer: {
      role: "chief_engineer",
      roleRecordId: "role-engineer",
      roleAuthorityCeiling: "local-write",
      ownerGate: "allowlist",
      delegationPolicy: "leaf-worker",
      verificationEligible: false,
      agent: "keel",
      agentRecordId: "agent-keel",
      bindingRef: "codex-local-primary",
      adapterId: "codex-cli",
      resolvedModel: null,
      execution: "ephemeral",
      providerAuthority: "Codex workspace-write sandbox",
      unmanagedAuthority: "Current macOS user outside provider sandbox",
    },
    verifier: {
      role: "verifier",
      roleRecordId: "role-verifier",
      roleAuthorityCeiling: "read-only",
      ownerGate: "allowlist",
      delegationPolicy: "leaf-worker",
      verificationEligible: true,
      agent: "keel",
      agentRecordId: "agent-keel",
      bindingRef: "codex-local-primary",
      adapterId: "codex-cli",
      resolvedModel: null,
      execution: "ephemeral",
      providerAuthority: "Codex workspace-write sandbox",
      unmanagedAuthority: "Current macOS user outside provider sandbox",
    },
  };
  return byRole[step.role] ?? null;
}

function fakePort(
  options: {
    missingRole?: string;
    approve?: boolean;
    verifierStatus?: "passed" | "failed" | "inconclusive";
  } = {},
) {
  let version = 0;
  let fencingToken = 0;
  let currentStep = definition.steps[0].id;
  const states = Object.fromEntries(
    definition.steps.map((step) => [step.id, "queued"]),
  );
  const transitions: WorkflowTransitionRequest[] = [];
  const approvals: unknown[] = [];
  const artifacts: unknown[] = [];
  let id = 0;

  const port: WorkflowRunnerPort = {
    now: () => "2026-07-27T12:00:00.000Z",
    newId: () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    acquireLease: async (input) => {
      expect(input.expectedRunVersion).toBe(version);
      version += 1;
      fencingToken += 1;
      return { runVersion: version, fencingToken };
    },
    transition: async (input) => {
      expect(input.expectedRunVersion).toBe(version);
      expect(input.expectedStepId).toBe(currentStep);
      expect(input.expectedStepState).toBe(states[currentStep]);
      expect(input.fencingToken).toBe(fencingToken);
      version += 1;
      currentStep = input.nextStepId;
      states[input.nextStepId] = input.nextStepState;
      transitions.push(input);
      return { runVersion: version, fencingToken };
    },
    releaseLease: async (input) => {
      expect(input.fencingToken).toBe(fencingToken);
      version += 1;
      return { runVersion: version };
    },
    resolveRole: async (step) =>
      options.missingRole === step.role ? null : resolution(step),
    dispatch: async ({ step, assignment, renderedContext }) => {
      expect(renderedContext).toContain("[1 POLICY — AUTHORITY]");
      expect(assignment.envelope.role).toBe(step.role);
      return {
        sessionId: `session-${step.id}`,
        result:
          step.role === "verifier"
            ? {
                status: options.verifierStatus ?? "passed",
                evidence: ["fixture:test"],
              }
            : { status: "completed", step: step.id },
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    },
    decideApproval: async (approval) => {
      approvals.push(approval);
      if (options.approve === false) return null;
      return { decision: "approved", decisionMaker: "Adam" };
    },
    performArtifact: async (input) => {
      artifacts.push(input);
      return {
        artifactRef: "simulation://gate4/consequential-action",
        simulated: input.simulated,
      };
    },
  };
  return { port, transitions, approvals, artifacts };
}

describe("workflow runner", () => {
  it("runs the Gate 4 workflow over fenced CAS transitions with exact approval binding", async () => {
    const fake = fakePort();
    const result = await runWorkflow(
      {
        runId: "10000000-0000-4000-8000-000000000001",
        runVersion: 0,
        actor: "Adam",
        definition,
        inputs: {},
        sourceRecords: ["record-1"],
        sourcePaths: ["/bounded/proof"],
        sourceTools: ["list_roles"],
      },
      fake.port,
    );

    expect(result.status).toBe("completed");
    expect(Object.values(result.stepStates)).toEqual(
      expect.arrayContaining(["completed"]),
    );
    expect(result.assignments.coordinate.selectedAgent).toBe("fiona");
    expect(result.assignments.draft.selectedBinding).toBe("codex-local-primary");
    expect(result.assignments.verify.assignmentId).not.toBe(
      result.assignments.draft.assignmentId,
    );
    expect(result.verification).toEqual([
      expect.objectContaining({
        label: "independent agent verification",
        producingAssignmentId: result.assignments.draft.assignmentId,
        verifyingAssignmentId: result.assignments.verify.assignmentId,
        status: "passed",
      }),
    ]);
    expect(result.approvals.approve).toMatchObject({
      requiredRole: "founder_approval_authority",
      payloadRef: "steps.verify.result",
      decision: "approved",
      decisionMaker: "Adam",
    });
    expect(fake.approvals).toHaveLength(1);
    expect(fake.artifacts).toEqual([
      expect.objectContaining({
        simulated: true,
        payload: { status: "passed", evidence: ["fixture:test"] },
      }),
    ]);
    expect(fake.transitions.map((transition) => transition.eventKind)).toEqual(
      expect.arrayContaining([
        "assignment_created",
        "agent_completed",
        "condition_evaluated",
        "verification_recorded",
        "approval_requested",
        "approval_granted",
        "workflow_completed",
      ]),
    );
    expect(
      fake.transitions.every(
        (transition) =>
          /^[a-f0-9]{64}$/.test(transition.requestHash) &&
          transition.idempotencyKey.startsWith(
            "run:10000000-0000-4000-8000-000000000001:",
          ),
      ),
    ).toBe(true);
  });

  it("blocks visibly with no fall-through when a role is unavailable", async () => {
    const fake = fakePort({ missingRole: "chief_engineer" });
    const result = await runWorkflow(
      {
        runId: "10000000-0000-4000-8000-000000000002",
        runVersion: 0,
        actor: "Adam",
        definition,
        inputs: {},
      },
      fake.port,
    );

    expect(result.status).toBe("blocked");
    expect(result.stepStates.draft).toBe("blocked");
    expect(fake.transitions[fake.transitions.length - 1]).toMatchObject({
      eventKind: "blocked",
      eventPayload: {
        reason: "role unavailable",
        requestedRole: "chief_engineer",
        noFallThrough: true,
      },
    });
  });

  it("pauses at the payload-bound founder approval without performing the action", async () => {
    const fake = fakePort({ approve: false });
    const result = await runWorkflow(
      {
        runId: "10000000-0000-4000-8000-000000000003",
        runVersion: 0,
        actor: "Adam",
        definition,
        inputs: {},
      },
      fake.port,
    );

    expect(result.status).toBe("needs_approval");
    expect(result.stepStates.approve).toBe("running");
    expect(result.approvals.approve.decision).toBeNull();
    expect(fake.artifacts).toHaveLength(0);
  });

  it("blocks before approval when independent verification is inconclusive", async () => {
    const fake = fakePort({ verifierStatus: "inconclusive" });
    const result = await runWorkflow(
      {
        runId: "10000000-0000-4000-8000-000000000004",
        runVersion: 0,
        actor: "Adam",
        definition,
        inputs: {},
      },
      fake.port,
    );

    expect(result.status).toBe("blocked");
    expect(result.verification).toEqual([
      expect.objectContaining({
        label: "independent agent verification",
        status: "inconclusive",
      }),
    ]);
    expect(result.stepStates.verification_decision).toBe("completed");
    expect(result.stepStates.approve).toBe("queued");
    expect(fake.approvals).toHaveLength(0);
    expect(fake.artifacts).toHaveLength(0);
  });
});
