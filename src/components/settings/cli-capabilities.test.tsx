// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: api.invoke }));
import { CliCapabilities } from "./cli-capabilities";
let root: Root; let element: HTMLDivElement; let client: QueryClient;
beforeEach(() => {
  api.invoke.mockReset().mockResolvedValue({ items: [
    { provider: "codex", kind: "plugin", name: "ponytail@ponytail", state: "Enabled in config", enabled: true, controllable: true, overridden: false },
    { provider: "claude-code", kind: "plugin", name: "review@market", state: "Disabled in config", enabled: false, controllable: true, overridden: false },
    { provider: "codex", kind: "connection", name: "intelizen", state: "Configured", enabled: true, controllable: true, overridden: false },
  ], warnings: [] });
  element = document.createElement("div"); document.body.append(element); root = createRoot(element);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); element.remove(); });
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
async function mount(route = "/settings?section=capabilities") {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[route]}><CliCapabilities /></MemoryRouter></QueryClientProvider>));
  await settle(); await settle();
}
it("reads CLI capabilities without requiring Hermes and filters provider deep links", async () => {
  await mount("/settings?section=capabilities&provider=codex");
  expect(api.invoke).toHaveBeenCalledWith("cli_capabilities");
  expect(element.textContent).toContain("ponytail@ponytail");
  expect(element.textContent).not.toContain("review@market");
  expect(element.textContent).toContain("Configured");
  const select = element.querySelector("select")!;
  await act(async () => { select.value = "claude-code"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(element.textContent).toContain("review@market");
  expect(element.textContent).not.toContain("ponytail@ponytail");
  expect(element.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
});
it("persists an IntelliZen-only switch and reads its saved state back", async () => {
  const data = await api.invoke();
  api.invoke.mockImplementation(async (command, args) => {
    if (command === "cli_capability_set") {
      const row = data.items.find((item: { name: string }) => item.name === args.selection.name);
      row.enabled = args.selection.enabled; row.overridden = true;
      return;
    }
    return structuredClone(data);
  });
  await mount("/settings?section=capabilities&provider=codex");
  const button = element.querySelector<HTMLButtonElement>('[aria-label="Disable ponytail@ponytail for IntelliZen"]')!;
  await act(async () => button.click()); await settle(); await settle();
  expect(api.invoke).toHaveBeenCalledWith("cli_capability_set", { selection: { provider: "codex", kind: "plugin", name: "ponytail@ponytail", enabled: false } });
  expect(element.querySelector('[aria-label="Enable ponytail@ponytail for IntelliZen"]')?.getAttribute("aria-checked")).toBe("false");
  expect(element.textContent).toContain("Off for new chats");
});
it("does not flip the switch when saving fails", async () => {
  const data = await api.invoke();
  api.invoke.mockImplementation(async (command) => {
    if (command === "cli_capability_set") throw new Error("disk unavailable");
    return data;
  });
  await mount("/settings?section=capabilities&provider=codex");
  await act(async () => element.querySelector<HTMLButtonElement>('[aria-label="Disable ponytail@ponytail for IntelliZen"]')!.click());
  await settle();
  expect(element.querySelector('[role="alert"]')?.textContent).toContain("Selection was not saved");
  expect(element.querySelector('[aria-label="Disable ponytail@ponytail for IntelliZen"]')?.getAttribute("aria-checked")).toBe("true");
});
it("preserves partial results and tells users when a source cannot be parsed", async () => {
  api.invoke.mockResolvedValue({ items: [{ provider: "hermes", kind: "plugin", name: "supabase", state: "On disk" }], warnings: ["Could not parse .codex/config.toml."] });
  await mount();
  expect(element.textContent).toContain("supabase");
  expect(element.textContent).toContain("inventory may be incomplete");
});
it("does not present native read errors as an empty plugin installation", async () => {
  api.invoke.mockRejectedValue(new Error("native unavailable"));
  await mount();
  expect(element.querySelector('[role="alert"]')?.textContent).toContain("CLI inventory unavailable");
  expect(element.textContent).not.toContain("No matching capabilities");
});
