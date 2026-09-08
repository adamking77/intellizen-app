// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { Dock } from "./dock";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => document.body.replaceChildren());

it("selects an explicit mode and exposes the local set-aside control only while executing", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const change = vi.fn();
  const aside = vi.fn();
  await act(async () => root.render(<Dock mode="executing" onModeChange={change} traces={[{ id: "fiona" }]} questionKeys={["one", "two"]} onSetAside={aside} />));
  const thinking = [...host.querySelectorAll("button")].find((button) => button.textContent === "Thinking")!;
  await act(async () => thinking.click());
  expect(change).toHaveBeenCalledWith("thinking");
  const modeGroup = host.querySelector('[role="group"][aria-label="Session mode"]')!;
  expect(modeGroup.textContent).not.toContain("Set this project aside");
  expect(modeGroup.querySelector("[data-dock-indicator]")).not.toBeNull();
  expect(host.querySelector('[role="img"]')).not.toBeNull();
  const setAside = host.querySelector<HTMLButtonElement>('[aria-label="Set this project aside"]')!;
  await act(async () => setAside.click());
  expect(aside).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
});


it("keeps the compact mode controls and omits an empty decorative trace", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<Dock mode="thinking" onModeChange={vi.fn()} traces={[]} questionKeys={[]} />));
  try {
    expect(host.querySelector("[data-home-dock]")?.className).toContain("@container");
    expect(host.querySelector('[data-home-dock]')?.className).toContain("justify-between");
    expect(host.querySelector('[role="group"] [data-dock-indicator]')?.className).toContain("@max-[22rem]:hidden");
    expect(host.querySelector('[role="group"] button')?.className).toContain("min-h-[var(--h-ctl)]");
    expect(host.querySelector('[role="img"]')).toBeNull();
    expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Thinking", "Deciding", "Executing", "Not today"]);
  } finally { await act(async () => root.unmount()); }
});

it("opens questions from the count, keeps them private in Not today, and supports keyboard mode changes", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  const change = vi.fn();
  const props = { onModeChange: change, traces: [{ id: "keel", label: "Keel", state: "Working" }], questionKeys: ["approval"] };
  await act(async () => root.render(<Dock {...props} mode="thinking" />));
  try {
    const question = [...host.querySelectorAll("button")].find((button) => button.textContent === "1 question for you")!;
    await act(async () => question.click());
    expect(change).toHaveBeenLastCalledWith("deciding");
    const thinking = host.querySelector<HTMLButtonElement>('[aria-pressed="true"]')!;
    await act(async () => thinking.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(change).toHaveBeenLastCalledWith("not_today");
    expect(document.activeElement?.textContent).toBe("Not today");
    await act(async () => root.render(<Dock {...props} mode="not_today" />));
    expect([...host.querySelectorAll("button")].some((button) => button.textContent?.includes("question"))).toBe(false);
    expect(host.querySelector("circle")).toBeNull();
    expect(host.textContent).toContain("Keel · Working");
    expect(host.querySelector("path")).not.toBeNull();
  } finally { await act(async () => root.unmount()); }
});
