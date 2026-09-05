// @vitest-environment happy-dom
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import { createWorkflowDesignerDraft } from "@/lib/workflow-designer";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowRunDrawer } from "./workflow-run-drawer";
import type { WorkflowRunItem } from "@/lib/types";
const mocks = vi.hoisted(() => ({ get: vi.fn(), project: vi.fn() }));
vi.mock("@/lib/data", () => ({ GENZEN_WORKSPACE_DATABASE_IDS: { workflowRuns: "runs-db" }, getWorkspaceRecord: mocks.get, toWorkflowRunItem: mocks.project }));
vi.mock("./workflow-detail", () => ({ runDuration: () => "2m" }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>; let host: HTMLDivElement; let client: QueryClient;
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); client?.clear(); vi.clearAllMocks(); });
describe("exact workflow run drawer", () => {
  it("loads the requested run and renders full receipts and full record notes", async () => {
    const run = { id: "exact-run", name: "Exact requested run", status: "Done", receipt: `Receipt start\n\n${"long content ".repeat(80)}\n\nReceipt end`, definition_snapshot: createWorkflowDesignerDraft({ id: "historical", name: "Historical definition" }), actor: "Fiona", context: JSON.stringify({ request: "Context value" }) } as WorkflowRunItem;
    mocks.get.mockResolvedValue({ database_id: "runs-db", body: "Full record notes, including approval context." }); mocks.project.mockReturnValue(run);
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
  });
  it("rejects an exact ID from a different database without presenting it as a run", async () => {
    mocks.get.mockResolvedValue({ database_id: "other-db", body: "Unrelated document" });
    host = document.createElement("div"); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><WorkflowRunDrawer runId="wrong-record" item={null} onClose={() => {}} /></QueryClientProvider></MemoryRouter>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(host.textContent).toContain("Could not load this run"); expect(host.textContent).not.toContain("Unrelated document"); expect(mocks.project).not.toHaveBeenCalled();
  });

});
