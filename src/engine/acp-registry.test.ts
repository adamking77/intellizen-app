import { beforeEach, describe, expect, it, vi } from "vitest";

import { listAgents } from "@/components/agents/agents-data";
import type { GatewayClientLike } from "./contract";

import { defaultAcpLaunch, listAcpAgents, normalizeAcpAgent, normalizeAcpRegistry, saveAcpAgent, type AcpAgent } from "./acp-registry";

const disk = vi.hoisted(() => ({ text: "" }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 1 },
  exists: async (path: string) => path === "" || disk.text.length > 0,
  mkdir: async () => undefined,
  readTextFile: async () => disk.text,
  writeFile: async (_path: string, bytes: Uint8Array) => {
    disk.text = new TextDecoder().decode(bytes);
  },
}));

beforeEach(() => {
  disk.text = "";
});

const claude: AcpAgent = {
  id: "claude-code",
  name: "Claude Code",
  engine: "claude-code",
  command: "claude-agent-acp",
  args: [],
};

describe("ACP registry rows", () => {
  it("keeps the UI fields in their shared shape", () => {
    expect(
      normalizeAcpAgent({
        id: "cc",
        engine: "claude-code",
        command: "claude-agent-acp",
        args: ["--x", 3],
        voice: { service: "macos-say", voice_id: "Daniel" },
        context: ["/one", 3, "/two"],
        avatar_style: "blob",
        avatar_kind: "drop",
        avatar_color: "var(--mauve)",
        stray: true,
      }),
    ).toEqual({
      id: "cc",
      name: "Claude Code",
      engine: "claude-code",
      command: "claude-agent-acp",
      args: ["--x"],
      voice: { service: "macos-say", voiceId: "Daniel" },
      context: ["/one", "/two"],
      avatarStyle: "blob",
      avatarKind: "drop",
      avatarColor: "var(--mauve)",
    });
  });

  it("refuses incomplete rows and deduplicates ids", () => {
    expect(normalizeAcpAgent({ id: "x", engine: "qwen" })).toBeNull();
    expect(normalizeAcpRegistry([claude, { ...claude, name: "Duplicate" }, { id: "bad" }])).toEqual([claude]);
  });
});

describe("ACP launch defaults", () => {
  it("uses the adapters each engine already exposes", () => {
    expect(defaultAcpLaunch("codex")).toEqual({ command: "codex-acp", args: [] });
    expect(defaultAcpLaunch("gemini")).toEqual({ command: "gemini", args: ["--experimental-acp"] });
  });
});

describe("offline roster", () => {
  it("saves and lists ACP agents without calling Hermes", async () => {
    await saveAcpAgent(claude);
    const request = vi.fn();
    const client = { request } as unknown as GatewayClientLike;
    const result = await listAgents(client, false);

    expect(request).not.toHaveBeenCalled();
    expect(result.agents.map((agent) => agent.displayName)).toEqual(["Claude Code"]);
  });

  it("does not erase a malformed registry", async () => {
    disk.text = "{";
    await expect(listAcpAgents()).rejects.toThrow("not valid JSON");
    expect(disk.text).toBe("{");
  });
});
