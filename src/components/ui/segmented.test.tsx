// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Segmented } from "./segmented";

afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(document, "startViewTransition");
  Reflect.deleteProperty(window, "matchMedia");
});

describe("Segmented", () => {
  it("moves with arrows, Home and End", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const change = vi.fn();
    const transition = vi.fn((update: () => void) => {
      update();
      return { finished: Promise.resolve() };
    });
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: transition });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
    await act(async () => root.render(
      <Segmented
        label="Views"
        value="table"
        options={[{ value: "table", label: "Table" }, { value: "board", label: "Board" }, { value: "brief", label: "Brief" }]}
        onValueChange={change}
      />,
    ));
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];

    tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(change).toHaveBeenLastCalledWith("board");
    tabs[0].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(change).toHaveBeenLastCalledWith("brief");
    tabs[2].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(change).toHaveBeenLastCalledWith("table");
    expect(transition).not.toHaveBeenCalled();
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);

    await act(async () => window.dispatchEvent(new Event("pointerdown")));
    await act(async () => tabs[1].click());
    expect(transition).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });
});
