import { describe, expect, it, vi } from "vitest";

import { currentRotation } from "./rotation";

const at = (date: string) => new Date(`${date}T12:00:00`);

describe("currentRotation", () => {
  it.each([
    ["2026-03-23", "Build"],
    ["2026-03-30", "Marketing"],
    ["2026-04-06", "Ops"],
    ["2026-04-13", "Slack"],
  ])("maps %s to the recorded %s week", (date, week) => {
    expect(currentRotation(at(date)).week).toBe(week);
  });

  it("counts the current day through the end of the week", () => {
    expect(currentRotation(at("2026-04-13")).daysRemaining).toBe(7);
    expect(currentRotation(at("2026-04-19")).daysRemaining).toBe(1);
  });

  it("crosses the London daylight-saving boundary by calendar day", () => {
    vi.stubEnv("TZ", "Europe/London");
    try {
      const rotation = currentRotation(new Date(2026, 2, 30, 12));
      expect(rotation.week).toBe("Marketing");
      expect(rotation.weekStart).toEqual(new Date(2026, 2, 30));
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
