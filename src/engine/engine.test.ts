import { describe, expect, it } from "vitest";

import {
  engineWebSocketUrl,
  isDesktopHost,
  NOT_DESKTOP_HOST,
  resetEngine,
  startEngine,
  stopEngine,
} from "./engine";

describe("engine wrappers outside the desktop host", () => {
  it("knows vitest is not the desktop host", () => {
    expect(isDesktopHost()).toBe(false);
  });

  it("startEngine rejects with the offline reason instead of invoking", async () => {
    await expect(startEngine()).rejects.toThrow(NOT_DESKTOP_HOST);
  });

  it("stopEngine and resetEngine are no-ops", async () => {
    await expect(stopEngine()).resolves.toBeUndefined();
    await expect(resetEngine()).resolves.toBeUndefined();
  });
});

describe("engineWebSocketUrl", () => {
  it("targets loopback /api/ws with the token as a query param", () => {
    expect(engineWebSocketUrl({ port: 56083, token: "abc123" })).toBe(
      "ws://127.0.0.1:56083/api/ws?token=abc123",
    );
  });

  it("url-encodes the token", () => {
    expect(engineWebSocketUrl({ port: 1, token: "a b&c" })).toBe("ws://127.0.0.1:1/api/ws?token=a+b%26c");
  });
});
