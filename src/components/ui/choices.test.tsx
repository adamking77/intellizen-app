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

  it("merges caller keyboard handling and ignores modified or disabled shortcuts", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const choose = vi.fn();
    const keyDown = vi.fn();
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <Choices
          choices={[{ id: "continue", label: "Continue" }, { id: "later", label: "Later", disabled: true }]}
          onChoose={choose}
          onKeyDown={keyDown}
        />,
      );
    });
    const first = host.querySelector("button")!;
    first.focus();

    await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "1" })));
    expect(keyDown).toHaveBeenCalledOnce();
    expect(choose).toHaveBeenCalledWith("continue");

    await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "1", shiftKey: true })));
    await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "2" })));
    expect(choose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it("honors a caller that prevents a keyboard shortcut", async () => {
    const host = document.body.appendChild(document.createElement("div"));
    const choose = vi.fn();
    const root = createRoot(host);
    await act(async () => {
      root.render(
        <Choices
          choices={[{ id: "continue", label: "Continue" }]}
          onChoose={choose}
          onKeyDown={(event) => event.preventDefault()}
        />,
      );
    });
    const first = host.querySelector("button")!;
    first.focus();
    await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "1", cancelable: true })));
    expect(choose).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});
