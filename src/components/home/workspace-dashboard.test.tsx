// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({
  listHomePinsFromWorkspace: vi.fn(),
  listWorkspaceDatabaseCatalog: vi.fn(),
  saveHomePinsToWorkspace: vi.fn(),
}));
vi.mock("@/lib/data", () => data);

import { WorkspaceDashboard } from "./workspace-dashboard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe("WorkspaceDashboard", () => {
  it("exists while blank and opens the database-view picker", async () => {
    data.listHomePinsFromWorkspace.mockResolvedValue([]);
    data.listWorkspaceDatabaseCatalog.mockResolvedValue([{
      id: "projects",
      name: "Projects",
      schema: [],
      headerFieldIds: [],
      records: [],
      views: [{ id: "active", name: "Active", type: "table", sort: [], filter: [], hiddenFields: [] }],
    }]);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await act(async () => {
      root.render(<MemoryRouter><QueryClientProvider client={query}><WorkspaceDashboard workspaceId="work" workspaceName="Client Work" /></QueryClientProvider></MemoryRouter>);
    });
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });

    expect(container.textContent).toContain("No widgets yet");
    const add = Array.from(container.querySelectorAll("button")).filter((button) => button.textContent?.includes("Add widget")).at(-1);
    await act(async () => add?.click());
    expect(container.textContent).toContain("Database views");
    expect(container.textContent).toContain("Active");
    expect(container.textContent).toContain("Projects · table");

    await act(async () => root.unmount());
    query.clear();
  });
});
