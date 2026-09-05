// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
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
    expect(host.querySelector("dialog")?.open).toBe(true);
    storage.fail = false;
    await click("Pin widget");
    expect(storage.pins).toHaveLength(1);
    expect(storage.pins[0]).toMatchObject({ kind: "instrument", instrumentId: "activity.attention", config: { activity: DEFAULT_ACTIVITY_FILTER } });
    expect(client.getQueryData(["home-pins"])).toEqual(storage.pins);
    expect(host.querySelector("dialog")?.open).toBe(false);
  } finally { await act(async () => root.unmount()); client.clear(); }
});
