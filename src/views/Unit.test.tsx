// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { buildTree, type HierarchyNode } from "@/lib/hierarchy";
import { UnitView } from "./Unit";

const data = vi.hoisted(() => ({ getDocumentsWorkspaceBundle: vi.fn().mockResolvedValue({ records: [] }), listWorkspaceDatabaseCatalog: vi.fn().mockResolvedValue([]), listWorkspaceDatabaseRecordFields: vi.fn() }));
vi.mock("@/lib/data", () => data);
vi.mock("@/services/hermes-kanban", () => ({ listKanbanBoards: vi.fn().mockResolvedValue([]), getKanbanBoard: vi.fn() }));
vi.mock("@/components/home/workspace-dashboard", () => ({ WorkspaceDashboard: () => null }));
vi.mock("@/lib/use-hierarchy", () => ({ useHierarchy: () => ({ tree: buildTree([
  { id: "department", kind: "department", name: "Department", parent_id: null },
  { id: "workspace", kind: "workspace", name: "Workspace", parent_id: "department" },
] as HierarchyNode[]), isLoading: false, error: null }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("shows the scoped not-doing list even without projects and excludes unscoped and other-workspace tasks", async () => {
  data.listWorkspaceDatabaseRecordFields.mockResolvedValue({ complete: false, records: [
    { id: "here", fields: { task_name: "Keep this out", task_kind: "keeping_out", task_scope_node_id: "workspace" } },
    { id: "elsewhere", fields: { task_name: "Private elsewhere", task_kind: "keeping_out", task_scope_node_id: "elsewhere" } },
    { id: "unscoped", fields: { task_name: "Unscoped choice", task_kind: "keeping_out" } },
  ] });
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<MemoryRouter initialEntries={["/unit/workspace"]}><QueryClientProvider client={query}><Routes><Route path="/unit/:id" element={<UnitView />} /></Routes></QueryClientProvider></MemoryRouter>));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(container.textContent).toContain("0 projects have a place here.");
  expect(container.textContent).toContain("Keep this out");
  expect(container.textContent).not.toContain("Private elsewhere");
  expect(container.textContent).not.toContain("Unscoped choice");
  expect(container.textContent).toContain("this list may be incomplete");
  expect(container.querySelector('a[href$="?record=here"]')).not.toBeNull();
  await act(async () => root.unmount()); query.clear(); container.remove();
});
