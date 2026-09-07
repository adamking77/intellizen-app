// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { initializeSessionMode, resetSessionModeForTests, setSessionMode } from "@/lib/session-mode";
import { DoneWord, useInputModality, useMotionEnabled } from "./motion";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  resetSessionModeForTests();
  window.dispatchEvent(new Event("pointerdown"));
});

function Probe() {
  return <output>{useInputModality()}:{useMotionEnabled() ? "motion" : "reduced"}</output>;
}

describe("shared motion policy", () => {
  it("carries keyboard modality into content mounted after the key press", async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<Probe />));
    expect(host.textContent).toBe("keyboard:motion");
    await act(async () => root.unmount());
  });

  it("turns movement off for Not today", async () => {
    await initializeSessionMode(async () => "motion-test");
    setSessionMode("not_today");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<Probe />));
    expect(host.textContent).toBe("pointer:reduced");
    await act(async () => root.unmount());
  });

  it("crossfades to the completed wording in place", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<DoneWord done={false} doneLabel="Set aside">Set it aside</DoneWord>));
    expect(host.textContent).toBe("Set it aside");
    await act(async () => root.render(<DoneWord done doneLabel="Set aside">Set it aside</DoneWord>));
    expect(host.textContent).toContain("Set aside");
    await act(async () => root.unmount());
  });
});
