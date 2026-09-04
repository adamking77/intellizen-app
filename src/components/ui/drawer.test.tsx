// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Drawer } from "./drawer";

afterEach(() => document.body.replaceChildren());

describe("Drawer", () => {
  it("closes on Escape and restores focus", async () => {
    const opener = document.createElement("button");
    const host = document.createElement("div");
    document.body.append(opener, host);
    opener.focus();
    const close = vi.fn();
    const root = createRoot(host);
    await act(async () => root.render(<Drawer open label="Details" onClose={close}><button>Inside</button></Drawer>));
    expect(document.activeElement?.textContent).toBe("Inside");

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(close).toHaveBeenCalledOnce();
    await act(async () => root.render(<Drawer open={false} label="Details" onClose={close}><button>Inside</button></Drawer>));
    expect(document.activeElement).toBe(opener);

    await act(async () => root.unmount());
  });
});
