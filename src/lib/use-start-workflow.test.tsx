// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ startWorkflow: vi.fn(), success: vi.fn(), error: vi.fn() }));

vi.mock("@/lib/data", () => ({ OPERATOR_ACTOR: "Adam", startWorkflow: mocks.startWorkflow }));
vi.mock("@/lib/toast", () => ({ toast: { success: mocks.success }, toastError: mocks.error }));
vi.mock("@/services/workflow-dispatch", () => ({ dispatchWorkflowRun: vi.fn() }));

import { useStartWorkflow } from "./use-start-workflow";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;

afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

it("blocks same-tick starts and reuses a failed schema-v1 confirmation attempt", async () => {
  const preview = deferred<unknown>();
  const attempt = {
    idempotency_key: "start-key",
    run_name: "Example - frozen",
    run_started_at: "2026-09-07T12:00:00.000Z",
    request_hash: "a".repeat(64),
  };
  mocks.startWorkflow
    .mockReturnValueOnce(preview.promise)
    .mockRejectedValueOnce(new Error("temporary network failure"))
    .mockResolvedValueOnce({
      workflow_run_id: "run-1",
      run: { name: attempt.run_name, schema_version: null },
    });
  let current!: ReturnType<typeof useStartWorkflow>;
  const Probe = () => {
    const value = useStartWorkflow();
    useEffect(() => { current = value; }, [value]);
    return null;
  };
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Probe />));

  let first!: Promise<unknown>;
  let duplicate!: Promise<unknown>;
  await act(async () => {
    first = current.start({ workflowId: "example", triggerSource: "ui" });
    duplicate = current.start({ workflowId: "example", triggerSource: "ui" });
  });
  expect(await duplicate).toBeNull();
  expect(mocks.startWorkflow).toHaveBeenCalledTimes(1);
  await act(async () => preview.resolve({ dry_run: true, schema_v1: { confirmation: { start_attempt: attempt } } }));
  await expect(first).resolves.toBeNull();

  await act(async () => { await current.start({ workflowId: "example", triggerSource: "ui" }); });
  expect(mocks.startWorkflow).toHaveBeenCalledTimes(3);
  expect(mocks.startWorkflow.mock.calls[2]?.[0]).toMatchObject({
    confirmWrite: true,
    startAttempt: attempt,
  });
});

it("returns the committed run when its view refresh fails", async () => {
  const created = { workflow_run_id: "run-created", run: { name: "Created run", schema_version: null } };
  const refreshError = new Error("View refresh failed");
  mocks.startWorkflow.mockResolvedValueOnce({ dry_run: true }).mockResolvedValueOnce(created);
  let current!: ReturnType<typeof useStartWorkflow>;
  const Probe = () => {
    current = useStartWorkflow({ onStarted: async () => { throw refreshError; } });
    return null;
  };
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Probe />));
  await act(async () => {
    expect(await current.start({ workflowId: "example", triggerSource: "ui" })).toEqual(created);
  });
  expect(mocks.error).toHaveBeenCalledWith("Workflow run created, but the view could not refresh", refreshError);
  expect(mocks.error).not.toHaveBeenCalledWith("Workflow start failed", expect.anything());
});
