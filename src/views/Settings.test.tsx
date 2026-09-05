// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/components/settings/appearance", () => ({ AppearanceSection: () => <p>Appearance content</p> }));
vi.mock("@/components/settings/capabilities", () => ({ CapabilitiesSettings: () => <p>Capabilities content</p> }));
vi.mock("@/components/settings/context", () => ({ ContextSettings: () => null }));
vi.mock("@/components/settings/general", () => ({ GeneralSettings: () => null }));
vi.mock("@/components/settings/providers", () => ({ ProvidersSettings: () => <p>Providers content</p> }));
vi.mock("@/components/settings/plugins", () => ({ PluginsSettings: () => null }));
vi.mock("@/components/settings/voice-settings", () => ({ VoiceSettings: () => null }));
vi.mock("@/components/activity/activity-dashboard", () => ({ ActivityDashboard: () => <p>Activity dashboard</p> }));
import { SettingsView } from "./Settings";
let root: Root;
let element: HTMLDivElement;
function Location() { const location = useLocation(); return <output>{location.pathname}{location.search}</output>; }
beforeEach(() => { localStorage.clear(); element = document.createElement("div"); document.body.append(element); root = createRoot(element); });
afterEach(async () => { await act(async () => root.unmount()); element.remove(); localStorage.clear(); });
async function mount(route = "/settings") { await act(async () => root.render(<MemoryRouter initialEntries={[route]}><Location /><SettingsView /></MemoryRouter>)); }
async function click(label: string) {
  const button = [...element.querySelectorAll("button")].find((item) => item.textContent === label || item.getAttribute("aria-label") === label);
  expect(button).toBeTruthy(); await act(async () => button!.click());
}
it("opens Activity from the Settings menu and supports its existing deep link", async () => {
  await mount(); await click("Activity");
  expect(element.querySelector("output")?.textContent).toBe("/settings?section=activity");
  expect(element.querySelector('[role="tabpanel"]')?.textContent).toContain("Activity dashboard");
  await click("Providers");
  expect(element.textContent).toContain("Providers content");
});
it("keeps Activity selected while the shared rail collapses and restores", async () => {
  await mount("/settings?section=activity");
  expect(element.querySelector('[data-collapsible-rail="Settings"]')).toBeTruthy();
  await click("Collapse settings menu");
  expect(element.querySelector('[role="tablist"]')).toBeNull();
  expect(element.textContent).toContain("Activity dashboard");
  expect(localStorage.getItem("intelizen:settings-nav-collapsed")).toBe("true");
  await click("Expand settings menu");
  expect(element.querySelector('#settings-tab-activity')?.getAttribute("aria-selected")).toBe("true");
  expect(localStorage.getItem("intelizen:settings-nav-collapsed")).toBe("false");
});
