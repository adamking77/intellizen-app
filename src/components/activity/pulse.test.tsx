// @vitest-environment happy-dom
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import { Pulse } from "./pulse";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => document.body.replaceChildren());

it("renders only evidence-backed traces and drifts only with active work", async () => {
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  await act(async () => root.render(<Pulse traces={[{ id: "agent" }]} questions={["approval"]} />));
  try {
    expect(host.querySelector("path")).not.toBeNull();
    expect(host.querySelector("circle")).not.toBeNull();
    expect(host.querySelector(".pulse-trace")).not.toBeNull();
    await act(async () => root.render(<Pulse />));
    expect(host.querySelector("svg")).toBeNull();
  } finally {
    await act(async () => root.unmount());
  }
});
