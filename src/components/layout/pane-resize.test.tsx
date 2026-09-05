// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PaneDivider, usePaneResize } from "./pane-resize";

function Harness() {
  const pane = usePaneResize("qa:pane-width", 336, 300, 560);
  return <><PaneDivider pane={pane} edge="left" direction={-1} label="left" /><PaneDivider pane={pane} edge="right" direction={1} label="right" /></>;
}
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

it("resizes from either edge by pointer delta, bounds width and persists on release", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<Harness />));
  const left = host.querySelector<HTMLElement>('[aria-label="left"]')!;
  const right = host.querySelector<HTMLElement>('[aria-label="right"]')!;
  try {
    const screenWidth = window.innerWidth;
    await act(async () => left.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 800 })));
    await act(async () => window.dispatchEvent(new PointerEvent("pointermove", { clientX: 700 })));
    expect(left.getAttribute("aria-valuenow")).toBe("436");
    await act(async () => window.dispatchEvent(new PointerEvent("pointerup")));
    expect(localStorage.getItem("qa:pane-width")).toBe("436");
    await act(async () => right.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 1100 })));
    await act(async () => window.dispatchEvent(new PointerEvent("pointermove", { clientX: 1500 })));
    expect(right.getAttribute("aria-valuenow")).toBe("560");
    await act(async () => window.dispatchEvent(new PointerEvent("pointerup")));
    expect(window.innerWidth).toBe(screenWidth);
    expect(localStorage.getItem("qa:pane-width")).toBe("560");
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("supports keyboard resizing and restores the saved width after remount", async () => {
  localStorage.setItem("qa:pane-width", "420");
  const host = document.createElement("div"); const root = createRoot(host);
  await act(async () => root.render(<Harness />));
  try {
    const left = host.querySelector<HTMLElement>('[aria-label="left"]')!;
    expect(left.getAttribute("aria-valuenow")).toBe("420");
    await act(async () => left.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(localStorage.getItem("qa:pane-width")).toBe("404");
  } finally { await act(async () => root.unmount()); }
});

it("cancels a drag without persisting it and releases global listeners on unmount", async () => {
  const add = vi.spyOn(window, "addEventListener"); const remove = vi.spyOn(window, "removeEventListener");
  const host = document.createElement("div"); const root = createRoot(host);
  await act(async () => root.render(<Harness />));
  const left = host.querySelector<HTMLElement>('[aria-label="left"]')!;
  await act(async () => left.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 800 })));
  await act(async () => window.dispatchEvent(new PointerEvent("pointermove", { clientX: 700 })));
  await act(async () => window.dispatchEvent(new PointerEvent("pointercancel")));
  expect(left.getAttribute("aria-valuenow")).toBe("336");
  expect(localStorage.getItem("qa:pane-width")).toBeNull();
  await act(async () => left.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 800 })));
  const move = add.mock.calls.filter(([type]) => type === "pointermove").at(-1)?.[1];
  await act(async () => root.unmount());
  expect(remove).toHaveBeenCalledWith("pointermove", move);
});
