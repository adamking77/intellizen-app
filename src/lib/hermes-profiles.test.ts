import { describe, expect, it } from "vitest";

import { selectActiveHermesProfile } from "@/lib/hermes-profiles";

describe("selectActiveHermesProfile", () => {
  it("prefers a running named gateway over a stopped default profile", () => {
    const profiles = [
      { name: "default", model: "glm-5.2", isDefault: true, gatewayRunning: false },
      { name: "fiona", model: "deepseek-v4-pro", isDefault: false, gatewayRunning: true },
    ];

    expect(selectActiveHermesProfile(profiles)).toEqual(profiles[1]);
  });

  it("prefers the default profile when it is also running", () => {
    const profiles = [
      { name: "fiona", isDefault: false, gatewayRunning: true },
      { name: "default", isDefault: true, gatewayRunning: true },
    ];

    expect(selectActiveHermesProfile(profiles)).toEqual(profiles[1]);
  });

  it("falls back to the configured default when no gateway is running", () => {
    const profiles = [
      { name: "fiona", isDefault: false, gatewayRunning: false },
      { name: "default", isDefault: true, gatewayRunning: false },
    ];

    expect(selectActiveHermesProfile(profiles)).toEqual(profiles[1]);
  });

  it("returns null for an empty catalog", () => {
    expect(selectActiveHermesProfile([])).toBeNull();
  });
});
