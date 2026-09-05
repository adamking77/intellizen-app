import { expect, it } from "vitest";
import { activitySource, mergeActivitySources } from "./activity-sources";
it("retains last successful values and timestamp on failure, then clears stale state on recovery", async () => {
  const previous = { data: [42], at: 100 };
  const stale = await activitySource(
    async () => {
      throw new Error("Offline");
    },
    previous,
    200,
  );
  expect(stale).toEqual({ data: [42], at: 100, error: "Offline" });
  expect(await activitySource(async () => [43], stale, 300)).toEqual({
    data: [43],
    at: 300,
  });
});
it("keeps ACP data when Hermes cannot report, with explicit partial coverage", () => {
  expect(
    mergeActivitySources([
      { data: null, at: null, error: "Hermes offline" },
      { data: ["ACP"], at: 200 },
    ]),
  ).toEqual({ data: ["ACP"], at: 200, error: "Hermes offline" });
});
