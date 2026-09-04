// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_SELECTION_STRENGTH,
  FOLLOW_SYSTEM_KEY,
  SELECTION_STRENGTH_KEY,
  SYSTEM_DARK_FLAVOR_KEY,
  SYSTEM_LIGHT_FLAVOR_KEY,
  THEME_CHANGED_EVENT,
  applySavedTheme,
  applySelectionStrength,
  applyTheme,
  loadSystemThemePreferences,
  loadSelectionStrength,
  normalizeSelectionStrength,
  resolveTheme,
  saveSystemThemePreferences,
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

describe("system appearance", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("style");
    delete document.documentElement.dataset.flavor;
  });

  it("defaults to Flat White for light and Mocha for dark", () => {
    expect(loadSystemThemePreferences()).toEqual({
      followSystem: false,
      lightFlavor: "flat",
      darkFlavor: "mocha",
    });
  });

  it("resolves both appearances with the same accent slot", () => {
    localStorage.setItem("intelizen:flavor", "mocha");
    localStorage.setItem("intelizen:accent", "#e2a37b");
    saveSystemThemePreferences({ followSystem: true, lightFlavor: "latte", darkFlavor: "nitro" });

    expect(resolveTheme("light")).toEqual({ flavor: "latte", accent: "#b06a33" });
    expect(resolveTheme("dark")).toEqual({ flavor: "nitro", accent: "#dc9d75" });

    applySavedTheme("light");
    expect(document.documentElement.dataset.flavor).toBe("latte");
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#b06a33");
  });

  it("persists the switch and guards each side of the pair", () => {
    saveSystemThemePreferences({ followSystem: true, lightFlavor: "mocha", darkFlavor: "flat" });

    expect(localStorage.getItem(FOLLOW_SYSTEM_KEY)).toBe("1");
    expect(localStorage.getItem(SYSTEM_LIGHT_FLAVOR_KEY)).toBe("flat");
    expect(localStorage.getItem(SYSTEM_DARK_FLAVOR_KEY)).toBe("mocha");
  });
});
