import { beforeEach, describe, expect, it } from "vitest";

import type { EngineInfo } from "./engine";
import { describeEngine, deriveEngineTag, useEngineStore } from "./engine-store";

const spawned: EngineInfo = {
  mode: "spawned",
  pid: 4242,
  port: 56083,
  token: "tok",
  version: "0.21.0",
  url: "http://127.0.0.1:56083",
};

describe("deriveEngineTag", () => {
  it("is connected whenever the socket is open", () => {
    expect(deriveEngineTag({ connection: "open", error: null })).toBe("connected");
    expect(deriveEngineTag({ connection: "open", error: "stale error" })).toBe("connected");
  });

  it("names an open gateway whose runtime guarantees do not match the pin", () => {
    expect(deriveEngineTag({ connection: "open", error: null, pinCompatible: false })).toBe("pin mismatch");
    expect(describeEngine({ connection: "open", info: spawned, error: null, pinCompatible: false }))
      .toContain("runtime capabilities do not match HERMES_PIN");
  });

  it("is offline when there is an error and no open socket", () => {
    expect(deriveEngineTag({ connection: "closed", error: "Hermes is not installed" })).toBe("offline");
    expect(deriveEngineTag({ connection: "idle", error: "offline: not in the desktop host" })).toBe("offline");
  });

  it("is starting while booting or reconnecting without an error", () => {
    expect(deriveEngineTag({ connection: "idle", error: null })).toBe("starting…");
    expect(deriveEngineTag({ connection: "connecting", error: null })).toBe("starting…");
    expect(deriveEngineTag({ connection: "closed", error: null })).toBe("starting…");
  });
});

describe("describeEngine", () => {
  it("names the Hermes, its url, and that we spawned it", () => {
    expect(describeEngine({ connection: "open", info: spawned, error: null })).toBe(
      "Hermes 0.21.0 at http://127.0.0.1:56083, spawned by IntelliZen (pid 4242)",
    );
  });

  it("says attached for an engine we did not spawn", () => {
    expect(describeEngine({ connection: "open", info: { ...spawned, mode: "attached", pid: 7 }, error: null })).toBe(
      "Hermes 0.21.0 at http://127.0.0.1:56083, attached (pid 7)",
    );
  });

  it("shows the error text when offline", () => {
    expect(describeEngine({ connection: "error", info: spawned, error: "Hermes is not installed" })).toBe(
      "Hermes is not installed",
    );
  });

  it("says starting while booting or reconnecting", () => {
    expect(describeEngine({ connection: "connecting", info: null, error: null })).toBe("Starting Hermes…");
    expect(describeEngine({ connection: "closed", info: spawned, error: null })).toBe("Starting Hermes…");
  });
});

describe("useEngineStore", () => {
  beforeEach(() => {
    useEngineStore.setState({ connection: "idle", info: null, error: null, pinCompatible: null });
  });

  it("starts idle with nothing known", () => {
    const state = useEngineStore.getState();
    expect(state.connection).toBe("idle");
    expect(state.info).toBeNull();
    expect(state.error).toBeNull();
    expect(state.pinCompatible).toBeNull();
  });

  it("setters replace one field each", () => {
    const { setConnection, setInfo, setError, setPinCompatible } = useEngineStore.getState();
    setConnection("open");
    setInfo(spawned);
    setError("boom");
    setPinCompatible(false);
    expect(useEngineStore.getState()).toMatchObject({ connection: "open", info: spawned, error: "boom", pinCompatible: false });
    setError(null);
    expect(useEngineStore.getState().error).toBeNull();
    expect(useEngineStore.getState().info).toEqual(spawned);
  });
});
