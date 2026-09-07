// @vitest-environment happy-dom
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { addWorkflowDesignerStep, createWorkflowDesignerDraft } from "@/lib/workflow-designer";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowRunDrawer } from "./workflow-run-drawer";
import type { WorkflowRunItem } from "@/lib/types";
const mocks = vi.hoisted(() => ({ get: vi.fn(), project: vi.fn(), events: vi.fn(), approval: vi.fn(), dispatch: vi.fn() }));
vi.mock("@/lib/data", () => ({ GENZEN_WORKSPACE_DATABASE_IDS: { workflowRuns: "runs-db" }, getWorkspaceRecord: mocks.get, toWorkflowRunItem: mocks.project, resolveWorkflowApproval: mocks.approval }));
vi.mock("@/lib/data/work-receipts", () => ({ listWorkEvents: mocks.events }));
vi.mock("@/services/workflow-dispatch", () => ({ dispatchWorkflowRun: mocks.dispatch }));
vi.mock("./workflow-detail", () => ({ runDuration: () => "2m" }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>; let host: HTMLDivElement; let client: QueryClient;
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); client?.clear(); vi.clearAllMocks(); });

function meanwhileRun(sideState?: string) {
  const definition = addWorkflowDesignerStep(addWorkflowDesignerStep(createWorkflowDesignerDraft({ id: "drawer-meanwhile", name: "Drawer meanwhile" }), "approval"), "role-assign");
  const [, approval, side] = definition.steps;
  if (approval.kind !== "approval" || side.kind !== "role-assign") throw new Error("Unexpected workflow fixture");
  approval.title = "Approve fixture";
  approval.next = "complete";
  approval.meanwhile = [side.id];
  side.title = "Prepare synthetic payload";
  side.next = null;
  side.execution = "ephemeral";
  side.mediatedAuthority = "read-only";
  side.verification = { required: false };
  return {
    run: {
      id: "meanwhile-run", name: "Meanwhile run", status: "Needs approval", schema_version: "intellizen.workflow/1",
      definition_snapshot: definition, current_step_id: approval.id, current_step: "Queued: Prepare synthetic approval payload",
      step_states: { [approval.id]: "running", ...(sideState ? { [side.id]: sideState } : {}) }, run_version: 7,
      approvals: { [approval.id]: { approvalId: "approval-fixture", stepId: approval.id, decision: null, requiredRole: "founder_approval_authority", payloadHash: "sha256:fixture", payloadSnapshot: { fixture: true } } },
      updated_at: "2026-09-07T17:00:00Z",
    } as WorkflowRunItem,
    approvalId: approval.id,
  };
}

describe("exact workflow run drawer", () => {
  it("loads the requested run and renders full receipts and full record notes", async () => {
    const run = { id: "exact-run", name: "Exact requested run", status: "Done", receipt: `Receipt start\n\n${"long content ".repeat(80)}\n\nReceipt end`, definition_snapshot: createWorkflowDesignerDraft({ id: "historical", name: "Historical definition" }), actor: "Fiona", context: JSON.stringify({ request: "Context value" }) } as WorkflowRunItem;
    mocks.get.mockResolvedValue({ database_id: "runs-db", updated_at: "2026-01-01T00:00:00Z", body: "Full record notes, including approval context." }); mocks.project.mockReturnValue(run); mocks.events.mockResolvedValue([{ id: "receipt-1", workflow_run_id: "exact-run", event_kind: "assignment_created", actor: "Fiona", durable_role: null, decision_role: null, summary: "Fiona was assigned", payload: { assignmentId: "assignment-1", resolution: { selectedAgent: "Fiona" } }, run_version: 1, step_id: null, assignment_id: "assignment-1", runtime_session_id: null, created_at: "2026-01-01T00:00:00Z" }]);
    host = document.createElement("div"); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><WorkflowRunDrawer runId="exact-run" item={null} onClose={() => {}} /></QueryClientProvider></MemoryRouter>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(mocks.get).toHaveBeenCalledWith("exact-run");
    expect(host.querySelector('a[href="/databases/runs-db?record=exact-run"]')).toBeTruthy();
    expect(host.textContent).toContain("Historical definition");
    expect(host.textContent).toContain("Receipt end"); expect(host.textContent).toContain("Full record notes, including approval context.");
    expect(host.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Exact requested run");
    const context = host.querySelector("details");
    expect(context?.open).toBe(false);
    expect(context?.querySelector("pre")?.textContent).toBe('{\n  "request": "Context value"\n}');
    expect(context?.querySelector("pre")?.className).toContain("break-words");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Open full-page run"]')!.click());
    expect(host.querySelector('[aria-label="Exit full-page run"]')).toBeTruthy();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(host.querySelector('[aria-label="Run timeline"]')?.textContent).toContain("Fiona was assigned");
  });
  it("rejects an exact ID from a different database without presenting it as a run", async () => {
    mocks.get.mockResolvedValue({ database_id: "other-db", body: "Unrelated document" });
    host = document.createElement("div"); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><WorkflowRunDrawer runId="wrong-record" item={null} onClose={() => {}} /></QueryClientProvider></MemoryRouter>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(host.textContent).toContain("Could not load this run"); expect(host.textContent).not.toContain("Unrelated document"); expect(mocks.project).not.toHaveBeenCalled();
  });

  it("shows a resume warning after recording an exact current-step approval", async () => {
    const run = { id: "approval-run", name: "Approve release", status: "Needs approval", schema_version: "intellizen.workflow/1", current_step_id: "approve", current_step: "Approve release", run_version: 3, updated_at: "2026-01-01T00:00:00Z", approvals: { approve: { approvalId: "approval-1", stepId: "approve", decision: null, requiredRole: "founder_approval_authority", payloadHash: "sha256:release", payloadSnapshot: { release: "v1" } } } } as WorkflowRunItem;
    let currentRun = run;
    mocks.get.mockResolvedValue({ database_id: "runs-db", updated_at: "2026-01-01T00:00:00Z", body: "" }); mocks.project.mockImplementation(() => currentRun); mocks.events.mockResolvedValue([]); mocks.approval.mockImplementation(async () => { currentRun = { ...run, status: "In progress", approvals: { approve: { approvalId: "approval-1", stepId: "approve", decision: "approved", requiredRole: "founder_approval_authority", payloadHash: "sha256:release", payloadSnapshot: { release: "v1" } } } }; return { write_performed: true, resume_error: "Codex binding stopped" }; });
    host = document.createElement("div"); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><WorkflowRunDrawer runId="approval-run" item={null} onClose={() => {}} /></QueryClientProvider></MemoryRouter>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Open full-page run"]')!.click());
    await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("Approve this version"))!.click());
    expect(mocks.approval).toHaveBeenCalledWith(expect.objectContaining({ workflowRunId: "approval-run", approvalId: "approval-1", decisionRole: "founder_approval_authority" }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(host.textContent).toContain("In progress");
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Codex binding stopped");
  });

  it("uses immutable current-step identity and starts queued waiting work on the same fresh run", async () => {
    const { run } = meanwhileRun("queued");
    const record = { id: run.id, database_id: "runs-db", updated_at: run.updated_at, body: "" };
    mocks.get.mockResolvedValue(record); mocks.project.mockReturnValue(run); mocks.events.mockResolvedValue([]); mocks.dispatch.mockResolvedValue({ status: "needs_approval" });
    host = document.createElement("div"); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><WorkflowRunDrawer runId={run.id} item={null} onClose={() => {}} /></QueryClientProvider></MemoryRouter>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(host.textContent).toContain("Approve fixture — running");
    expect(host.textContent).not.toContain("Queued: Prepare synthetic approval payload");
    const action = [...host.querySelectorAll("button")].find((button) => button.textContent === "Start waiting work");
    expect(action).toBeTruthy();
    await act(async () => { action!.click(); action!.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(mocks.get.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(mocks.dispatch).toHaveBeenCalledTimes(1);
    expect(mocks.dispatch).toHaveBeenCalledWith(run);
  });

  it.each([undefined, "running", "completed"])("does not offer waiting work when its state is %s", async (sideState) => {
    const { run } = meanwhileRun(sideState);
    mocks.get.mockResolvedValue({ id: run.id, database_id: "runs-db", updated_at: run.updated_at, body: "" }); mocks.project.mockReturnValue(run);
    host = document.createElement("div"); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><WorkflowRunDrawer runId={run.id} item={null} onClose={() => {}} /></QueryClientProvider></MemoryRouter>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect([...host.querySelectorAll("button")].some((button) => button.textContent === "Start waiting work")).toBe(false);
  });

  it("rechecks queued waiting work before dispatching", async () => {
    const cached = meanwhileRun("queued").run;
    const fresh = meanwhileRun("running").run;
    const record = { id: cached.id, database_id: "runs-db", updated_at: cached.updated_at, body: "" };
    mocks.get.mockResolvedValue(record); mocks.project.mockReturnValueOnce(cached).mockReturnValue(fresh);
    host = document.createElement("div"); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><WorkflowRunDrawer runId={cached.id} item={null} onClose={() => {}} /></QueryClientProvider></MemoryRouter>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Start waiting work")!.click());
    await act(async () => { await vi.waitFor(() => expect(host.querySelector('[role="alert"]')).toBeTruthy()); });
    expect(mocks.dispatch).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("no longer queued");
  });

});
