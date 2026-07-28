// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { useAgentPanelResize } from "@/components/agent/use-agent-panel-resize";

function ResizeHarness() {
  const [width, setWidth] = useState(384);
  const startResize = useAgentPanelResize(setWidth);
  return (
    <div
      data-testid="handle"
      data-width={width}
      onPointerDown={startResize}
    />
  );
}

describe("useAgentPanelResize", () => {
  it("removes active window listeners when its owner unmounts", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<ResizeHarness />));

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="handle"]')
        ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });

    const move = add.mock.calls.find(([type]) => type === "pointermove")?.[1];
    const up = add.mock.calls.find(([type]) => type === "pointerup")?.[1];
    expect(move).toBeTypeOf("function");
    expect(up).toBeTypeOf("function");

    await act(async () => root.unmount());
    expect(remove).toHaveBeenCalledWith("pointermove", move);
    expect(remove).toHaveBeenCalledWith("pointerup", up);
    container.remove();
  });
});
