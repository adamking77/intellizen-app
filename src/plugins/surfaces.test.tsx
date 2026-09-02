// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  toastError: vi.fn(),
  errorMessage: (e: unknown) => String(e),
}));
vi.mock("@tauri-apps/api/path", () => ({ homeDir: async () => "/h", join: async (...p: string[]) => p.join("/") }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readDir: vi.fn(), readTextFile: vi.fn(), stat: vi.fn() }));

import { PluginWidgetBoard } from "./home-widgets";
import { emptyContributions, usePluginRegistry } from "./registry";
import { PluginSidebarEntries } from "./sidebar-entries";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  usePluginRegistry.getState().clear();
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function loaded(id: string, contributions: Partial<ReturnType<typeof emptyContributions>>) {
  usePluginRegistry.getState().setLoaded({
    id,
    name: id,
    dir: `/h/.hermes/plugins/${id}`,
    contributions: { ...emptyContributions(), ...contributions },
  });
}

describe("plugin surfaces", () => {
  it("a widget that throws fails alone; the neighbour still renders", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    loaded("good", { widgets: [{ id: "w", label: "Good", render: () => createElement("p", null, "fine") }] });
    loaded("bad", {
      widgets: [
        {
          id: "w",
          label: "Bad",
          render: () => {
            throw new Error("kaboom");
          },
        },
      ],
    });
    localStorage.setItem("intelizen:plugin-widgets", JSON.stringify(["good:w", "bad:w"]));
    await act(async () => root.render(createElement(PluginWidgetBoard)));
    expect(container.textContent).toContain("fine");
    expect(container.textContent).toContain("kaboom");
    expect(container.querySelectorAll("section")).toHaveLength(2);
  });

  it("sidebar lists entries and marks a broken plugin", async () => {
    loaded("hello", { sidebar: [{ label: "Hello" }] });
    usePluginRegistry.getState().setError({ id: "broken", dir: "/x" }, "syntax");
    await act(async () =>
      root.render(createElement(MemoryRouter, null, createElement(PluginSidebarEntries, { collapsed: false }))),
    );
    const links = [...container.querySelectorAll("a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/plugin/hello", "/plugin/broken"]);
    expect(links[1].textContent).toContain("failed");
    expect(links[1].getAttribute("title")).toBe("broken: syntax");
  });
});
