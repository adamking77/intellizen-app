// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Choices } from "./choices";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => document.body.replaceChildren());

describe("Choices", () => {
  it("uses number shortcuts only while its decision is focused and never while typing", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const choose = vi.fn();
    const root = createRoot(host);
    await act(async () => {
      root.render(<Choices choices={[{ id: "continue", label: "Continue" }, { id: "later", label: "Later", recommended: true }]} onChoose={choose} />);
    });
    const first = host.querySelector("button")!;
    first.focus();
    await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "2" })));
    expect(choose).toHaveBeenCalledWith("later");

    await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "1", isComposing: true })));
    expect(choose).toHaveBeenCalledTimes(1);

    await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "1", metaKey: true })));
    await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "1", repeat: true })));
    expect(choose).toHaveBeenCalledTimes(1);

    const input = document.body.appendChild(document.createElement("input"));
    input.focus();
    await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "1" })));
    expect(choose).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});
