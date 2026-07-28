import { describe, expect, it } from "vitest";

import {
  assertWorkflowDefinitionIdentity,
  canonicalWorkflowJson,
  dryRunWorkflowDefinition,
  validatedWorkflowDefinitionHash,
  validateWorkflowDefinition,
  workflowDefinitionHash,
  type WorkflowDefinitionV1,
  type WorkflowRoleResolution,
} from "@/lib/workflow-schema";

const proofWorkflow: WorkflowDefinitionV1 = {
  schema: "intellizen.workflow/1",
  id: "v2-gate4-role-directed-proof",
  name: "V2 Gate 4 role-directed proof",
  version: 1,
  trigger: { kind: "manual" },
  inputs: [{ key: "build_scope", type: "string" }],
  steps: [
    {
      id: "coordinate",
      kind: "role-assign",
      title: "Coordinate bounded proof",
      role: "operations_director",
      resolution: "primary-active-occupant",
      instructions: "Coordinate the bounded draft-only proof for {{input.build_scope}}.",
      contextRefs: ["input.build_scope"],
      execution: "durable",
      mediatedAuthority: "draft-only",
      verification: { required: false },
      timeoutMinutes: 30,
      next: "draft",
    },
    {
      id: "draft",
      kind: "role-assign",
      title: "Produce bounded draft",
      role: "chief_engineer",
      resolution: "primary-active-occupant",
      instructions: "Produce the bounded draft requested by the coordinator.",
      execution: "ephemeral",
      mediatedAuthority: "draft-only",
      verification: { required: true, method: "verifier-step:verify" },
      timeoutMinutes: 30,
      next: "draft_completed",
    },
    {
      id: "draft_completed",
      kind: "condition",
      title: "Require completed draft",
      expr: "steps.draft.state == 'completed'",
      then: "verify",
      else: "blocked",
    },
    {
      id: "verify",
      kind: "role-assign",
      title: "Verify the draft",
      role: "verifier",
      resolution: "explicit-agent-override",
      agentOverride: "keel",
      overrideReason:
        "Gate 4 has no standing verifier occupant; the workflow pins an eligible agent and creates a distinct verifier assignment.",
      instructions: "Cross-check the draft against its declared evidence.",
      execution: "ephemeral",
      mediatedAuthority: "read-only",
      verification: { required: false },
      timeoutMinutes: 30,
      next: "record_verification",
    },
    {
      id: "record_verification",
      kind: "decision",
      title: "Record verification decision",
      rationale: "Record the verifier result without upgrading runtime completion to verification.",
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
      title: "Simulate consequential action",
      action: "simulate-consequential-action",
      template: "gate4-safe-simulation",
      payloadRef: "steps.verify.result",
      next: null,
    },
  ],
};

const resolutions: Record<string, WorkflowRoleResolution> = {
  operations_director: {
    role: "operations_director",
    roleStatus: "active",
    agent: "fiona",
    agentStatus: "active",
    bindingRef: "hermes-fiona",
    adapterId: "hermes",
    authReady: true,
    execution: "durable",
    resolution: "primary-active-occupant",
  },
  chief_engineer: {
    role: "chief_engineer",
    roleStatus: "active",
    agent: "keel",
    agentStatus: "active",
    bindingRef: "codex-local-primary",
    adapterId: "codex-cli",
    authReady: true,
    execution: "ephemeral",
    resolution: "primary-active-occupant",
  },
  verifier: {
    role: "verifier",
    roleStatus: "active",
    agent: "keel",
    agentStatus: "active",
    bindingRef: "codex-local-primary",
    adapterId: "codex-cli",
    authReady: true,
    execution: "ephemeral",
    resolution: "explicit-agent-override",
  },
};

describe("workflow schema v1", () => {
  it("validates the Gate 4 role-directed workflow and returns a no-dispatch dry run", () => {
    const validation = validateWorkflowDefinition(proofWorkflow);
    expect(validation).toMatchObject({
      valid: true,
      entryStepId: "coordinate",
    });

    const dryRun = dryRunWorkflowDefinition({
      definition: proofWorkflow,
      roleResolutions: resolutions,
      knownApprovalRoles: ["founder_approval_authority"],
    });
    expect(dryRun.valid).toBe(true);
    expect(dryRun.dispatches).toBe(false);
    expect(dryRun.sequence).toHaveLength(proofWorkflow.steps.length);
    expect(dryRun.approvals).toEqual([
      {
        stepId: "approve",
        gate: "founder_approval_authority",
        payloadRef: "steps.verify.result",
        payloadBound: true,
      },
    ]);
  });

  it("rejects cycles, arbitrary conditions, missing verifier paths, and unavailable roles", () => {
    const broken = structuredClone(proofWorkflow);
    const draft = broken.steps.find((step) => step.id === "draft");
    const condition = broken.steps.find((step) => step.id === "draft_completed");
    if (draft?.kind !== "role-assign" || condition?.kind !== "condition") {
      throw new Error("Fixture mismatch.");
    }
    draft.verification.method = "verifier-step:missing";
    condition.expr = "globalThis.process.exit()";
    const simulate = broken.steps.find((step) => step.id === "simulate");
    if (simulate?.kind !== "artifact") throw new Error("Fixture mismatch.");
    simulate.next = "draft";

    const validation = validateWorkflowDefinition(broken);
    expect(validation.valid).toBe(false);
    expect(validation.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        "invalid_condition",
        "unreachable_verification",
        "workflow_cycle",
      ]),
    );

    const dryRun = dryRunWorkflowDefinition({
      definition: proofWorkflow,
      roleResolutions: {
        ...resolutions,
        chief_engineer: { ...resolutions.chief_engineer, authReady: false },
      },
      knownApprovalRoles: ["founder_approval_authority"],
    });
    expect(dryRun.valid).toBe(false);
    expect(dryRun.errors).toContainEqual(
      expect.objectContaining({
        code: "role_unavailable",
        path: "steps.draft.role",
      }),
    );
  });

  it("hashes a canonical key-sorted representation", async () => {
    const reordered = {
      ...proofWorkflow,
      trigger: { kind: "manual" as const },
      schema: "intellizen.workflow/1" as const,
    };
    expect(canonicalWorkflowJson(reordered)).toBe(
      canonicalWorkflowJson(proofWorkflow),
    );
    expect(await workflowDefinitionHash(reordered)).toBe(
      await workflowDefinitionHash(proofWorkflow),
    );
  });

  it("creates a definition-specific identity only after schema validation", async () => {
    const identity = await validatedWorkflowDefinitionHash(proofWorkflow);
    expect(identity).toBe(await workflowDefinitionHash(proofWorkflow));
    await expect(
      assertWorkflowDefinitionIdentity(proofWorkflow, identity),
    ).resolves.toBeUndefined();
    await expect(
      assertWorkflowDefinitionIdentity(
        { ...proofWorkflow, version: proofWorkflow.version + 1 },
        identity,
      ),
    ).rejects.toThrow("does not match its persisted identity");
    await expect(
      assertWorkflowDefinitionIdentity(proofWorkflow, null),
    ).resolves.toBeUndefined();
    await expect(
      validatedWorkflowDefinitionHash({
        ...proofWorkflow,
        steps: [],
      }),
    ).rejects.toThrow("Cannot identify invalid workflow definition");
    expect(
      await validatedWorkflowDefinitionHash({
        ...proofWorkflow,
        version: proofWorkflow.version + 1,
      }),
    ).not.toBe(await validatedWorkflowDefinitionHash(proofWorkflow));
  });
});
