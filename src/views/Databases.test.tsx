// @vitest-environment happy-dom

import { act } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

const data = vi.hoisted(() => ({
  createWorkspaceDatabase: vi.fn(),
  deleteWorkspaceDatabase: vi.fn(),
  isOperationalSystemWorkspaceIcon: vi.fn(() => false),
  listWorkspaceDatabaseWayIn: vi.fn(),
  removeHomePinsForWorkspaceDatabase: vi.fn(),
}));

vi.mock("@/lib/data", () => data);
vi.mock("@/components/layout/collapsed-rail-trigger", () => ({ CollapsedRailTrigger: () => null }));
vi.mock("@/components/layout/collapsible-rail", () => ({ CollapsibleRail: ({ children }: { children: ReactNode }) => <aside>{children}</aside> }));
vi.mock("@/components/database/primitives/DatabaseConfirmDialog", () => ({ DatabaseConfirmDialog: () => null }));
vi.mock("@/components/ui/context-menu", () => ({ ContextMenu: () => null }));
vi.mock("@/components/database/primitives/DatabaseButton", () => ({ DatabaseButton: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }));
vi.mock("@/components/ui/venture-scope", () => ({ VentureScope: () => null }));
vi.mock("@/views/DatabaseEditor", () => ({ DatabaseEditorView: () => <p>Database editor</p> }));
vi.mock("@/lib/current-database", () => ({ loadCurrentDatabaseId: () => null, saveCurrentDatabaseId: vi.fn() }));
vi.mock("@/lib/home-pins", () => ({ loadHomePins: () => [], removeHomePinsForDatabase: (pins: unknown) => ({ pins, removed: false }), saveHomePins: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn() }, toastError: vi.fn() }));
vi.mock("@/store", () => ({ useAppStore: () => null }));

import { DatabasesView } from "./Databases";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

it("keeps the way-in unselected until an inventory row is chosen", async () => {
  let resolveDatabases!: (rows: unknown[]) => void;
  data.listWorkspaceDatabaseWayIn.mockReturnValue(new Promise((resolve) => { resolveDatabases = resolve; }));
  const rows = [{
    id: "tasks", name: "Tasks", entity: "genzen", icon: null, schema: [], header_field_ids: [], taxonomy: {},
    created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-02T00:00:00.000Z", recordCount: 7, revisionCount: 2, revisionCountCapped: false,
  }];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  await act(async () => root.render(<MemoryRouter initialEntries={["/databases"]}><QueryClientProvider client={query}><DatabasesView /></QueryClientProvider></MemoryRouter>));
  expect(host.textContent).toContain("Loading databases");
  expect(host.textContent).not.toContain("No databases yet");
  await act(async () => resolveDatabases(rows));
  await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
  expect(host.querySelector('[aria-label="Database inventory"]')).toBeTruthy();
  expect(host.textContent).not.toContain("Database editor");

  await act(async () => host.querySelector<HTMLElement>('[aria-label="Database inventory"] button')?.click());
  expect(host.textContent).toContain("Database editor");
  await act(async () => root.unmount());
  query.clear();
});
