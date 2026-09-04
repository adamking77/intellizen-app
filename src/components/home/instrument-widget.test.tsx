// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import type { ActivitySnapshot } from "@/lib/activity";
import type { HomeInstrumentPin } from "@/lib/home-pins";
import { ACTIVITY_QUERY_KEY, InstrumentWidget } from "./instrument-widget";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pin: HomeInstrumentPin = {
  id: "pin",
  kind: "instrument",
  instrumentId: "attention.waiting",
  title: "Waits on you",
  pinnedAt: "2026-09-04T00:00:00Z",
  x: 0,
  y: 0,
  w: 4,
  h: 9,
};

function snapshot(value: string): ActivitySnapshot {
  return {
    metrics: [{ id: "attention.waiting", section: "Attention", label: "Waits on you", value, word: "items", sparkline: [], tone: "waiting" }],
    waiting: [],
    updatedAt: Date.now(),
    errors: [],
  };
}

describe("InstrumentWidget", () => {
  it("renders the pinned measure and updates when its shared query refreshes", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const query = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    query.setQueryData(ACTIVITY_QUERY_KEY, snapshot("2"));
    await act(async () => root.render(<QueryClientProvider client={query}><InstrumentWidget pin={pin} /></QueryClientProvider>));
    expect(container.textContent).toContain("2items");

    await act(async () => {
      query.setQueryData(ACTIVITY_QUERY_KEY, snapshot("3"));
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(container.textContent).toContain("3items");
    await act(async () => root.unmount());
    container.remove();
  });
});
