import { beforeEach, describe, expect, it, vi } from "vitest";
import { workflowDefinitionHash, type WorkflowDefinitionV1 } from "@/lib/workflow-schema";

const state = vi.hoisted(() => ({
  scanResult: { data: [] as Array<{ id: string; fields: Record<string, unknown> }>, error: null as { message: string } | null },
  continuation: vi.fn(),
  recover: vi.fn(),
}));

const query = {
  select: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(async () => state.scanResult),
};
query.select.mockReturnValue(query);
query.eq.mockReturnValue(query);

vi.mock("@/lib/data", () => ({
  GENZEN_WORKSPACE_DATABASE_IDS: {
    workflowRuns: "c1000000-0000-0000-0000-000000000002",
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    schema: vi.fn(() => ({
      from: vi.fn(() => query),
      rpc: vi.fn(),
    })),
  },
}));

vi.mock("@/lib/workflow-continuation", () => ({
  loadWorkflowRunContinuation: state.continuation,
}));

vi.mock("@/services/workflow-runner", () => ({
  recoverInterruptedWorkflow: state.recover,
}));

async function recoverOnLaunch() {
  const module = await import("@/services/workflow-recovery");
  return module.recoverInterruptedLocalWorkflowsOnLaunch;
}

const definition: WorkflowDefinitionV1 = {
  schema: "intellizen.workflow/1",
  id: "recovery-test",
  name: "Recovery test",
  version: 1,
  trigger: { kind: "manual" },
  inputs: [],
  steps: [{
    id: "step-1",
    kind: "role-assign",
    title: "Work",
    role: "worker",
    resolution: "primary-active-occupant",
    instructions: "Perform the recovery test work.",
    execution: "ephemeral",
    mediatedAuthority: "read-only",
    verification: { required: false },
    timeoutMinutes: 30,
    next: null,
  }],
};

describe("workflow launch recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    state.scanResult = { data: [], error: null };
    state.continuation.mockReset();
    state.recover.mockReset();
    query.in.mockClear();
  });

  it("evicts a rejected launch scan so a later call can retry", async () => {
    const recover = await recoverOnLaunch();
    state.scanResult = { data: [], error: { message: "temporary read failure" } };
    await expect(recover()).rejects.toThrow("temporary read failure");
    state.scanResult = { data: [], error: null };
    await expect(recover()).resolves.toEqual({
      inspected: 0,
      abandoned: [],
      activeLeases: [],
      durableReconciliation: [],
      ignored: [],
      failures: [],
    });
    expect(query.in).toHaveBeenCalledTimes(2);
  });

  it("recovers from the ready immutable continuation instead of mutable run fields", async () => {
    const recover = await recoverOnLaunch();
    const definitionHash = await workflowDefinitionHash(definition);
    state.scanResult = {
      data: [{
        id: "run-1",
        fields: {
          run_version: 1,
          run_current_step_id: "stale-step",
          run_step_states: { "stale-step": "completed" },
          run_lease_expires_at: null,
        },
      }],
      error: null,
    };
    state.continuation.mockResolvedValue({
      identity: { executionVersion: 2, definitionHash },
      definitionSnapshot: definition,
      runVersion: 7,
      currentStepId: "step-1",
      stepStates: { "step-1": "running" },
      stepResults: {},
    });
    state.recover.mockResolvedValue({ status: "abandoned", runVersion: 9, fencingToken: 3 });

    await expect(recover()).resolves.toMatchObject({
      inspected: 1,
      abandoned: ["run-1"],
      failures: [],
    });
    expect(state.recover).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        runVersion: 7,
        currentStepId: "step-1",
        currentStepState: "running",
        definition,
        identity: { executionVersion: 2, definitionHash },
      }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("reports an unready legacy continuation without attempting recovery", async () => {
    const recover = await recoverOnLaunch();
    state.scanResult = { data: [{ id: "legacy-run", fields: {} }], error: null };
    state.continuation.mockRejectedValue(
      new Error("Workflow continuation is not ready: immutable execution identity or completed-step receipts are missing."),
    );

    await expect(recover()).resolves.toMatchObject({
      inspected: 1,
      failures: [{
        runId: "legacy-run",
        message: "Workflow continuation is not ready: immutable execution identity or completed-step receipts are missing.",
      }],
    });
    expect(state.recover).not.toHaveBeenCalled();
  });
});
