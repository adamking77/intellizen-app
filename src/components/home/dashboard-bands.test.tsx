// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { dashboardBand, PinnedViewGrid, type PinnedHomeWidgetModel } from "./pinned-view-grid";

vi.mock("react-grid-layout", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/home/instrument-widget", () => ({ InstrumentWidget: () => <p>Activity material</p> }));
vi.mock("@/components/agent/agent-chat-widget", () => ({ AgentChatWidget: () => <p>Generated material</p> }));
vi.mock("@/plugins/home-widgets", () => ({ PluginWidgetSurface: () => <p>Plugin material</p> }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

it("groups every pin kind deterministically without guessing from titles", () => {
  const pin = { kind: "instrument" as const, pinnedAt: "2026-09-07", id: "pin", x: 0, y: 0, w: 4, h: 11 };
  expect(dashboardBand({ kind: "database-view", pin } as unknown as PinnedHomeWidgetModel)).toBe("Reference");
  expect(dashboardBand({ kind: "plugin", pin: { ...pin, title: "Question" } } as unknown as PinnedHomeWidgetModel)).toBe("Reference");
  expect(dashboardBand({ kind: "genui", pin } as unknown as PinnedHomeWidgetModel)).toBe("Outputs");
  expect(dashboardBand({ kind: "instrument", pin: { ...pin, instrumentId: "activity.progress" } } as unknown as PinnedHomeWidgetModel)).toBe("In motion");
  expect(dashboardBand({ kind: "instrument", pin: { ...pin, instrumentId: "unknown", config: { band: "Question" } } } as unknown as PinnedHomeWidgetModel)).toBe("Question");
});

it("keeps workspace scope and placement while exposing removal only in Arrange", async () => {
  vi.stubGlobal("ResizeObserver", class { constructor(private callback: (entries: unknown[]) => void) {} observe() { this.callback([{ contentRect: { width: 800, height: 600 } }]); } disconnect() {} });
  const widget: PinnedHomeWidgetModel = { kind: "instrument", pin: { kind: "instrument", id: "attention", instrumentId: "activity.attention", x: 3, y: 7, w: 4, h: 11, pinnedAt: "2026-09-07", config: { dashboardScope: "workspace:work", period: "week" } } };
  const update = vi.fn();
  const layoutChange = vi.fn();
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  const button = (label: string) => [...container.querySelectorAll("button")].find((element) => element.getAttribute("aria-label") === label || element.textContent === label)!;
  await act(async () => root.render(<PinnedViewGrid widgets={[widget]} catalog={[]} layout={[{ i: "attention", x: 3, y: 7, w: 4, h: 11 }]} workspaceName="Client Work" onLayoutChange={layoutChange} onOpenWidget={vi.fn()} onOpenRecord={vi.fn()} onRemoveWidget={vi.fn()} onUpdateWidgetMetadata={update} />));
  expect(container.querySelector('section[aria-label="Question"]')).not.toBeNull();
  expect(container.textContent).toContain("Client Work · Activity");
  expect(button("Remove widget")).toBeUndefined();
  expect(container.querySelector(".db-dashboard-widget-grip")).toBeNull();
  await act(async () => button("Edit widget").click());
  const select = container.querySelector('select[aria-label="Widget band"]') as HTMLSelectElement;
  await act(async () => { select.value = "Reference"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => button("Save").click());
  expect(update.mock.calls[0][1].config).toEqual({ dashboardScope: "workspace:work", period: "week", band: "Reference" });
  await act(async () => button("Arrange").click());
  expect(button("Remove widget")).toBeDefined();
  expect(container.querySelector(".db-dashboard-widget-grip")).not.toBeNull();
  await act(async () => button("Done arranging").click());
  expect(button("Remove widget")).toBeUndefined();
  expect(layoutChange).not.toHaveBeenCalled();
  expect(widget.pin).toMatchObject({ x: 3, y: 7, w: 4, h: 11 });
  await act(async () => root.unmount());
});
