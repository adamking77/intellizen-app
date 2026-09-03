import { beforeEach, describe, expect, it, vi } from "vitest";

const isTauri = vi.hoisted(() => vi.fn());
const tauriFetch = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ isTauri }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: tauriFetch }));

import { useEngineStore } from "./engine-store";
import { hermesRest } from "./rest";

beforeEach(() => {
  isTauri.mockReset();
  tauriFetch.mockReset();
  useEngineStore.setState({
    connection: "open",
    error: null,
    info: {
      mode: "spawned",
      pid: 42,
      port: 60780,
      token: "session-token",
      version: "0.21.0",
      url: "ws://127.0.0.1:60780/api/ws",
    },
  });
});

describe("Hermes REST transport", () => {
  it("uses the native HTTP bridge in Tauri so Hermes does not need CORS", async () => {
    isTauri.mockReturnValue(true);
    tauriFetch.mockResolvedValue(new Response(JSON.stringify([{ id: "daily" }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    await expect(hermesRest("/api/cron/jobs?profile=all")).resolves.toEqual([{ id: "daily" }]);
    expect(tauriFetch).toHaveBeenCalledWith("http://127.0.0.1:60780/api/cron/jobs?profile=all", {
      headers: {
        "content-type": "application/json",
        "x-hermes-session-token": "session-token",
      },
    });
  });
});
