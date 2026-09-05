// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkflowsView, newWorkflowTemplate } from "./Workflows";
import { storeWorkflowDesignerDraft } from "@/lib/workflow-designer";
const mocks = vi.hoisted(() => ({ list: vi.fn(), record: vi.fn(), roles: vi.fn() }));
vi.mock("@/lib/data", () => ({ GENZEN_WORKSPACE_DATABASE_IDS: { workflowRegistry: "registry" }, listWorkflows: mocks.list, getWorkspaceRecord: mocks.record, toWorkflowTemplateItem: (record: unknown) => record }));
vi.mock("@/services/agent-panel-roles", () => ({ listAgentPanelRoleTargets: mocks.roles }));
vi.mock("@/store", () => ({ useAppStore: (selector: (state: { entityFilter: null }) => unknown) => selector({ entityFilter: null }) }));
vi.mock("@/components/workflows/workflow-workspace", () => ({ WorkflowWorkspace: ({ item }: { item: { workflow: { name: string } } }) => <div data-composer>Composer {item.workflow.name}</div> }));
vi.mock("@/components/workflows/workflow-run-drawer", () => ({ WorkflowRunDrawer: ({ runId }: { runId: string }) => <div data-run>{runId}</div> }));
vi.mock("@/lib/view-transitions", () => ({ runViewTransition: (_: unknown, action: () => void) => action() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>; let host: HTMLDivElement; let client: QueryClient;
const first = { ...newWorkflowTemplate("workflow-one"), id: "first", name: "First design", database_id: "registry" };
const second = { ...newWorkflowTemplate("workflow-two"), id: "second", name: "Second design", database_id: "registry" };
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); mocks.list.mockResolvedValue([first, second]); mocks.roles.mockResolvedValue([]); mocks.record.mockImplementation(async (id) => id === "second" ? second : first); host = document.createElement("div"); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); client.clear(); vi.clearAllMocks(); });
function Probe() { const location = useLocation(); const navigate = useNavigate(); return <><output data-location>{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>Browser back</button></>; }
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); }); }
async function render(url = "/workflows") { await act(async () => root.render(<MemoryRouter initialEntries={[url]}><QueryClientProvider client={client}><WorkflowsView /><Probe /></QueryClientProvider></MemoryRouter>)); await settle(); await settle(); }
async function click(text: string) { const button = [...host.querySelectorAll("button")].find((node) => node.textContent?.includes(text)); expect(button, text).toBeTruthy(); await act(async () => button!.click()); await settle(); await settle(); }
it("lands on the card library without silently selecting a workflow", async () => { await render(); expect(host.querySelector('[aria-label="Workflow library"]')).toBeTruthy(); expect(host.querySelector("[data-composer]")).toBeNull(); expect(mocks.record).not.toHaveBeenCalled(); });
it("opens the chosen composer and browser back restores the library", async () => { await render(); await click("Second design"); expect(host.querySelector("[data-composer]")?.textContent).toBe("Composer Second design"); expect(host.querySelector('[aria-label="Workflow library"]')).toBeNull(); expect(mocks.record).toHaveBeenCalledWith("second"); await click("Browser back"); expect(host.querySelector('[aria-label="Workflow library"]')).toBeTruthy(); expect(host.querySelector("[data-composer]")).toBeNull(); });
it("resolves an exact workflow outside the library page", async () => { mocks.list.mockResolvedValue([first]); await render("/workflows?workflow=second"); expect(host.querySelector("[data-composer]")?.textContent).toContain("Second design"); });
it("does not substitute the first workflow when an explicit selection fails", async () => { mocks.record.mockRejectedValue(new Error("Missing record")); await render("/workflows?workflow=missing"); expect(host.textContent).toContain("Workflow unavailable"); expect(host.querySelector("[data-composer]")).toBeNull(); });
it("opens a direct historical run without selecting a different design", async () => { await render("/workflows?run=old-exact-run"); expect(host.querySelector("[data-run]")?.textContent).toBe("old-exact-run"); expect(host.querySelector("[data-composer]")).toBeNull(); });
it("creates an addressable local draft without a Registry write", async () => { await render(); await click("New workflow"); expect(host.querySelector("[data-location]")?.textContent).toMatch(/\/workflows\?draft=workflow-/); expect(host.querySelector("[data-composer]")).toBeTruthy(); expect(mocks.record).not.toHaveBeenCalled(); });
it("recovers unsaved new drafts as library cards after remount", async () => { const id = "workflow-00000000-0000-4000-8000-000000000001"; const template = newWorkflowTemplate(id); storeWorkflowDesignerDraft(id, { definition: { ...(template.definition as import("@/lib/workflow-schema").WorkflowDefinitionV1), name: "Recovered idea" }, baseUpdatedAt: "" }); await render(); expect(host.textContent).toContain("Local draft"); expect(host.querySelector('[aria-label="Edit Recovered idea"]')).toBeTruthy(); await click("Recovered idea"); expect(host.querySelector("[data-location]")?.textContent).toBe(`/workflows?draft=${id}`); });
