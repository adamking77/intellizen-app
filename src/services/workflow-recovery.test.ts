import { describe, expect, it, vi } from "vitest";

const terminalQuery = vi
  .fn()
  .mockResolvedValueOnce({ data: null, error: { message: "temporary read failure" } })
  .mockResolvedValueOnce({ data: [], error: null });

const query = {
  select: vi.fn(),
  eq: vi.fn(),
  in: terminalQuery,
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
    })),
  },
}));

import { recoverInterruptedLocalWorkflowsOnLaunch } from "@/services/workflow-recovery";

describe("workflow launch recovery", () => {
  it("evicts a rejected launch scan so a later call can retry", async () => {
    await expect(recoverInterruptedLocalWorkflowsOnLaunch()).rejects.toThrow(
      "temporary read failure",
    );
    await expect(recoverInterruptedLocalWorkflowsOnLaunch()).resolves.toEqual({
      inspected: 0,
      abandoned: [],
      activeLeases: [],
      durableReconciliation: [],
      ignored: [],
      failures: [],
    });
    expect(terminalQuery).toHaveBeenCalledTimes(2);
  });
});
