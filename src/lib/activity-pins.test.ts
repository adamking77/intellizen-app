import { expect, it } from "vitest";
import { activityPinFilter, pinActivityCard } from "./activity-pins";
import { DEFAULT_ACTIVITY_FILTER } from "./activity-dashboard";
import {
  dashboardScope,
  parseHomePin,
  type HomeInstrumentPin,
} from "./home-pins";
it("persists filters through the existing pin format and keeps workspace and Home pins independent", () => {
  const filter = {
    ...DEFAULT_ACTIVITY_FILTER,
    days: 30 as const,
    agent: "acp:codex",
  };
  const home = pinActivityCard([], "usage", "Usage", filter, "home");
  const workspace = pinActivityCard(
    home,
    "usage",
    "Usage",
    filter,
    "workspace:client",
  );
  expect(workspace).toHaveLength(2);
  expect(
    pinActivityCard(workspace, "usage", "Usage", filter, "workspace:client"),
  ).toHaveLength(2);
  const restored = parseHomePin(
    JSON.parse(JSON.stringify(workspace[1])),
  ) as HomeInstrumentPin;
  expect(dashboardScope(restored)).toBe("workspace:client");
  expect(activityPinFilter(restored)).toEqual({
    days: 30,
    agent: "acp:codex",
    workspace: "client",
  });
  restored.config = {
    ...restored.config,
    activity: { ...filter, workspace: "all" },
  };
  expect(activityPinFilter(restored).workspace).toBe("client");
});

it("retains a chosen chart display through serialization and distinguishes different pinned displays", () => {
  const pins = pinActivityCard([], "usage", "Usage", DEFAULT_ACTIVITY_FILTER, "home", "bar");
  const restored = parseHomePin(JSON.parse(JSON.stringify(pins[0]))) as HomeInstrumentPin;
  expect(restored.config?.chartStyle).toBe("bar");
  expect(pinActivityCard(pins, "usage", "Usage", DEFAULT_ACTIVITY_FILTER, "home", "bar")).toHaveLength(1);
  expect(pinActivityCard(pins, "usage", "Usage", DEFAULT_ACTIVITY_FILTER, "home", "line")).toHaveLength(2);
});
