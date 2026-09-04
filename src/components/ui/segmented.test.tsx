// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Segmented } from "./segmented";

afterEach(() => document.body.replaceChildren());

describe("Segmented", () => {
  it("moves with arrows, Home and End", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const change = vi.fn();
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
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);

    await act(async () => root.unmount());
  });
});
