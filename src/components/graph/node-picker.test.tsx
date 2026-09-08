// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { NodePicker } from "./node-picker";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const onChange = vi.fn();

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onChange.mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it("keeps the clear action outside the picker trigger and exposes the popup state", async () => {
  await act(async () => root.render(<NodePicker
    nodes={[{ node_id: "a", label: "Alpha", entity_type: "person" as never }]}
    value="a"
    onChange={onChange}
    entityAccent={{ person: "var(--agent-1)" } as never}
  />));
  const trigger = host.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!;
  expect(trigger.querySelector("button")).toBeNull();
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  await act(async () => trigger.click());
  await act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(host.querySelector('[role="dialog"]')).toBeTruthy();
  expect(host.querySelector<HTMLInputElement>('[aria-label="Search nodes"]')).toBe(document.activeElement);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Clear"]')!.click());
  expect(onChange).toHaveBeenCalledWith(null);
});

it("closes on Escape and restores focus to the picker trigger", async () => {
  await act(async () => root.render(<NodePicker
    nodes={[{ node_id: "a", label: "Alpha", entity_type: "person" as never }]}
    value={null}
    onChange={onChange}
    placeholder="From…"
    entityAccent={{ person: "var(--agent-1)" } as never}
  />));
  const trigger = host.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!;
  expect(trigger.getAttribute("aria-label")).toBe("From…");
  await act(async () => trigger.click());
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
