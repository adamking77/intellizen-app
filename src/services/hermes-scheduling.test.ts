import { beforeEach, describe, expect, it, vi } from "vitest";

const hermesRest = vi.hoisted(() => vi.fn());
vi.mock("@/engine/rest", () => ({ hermesRest }));

import {
  createCronJob,
  deleteCronJob,
  listCronJobs,
  runCronJobNow,
  scheduledWorkflowPrompt,
} from "./hermes-cron";
import { createKanbanCard, listKanbanBoards } from "./hermes-kanban";

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
    })).toEqual({ id: "card-1", title: "Collect", status: "todo", assignee: "fiona" });
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
  });
});
