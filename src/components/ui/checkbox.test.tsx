// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Checkbox } from "./checkbox";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("works inside a field label without nested labels and keeps disabled changes blocked", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host); const change = vi.fn();
  try {
    const render = (disabled = false) => root.render(<label><Checkbox checked={false} disabled={disabled} onCheckedChange={change} />Independent verification</label>);
    await act(async () => render());
    expect(host.querySelectorAll("label")).toHaveLength(1);
    await act(async () => host.querySelector("input")!.click());
    expect(change).toHaveBeenCalledExactlyOnceWith(true);
    await act(async () => render(true));
    await act(async () => host.querySelector("input")!.click());
    expect(change).toHaveBeenCalledTimes(1);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
