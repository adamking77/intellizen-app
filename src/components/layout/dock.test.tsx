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
  const setAside = [...host.querySelectorAll("button")].find((button) => button.textContent === "Set this project aside")!;
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
    expect(host.querySelector('[role="group"]')?.className).toContain("@max-[22rem]:rounded-[var(--r-ctl)]");
    expect(host.querySelector('[role="group"] [data-dock-indicator]')?.className).toContain("@max-[22rem]:hidden");
    expect(host.querySelector('[role="group"] button')?.className).toContain("min-h-[var(--h-ctl)]");
    expect(host.querySelector('[role="img"]')).toBeNull();
    expect([...host.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Thinking", "Deciding", "Executing", "Not today"]);
  } finally { await act(async () => root.unmount()); }
});
