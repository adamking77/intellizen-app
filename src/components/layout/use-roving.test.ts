import { describe, expect, it } from "vitest";

import { nextIndex } from "@/components/layout/use-roving";

describe("nextIndex", () => {
  it("arrives at the first row when nothing is focused", () => {
    expect(nextIndex("ArrowDown", -1, 5)).toBe(0);
    expect(nextIndex("ArrowUp", -1, 5)).toBe(0);
  });

  it("steps without wrapping", () => {
    expect(nextIndex("ArrowDown", 1, 5)).toBe(2);
    expect(nextIndex("ArrowDown", 4, 5)).toBe(4);
    expect(nextIndex("ArrowUp", 1, 5)).toBe(0);
    expect(nextIndex("ArrowUp", 0, 5)).toBe(0);
  });

  it("jumps to the ends", () => {
    expect(nextIndex("Home", 3, 5)).toBe(0);
    expect(nextIndex("End", 0, 5)).toBe(4);
  });

  it("ignores other keys and empty trees", () => {
    expect(nextIndex("ArrowRight", 2, 5)).toBeNull();
    expect(nextIndex("ArrowDown", -1, 0)).toBeNull();
  });
});
