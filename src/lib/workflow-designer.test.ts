import { describe, expect, it } from "vitest";

import {
  addWorkflowDesignerStep,
  changeWorkflowDesignerStepKind,
  connectWorkflowDesignerEdge,
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

  it("round-trips direct edge edits through the existing schema", () => {
    const withCondition = addWorkflowDesignerStep(
      addWorkflowDesignerStep(
        createWorkflowDesignerDraft({
          id: "edge-proof",
          name: "Edge proof",
          ownerRole: "chief_engineer",
        }),
        "condition",
      ),
      "artifact",
    );
    const condition = withCondition.steps.find(
      (step) => step.kind === "condition",
    );
    if (!condition) throw new Error("fixture");
    const connected = connectWorkflowDesignerEdge(withCondition, {
      sourceStepId: condition.id,
      target: "blocked",
      handle: "else",
    });
    const updated = connected.steps.find((step) => step.id === condition.id);
    expect(updated).toMatchObject({ kind: "condition", else: "blocked" });
    expect(validateWorkflowDefinition(connected).valid).toBe(true);
  });
});

describe("positioned workflow insertion", () => {
  const draft = () => createWorkflowDesignerDraft({ id: "insert", name: "Insertion" });
  it("inserts at the beginning and preserves the original entry", () => {
    const original = draft();
    const result = addWorkflowDesignerStep(original, "decision", { afterStepId: null });
    expect(result.steps.map((step) => step.id)).toEqual(["step_2", "step_1"]);
    expect(result.steps[0]).toMatchObject({ next: "step_1" });
    expect(result.steps[1]).toEqual(original.steps[0]);
    expect(validateWorkflowDefinition(result).valid).toBe(true);
  });
  it("splices a middle edge without removing its successor", () => {
    const original = addWorkflowDesignerStep(draft(), "decision");
    const result = addWorkflowDesignerStep(original, "role-assign", { afterStepId: "step_1" });
    expect(result.steps.map((step) => step.id)).toEqual(["step_1", "step_3", "step_2"]);
    expect(result.steps[0]).toMatchObject({ next: "step_3" });
    expect(result.steps[1]).toMatchObject({ next: "step_2" });
    expect(validateWorkflowDefinition(result).valid).toBe(true);
  });
  it("inserts only on the selected condition branch and retains the terminal", () => {
    const original = addWorkflowDesignerStep(draft(), "condition");
    const result = addWorkflowDesignerStep(original, "decision", { afterStepId: "step_2", branch: "else" });
    expect(result.steps[1]).toMatchObject({ then: "complete", else: "step_3" });
    expect(result.steps[2]).toMatchObject({ next: "blocked" });
    expect(validateWorkflowDefinition(result).valid).toBe(true);
  });
  it("retains the existing successor when inserting a condition", () => {
    const original = addWorkflowDesignerStep(draft(), "decision");
    const result = addWorkflowDesignerStep(original, "condition", { afterStepId: "step_1" });
    expect(result.steps[1]).toMatchObject({ then: "step_2", else: "blocked" });
    expect(validateWorkflowDefinition(result).valid).toBe(true);
  });
});


describe("workflow step kind conversion", () => {
  const seed = () => createWorkflowDesignerDraft({ id: "conversion", name: "Conversion" });
  const kinds = ["role-assign", "condition", "approval", "artifact", "decision"] as const;
  it.each(kinds)("converts to %s while preserving identity, incoming routes, order and successor", (kind) => {
    const definition = addWorkflowDesignerStep(addWorkflowDesignerStep(seed(), kind === "decision" ? "role-assign" : "decision"), "decision");
    const snapshot = structuredClone(definition);
    const next = changeWorkflowDesignerStepKind(definition, "step_2", kind);
    expect(next.steps.map((step) => step.id)).toEqual(["step_1", "step_2", "step_3"]);
    expect(next.steps[0]).toEqual(definition.steps[0]); expect(next.steps[2]).toEqual(definition.steps[2]);
    expect(next.steps[1]).toMatchObject({ id: "step_2", title: definition.steps[1].title, kind });
    expect(next.steps[1]).toMatchObject(kind === "condition" ? { then: "step_3", else: "blocked" } : { next: "step_3" });
    expect(validateWorkflowDefinition(next).valid).toBe(true); expect(definition).toEqual(snapshot);
  });
  it("requires an explicit choice for divergent branches and retains unchosen steps", () => {
    const definition = addWorkflowDesignerStep(addWorkflowDesignerStep(addWorkflowDesignerStep(seed(), "condition"), "decision", { afterStepId: "step_2", branch: "then" }), "artifact", { afterStepId: "step_2", branch: "else" });
    const snapshot = structuredClone(definition);
    expect(() => changeWorkflowDesignerStepKind(definition, "step_2", "decision")).toThrow("Choose the Yes or No branch");
    for (const branch of ["then", "else"] as const) {
      const next = changeWorkflowDesignerStepKind(definition, "step_2", "decision", branch);
      expect(next.steps[1]).toMatchObject({ id: "step_2", next: branch === "then" ? "step_3" : "step_4" });
      expect(next.steps.map((step) => step.id)).toEqual(definition.steps.map((step) => step.id));
      expect(next.steps.filter((step) => step.id !== "step_2")).toEqual(definition.steps.filter((step) => step.id !== "step_2"));
    }
    expect(definition).toEqual(snapshot);
  });
  it("allows a converged condition without a branch choice", () => {
    const definition = addWorkflowDesignerStep(seed(), "condition");
    const condition = definition.steps[1]; if (condition.kind !== "condition") throw new Error("fixture");
    condition.else = condition.then;
    const next = changeWorkflowDesignerStepKind(definition, condition.id, "approval");
    expect(next.steps[1]).toMatchObject({ next: "complete", payloadRef: "steps.step_1.result" });
    expect(validateWorkflowDefinition(next).valid).toBe(true);
  });
  it("uses the actual incoming step for new references, regardless of array order", () => {
    const definition = addWorkflowDesignerStep(addWorkflowDesignerStep(seed(), "decision"), "decision");
    definition.steps = [definition.steps[0], definition.steps[2], definition.steps[1]];
    const next = changeWorkflowDesignerStepKind(definition, "step_3", "approval");
    expect(next.steps[1]).toMatchObject({ id: "step_3", payloadRef: "steps.step_2.result" });
    expect(next.steps[2]).toEqual(definition.steps[2]); expect(validateWorkflowDefinition(next).valid).toBe(true);
  });
  it("keeps every same-kind field and the definition object unchanged", () => {
    const definition = addWorkflowDesignerStep(seed(), "condition");
    const role = definition.steps[0]; if (role.kind !== "role-assign") throw new Error("fixture");
    role.instructions = "Keep manual instructions"; role.mediatedAuthority = "draft-only"; role.timeoutMinutes = 77;
    expect(changeWorkflowDesignerStepKind(definition, role.id, role.kind)).toBe(definition);
    expect(changeWorkflowDesignerStepKind(definition, "step_2", "condition")).toBe(definition);
  });
  it.each(["condition", "approval"] as const)("rejects %s without a predecessor in insertion or conversion", (kind) => {
    const definition = seed(); const snapshot = structuredClone(definition);
    expect(() => changeWorkflowDesignerStepKind(definition, "step_1", kind)).toThrow("requires a prior step");
    expect(() => addWorkflowDesignerStep(definition, kind, { afterStepId: null })).toThrow("requires a prior step");
    expect(() => addWorkflowDesignerStep({ ...definition, steps: [] }, kind)).toThrow("requires a prior step");
    expect(definition).toEqual(snapshot);
  });
  it("omits the optional artifact payload when no predecessor exists", () => {
    const definition = seed();
    for (const next of [changeWorkflowDesignerStepKind(definition, "step_1", "artifact"), addWorkflowDesignerStep(definition, "artifact", { afterStepId: null })]) {
      expect(next.steps[0].kind).toBe("artifact"); expect(next.steps[0]).not.toHaveProperty("payloadRef");
      expect(validateWorkflowDefinition(next).valid).toBe(true);
    }
  });
});
