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
  const setAside = [...host.querySelectorAll("button")].find((button) => button.textContent === "Set this project aside")!;
  await act(async () => setAside.click());
  expect(aside).toHaveBeenCalledTimes(1);
  await act(async () => root.unmount());
});
