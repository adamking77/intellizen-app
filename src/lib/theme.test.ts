// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SELECTION_STRENGTH,
  SELECTION_STRENGTH_KEY,
  THEME_CHANGED_EVENT,
  applySelectionStrength,
  applyTheme,
  loadSelectionStrength,
  normalizeSelectionStrength,
} from "./theme";

describe("selection strength", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("style");
  });

  it("normalizes missing, malformed and out-of-range values", () => {
    expect(normalizeSelectionStrength("not-a-number")).toBe(DEFAULT_SELECTION_STRENGTH);
    expect(normalizeSelectionStrength(0)).toBe(0.04);
    expect(normalizeSelectionStrength(1)).toBe(0.14);
    expect(normalizeSelectionStrength(0.099)).toBe(0.1);
  });

  it("persists and applies the slider value", () => {
    let changes = 0;
    window.addEventListener(THEME_CHANGED_EVENT, () => changes++, { once: true });

    applySelectionStrength(0.11);

    expect(localStorage.getItem(SELECTION_STRENGTH_KEY)).toBe("0.11");
    expect(loadSelectionStrength()).toBe(0.11);
    expect(document.documentElement.style.getPropertyValue("--sel-step")).toBe("0.11");
    expect(document.documentElement.style.getPropertyValue("--sel-accent-weight")).toBe("6.6%");
    expect(changes).toBe(1);
  });

  it("restores the persisted value when the theme boots", () => {
    localStorage.setItem(SELECTION_STRENGTH_KEY, "0.13");

    applyTheme("mocha", "#7fa6e6");

    expect(document.documentElement.style.getPropertyValue("--sel-step")).toBe("0.13");
    expect(document.documentElement.style.getPropertyValue("--sel-accent-weight")).toBe("7.8%");
  });
});
