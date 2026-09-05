import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const { context } = vi.hoisted(() => ({ context: {
  data: [{ name: "Blocked", count: 1, other: 2 }],
  barScale: () => 50,
  bandWidth: 500,
  barXAccessor: (row: Record<string, unknown>) => String(row.name),
  yScale: (value: number) => 200 - value * 50,
  innerHeight: 200,
  isLoaded: true,
  hoveredBarIndex: null,
  lines: [{ dataKey: "count" }],
  orientation: "vertical",
  stacked: false,
} }));
vi.mock("./chart-context", () => ({
  chartCssVars: { linePrimary: "black" },
  useChart: () => context,
  useChartStable: () => context,
}));
import { Bar } from "./bar";

function rectangle(maxWidth?: number, dataKey = "count") {
  const markup = renderToStaticMarkup(<svg><Bar dataKey={dataKey} animate={false} maxWidth={maxWidth} /></svg>);
  return Object.fromEntries([...markup.matchAll(/\b(x|y|width|height)="([\d.-]+)"/g)].map((match) => [match[1], Number(match[2])]));
}
beforeEach(() => {
  context.bandWidth = 500;
  context.lines = [{ dataKey: "count" }];
  context.orientation = "vertical";
  context.stacked = false;
});
it("caps sparse bars and centers them under the unchanged category label and hover target", () => {
  const bar = rectangle(28);
  expect(bar.width).toBe(28);
  expect(bar.x + bar.width / 2).toBe(50 + context.bandWidth / 2);
  expect(bar.height).toBe(50);
});
it("shrinks dense bars to available space and leaves uncapped charts unchanged", () => {
  context.bandWidth = 12;
  expect(rectangle(28)).toEqual(rectangle());
  expect(rectangle(28).width).toBe(12);
});
it("centers a capped group while preserving the gap between series", () => {
  context.lines.push({ dataKey: "other" });
  const first = rectangle(16);
  const second = rectangle(16, "other");
  expect(first.width).toBe(16);
  expect(second.x - first.x - first.width).toBe(4);
  expect((first.x + second.x + second.width) / 2).toBe(300);
});
it("caps horizontal and stacked category thickness without moving the value baseline", () => {
  context.stacked = true;
  expect(rectangle(28).x).toBe(286);
  context.orientation = "horizontal";
  const bar = rectangle(28);
  expect(bar.height).toBe(28);
  expect(bar.y + bar.height / 2).toBe(300);
  expect(bar.x).toBe(0);
});
