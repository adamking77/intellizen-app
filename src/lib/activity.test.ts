import { describe, expect, it } from "vitest";

import { buildActivitySnapshot, formatDuration, type BuildActivityInput } from "@/lib/activity";
import type { WorkEventItem } from "@/lib/data/work-receipts";

const NOW = Date.parse("2026-09-04T12:00:00Z");

function event(event_kind: string, created_at: string, extra: Partial<WorkEventItem> = {}): WorkEventItem {
  return {
    id: `${event_kind}-${created_at}`,
    record_id: "record-1",
    workflow_run_id: "run-1",
    event_kind,
    actor: "test",
    durable_role: null,
    decision_role: null,
    summary: null,
    payload: {},
    created_at,
    ...extra,
  };
}

function input(): BuildActivityInput {
  return {
    now: NOW,
    agents: [{
      name: "fiona",
      displayName: "Fiona",
      usage: {
        daily: [
          { day: "2026-09-03", sessions: 2, input_tokens: 1_000, output_tokens: 500, estimated_cost: 0.5 },
          { day: "2026-09-04", sessions: 1, input_tokens: 2_000, output_tokens: 500, actual_cost: 0.75 },
        ],
        totals: { total_sessions: 3, total_input: 3_000, total_output: 1_000, total_actual_cost: 1.25 },
      },
      modelUsage: { models: [{ tool_calls: 7 }] },
      sessions: [{ id: "s", title: "x", preview: "", profile: "fiona", cwd: null, source: null, lastActive: NOW / 1_000, messageCount: 2, failed: true, toolCallCount: 7 }],
      turnTimes: [60_000, 120_000],
    }],
    engine: { connected: true, startedAt: "2026-09-04T10:00:00Z", acpReachable: 2 },
    events: [
      event("kanban.card_moved", "2026-09-03T09:00:00Z"),
      event("record.created", "2026-09-03T10:00:00Z", { payload: { database_name: "Documents" } }),
      event("approval_request", "2026-09-03T11:00:00Z"),
      event("approval_decision", "2026-09-03T12:00:00Z"),
      event("workflow_run_started", "2026-09-04T09:00:00Z"),
      event("workflow_completed", "2026-09-04T10:00:00Z"),
    ],
    workflowRuns: [{ id: "waiting", name: "Publish brief", status: "Needs approval", current_step: "Approve copy", started_at: "2026-09-04T08:00:00Z", updated_at: "2026-09-04T08:00:00Z" }],
    cronRuns: [{ id: "cron-1", startedAt: "2026-09-04T09:00:00Z", endedAt: "2026-09-04T09:05:00Z", isActive: false, outcome: "completed", preview: "" }],
    pendingDecisions: [],
  };
}

describe("activity snapshot", () => {
  it("builds agent, engine, work, and attention instruments from read models", () => {
    const snapshot = buildActivitySnapshot(input());
    const byId = new Map(snapshot.metrics.map((metric) => [metric.id, metric]));

    expect(byId.get("agent.fiona.sessions-today")?.value).toBe("1");
    expect(byId.get("agent.fiona.tokens-week")?.value).toBe("4K");
    expect(byId.get("agent.fiona.turn-time")?.value).toBe("2m");
    expect(byId.get("agent.fiona.failures")?.tone).toBe("bad");
    expect(byId.get("engine.hermes-connected")?.value).toBe("2h");
    expect(byId.get("work.cards-moved")?.value).toBe("1");
    expect(byId.get("work.documents-written")?.value).toBe("1");
    expect(byId.get("work.decision-wait")?.value).toBe("1h");
    expect(byId.get("work.workflow-runs")?.value).toBe("2");
    expect(byId.get("work.workflow-outcomes")?.value).toBe("2");
    expect(byId.get("attention.waiting")?.value).toBe("1");
    expect(snapshot.waiting[0]?.label).toBe("Publish brief");
  });

  it("formats missing and long durations without false precision", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(30_000)).toBe("30s");
    expect(formatDuration(3 * 86_400_000)).toBe("3d");
  });
});
