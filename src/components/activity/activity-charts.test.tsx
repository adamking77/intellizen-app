// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const chartCalls = vi.hoisted(() => ({ bar: [] as Array<{ animationDuration?: number }>, line: [] as Array<{ animationDuration?: number }> }));
const policy = vi.hoisted(() => ({ modality: "pointer", enabled: true }));
vi.mock("@/components/ui/motion", () => ({ useMotionEnabled: () => policy.enabled, useInputModality: () => policy.modality }));
vi.mock("@/components/charts/bar-chart", () => ({ BarChart: (props: { animationDuration?: number }) => { chartCalls.bar.push(props); return <div />; } }));
vi.mock("@/components/charts/line-chart", () => ({ LineChart: (props: { animationDuration?: number }) => { chartCalls.line.push(props); return <div />; } }));
vi.mock("@/components/charts/bar", () => ({ Bar: () => null }));
vi.mock("@/components/charts/bar-x-axis", () => ({ BarXAxis: () => null }));
vi.mock("@/components/charts/bar-y-axis", () => ({ BarYAxis: () => null }));
vi.mock("@/components/charts/line", () => ({ Line: () => null }));
vi.mock("@/components/charts/x-axis", () => ({ XAxis: () => null }));
vi.mock("@/components/charts/y-axis", () => ({ YAxis: () => null }));
vi.mock("@/components/charts/grid", () => ({ Grid: () => null }));
vi.mock("@/components/charts/tooltip/chart-tooltip", () => ({ ChartTooltip: () => null }));
vi.mock("@/components/charts/pie-chart", () => ({ PieChart: ({ children }: { children?: ReactNode }) => <>{children}</> }));
vi.mock("@/components/charts/pie-slice", () => ({ PieSlice: () => null }));
vi.mock("@/components/charts/pie-center", () => ({ PieCenter: () => null }));

import { OutcomesChart, UsageChart } from "./activity-charts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { policy.modality = "pointer"; policy.enabled = true; chartCalls.bar = []; chartCalls.line = []; document.body.replaceChildren(); });

const model = {
  usageDays: [{ date: new Date("2026-09-07T00:00:00Z"), reported: 3, estimated: null }],
  outcomes: [{ name: "Completed", count: 1 }],
} as never;

it("reveals each cartesian chart only on its first mount, not when its display switches", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    await act(async () => root.render(<UsageChart model={model} style="bar" />));
    expect(chartCalls.bar.at(-1)?.animationDuration).toBe(240);
    await act(async () => root.render(<UsageChart model={model} style="line" />));
    expect(chartCalls.line.at(-1)?.animationDuration).toBe(0);
    await act(async () => root.render(<OutcomesChart model={model} style="bar" />));
    expect(chartCalls.bar.at(-1)?.animationDuration).toBe(240);
    await act(async () => root.render(<OutcomesChart model={model} style="ring" />));
    await act(async () => root.render(<OutcomesChart model={model} style="bar" />));
    expect(chartCalls.bar.at(-1)?.animationDuration).toBe(0);
  } finally { await act(async () => root.unmount()); }
});

it("keeps chart entry still after keyboard navigation and under reduced motion", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  try {
    policy.modality = "keyboard";
    await act(async () => root.render(<UsageChart model={model} style="bar" />));
    expect(chartCalls.bar.at(-1)?.animationDuration).toBe(0);
    policy.modality = "pointer";
    policy.enabled = false;
    await act(async () => root.render(<OutcomesChart model={model} style="bar" />));
    expect(chartCalls.bar.at(-1)?.animationDuration).toBe(0);
  } finally { await act(async () => root.unmount()); }
});
