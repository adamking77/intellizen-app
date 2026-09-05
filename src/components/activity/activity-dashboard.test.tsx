// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { ActivityCardBody } from "./activity-card";
import type { WorkflowRunItem } from "@/lib/types";
import { ActivityDashboard } from "./activity-dashboard";
import { buildActivityDashboard, DEFAULT_ACTIVITY_FILTER, type ActivitySources } from "@/lib/activity-dashboard";
import type { HomePin } from "@/lib/home-pins";
const storage = vi.hoisted(() => ({ pins: [] as HomePin[], fail: false }));
vi.mock("@/lib/data", () => ({ listHomePinsFromWorkspace: async () => storage.pins, saveHomePinsToWorkspace: async (pins: HomePin[]) => { if (storage.fail) throw new Error("Offline"); storage.pins = pins; } }));
vi.mock("./use-activity", () => ({ useActivity: () => {
  const data: ActivitySources = { at: 10, runs: { data: [], at: 10 }, hierarchy: { data: [], at: 10 }, profiles: { data: [], at: 10 }, connections: { data: [], at: 10 }, sessionFolders: { data: {}, at: 10 }, usage: {} };
  return { data, model: buildActivityDashboard(data, DEFAULT_ACTIVITY_FILTER, {}, {}, {}), rooms: {}, refetch: vi.fn(), isPending: false, isFetching: false };
} }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => { storage.pins = []; storage.fail = false; localStorage.clear(); document.body.replaceChildren(); });

it("saves a real card pin through read/write/read and leaves a failed save open for retry", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), client = new QueryClient();
  await act(async () => root.render(<MemoryRouter><QueryClientProvider client={client}><ActivityDashboard /></QueryClientProvider></MemoryRouter>));
  async function click(label: string) {
    const button = [...host.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label || b.textContent === label);
    expect(button).toBeTruthy(); await act(async () => button!.click());
  }
  try {
    await click("Pin Needs attention to a dashboard");
    storage.fail = true;
    await click("Pin widget");
    expect(storage.pins).toHaveLength(0);
    expect(host.querySelector('dialog[aria-label="Pin Needs attention"]')?.hasAttribute("open")).toBe(true);
    storage.fail = false;
    await click("Pin widget");
    expect(storage.pins).toHaveLength(1);
    expect(storage.pins[0]).toMatchObject({ kind: "instrument", instrumentId: "activity.attention", config: { activity: DEFAULT_ACTIVITY_FILTER } });
    expect(client.getQueryData(["home-pins"])).toEqual(storage.pins);
    expect(host.querySelector("dialog[open]")).toBeNull();
  } finally { await act(async () => root.unmount()); client.clear(); }
});

it("restores a chart display selection and includes it when pinning that card", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const client = new QueryClient();
  let root = createRoot(host);
  const render = () => <MemoryRouter><QueryClientProvider client={client}><ActivityDashboard /></QueryClientProvider></MemoryRouter>;
  await act(async () => root.render(render()));
  const usageGroup = () => host.querySelector('[aria-label="Usage chart display"]')!;
  try {
    await act(async () => ([...usageGroup().querySelectorAll("button")].find((b) => b.textContent === "Bar")!).click());
    expect(JSON.parse(localStorage.getItem("intelizen:activity-charts")!)).toEqual({ usage: "bar" });
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(render()));
    expect(usageGroup().querySelector('[aria-checked="true"]')?.textContent).toBe("Bar");
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Pin Usage to a dashboard"]')!.click());
    await act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent === "Pin widget")!.click());
    expect(storage.pins[0]).toMatchObject({ instrumentId: "activity.usage", config: { chartStyle: "bar" } });
  } finally { await act(async () => root.unmount()); client.clear(); }
});


it("opens stored workflow records in a dismissible dialog and closes it before navigating to the exact run", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const data: ActivitySources = { at: 10, runs: { data: [{ id: "old-run", name: "Old queued workflow", status: "Queued", updated_at: "2026-07-01T00:00:00Z", started_at: null, completed_at: null, step_states: {} } as WorkflowRunItem], at: 10 }, hierarchy: { data: [], at: 10 }, profiles: { data: [], at: 10 }, connections: { data: [], at: 10 }, sessionFolders: { data: {}, at: 10 }, usage: {} };
  function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }
  const model = buildActivityDashboard(data, DEFAULT_ACTIVITY_FILTER, {}, {}, {});
  await act(async () => root.render(<MemoryRouter><ActivityCardBody id="progress" sources={data} model={model} /><Location /></MemoryRouter>));
  const click = async (text: string) => { await act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!.click()); };
  try {
    expect(model.progress).toHaveLength(0);
    await click("1 open workflow records");
    expect(host.querySelector('dialog[open]')?.getAttribute("aria-label")).toBe("Open workflow records");
    expect(host.querySelector('dialog[open]')?.textContent).toContain("do not confirm a live process");
    await act(async () => {
      host.querySelector("dialog[open]")!.dispatchEvent(new Event("cancel", { cancelable: true }));
      await new Promise(requestAnimationFrame);
    });
    expect(host.querySelector("dialog[open]")).toBeNull();
    expect(document.activeElement?.textContent).toContain("1 open workflow records");
    await click("1 open workflow records");
    await click("Close");
    await act(async () => { await new Promise(requestAnimationFrame); });
    expect(document.activeElement?.textContent).toContain("1 open workflow records");
    expect(host.querySelector('dialog[open]')).toBeNull();
    await click("1 open workflow records");
    await click("Old queued workflow");
    expect(host.querySelector('dialog[open]')).toBeNull();
    expect(host.querySelector("output")?.textContent).toBe("/workflows?run=old-run");
    expect(storage.pins).toHaveLength(0);
  } finally { await act(async () => root.unmount()); }
});
