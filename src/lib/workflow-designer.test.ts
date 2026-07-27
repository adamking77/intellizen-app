import { describe, expect, it } from "vitest";

import {
  addWorkflowDesignerStep,
  createWorkflowDesignerDraft,
  workflowAuthorityDiff,
} from "@/lib/workflow-designer";
import {
  canonicalWorkflowJson,
  validateWorkflowDefinition,
} from "@/lib/workflow-schema";
import {
  runWorkflow,
  type WorkflowRunnerPort,
} from "@/services/workflow-runner";

describe("workflow designer schema output", () => {
  it("creates a valid v1 graph that the runner executes unchanged", async () => {
    const draft = addWorkflowDesignerStep(
      createWorkflowDesignerDraft({
        id: "gate6-designer-proof",
        name: "Gate 6 designer proof",
        ownerRole: "operations_director",
      }),
      "artifact",
    );
    expect(validateWorkflowDefinition(draft).valid).toBe(true);

    let version = 0;
    let id = 0;
    const dispatchedSteps: unknown[] = [];
    const performedArtifacts: unknown[] = [];
    const port: WorkflowRunnerPort = {
      now: () => "2026-07-27T12:00:00.000Z",
      newId: () =>
        `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
      acquireLease: async () => ({ runVersion: ++version, fencingToken: 1 }),
      transition: async () => ({ runVersion: ++version, fencingToken: 1 }),
      releaseLease: async () => ({ runVersion: ++version }),
      resolveRole: async (step) => ({
        role: step.role,
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
        execution: step.execution,
        providerAuthority: "Hermes profile controls",
        unmanagedAuthority: "Hermes host process",
      }),
      dispatch: async ({ step }) => {
        dispatchedSteps.push(structuredClone(step));
        return {
          sessionId: "designer-runner-proof",
          result: { status: "completed" },
        };
      },
      decideApproval: async () => null,
      performArtifact: async (input) => {
        performedArtifacts.push(structuredClone(input.step));
        return { artifactRef: "docs://designer-proof", simulated: false };
      },
    };
    const runnerSnapshot = structuredClone(draft);
    const result = await runWorkflow(
      {
        runId: "10000000-0000-4000-8000-000000000060",
        runVersion: 0,
        actor: "Gate 6 test",
        definition: runnerSnapshot,
        inputs: {},
      },
      port,
    );

    expect(result.status).toBe("completed");
    expect(canonicalWorkflowJson(runnerSnapshot)).toBe(canonicalWorkflowJson(draft));
    expect(dispatchedSteps).toEqual([draft.steps[0]]);
    expect(performedArtifacts).toEqual([draft.steps[1]]);
    expect(canonicalWorkflowJson(draft)).toBe(
      canonicalWorkflowJson(structuredClone(draft)),
    );
  });

  it("detects an authority expansion and new approval gate", () => {
    const previous = createWorkflowDesignerDraft({
      id: "authority-proof",
      name: "Authority proof",
      ownerRole: "chief_engineer",
    });
    const elevated = structuredClone(previous);
    const first = elevated.steps[0];
    if (first.kind !== "role-assign") throw new Error("fixture");
    first.mediatedAuthority = "room-write";
    const next = addWorkflowDesignerStep(elevated, "approval");
    expect(workflowAuthorityDiff(previous, next)).toEqual({
      before: null,
      after: "room-write",
      authorityExpanded: true,
      addedApprovalGates: ["founder_approval_authority"],
    });
  });
});
