import { beforeEach, describe, expect, it, vi } from "vitest";

const { startHermesHostRun, getHermesHostRunStatus } = vi.hoisted(() => ({
  startHermesHostRun: vi.fn(),
  getHermesHostRunStatus: vi.fn(),
}));

vi.mock("@/services/hermes-host", () => ({
  checkHermesHostApi: vi.fn(),
  checkHermesHostGateway: vi.fn(),
  getHermesHostRunStatus,
  startHermesHostRun,
  streamHermesHostChat: vi.fn(),
  submitHermesHostGateway: vi.fn(),
}));

vi.mock("@/services/voice", () => ({
  hermesDashboardConfigured: vi.fn(() => false),
  hermesDashboardFetch: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { executeHermesRun } from "@/services/agent";

describe("Hermes durable run polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    startHermesHostRun.mockReset();
    getHermesHostRunStatus.mockReset();
    startHermesHostRun.mockResolvedValue({ runId: "run-1" });
  });

  it("fails immediately when the host returns an unknown status", async () => {
    getHermesHostRunStatus.mockResolvedValue({
      status: "unknown",
      output: null,
      error: "missing status field",
      usage: null,
    });
    const run = executeHermesRun({
      prompt: "Bounded prompt",
      instructions: "Bounded instructions",
      timeoutMs: 60_000,
    });
    const rejection = expect(run).rejects.toThrow(
      "returned an unknown status: missing status field",
    );

    await vi.advanceTimersByTimeAsync(1_000);
    await rejection;
    expect(getHermesHostRunStatus).toHaveBeenCalledTimes(1);
  });

  it("honors cancellation while waiting between polls", async () => {
    const controller = new AbortController();
    const run = executeHermesRun({
      prompt: "Bounded prompt",
      instructions: "Bounded instructions",
      timeoutMs: 60_000,
      signal: controller.signal,
    });
    controller.abort();

    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(getHermesHostRunStatus).not.toHaveBeenCalled();
  });
});
