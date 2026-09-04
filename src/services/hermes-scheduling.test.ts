import { beforeEach, describe, expect, it, vi } from "vitest";

const hermesRest = vi.hoisted(() => vi.fn());
vi.mock("@/engine/rest", () => ({ hermesRest }));

import {
  createCronJob,
  defaultBlueprintSchedule,
  deleteCronJob,
  listCronBlueprints,
  listCronJobRuns,
  listCronJobs,
  pauseCronJob,
  resumeCronJob,
  runCronJobNow,
  scheduledWorkflowPrompt,
} from "./hermes-cron";
import {
  createKanbanCard,
  getKanbanBoard,
  kanbanEventsUrl,
  listKanbanBoard,
  listKanbanBoards,
  moveKanbanCard,
} from "./hermes-kanban";

beforeEach(() => hermesRest.mockReset());

describe("Hermes scheduling services", () => {
  it("maps profile-scoped cron jobs and sends mutations to the documented routes", async () => {
    hermesRest
      .mockResolvedValueOnce([{ id: "daily", name: "Daily", schedule: "0 7 * * *", profile: "fiona" }])
      .mockResolvedValueOnce({ id: "daily", name: "Daily", schedule: "0 7 * * *" })
      .mockResolvedValueOnce({ id: "daily", name: "Daily", schedule: "0 7 * * *", last_status: "ok" })
      .mockResolvedValueOnce({ ok: true });

    expect(await listCronJobs("all")).toMatchObject([{ id: "daily", profile: "fiona" }]);
    await createCronJob("fiona", { name: "Daily", schedule: "0 7 * * *", prompt: "Run" });
    await runCronJobNow("fiona", "daily");
    await deleteCronJob("fiona", "daily");

    expect(hermesRest.mock.calls.slice(1)).toEqual([
      ["/api/cron/jobs?profile=fiona", {
        method: "POST",
        body: JSON.stringify({ deliver: "local", name: "Daily", schedule: "0 7 * * *", prompt: "Run" }),
      }],
      ["/api/cron/jobs/daily/trigger?profile=fiona", { method: "POST" }],
      ["/api/cron/jobs/daily?profile=fiona", { method: "DELETE" }],
    ]);
  });

  it("uses Hermes pause, resume, and run-history routes", async () => {
    hermesRest
      .mockResolvedValueOnce({ id: "daily", enabled: false })
      .mockResolvedValueOnce({ id: "daily", enabled: true })
      .mockResolvedValueOnce({ runs: [{ id: "run-1", started_at: "2026-09-04T07:00:00Z", ended_at: null, is_active: true }] });

    await pauseCronJob("fiona", "daily");
    await resumeCronJob("fiona", "daily");
    await expect(listCronJobRuns("fiona", "daily", 3)).resolves.toEqual([{
      id: "run-1",
      startedAt: "2026-09-04T07:00:00Z",
      endedAt: null,
      isActive: true,
      outcome: "running",
      preview: "",
    }]);

    expect(hermesRest.mock.calls).toEqual([
      ["/api/cron/jobs/daily/pause?profile=fiona", { method: "POST" }],
      ["/api/cron/jobs/daily/resume?profile=fiona", { method: "POST" }],
      ["/api/cron/jobs/daily/runs?profile=fiona&limit=3"],
    ]);
  });

  it("reads Hermes blueprint defaults instead of carrying a local preset catalog", async () => {
    hermesRest.mockResolvedValueOnce({ blueprints: [{
      key: "workday-start",
      title: "Workday start",
      schedule: "{minute} {hour} * * 1-5",
      scheduleHuman: "weekdays at 09:00",
      fields: [{ name: "time", type: "time", default: "09:00" }],
    }] });

    const blueprints = await listCronBlueprints();
    expect(defaultBlueprintSchedule(blueprints[0])).toBe("00 09 * * 1-5");
    expect(hermesRest).toHaveBeenCalledWith("/api/cron/blueprints");
  });

  it("maps boards and creates idempotent progress cards", async () => {
    hermesRest
      .mockResolvedValueOnce({ boards: [{ slug: "ops", name: "Operations", total: 4, is_current: true }] })
      .mockResolvedValueOnce({ task: { id: "card-1", title: "Collect", status: "todo", assignee: "fiona" } });

    expect(await listKanbanBoards()).toMatchObject([{ slug: "ops", total: 4, isCurrent: true }]);
    expect(await createKanbanCard("ops", {
      title: "Collect",
      body: "Gather inputs",
      assignee: "fiona",
      idempotencyKey: "run:collect",
    })).toEqual({ id: "card-1", title: "Collect", status: "todo", assignee: "fiona", projectId: null, latestSummary: null });
    expect(hermesRest.mock.calls[1]).toEqual([
      "/api/plugins/kanban/tasks?board=ops",
      {
        method: "POST",
        body: JSON.stringify({
          title: "Collect",
          body: "Gather inputs",
          assignee: "fiona",
          priority: 0,
          triage: false,
          idempotency_key: "run:collect",
        }),
      },
    ]);
  });

  it("maps a project board into display columns", async () => {
    hermesRest.mockResolvedValueOnce({
      latest_event_id: 42,
      columns: [{ name: "running", tasks: [{ id: "card-1", title: "Build", assignee: "keel", latest_summary: "Wired" }] }],
    });

    await expect(listKanbanBoard("app build")).resolves.toEqual([{
      name: "running",
      cards: [{
        id: "card-1",
        title: "Build",
        status: "running",
        assignee: "keel",
        projectId: null,
        latestSummary: "Wired",
      }],
    }]);
    expect(hermesRest).toHaveBeenCalledWith("/api/plugins/kanban/board?board=app%20build");
  });

  it("keeps the board cursor, moves cards through Hermes, and builds its event URL", async () => {
    hermesRest
      .mockResolvedValueOnce({ latest_event_id: 42, columns: [] })
      .mockResolvedValueOnce({ task: { id: "card/1", title: "Build", status: "review" } });

    await expect(getKanbanBoard("app build")).resolves.toEqual({ columns: [], latestEventId: 42 });
    await expect(moveKanbanCard("app build", "card/1", "review")).resolves.toMatchObject({
      id: "card/1",
      status: "review",
    });
    expect(hermesRest.mock.calls[1]).toEqual([
      "/api/plugins/kanban/tasks/card%2F1?board=app%20build",
      { method: "PATCH", body: JSON.stringify({ status: "review" }) },
    ]);
    expect(kanbanEventsUrl({ port: 56083, token: "a b&c" }, "app build", 42)).toBe(
      "ws://127.0.0.1:56083/api/plugins/kanban/events?token=a+b%26c&board=app+build&since=42",
    );
  });

  it("puts the workflow definition and progress-card identities into the cron prompt", () => {
    const prompt = scheduledWorkflowPrompt({
      workflow: { workflow_id: "weekly-review", name: "Weekly review", definition_version: 3 },
      definition: {
        schema: "intellizen.workflow/1",
        id: "weekly-review",
        name: "Weekly review",
        version: 3,
        trigger: { kind: "manual" },
        inputs: [],
        steps: [{
          id: "collect",
          kind: "role-assign",
          title: "Collect",
          role: "researcher",
          resolution: "primary-active-occupant",
          instructions: "Gather the week.",
          execution: "durable",
          verification: { required: true },
          timeoutMinutes: 20,
          next: null,
        }],
      },
      schedule: "0 7 * * 1",
      kanban: { board: "ops", cards: { collect: "card-1" } },
    });

    expect(prompt).toContain('"workflow_id": "weekly-review"');
    expect(prompt).toContain('"card_id": "card-1"');
    expect(prompt).toContain('"board": "ops"');
    expect(prompt).toContain("request approval before anything external-facing or irreversible");
    expect(prompt).toContain("Do not inspect IntelliZen source");
    expect(prompt).toContain("do not call raw SQL or the low-level advance_workflow_step tool");
    expect(prompt).toContain("Do not wait in process for Adam's answer");
  });
});
