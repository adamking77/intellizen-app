// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ installed: vi.fn().mockResolvedValue([]), invoke: vi.fn() }));
vi.mock("@/plugins/approval", () => ({ listInstalledPluginMetadata: api.installed, setPluginEnabled: vi.fn(), uninstallPlugin: vi.fn() }));
vi.mock("@/plugins/registry", () => ({ usePlugins: () => [] }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: api.invoke }));
import { PluginsSettings } from "./plugins";
it("reserves Plugins for IntelliZen SDK extensions without scanning CLI capabilities", async () => {
  const element = document.createElement("div"); document.body.append(element);
  const root = createRoot(element); const client = new QueryClient();
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><PluginsSettings /></QueryClientProvider>));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(api.installed).toHaveBeenCalled();
    expect(element.textContent).toContain("Installed IntelliZen extensions");
    expect(api.invoke).not.toHaveBeenCalled();
    expect(element.querySelector('[aria-label="Capability provider"]')).toBeNull();
  } finally { await act(async () => root.unmount()); client.clear(); element.remove(); }
});
