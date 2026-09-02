// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  WorkspaceDatabaseChartType,
  WorkspaceDatabaseModel,
} from "@/lib/types";

vi.mock("@visx/responsive", () => ({
  ParentSize: ({ children }: { children: (size: { width: number; height: number }) => React.ReactNode }) =>
    children({ width: 640, height: 320 }),
}));

import { DatabaseChartView } from "./DatabaseChartView";

const roots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];

afterEach(async () => {
  for (const mounted of roots.splice(0)) {
    await act(async () => mounted.root.unmount());
    mounted.container.remove();
  }
});

function fixture(chartType: WorkspaceDatabaseChartType): WorkspaceDatabaseModel {
  return {
    id: "work",
    name: "Work",
    schema: [
      { id: "status", name: "Status", type: "status", options: ["Open", "Done"] },
      { id: "date", name: "Date", type: "date" },
      { id: "value", name: "Value", type: "number" },
    ],
    views: [{
      id: `chart-${chartType}`,
      name: chartType,
      type: "chart",
      chartType,
      groupBy: chartType === "line" ? "date" : "status",
      chartAggregation: chartType === "gauge" ? "sum" : "count",
      chartValueField: "value",
      chartGoalValue: 20,
      sort: [],
      filter: [],
      hiddenFields: [],
    }],
    records: [
      { id: "one", status: "Open", date: "2026-09-01", value: 7 },
      { id: "two", status: "Done", date: "2026-09-02", value: 5 },
      { id: "three", status: "Open", date: "2026-09-03", value: 4 },
    ],
  };
}

async function renderChart(chartType: WorkspaceDatabaseChartType) {
  const database = fixture(chartType);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });

  await act(async () => {
    root.render(
      <DatabaseChartView
        catalog={[]}
        compact
        compactHeightUnits={3}
        compactPixelHeight={320}
        compactPixelWidth={640}
        compactWidthUnits={6}
        database={database}
        onCreateRecord={() => undefined}
        view={database.views[0]}
      />,
    );
  });

  return container;
}

describe("DatabaseChartView", () => {
  for (const chartType of ["bar", "line", "donut", "pie", "gauge"] as const) {
    it(`renders ${chartType} through the shared chart kit`, async () => {
      const container = await renderChart(chartType);
      expect(container.querySelector("svg")).not.toBeNull();
      expect(container.textContent).not.toContain("No chart data");
    });
  }
});
