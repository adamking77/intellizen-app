import { describe, expect, it } from "vitest";

import { currentRotation } from "./rotation";

const at = (iso: string) => new Date(`${iso}T12:00:00`);

describe("currentRotation", () => {
  // The only human-authored record of the rotation is the Google Calendar
  // events for 2026-03-30 (Marketing), 2026-04-06 (Ops), 2026-04-13 (Slack).
  // An anchor that cannot reproduce these three is wrong by definition.
  it.each([
    ["2026-03-23", "Build"],
    ["2026-03-30", "Marketing"],
    ["2026-04-06", "Ops"],
    ["2026-04-13", "Slack"],
    ["2026-04-20", "Build"],
  ])("labels the week of %s as %s", (date, week) => {
    expect(currentRotation(at(date)).week).toBe(week);
  });

  it("holds one label for a full Monday-to-Sunday week", () => {
    const days = ["2026-04-13", "2026-04-15", "2026-04-19"].map((d) => currentRotation(at(d)));
    expect(days.map((r) => r.week)).toEqual(["Slack", "Slack", "Slack"]);
    expect(days.map((r) => r.weekStart.getTime())).toEqual([
      days[0].weekStart.getTime(),
      days[0].weekStart.getTime(),
      days[0].weekStart.getTime(),
    ]);
  });

  it("counts down days remaining within a week", () => {
    expect(currentRotation(at("2026-04-13")).daysRemaining).toBe(7);
    expect(currentRotation(at("2026-04-19")).daysRemaining).toBe(1);
  });

  it("cycles every four weeks", () => {
    expect(currentRotation(at("2026-04-20")).week).toBe(currentRotation(at("2026-03-23")).week);
  });

  it("does not reset at the calendar year boundary", () => {
    // The session-start hook derived the week from the ISO week number, which
    // restarts each January and silently reshuffled the rotation every year.
    const before = currentRotation(at("2026-12-28"));
    const after = currentRotation(at("2027-01-04"));
    const order = ["Build", "Marketing", "Ops", "Slack"];
    const next = order[(order.indexOf(before.week) + 1) % order.length];
    expect(after.week).toBe(next);
  });

  it("handles dates before the anchor without going negative", () => {
    expect(["Build", "Marketing", "Ops", "Slack"]).toContain(currentRotation(at("2026-03-16")).week);
    expect(currentRotation(at("2026-03-16")).weekNumber).toBeGreaterThanOrEqual(1);
  });
});
