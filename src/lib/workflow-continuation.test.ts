import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({ data: null as unknown, error: null as null | { message: string } }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    schema: () => ({
      rpc: async () => ({ data: backend.data, error: backend.error }),
    }),
  },
}));

import {
  attachWorkflowTransitionContinuation,
  loadWorkflowRunContinuation,
} from "./workflow-continuation";

const hash = "a".repeat(64);
const runId = "10000000-0000-4000-8000-000000000001";

beforeEach(() => {
  backend.error = null;
  backend.data = {
    schema: "intellizen.workflow-run-continuation/1",
    continuationStatus: "ready",
    run: {
      workflowRunId: runId,
      runVersion: 4,
      runExecutionVersion: 1,
      runCurrentStepId: "draft",
      runStepStates: { draft: "completed", publish: "queued" },
    },
    execution: {
      workflowRunId: runId,
      executionVersion: 1,
      definitionHash: hash,
      definitionSnapshot: { schema: "intellizen.workflow/1" },
    },
    stepResults: {
      draft: {
        workflowRunId: runId,
        stepId: "draft",
        executionVersion: 1,
        definitionHash: hash,
        result: { text: "Saved result" },
      },
    },
  };
});

describe("workflow continuation", () => {
  it("hydrates results only from the ready immutable receipt projection", async () => {
    await expect(loadWorkflowRunContinuation(runId)).resolves.toMatchObject({
      identity: { executionVersion: 1, definitionHash: hash },
      runVersion: 4,
      currentStepId: "draft",
      stepResults: { draft: { text: "Saved result" } },
    });
  });

  it("fails closed when hosted history is incomplete", async () => {
    backend.data = { ...(backend.data as object), continuationStatus: "legacy_partial" };
    await expect(loadWorkflowRunContinuation(runId)).rejects.toThrow(
      "incomplete saved execution history",
    );
  });

  it("rejects a receipt projected from another execution", async () => {
    const data = backend.data as Record<string, Record<string, unknown>>;
    data.stepResults.draft = {
      ...(data.stepResults.draft as object),
      executionVersion: 2,
    };
    await expect(loadWorkflowRunContinuation(runId)).rejects.toThrow(
      "incomplete saved execution history",
    );
  });

  it("requires a matching receipt for every completed step", async () => {
    (backend.data as Record<string, unknown>).stepResults = {};
    await expect(loadWorkflowRunContinuation(runId)).rejects.toThrow(
      "incomplete saved execution history",
    );
  });

  it("attaches the exact completion result and null for every other transition", () => {
    const base = {
      expectedStepId: "draft",
      nextStepId: "draft",
      nextStepState: "completed",
      eventPayload: { result: { text: "done" } },
    };
    expect(attachWorkflowTransitionContinuation(base, {
      executionVersion: 1,
      definitionHash: hash,
    }).eventPayload._continuation).toEqual({
      schema: "intellizen.workflow-transition-continuation/1",
      executionVersion: 1,
      definitionHash: hash,
      stepResult: { text: "done" },
    });
    expect(attachWorkflowTransitionContinuation({
      ...base,
      nextStepId: "publish",
      nextStepState: "queued",
    }, { executionVersion: 1, definitionHash: hash }).eventPayload._continuation)
      .toMatchObject({ stepResult: null });
  });

  it("rejects caller-supplied continuation identity", () => {
    expect(() => attachWorkflowTransitionContinuation({
      expectedStepId: "draft",
      nextStepId: "draft",
      nextStepState: "completed",
      eventPayload: { _continuation: {} },
    }, { executionVersion: 1, definitionHash: hash })).toThrow("reserved");
  });
});
