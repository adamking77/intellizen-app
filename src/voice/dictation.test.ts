import { describe, expect, it } from "vitest";

import { levelOf, micTrouble, pushLevel, sayable } from "./dictation";

describe("levelOf", () => {
  it("reads zero for an empty or silent frame", () => {
    expect(levelOf(new Float32Array(0))).toBe(0);
    expect(levelOf(new Float32Array(128))).toBe(0);
  });
  it("clamps a loud frame and shows speech mid-scale", () => {
    expect(levelOf(new Float32Array(128).fill(0.9))).toBe(1);
    expect(levelOf(new Float32Array(128).fill(0.05))).toBeCloseTo(0.65, 1);
  });
  it("does not pin the meter on a single click", () => {
    const click = new Float32Array(128);
    click[0] = 1;
    expect(levelOf(click)).toBeLessThan(0.3);
  });
  it("counts the negative half of a waveform", () => {
    const alt = new Float32Array(128);
    for (let i = 0; i < alt.length; i += 1) alt[i] = i % 2 ? 0.05 : -0.05;
    expect(levelOf(alt)).toBeCloseTo(0.65, 1);
  });
});

describe("pushLevel", () => {
  it("fills to the bar count then drops the oldest", () => {
    expect(pushLevel([], 0.5, 4)).toEqual([0.5]);
    expect(pushLevel([0.1, 0.2, 0.3], 0.4, 4)).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(pushLevel([0.1, 0.2, 0.3, 0.4], 0.5, 4)).toEqual([0.2, 0.3, 0.4, 0.5]);
    expect(pushLevel([1, 2, 3, 4, 5, 6], 7, 3)).toHaveLength(3);
  });
  it("does not mutate its input", () => {
    const before = [0.1, 0.2, 0.3, 0.4];
    pushLevel(before, 0.9, 4);
    expect(before).toEqual([0.1, 0.2, 0.3, 0.4]);
  });
});

describe("micTrouble", () => {
  it("names the fix for each named failure", () => {
    expect(micTrouble(new DOMException("", "NotAllowedError"))).toMatch(/System Settings/);
    expect(micTrouble(new DOMException("", "NotFoundError"))).toMatch(/No microphone/);
    expect(micTrouble(new DOMException("", "NotReadableError"))).toMatch(/another app/);
    expect(micTrouble(new Error("boom"))).toContain("boom");
    expect(typeof micTrouble(null)).toBe("string");
  });
});

describe("sayable", () => {
  it("speaks a short reply whole", () => {
    expect(sayable("Just this.")).toBe("Just this.");
    expect(sayable("  hi  ")).toBe("hi");
  });
  it("cuts a long reply on a sentence", () => {
    const cut = sayable("One sentence here. ".repeat(200));
    expect(cut.length).toBeLessThan(3000);
    expect(cut.endsWith(".")).toBe(true);
  });
  it("falls back to a word boundary and marks the cut", () => {
    expect(sayable("word ".repeat(500))).toMatch(/word…$/);
    expect(sayable("a".repeat(2000)).endsWith("…")).toBe(true);
    expect(sayable("a".repeat(900) + " " + "b".repeat(900))).toBe("a".repeat(900) + "…");
  });
});
