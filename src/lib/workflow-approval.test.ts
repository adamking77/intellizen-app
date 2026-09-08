import { beforeEach, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({
  run: {} as Record<string, unknown>,
  casResult: undefined as Record<string, unknown> | null | undefined,
  rpcErrors: {} as Record<string, string>,
  rpc: vi.fn(),
  continuation: vi.fn(),
  updates: [] as unknown[],
  filters: [] as Array<[string, unknown]>,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    schema: () => ({
      rpc: async (name: string, args: Record<string, unknown>) => {
        backend.rpc(name, args);
        if (backend.rpcErrors[name]) return { data: null, error: { message: backend.rpcErrors[name] } };
        if (name === "acquire_workflow_dispatch_lease") return { data: { run_version: 5, fencing_token: 3 }, error: null };
        if (name === "transition_workflow_step") return { data: { applied: true, event: { id: "receipt" } }, error: null };
        if (name === "release_workflow_dispatch_lease") return { data: { run_version: 7 }, error: null };
        if (name === "append_record_section") return { data: backend.casResult, error: null };
        if (name === "append_record_section_with_event") return { data: backend.casResult, error: null };
        throw new Error(`Unexpected RPC ${name}`);
      },
      from: () => {
        const query = {
          select: () => query,
          update: (value: unknown) => { backend.updates.push(value); return query; },
          eq: (field: string, value: unknown) => { backend.filters.push([field, value]); return query; },
          single: async () => ({ data: backend.run, error: null }),
          maybeSingle: async () => ({ data: backend.casResult, error: null }),
        };
        return query;
      },
    }),
  },
}));

vi.mock("@/lib/workflow-continuation", () => ({
  loadWorkflowRunContinuation: backend.continuation,
  attachWorkflowTransitionContinuation: (transition: Record<string, unknown>, identity: Record<string, unknown>) => ({
    ...transition,
    eventPayload: {
      ...(transition.eventPayload as Record<string, unknown>),
      _continuation: {
        schema: "intellizen.workflow-transition-continuation/1",
        executionVersion: identity.executionVersion,
        definitionHash: identity.definitionHash,
        stepResult: null,
      },
    },
  }),
}));

import { GENZEN_WORKSPACE_DATABASE_IDS, resolveWorkflowApproval, workflowApprovalIdentityFromRecord } from "./data";
import { workflowDefinitionHash } from "./workflow-schema";

const payloadHash = "a".repeat(64);
const base = {
  id: "00000000-0000-4000-8000-000000000001",
  database_id: GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns,
  entity: "genzen",
  body: "",
  taxonomy: {},
  created_at: "2026-09-07T10:00:00.000Z",
  updated_at: "2026-09-07T11:00:00.000Z",
};

beforeEach(() => {
  backend.rpc.mockClear();
  backend.updates = [];
  backend.filters = [];
  backend.casResult = undefined;
  backend.rpcErrors = {};
  backend.continuation.mockReset();
  backend.continuation.mockResolvedValue({
    identity: { executionVersion: 1, definitionHash: "b".repeat(64) },
    definitionSnapshot: {},
    runVersion: 4,
    currentStepId: "approve",
    stepStates: { approve: "running" },
    stepResults: {},
  });
});

it("projects the pending approval for the displayed structured step", () => {
  expect(workflowApprovalIdentityFromRecord({
    id: base.id,
    _updatedAt: base.updated_at,
    run_schema_version: "intellizen.workflow/1",
    run_version: 4,
    run_current_step_id: "publish",
    run_approvals: JSON.stringify({
      stale: { approvalId: "stale", stepId: "draft", payloadHash: "b".repeat(64), requiredRole: "founder_approval_authority", decision: null },
      current: { approvalId: "current", stepId: "publish", payloadHash, requiredRole: "founder_approval_authority", decision: null },
    }),
  })).toEqual({
    expectedUpdatedAt: base.updated_at,
    expectedRunVersion: 4,
    expectedStepId: "publish",
    approvalId: "current",
    expectedPayloadHash: payloadHash,
    decisionRole: "founder_approval_authority",
  });
});

it("binds a schema-v1 approval to version, step, approval and payload through the fenced RPC", async () => {
  backend.run = {
    ...base,
    fields: {
      run_schema_version: "intellizen.workflow/1",
      run_status: "Needs approval",
      run_version: 4,
      run_current_step_id: "approve",
      run_step_states: { approve: "running" },
      run_approvals: {
        approval: { approvalId: "approval", stepId: "approve", payloadHash, payloadRef: "steps.write.result", requiredRole: "founder_approval_authority", decision: null },
      },
    },
  };
  const result = await resolveWorkflowApproval({
    workflowRunId: base.id,
    decision: "approved",
    decisionSummary: "Reviewed",
    decidedBy: "Adam",
    expectedUpdatedAt: base.updated_at,
    expectedRunVersion: 4,
    expectedStepId: "approve",
    approvalId: "approval",
    expectedPayloadHash: payloadHash,
    decisionRole: "founder_approval_authority",
    confirmWrite: true,
  });
  expect(result).toMatchObject({ dry_run: false, write_performed: true });
  expect(backend.rpc.mock.calls.map(([name]) => name)).toEqual([
    "acquire_workflow_dispatch_lease",
    "transition_workflow_step",
    "release_workflow_dispatch_lease",
  ]);
  expect(backend.rpc.mock.calls[1]?.[1]).toMatchObject({
    p_expected_run_version: 5,
    p_expected_step_id: "approve",
    p_expected_step_state: "running",
    p_event_payload: expect.objectContaining({
      _continuation: expect.objectContaining({
        executionVersion: 1,
        definitionHash: "b".repeat(64),
      }),
    }),
    p_approval_mutation: { operation: "decide", approvalId: "approval", payloadHash, decision: "approved", decisionMaker: "Adam" },
  });
  const rpcArguments = backend.rpc.mock.calls[1]?.[1] as Record<string, unknown>;
  const { p_request_hash: requestHash, ...rpcArgumentsWithoutHash } = rpcArguments;
  expect(requestHash).toBe(await workflowDefinitionHash(rpcArgumentsWithoutHash));
});

it("blocks a structured step when changes are requested and syncs its linked task", async () => {
  backend.run = {
    ...base,
    fields: {
      run_schema_version: "intellizen.workflow/1",
      run_name: "Publish",
      run_status: "Needs approval",
      run_version: 4,
      run_current_step_id: "approve",
      run_step_states: { approve: "running" },
      run_task: ["00000000-0000-4000-8000-000000000002"],
      run_approvals: {
        approval: { approvalId: "approval", stepId: "approve", payloadHash, requiredRole: "founder_approval_authority", decision: null },
      },
    },
  };
  backend.casResult = {
    ...base,
    id: "00000000-0000-4000-8000-000000000002",
    database_id: GENZEN_WORKSPACE_DATABASE_IDS.tasks,
    fields: { task_name: "Publish", task_status: "Blocked", task_stage: "Doing" },
  };
  const result = await resolveWorkflowApproval({
    workflowRunId: base.id,
    decision: "changes_requested",
    decisionSummary: "Revise the title",
    decidedBy: "Adam",
    expectedUpdatedAt: base.updated_at,
    expectedRunVersion: 4,
    expectedStepId: "approve",
    approvalId: "approval",
    expectedPayloadHash: payloadHash,
    decisionRole: "founder_approval_authority",
    confirmWrite: true,
  });
  expect(backend.rpc.mock.calls[1]?.[1]).toMatchObject({
    p_next_step_state: "blocked",
    p_next_run_status: "Blocked",
    p_approval_mutation: { decision: "changes_requested" },
  });
  expect(backend.rpc.mock.calls.map(([name]) => name)).toEqual([
    "acquire_workflow_dispatch_lease",
    "transition_workflow_step",
    "release_workflow_dispatch_lease",
    "append_record_section",
  ]);
  expect(result).toMatchObject({ write_performed: true, synced_task: { id: "00000000-0000-4000-8000-000000000002" } });
});

it("reports a structured task sync failure after the approval has committed", async () => {
  backend.run = {
    ...base,
    fields: {
      run_schema_version: "intellizen.workflow/1",
      run_status: "Needs approval",
      run_version: 4,
      run_current_step_id: "approve",
      run_step_states: { approve: "running" },
      run_task: ["00000000-0000-4000-8000-000000000002"],
      run_approvals: {
        approval: { approvalId: "approval", stepId: "approve", payloadHash, requiredRole: "founder_approval_authority", decision: null },
      },
    },
  };
  backend.rpcErrors.append_record_section = "task sync unavailable";
  await expect(resolveWorkflowApproval({
    workflowRunId: base.id,
    decision: "approved",
    decisionSummary: "Reviewed",
    decidedBy: "Adam",
    expectedUpdatedAt: base.updated_at,
    expectedRunVersion: 4,
    expectedStepId: "approve",
    approvalId: "approval",
    expectedPayloadHash: payloadHash,
    decisionRole: "founder_approval_authority",
    confirmWrite: true,
  })).resolves.toMatchObject({ write_performed: true, task_sync_error: "task sync unavailable" });
});

it("rejects changed structured identity before taking a lease", async () => {
  backend.run = {
    ...base,
    fields: {
      run_schema_version: "intellizen.workflow/1",
      run_version: 5,
      run_current_step_id: "approve",
      run_step_states: { approve: "running" },
      run_approvals: { approval: { approvalId: "approval", stepId: "approve", payloadHash, requiredRole: "founder_approval_authority", decision: null } },
    },
  };
  await expect(resolveWorkflowApproval({
    workflowRunId: base.id,
    decision: "approved",
    decisionSummary: "Reviewed",
    decidedBy: "Adam",
    expectedUpdatedAt: base.updated_at,
    expectedRunVersion: 4,
    expectedStepId: "approve",
    approvalId: "approval",
    expectedPayloadHash: payloadHash,
    decisionRole: "founder_approval_authority",
    confirmWrite: true,
  })).rejects.toThrow("changed");
  expect(backend.rpc).not.toHaveBeenCalled();
});

it("uses the reviewed updated_at as the legacy approval CAS", async () => {
  backend.run = { ...base, fields: { run_name: "Legacy", run_status: "Needs approval", run_current_step: "Review" } };
  backend.casResult = null;
  await expect(resolveWorkflowApproval({
    workflowRunId: base.id,
    decision: "approved",
    decisionSummary: "Reviewed",
    decidedBy: "Adam",
    expectedUpdatedAt: base.updated_at,
    confirmWrite: true,
  })).rejects.toThrow("Nothing was written");
  expect(backend.filters).toContainEqual(["updated_at", base.updated_at]);
  expect(backend.rpc).not.toHaveBeenCalled();
});

it("reports a legacy receipt failure after the guarded decision without inviting a blind retry", async () => {
  backend.run = { ...base, fields: { run_name: "Legacy", run_status: "Needs approval", run_current_step: "Review" } };
  backend.casResult = { ...backend.run, updated_at: "2026-09-07T11:01:00.000Z", fields: { ...(backend.run.fields as object), run_status: "In progress" } };
  backend.rpcErrors.append_record_section_with_event = "receipt unavailable";
  await expect(resolveWorkflowApproval({
    workflowRunId: base.id,
    decision: "approved",
    decisionSummary: "Reviewed",
    decidedBy: "Adam",
    expectedUpdatedAt: base.updated_at,
    confirmWrite: true,
  })).resolves.toMatchObject({ write_performed: true, receipt_error: "receipt unavailable" });
});
