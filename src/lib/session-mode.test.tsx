// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";

import {
  initializeSessionMode,
  readRestingAgents,
  readSessionMode,
  resetSessionModeForTests,
  RESTING_AGENTS_KEY,
  SESSION_MODE_KEY,
  setLastAvailabilityAnswer,
  setRestingAgents,
  setSessionMode,
} from "./session-mode";

describe("session availability lifecycle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetSessionModeForTests();
  });

  it("preserves active mode through a webview reload in the same native launch", async () => {
    window.localStorage.setItem(SESSION_MODE_KEY, JSON.stringify({ launchId: "launch-1", mode: "executing", lastAvailabilityAnswer: "deciding" }));
    await initializeSessionMode(async () => "launch-1");
    expect(readSessionMode()).toBe("executing");
  });

  it("clears only active mode when the native process identity changes", async () => {
    window.localStorage.setItem(SESSION_MODE_KEY, JSON.stringify({ launchId: "launch-old", mode: "not_today", lastAvailabilityAnswer: "not_today" }));
    window.localStorage.setItem(RESTING_AGENTS_KEY, JSON.stringify({ launchId: "launch-old", agents: ["hermes:fiona"] }));
    await initializeSessionMode(async () => "launch-new");
    expect(readSessionMode()).toBeNull();
    expect(readRestingAgents()).toEqual([]);
    expect(JSON.parse(window.localStorage.getItem(SESSION_MODE_KEY)!)).toEqual({ launchId: "launch-new", mode: null, lastAvailabilityAnswer: "not_today" });
  });

  it("stores the active mode and remembered answer independently", async () => {
    await initializeSessionMode(async () => "launch-1");
    setSessionMode("thinking");
    setLastAvailabilityAnswer("executing");
    expect(JSON.parse(window.localStorage.getItem(SESSION_MODE_KEY)!)).toEqual({ launchId: "launch-1", mode: "thinking", lastAvailabilityAnswer: "executing" });
  });

  it("keeps valid resting agents through webview reloads in one launch", async () => {
    window.localStorage.setItem(RESTING_AGENTS_KEY, JSON.stringify({ launchId: "launch-1", agents: ["hermes:fiona", "acp:keel"] }));
    await initializeSessionMode(async () => "launch-1");
    expect(readRestingAgents()).toEqual(["hermes:fiona", "acp:keel"]);
    setRestingAgents(["hermes:fiona", "bad", "hermes:fiona"]);
    expect(readRestingAgents()).toEqual(["hermes:fiona"]);
    expect(JSON.parse(window.localStorage.getItem(RESTING_AGENTS_KEY)!)).toEqual({ launchId: "launch-1", agents: ["hermes:fiona"] });
  });

  it("stays read-only after native identity fails and can retry", async () => {
    const saved = { launchId: "launch-1", mode: "deciding", lastAvailabilityAnswer: "thinking" };
    window.localStorage.setItem(SESSION_MODE_KEY, JSON.stringify(saved));
    await initializeSessionMode(async () => { throw new Error("IPC unavailable"); });
    setSessionMode("not_today");
    expect(readSessionMode()).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(SESSION_MODE_KEY)!)).toEqual(saved);

    await initializeSessionMode(async () => "launch-1");
    expect(readSessionMode()).toBe("deciding");
  });
});
