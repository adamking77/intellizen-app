import { describe, expect, it } from "vitest";
import {
  buildActivityDashboard,
  costForDay,
  DEFAULT_ACTIVITY_FILTER,
  outcomeOf,
  workspaceForFolder,
  normalizeHermesUsage,
  type ActivitySources,
} from "./activity-dashboard";
import { emptyThread } from "@/engine/session-store";
import type { WorkflowRunItem } from "./types";
import type { HierarchyNode } from "./hierarchy";

const now = Date.parse("2026-09-05T12:00:00Z");
function sources(): ActivitySources {
  return {
    at: now,
    runs: { data: [], at: now },
    hierarchy: { data: [], at: now },
    profiles: { data: [], at: now },
    connections: { data: [], at: now },
    sessionFolders: { data: {}, at: now },
    usage: {},
  };
}
const run = (
  id: string,
  status = "Done",
  updated_at = "2026-09-05T01:00:00Z",
) =>
  ({
    id,
    status,
    name: id,
    updated_at,
    completed_at: updated_at,
    started_at: updated_at,
    step_states: {},
  }) as WorkflowRunItem;
const node = (
  id: string,
  kind: HierarchyNode["kind"],
  parent_id: string | null,
  folders: string[] = [],
): HierarchyNode => ({
  id,
  kind,
  parent_id,
  name: id,
  folders,
  position: 0,
  legacy_operation_id: null,
  legacy_project_id: null,
  legacy_investigation_id: null,
  created_at: "",
  updated_at: "",
});

describe("Activity reporting", () => {
  it("deduplicates workflow identity, enforces UTC period and does not call deferred work cancelled", () => {
    const input = sources();
    input.runs.data = [
      run("same"),
      run("same"),
      run("old", "Done", "2026-08-29T23:59:59Z"),
      run("deferred", "Deferred"),
    ];
    const model = buildActivityDashboard(
      input,
      DEFAULT_ACTIVITY_FILTER,
      {},
      {},
      {},
      now,
    );
    expect(model.periodRuns).toHaveLength(2);
    expect(model.outcomes.find((o) => o.name === "Completed")?.count).toBe(1);
    expect(model.outcomes.find((o) => o.name === "Deferred")?.count).toBe(1);
    expect(model.outcomes.find((o) => o.name === "Cancelled")?.count).toBe(0);
    expect(
      outcomeOf({
        ...run("failed", "Blocked"),
        step_states: { one: "failed" },
      }),
    ).toBe("Failed");
  });
  it("keeps reported zero distinct from estimated and missing cost", () => {
    expect(costForDay({ day: "x", actual_cost: 0, estimated_cost: 4 })).toEqual(
      { reported: 0, estimated: 4 },
    );
    expect(costForDay({ day: "x", estimated_cost: 4 })).toEqual({
      reported: null,
      estimated: 4,
    });
    expect(costForDay({ day: "x" })).toEqual({
      reported: null,
      estimated: null,
    });
  });
  it("treats Hermes coalesced zero as unknown rather than proof of free usage", () => {
    expect(
      normalizeHermesUsage({
        daily: [{ day: "2026-09-05", actual_cost: 0, estimated_cost: 2 }],
      }).daily?.[0],
    ).toMatchObject({ actual_cost: undefined, estimated_cost: 2 });
  });
  it("does not zero-fill historical gaps or add repeated cumulative CLI observations to period totals", () => {
    const input = sources();
    input.usage.hermes = {
      data: { daily: [{ day: "2026-09-05", actual_cost: 2 }] },
      at: now,
    };
    const thread = emptyThread("acp:codex");
    thread.sessionId = "session";
    thread.transcript.usage = {
      cost: { amount: 9, currency: "EUR" },
      context_used: 25,
    };
    const first = buildActivityDashboard(
      input,
      DEFAULT_ACTIVITY_FILTER,
      { cli: thread },
      {},
      {},
      now,
    );
    const again = buildActivityDashboard(
      input,
      DEFAULT_ACTIVITY_FILTER,
      { cli: thread },
      {},
      {},
      now,
    );
    expect(first.reported).toBe(2);
    expect(again.reported).toBe(2);
    expect(first.usageDays[0].reported).toBeNull();
    expect(first.liveUsage[0].transcript.usage?.cost?.amount).toBe(9);
  });
  it("attributes nested project paths to the deepest workspace and excludes unowned global data", () => {
    const input = sources();
    input.hierarchy.data = [
      node("dept", "department", null),
      node("w1", "workspace", "dept"),
      node("p1", "project", "w1", ["/work"]),
      node("w2", "workspace", "dept"),
      node("p2", "project", "w2", ["/work/client"]),
    ];
    expect(workspaceForFolder(input.hierarchy.data, "/work/client/docs")).toBe(
      "w2",
    );
    expect(workspaceForFolder(input.hierarchy.data, "/work-old")).toBeNull();
    const thread = emptyThread("acp:codex");
    thread.sessionId = "s";
    thread.transcript.turnStartedAt = now - 1000;
    input.sessionFolders.data = { "acp:codex:s": "/work/client" };
    input.runs.data = [run("global")];
    input.usage.hermes = {
      data: { daily: [{ day: "2026-09-05", actual_cost: 100 }] },
      at: now,
    };
    const model = buildActivityDashboard(
      input,
      { ...DEFAULT_ACTIVITY_FILTER, workspace: "w2" },
      { cli: thread },
      {},
      {},
      now,
    );
    expect(model.progress).toHaveLength(1);
    expect(model.periodRuns).toHaveLength(0);
    expect(model.reported).toBeNull();
    expect(
      buildActivityDashboard(
        input,
        { ...DEFAULT_ACTIVITY_FILTER, workspace: "w1" },
        { cli: thread },
        {},
        {},
        now,
      ).progress,
    ).toHaveLength(0);
  });
  it("keeps approvals linked to the exact ACP conversation without running an action", () => {
    const thread = emptyThread("acp:codex");
    thread.transcript.pending = [
      {
        kind: "approval",
        requestId: "req",
        description: "Review command",
        command: "do work",
        choices: ["once"],
        messageId: "m",
        at: now - 10,
      },
    ];
    const model = buildActivityDashboard(
      sources(),
      DEFAULT_ACTIVITY_FILTER,
      { cli: thread },
      {},
      {},
      now,
    );
    expect(model.attention[0].target).toEqual({
      type: "profile",
      id: "acp:codex",
    });
  });
});

it("keeps old queued and in-progress records accessible without counting them as live work", () => {
  const input = sources();
  input.runs.data = [run("old-running", "In progress", "2026-07-01T00:00:00Z"), run("queued", "Queued"), run("old-approval", "Needs approval", "2026-07-01T00:00:00Z"), run("new-approval", "Needs approval")];
  const thread = emptyThread("acp:codex");
  thread.transcript.turnStartedAt = now - 1000;
  const model = buildActivityDashboard(input, DEFAULT_ACTIVITY_FILTER, { cli: thread }, {}, {}, now);
  expect(model.progress.map((i) => i.id)).toEqual(["session:acp:codex"]);
  expect(model.openWorkflows.map((i) => i.id)).toEqual(["run:queued", "run:old-running"]);
  expect(model.attention.map((i) => i.id)).toEqual(["run:new-approval", "run:old-approval"]);
});
