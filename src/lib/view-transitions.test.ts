// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";

import { runViewTransition } from "./view-transitions";

afterEach(() => {
  Reflect.deleteProperty(document, "startViewTransition");
  Reflect.deleteProperty(window, "matchMedia");
  delete document.documentElement.dataset.viewTransition;
});

describe("view transitions", () => {
  it("updates immediately when the API is missing", () => {
    const update = vi.fn();
    runViewTransition("room", update);
    expect(update).toHaveBeenCalledOnce();
  });

  it("does not animate when reduced motion is requested", () => {
    const start = vi.fn();
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true }) });
    const update = vi.fn();

    runViewTransition("segment", update);

    expect(update).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });

  it("names a drawer source only for the old snapshot", async () => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => { finish = resolve; });
    const start = vi.fn((callback: () => void | Promise<void>) => {
      void callback();
      return { finished };
    });
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
    const source = document.createElement("button");
    const update = vi.fn();

    runViewTransition("drawer", update, source);
    await Promise.resolve();

    expect(start).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
    expect(source.style.viewTransitionName).toBe("");
    expect(document.documentElement.dataset.viewTransition).toBe("drawer");

    finish();
    await finished;
    await Promise.resolve();
    expect(document.documentElement.dataset.viewTransition).toBeUndefined();
  });
});
