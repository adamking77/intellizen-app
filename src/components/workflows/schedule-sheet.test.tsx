// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const services = vi.hoisted(() => ({
  createCronJob: vi.fn(),
  createKanbanCard: vi.fn(),
  deleteCronJob: vi.fn(),
  fetchHermesProfiles: vi.fn(),
  listCronJobs: vi.fn(),
  listCronJobRuns: vi.fn(),
  listCronBlueprints: vi.fn(),
  listKanbanBoards: vi.fn(),
  pauseCronJob: vi.fn(),
  resumeCronJob: vi.fn(),
  runCronJobNow: vi.fn(),
}));

vi.mock("@/services/agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/agent")>()),
  fetchHermesProfiles: services.fetchHermesProfiles,
}));
vi.mock("@/services/hermes-cron", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/hermes-cron")>()),
  createCronJob: services.createCronJob,
  deleteCronJob: services.deleteCronJob,
  listCronJobs: services.listCronJobs,
  listCronJobRuns: services.listCronJobRuns,
  listCronBlueprints: services.listCronBlueprints,
  pauseCronJob: services.pauseCronJob,
  resumeCronJob: services.resumeCronJob,
  runCronJobNow: services.runCronJobNow,
}));
vi.mock("@/services/hermes-kanban", () => ({
  createKanbanCard: services.createKanbanCard,
  listKanbanBoards: services.listKanbanBoards,
}));
vi.mock("@/lib/toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/toast")>()),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { ScheduleSheet } from "./schedule-sheet";
import type { WorkflowTemplateItem } from "@/lib/types";
import type { WorkflowDefinitionV1 } from "@/lib/workflow-schema";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const workflow = {
  id: "workflow-record",
  workflow_id: "weekly-review",
  name: "Weekly review",
  definition_version: 1,
} as WorkflowTemplateItem;

const definition: WorkflowDefinitionV1 = {
  schema: "intellizen.workflow/1",
  id: "weekly-review",
  name: "Weekly review",
  version: 1,
  trigger: { kind: "manual" },
  inputs: [],
  steps: [{
    id: "collect",
    kind: "role-assign",
    title: "Collect",
    role: "researcher",
    resolution: "primary-active-occupant",
    instructions: "Collect inputs.",
    execution: "durable",
    verification: { required: true },
    timeoutMinutes: 20,
    next: null,
  }],
};

let mounted: { root: ReturnType<typeof createRoot>; container: HTMLDivElement; query: QueryClient } | null;

async function settle() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mounted = { root, container, query };
  await act(async () => {
    root.render(
      <QueryClientProvider client={query}>
        <ScheduleSheet definition={definition} onOpenChange={() => undefined} open workflow={workflow} />
      </QueryClientProvider>,
    );
  });
  await settle();
  await settle();
  return document.body;
}

beforeEach(() => {
  services.fetchHermesProfiles.mockResolvedValue([{ name: "fiona", displayName: "Fiona", isDefault: true }]);
  services.listKanbanBoards.mockResolvedValue([{ slug: "ops", name: "Operations", total: 3 }]);
  services.listCronJobs.mockResolvedValue([]);
  services.listCronJobRuns.mockResolvedValue([]);
  services.listCronBlueprints.mockResolvedValue([{
    key: "workday-start",
    title: "Workday start",
    schedule: "{minute} {hour} * * 1-5",
    scheduleHuman: "weekdays at 09:00",
    fields: [{ name: "time", type: "time", default: "09:00" }],
  }]);
  services.createKanbanCard.mockResolvedValue({ id: "card-1", title: "Collect", status: "todo", assignee: "fiona" });
  services.createCronJob.mockResolvedValue({ id: "cron-1" });
  services.deleteCronJob.mockResolvedValue(undefined);
  services.runCronJobNow.mockResolvedValue({ id: "cron-1" });
  services.pauseCronJob.mockResolvedValue({ id: "cron-1", enabled: false });
  services.resumeCronJob.mockResolvedValue({ id: "cron-1", enabled: true });
});

afterEach(async () => {
  vi.clearAllMocks();
  if (!mounted) return;
  await act(async () => mounted?.root.unmount());
  mounted.query.clear();
  mounted.container.remove();
  mounted = null;
});

describe("ScheduleSheet", () => {
  it("creates visible progress cards and then the cron schedule", async () => {
    const body = await mount();
    expect(body.textContent).toContain("Schedule Weekly review");
    expect(body.textContent).toContain("weekdays at 09:00");

    const selects = body.querySelectorAll("select");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(selects[2], "ops");
      selects[2].dispatchEvent(new Event("change", { bubbles: true }));
    });
    const create = Array.from(body.querySelectorAll("button")).find((button) => button.textContent?.includes("Create schedule"))!;
    await act(async () => create.click());
    await settle();

    expect(services.createKanbanCard).toHaveBeenCalledWith("ops", expect.objectContaining({ assignee: "fiona" }));
    expect(services.createCronJob).toHaveBeenCalledWith(
      "fiona",
      expect.objectContaining({ prompt: expect.stringContaining('"card_id": "card-1"') }),
    );
  });

  it("requires a second click before deleting a schedule", async () => {
    services.listCronJobs.mockResolvedValue([{ id: "cron-1", name: "IntelliZen · Weekly review", scheduleDisplay: "Weekdays", profile: "fiona", state: "scheduled", enabled: true, lastStatus: null, nextRunAt: null, prompt: "" }]);
    const body = await mount();
    const first = body.querySelector<HTMLButtonElement>('button[aria-label="Delete Weekdays"]')!;
    await act(async () => first.click());
    expect(services.deleteCronJob).not.toHaveBeenCalled();

    const confirm = body.querySelector<HTMLButtonElement>('button[aria-label="Confirm delete Weekdays"]')!;
    await act(async () => confirm.click());
    await settle();
    expect(services.deleteCronJob).toHaveBeenCalledWith("fiona", "cron-1");
  });

  it("pauses and resumes an existing schedule", async () => {
    services.listCronJobs.mockResolvedValue([{ id: "cron-1", name: "IntelliZen · Weekly review", scheduleDisplay: "Weekdays", profile: "fiona", state: "scheduled", enabled: true, lastStatus: null, nextRunAt: null, prompt: "" }]);
    const body = await mount();
    const pause = body.querySelector<HTMLButtonElement>('button[aria-label="Pause Weekdays"]')!;
    await act(async () => pause.click());
    await settle();
    expect(services.pauseCronJob).toHaveBeenCalledWith("fiona", "cron-1");
  });

  it("resumes a paused schedule", async () => {
    services.listCronJobs.mockResolvedValue([{ id: "cron-1", name: "IntelliZen · Weekly review", scheduleDisplay: "Weekdays", profile: "fiona", state: "paused", enabled: false, lastStatus: null, nextRunAt: null, prompt: "" }]);
    const body = await mount();
    const resume = body.querySelector<HTMLButtonElement>('button[aria-label="Resume Weekdays"]')!;
    await act(async () => resume.click());
    await settle();
    expect(services.resumeCronJob).toHaveBeenCalledWith("fiona", "cron-1");
  });
});
