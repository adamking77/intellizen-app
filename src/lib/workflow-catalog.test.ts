import { describe, expect, it } from "vitest";

import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import type { WorkflowTemplateItem } from "@/lib/types";
import { classifyWorkflow, runnableWorkflows } from "@/lib/workflow-catalog";
import { createWorkflowDesignerDraft } from "@/lib/workflow-designer";

function workflow(
  input: Partial<WorkflowTemplateItem> = {},
): WorkflowTemplateItem {
  return {
    id: "workflow-record",
    workflow_id: "catalog-proof",
    name: "Catalog proof",
    status: "Active",
    entity: "genzen",
    owner_role: "chief_engineer",
    default_actor: "Keel",
    source_document_id: null,
    source_path: null,
    trigger: null,
    required_inputs: null,
    default_routing: null,
    approval_gates: null,
    expected_output: null,
    related_databases: [],
    receipt_template: null,
    success_criteria: null,
    failure_behavior: null,
    definition: createWorkflowDesignerDraft({
      id: "catalog-proof",
      name: "Catalog proof",
      ownerRole: "chief_engineer",
    }),
    definition_version: 1,
    run_ids: [],
    body_preview: "",
    updated_at: "2026-07-28T00:00:00.000Z",
    ...input,
  };
}

function role(
  input: Partial<AgentPanelRoleTarget> = {},
): AgentPanelRoleTarget {
  return {
    roleKey: "chief_engineer",
    roleName: "Chief Engineer",
    roleRecordId: "role-chief-engineer",
    agentKey: "keel",
    agentName: "Keel",
    agentRecordId: "agent-keel",
    bindingRef: "codex-local-primary",
    adapterId: "acp",
    model: null,
    execution: "ephemeral",
    state: "ready",
    ...input,
  };
}

describe("workflow catalog", () => {
  it("separates SOP-only records from executable definitions", () => {
    expect(classifyWorkflow(workflow({ definition: null }), [role()])).toMatchObject({
      state: "sop-only",
      executable: false,
      runnable: false,
    });
    expect(classifyWorkflow(workflow(), [role()])).toMatchObject({
      state: "runnable",
      executable: true,
      runnable: true,
    });
  });

  it("keeps draft, invalid, assignment, binding, and runtime blockers exact", () => {
    expect(classifyWorkflow(workflow({ status: "Draft" }), [role()]).state).toBe("draft");
    expect(
      classifyWorkflow(workflow({ definition: { schema: "old" } }), [role()]),
    ).toMatchObject({
      state: "needs-review",
      blockers: expect.arrayContaining([
        expect.objectContaining({ kind: "definition" }),
      ]),
    });
    expect(classifyWorkflow(workflow(), [role({ agentKey: null })])).toMatchObject({
      state: "blocked",
      blockers: [expect.objectContaining({ kind: "assignment" })],
    });
    expect(
      classifyWorkflow(workflow(), [role({ bindingRef: null, adapterId: null })]),
    ).toMatchObject({
      state: "blocked",
      blockers: [expect.objectContaining({ kind: "binding" })],
    });
    expect(
      classifyWorkflow(workflow(), [role({ execution: "durable" })]),
    ).toMatchObject({
      state: "blocked",
      blockers: [expect.objectContaining({ kind: "runtime" })],
    });
  });

  it("excludes SOP-only, draft, and blocked records from launchers", () => {
    expect(
      runnableWorkflows(
        [
          workflow({ id: "runnable", workflow_id: "runnable" }),
          workflow({ id: "sop", workflow_id: "sop", definition: null }),
          workflow({ id: "draft", workflow_id: "draft", status: "Draft" }),
        ],
        [role()],
      ).map((item) => item.workflow_id),
    ).toEqual(["runnable"]);
  });

  it("requires a verified Codex ACP binding for meanwhile work", () => {
    const item = workflow({
      definition: {
        schema: "intellizen.workflow/1",
        id: "catalog-meanwhile-proof",
        name: "Catalog meanwhile proof",
        version: 1,
        trigger: { kind: "manual" },
        inputs: [],
        steps: [
          {
            id: "prepare",
            kind: "role-assign",
            title: "Prepare",
            role: "chief_engineer",
            resolution: "primary-active-occupant",
            instructions: "Prepare input.",
            execution: "ephemeral",
            mediatedAuthority: "read-only",
            verification: { required: false },
            timeoutMinutes: 5,
            next: "approve",
          },
          {
            id: "approve",
            kind: "approval",
            title: "Approve",
            gate: "founder_approval_authority",
            payloadRef: "steps.prepare.result",
            meanwhile: ["research"],
            reminder: "never",
            next: null,
          },
          {
            id: "research",
            kind: "role-assign",
            title: "Research",
            role: "researcher",
            resolution: "primary-active-occupant",
            instructions: "Research without writes.",
            execution: "ephemeral",
            mediatedAuthority: "read-only",
            verification: { required: false },
            timeoutMinutes: 5,
            next: null,
          },
        ],
      },
    });
    const approvalRole = role({ roleKey: "founder_approval_authority" });
    const unverifiedSide = role({
      roleKey: "researcher",
      bindingRef: "hermes-researcher",
      adapterId: "hermes",
      engine: "hermes",
    });
    expect(classifyWorkflow(item, [role(), approvalRole, unverifiedSide])).toMatchObject({
      state: "blocked",
      blockers: [expect.objectContaining({
        kind: "binding",
        stepId: "research",
        message: expect.stringContaining("Codex ACP"),
      })],
    });
    expect(classifyWorkflow(item, [
      role(),
      approvalRole,
      role({ roleKey: "researcher", engine: "codex" }),
    ])).toMatchObject({ state: "runnable", runnable: true });
  });
});
