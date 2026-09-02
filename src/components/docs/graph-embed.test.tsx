// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const graph = vi.hoisted(() => ({ listGraphNodes: vi.fn(), listGraphEdges: vi.fn() }));
vi.mock("@/lib/data/graph", () => graph);

import { GraphEmbeds } from "./graph-embed";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let mounted: { root: ReturnType<typeof createRoot>; element: HTMLDivElement; query: QueryClient } | null;

afterEach(async () => {
  vi.clearAllMocks();
  if (!mounted) return;
  await act(async () => mounted?.root.unmount());
  mounted.query.clear();
  mounted.element.remove();
  mounted = null;
});

describe("GraphEmbeds", () => {
  it("renders a linked static graph from a document block", async () => {
    graph.listGraphNodes.mockResolvedValue([
      { id: 1, project_id: 7, node_id: "one", label: "One", entity_type: "person", position_x: 0, position_y: 0, created_at: "", updated_at: "" },
    ]);
    graph.listGraphEdges.mockResolvedValue([]);
    const element = document.createElement("div");
    document.body.appendChild(element);
    const root = createRoot(element);
    const query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mounted = { root, element, query };

    await act(async () => {
      root.render(
        <MemoryRouter>
          <QueryClientProvider client={query}>
            <GraphEmbeds markdown={'Before\n```graph {"id":"7","mode":"construct"}\n```'} />
          </QueryClientProvider>
        </MemoryRouter>,
      );
    });
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });

    expect(element.querySelector("svg")).not.toBeNull();
    expect(element.querySelector("a")?.getAttribute("href")).toBe("/graph?project=7");
    expect(element.textContent).toContain("Relationship graph · construct");
  });
});
