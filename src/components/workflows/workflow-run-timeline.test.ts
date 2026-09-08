import { describe, expect, it } from "vitest";
import { workflowRunReceiptOrder, workflowRunTimeline } from "./workflow-run-timeline";

const event = (id: string, runVersion: number | null, createdAt: string, payload: Record<string, unknown>, actor = "workflow-runner") => ({
  id,
  record_id: null,
  workflow_run_id: "run-1",
  event_kind: "assignment_created",
  actor,
  durable_role: null,
  decision_role: null,
  summary: id,
  payload,
  run_version: runVersion,
  step_id: null,
  assignment_id: null,
  runtime_session_id: null,
  created_at: createdAt,
});

describe("workflow run receipt timeline", () => {
  it("orders replay by durable run version before receipt timestamp", () => {
    const ordered = workflowRunReceiptOrder([
      event("later-time", 2, "2026-02-01T00:00:00Z", {}),
      event("first-version", 1, "2026-03-01T00:00:00Z", {}),
      event("same-version-earlier", 2, "2026-01-01T00:00:00Z", {}),
    ]);
    expect(ordered.map((item) => item.id)).toEqual(["first-version", "same-version-earlier", "later-time"]);
  });

  it("puts the unversioned hosted start before durable v1 through v10 receipts", () => {
    const started = { ...event("started", null, "2026-01-01T00:00:00Z", {}), event_kind: "workflow_run_started" };
    const ordered = workflowRunReceiptOrder([
      event("version-10", 10, "2026-01-01T00:00:10Z", {}),
      event("version-1", 1, "2026-01-01T00:00:01Z", {}),
      started,
    ]);
    expect(ordered.map((item) => item.id)).toEqual(["started", "version-1", "version-10"]);
  });

  it("uses assignment receipt identity and never the run initiator for traces", () => {
    const created = event("created", 1, "2026-01-01T00:00:00Z", { assignmentId: "a-1", resolution: { selectedAgent: "acp:codex" } }, "workflow-runner");
    const complete = { ...event("completed", 2, "2026-01-01T00:01:00Z", { assignmentId: "a-1" }, "workflow-runner"), event_kind: "agent_completed" };
    expect(workflowRunTimeline([complete, created])).toEqual([{ agent: "acp:codex", events: [created, complete] }]);
  });
});
