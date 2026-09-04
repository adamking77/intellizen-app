import { describe, expect, it } from "vitest";

import { workEventsForSession, type WorkEventItem } from "./work-receipts";

function event(id: string, payload: Record<string, unknown>, created_at = id): WorkEventItem {
  return { id, payload, created_at, record_id: null, workflow_run_id: null, event_kind: "file_written", actor: "Keel", durable_role: null, decision_role: null, summary: id };
}

describe("workEventsForSession", () => {
  it("keeps only events explicitly correlated to the selected session", () => {
    expect(workEventsForSession([
      event("2", { session_key: "keel:s1" }, "2026-01-02"),
      event("1", { session_id: "s1" }, "2026-01-01"),
      event("3", { session_id: "elsewhere" }, "2026-01-03"),
    ], "s1", "keel").map((item) => item.id)).toEqual(["1", "2"]);
  });
});
