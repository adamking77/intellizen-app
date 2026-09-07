// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  catalog: vi.fn().mockResolvedValue([]),
  pins: vi.fn().mockResolvedValue([]),
  tasks: vi.fn().mockResolvedValue({ records: [] }),
  workflowRuns: vi.fn().mockResolvedValue([]),
  workflowApproval: vi.fn(),
  workflowCommitWarning: vi.fn(),
  activity: { model: { progress: [], openWorkflows: [] }, data: { runs: { data: [] as unknown[] }, connections: {}, hierarchy: { data: [] }, profiles: {}, sessionFolders: {}, usage: {} } },
  decideApproval: vi.fn(),
  decideClarify: vi.fn(),
  threads: {} as Record<string, unknown>,
  profiles: {} as Record<string, unknown>,
}));

vi.mock("@/lib/data", () => ({
  listWorkspaceDatabaseCatalog: api.catalog,
  listHomePinsFromWorkspace: api.pins,
  saveHomePinsToWorkspace: vi.fn(),
  listWorkspaceDatabaseRecordFields: api.tasks,
  listWorkflowRuns: api.workflowRuns,
  resolveWorkflowApproval: api.workflowApproval,
  GENZEN_WORKSPACE_DATABASE_IDS: { tasks: "tasks" },
}));
vi.mock("@/lib/home-pins", () => ({
  loadHomePins: () => [], createDatabaseHomePin: vi.fn(), createPluginHomePin: vi.fn(),
  isDatabaseViewHomePin: () => false, isGenuiHomePin: () => false, isInstrumentHomePin: () => false, isPluginHomePin: () => false,
  patchHomePinPlacements: (pins: unknown) => pins, patchHomePinMetadata: (pins: unknown) => pins, removeHomePinById: (pins: unknown) => pins,
  restoreHomePin: (pins: unknown) => pins, pinsForDashboard: () => [], saveHomePins: vi.fn(), supportsPinnedHomeView: () => true,
}));
vi.mock("@/lib/home-pin-mutations", () => ({ mutateAuthoritativeHomePins: vi.fn() }));
vi.mock("@/lib/genui-pins", () => ({ loadGenuiPins: () => [], migrateLegacyGenuiPins: vi.fn() }));
vi.mock("@/lib/home-widget-presets", () => ({ buildHomeWidgetPresets: () => [], isHomeWidgetPresetPinned: () => false }));
vi.mock("@/lib/home-dashboard", () => ({
  loadHomeDashboardLayout: () => [], mergeHomeDashboardLayout: () => [], pinnedDatabaseRecordPath: vi.fn(), saveHomeDashboardLayout: vi.fn(),
}));
vi.mock("@/plugins/home-widgets", () => ({ clearLegacyPluginWidgetKeys: vi.fn(), parseWidgetKey: vi.fn(), PluginWidgetMenuItems: () => null, readLegacyPluginWidgetKeys: () => [] }));
vi.mock("@/components/home/pinned-view-grid", () => ({ PinnedViewGrid: () => <p>Grid</p> }));
vi.mock("@/store", () => ({ useAppStore: () => undefined }));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn(), info: api.workflowCommitWarning } }));
vi.mock("@/components/activity/use-activity", () => ({
  useActivity: () => api.activity,
}));
vi.mock("@/engine/session-store", () => ({
  useSessionStore: Object.assign(
    (select: (state: object) => unknown) => select({ threads: api.threads, profileDirectory: api.profiles, decideApproval: api.decideApproval, decideClarify: api.decideClarify }),
    { getState: () => ({ threads: api.threads, decideApproval: api.decideApproval, decideClarify: api.decideClarify }) },
  ),
}));
vi.mock("@/rooms/group-chat", () => ({ $groupChats: {}, $groupClarify: {} }));
vi.mock("@/rooms/store", () => ({ useValue: () => ({}) }));
vi.mock("@/components/agent/panel-room", () => ({ runRoomAction: vi.fn() }));
vi.mock("@/lib/data/work-receipts", () => ({ listWorkEvents: vi.fn().mockResolvedValue([]) }));

import { HomeView } from "./Home";
import { resetSessionModeForTests, SESSION_MODE_KEY, setRestingAgents } from "@/lib/session-mode";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
let client: QueryClient;

beforeEach(() => {
  localStorage.clear();
  resetSessionModeForTests();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.threads = {};
  api.tasks.mockResolvedValue({ records: [] });
  api.profiles = {};
  api.decideApproval.mockReset();
  api.decideClarify.mockReset();
  api.workflowRuns.mockReset();
  api.workflowApproval.mockReset();
  api.workflowCommitWarning.mockReset();
  api.activity = { model: { progress: [], openWorkflows: [] }, data: { runs: { data: [] }, connections: {}, hierarchy: { data: [] }, profiles: {}, sessionFolders: {}, usage: {} } };
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  client.clear();
});

it("opens Thinking from availability and keeps the pinned grid behind Cmd+.", async () => {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><HomeView /></MemoryRouter></QueryClientProvider>));
  expect(host.textContent).toContain("What is actually available today?");
  const thinking = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Thinking"));
  expect(thinking).toBeTruthy();
  await act(async () => thinking!.click());
  expect(host.textContent).toContain("There are no questions for you.");
  expect(host.textContent).not.toContain("Pinned views");
  await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: ".", metaKey: true, bubbles: true })));
  expect(host.textContent).toContain("Pinned views");
});

it("opens an Executing move in its actual task record", async () => {
  api.tasks.mockResolvedValue({ records: [{ id: "task-1", fields: { task_name: "Review the brief", task_status: "In progress" } }], complete: false });
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><HomeView /></MemoryRouter></QueryClientProvider>));
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Executing"))!.click());
  expect([...host.querySelectorAll("a")].find((link) => link.textContent === "Review the brief")?.getAttribute("href")).toBe("/databases/tasks?record=task-1");
  expect(host.textContent).toContain("this menu and its count are incomplete");
});

it("answers a profile question through its owning session", async () => {
  const decision = { kind: "approval", requestId: "request-1", command: "Save", description: "Save the report", choices: ["once"], messageId: "message-1", at: 1 };
  api.threads = { fiona: { profile: "fiona", transcript: { pending: [decision] } } };
  api.profiles = { fiona: { name: "fiona", displayName: "Fiona" } };
  api.decideApproval.mockResolvedValue(undefined);
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><HomeView /></MemoryRouter></QueryClientProvider>));
  const deciding = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Deciding"))!;
  await act(async () => deciding.click());
  expect(host.textContent).toContain("Profile session · Fiona");
  const allow = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Allow once"))!;
  await act(async () => allow.click());
  expect(api.decideApproval).toHaveBeenCalledWith("fiona", decision, "once");
});

it("hides a quiet agent question locally and restores it without changing the pending request", async () => {
  const decision = { kind: "approval", requestId: "request-1", command: "Save", description: "Save the report", choices: ["once"], messageId: "message-1", at: 1 };
  api.threads = { fiona: { profile: "fiona", transcript: { pending: [decision] } } };
  api.profiles = { fiona: { name: "fiona", displayName: "Fiona" } };
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><HomeView /></MemoryRouter></QueryClientProvider>));
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Deciding"))!.click());
  expect(host.textContent).toContain("Profile session · Fiona");

  await act(async () => setRestingAgents(["hermes:fiona"]));
  expect(host.textContent).toContain("No question is pending right now.");
  expect((api.threads.fiona as { transcript: { pending: unknown[] } }).transcript.pending).toEqual([decision]);

  await act(async () => setRestingAgents([]));
  expect(host.textContent).toContain("Profile session · Fiona");
});

it("uses Thinking in the dock after restart while showing the remembered answer only as a hint", async () => {
  localStorage.setItem(SESSION_MODE_KEY, JSON.stringify({ launchId: "previous", mode: "not_today", lastAvailabilityAnswer: "not_today" }));
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><HomeView /></MemoryRouter></QueryClientProvider>));
  expect(host.textContent).toContain("Last time: not today.");
  expect(host.querySelector('[data-home-dock] button[aria-pressed="true"]')?.textContent).toBe("Thinking");
});

it("rechecks and resolves a workflow approval by its run identity", async () => {
  const run = { id: "run-1", name: "Publish brief", status: "Needs approval", actor: "Fiona", owner_role: null, current_step: "Approval requested: publish", current_step_id: "approve", approvals: { approve: { approvalId: "approval-1", decision: null, payloadHash: "sha256:exact", payloadSnapshot: { target: "brief" } } }, run_version: 2, updated_at: "2026-09-07T12:00:00.000Z" };
  api.activity = { ...api.activity, data: { ...api.activity.data, runs: { data: [run] } } };
  api.workflowRuns.mockResolvedValue([run]);
  api.workflowApproval.mockResolvedValue({ write_performed: true, receipt_error: "receipt unavailable" });
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><HomeView /></MemoryRouter></QueryClientProvider>));
  const deciding = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Deciding"))!;
  await act(async () => deciding.click());
  expect(host.textContent).toContain("Workflow approval · Fiona");
  const approve = [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Approve exact payload"))!;
  await act(async () => approve.click());
  expect(api.workflowRuns).toHaveBeenCalledWith({ status: "Needs approval", limit: 100 });
  expect(host.textContent).toContain('"target": "brief"');
  expect(api.workflowApproval).toHaveBeenCalledWith(expect.objectContaining({ workflowRunId: "run-1", decision: "approved", approvalId: "approval-1", expectedRunVersion: 2, expectedStepId: "approve", expectedPayloadHash: "sha256:exact", expectedUpdatedAt: "2026-09-07T12:00:00.000Z", decidedBy: "Adam", confirmWrite: true }));
  expect(api.workflowCommitWarning).toHaveBeenCalledWith("Workflow approval recorded", expect.objectContaining({ description: expect.stringContaining("receipt unavailable") }));
});

it("does not call a legacy workflow request an exact payload", async () => {
  const run = { id: "run-legacy", name: "Legacy review", status: "Needs approval", actor: "Fiona", owner_role: null, current_step: "Approve", current_step_id: "approve", approvals: { approve: { approvalId: "approval-old", decision: null } }, run_version: null, updated_at: "2026-09-07T12:00:00.000Z" };
  api.activity = { ...api.activity, data: { ...api.activity.data, runs: { data: [run] } } };
  api.workflowRuns.mockResolvedValue([run]);
  api.workflowApproval.mockResolvedValue({ write_performed: true });
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><HomeView /></MemoryRouter></QueryClientProvider>));
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Deciding"))!.click());
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Approve recorded approval"))!.click());
  expect(api.workflowApproval).toHaveBeenCalledWith(expect.objectContaining({ decisionSummary: "Approved the recorded workflow request." }));
});
