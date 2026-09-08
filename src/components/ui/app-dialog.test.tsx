// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("./motion", () => ({ useMotionEnabled: () => false, useInputModality: () => "keyboard" }));
import { AppDialog } from "./app-dialog";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("returns focus when a parent unmounts an open dialog", async () => {
  const host = document.createElement("div"); document.body.append(host);
  const trigger = document.createElement("button"); document.body.append(trigger);
  const root = createRoot(host);
  const show = vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function (this: HTMLDialogElement) {
    this.open = true; this.querySelector<HTMLButtonElement>("button")?.focus();
  });
  const close = vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
  try {
    trigger.focus();
    await act(async () => root.render(<AppDialog open title="Schedule" onOpenChange={() => {}}><button>Close</button></AppDialog>));
    expect(document.activeElement?.textContent).toBe("Close");
    await act(async () => root.render(null));
    expect(close).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
  } finally {
    await act(async () => root.unmount()); host.remove(); trigger.remove(); show.mockRestore(); close.mockRestore();
  }
});
