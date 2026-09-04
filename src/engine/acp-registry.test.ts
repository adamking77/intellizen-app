import { beforeEach, describe, expect, it, vi } from "vitest";

import { listAgents } from "@/components/agents/agents-data";
import type { GatewayClientLike } from "./contract";

import {
  connectAcpProvider,
  defaultAcpLaunch,
  disconnectAcpProvider,
  discoverAcpProviders,
  listAcpAgents,
  normalizeAcpAgent,
  normalizeAcpRegistry,
  saveAcpAgent,
  type AcpAgent,
  type AcpProviderDiscovery,
} from "./acp-registry";

const disk = vi.hoisted(() => ({ text: "" }));
const tauri = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: tauri.invoke,
  convertFileSrc: (path: string) => path,
}));
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
  tauri.invoke.mockReset();
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

  it("accepts provider ids learned after this build shipped", () => {
    expect(normalizeAcpAgent({ id: "kimi", name: "Kimi", engine: "kimi", command: "kimi", args: ["acp"] }))
      .toMatchObject({ engine: "kimi", command: "kimi" });
  });
});

describe("ACP launch defaults", () => {
  it("uses the adapters each engine already exposes", () => {
    expect(defaultAcpLaunch("codex")).toEqual({ command: "codex-acp", args: [] });
    expect(defaultAcpLaunch("gemini")).toEqual({ command: "gemini", args: ["--experimental-acp"] });
  });

  it("discovers a Claude CLI through the on-demand ACP bridge", async () => {
    tauri.invoke.mockImplementation(async (command: string, args?: { commands?: string[] }) => {
      if (command !== "acp_probe") return [];
      return (args?.commands ?? []).map((candidate) => ({
        command: candidate,
        available: candidate === "claude" || candidate === "npx",
        path: candidate === "claude" ? "/Users/test/.local/bin/claude" : candidate === "npx" ? "/usr/local/bin/npx" : null,
      }));
    });

    const result = await discoverAcpProviders();
    expect(result.find((provider) => provider.engine === "claude-code")).toMatchObject({
      available: true,
      cliAvailable: true,
      adapterAvailable: false,
      bridgeOnDemand: true,
      command: "npx",
      args: ["--yes", "@agentclientprotocol/claude-agent-acp@0.73.0"],
      path: "/Users/test/.local/bin/claude",
    });
  });

  it("merges dynamically discovered registry providers beyond the compatibility set", async () => {
    tauri.invoke.mockImplementation(async (command: string, args?: { commands?: string[] }) => {
      if (command === "acp_discover") {
        return [{
          id: "kimi",
          name: "Kimi CLI",
          icon: "https://cdn.agentclientprotocol.com/registry/v1/latest/kimi.svg",
          command: "/Users/test/.kimi-code/bin/kimi",
          args: ["acp"],
          path: "/Users/test/.kimi-code/bin/kimi",
          source: "ACP registry",
        }];
      }
      if (command === "acp_probe") {
        return (args?.commands ?? []).map((candidate) => ({ command: candidate, available: false, path: null }));
      }
      return [];
    });

    const result = await discoverAcpProviders();
    expect(result.find((provider) => provider.engine === "kimi")).toMatchObject({
      label: "Kimi CLI",
      icon: "https://cdn.agentclientprotocol.com/registry/v1/latest/kimi.svg",
      command: "/Users/test/.kimi-code/bin/kimi",
      args: ["acp"],
      available: true,
    });
  });

  it("refreshes an app-managed provider launch without replacing custom commands", async () => {
    disk.text = JSON.stringify([
      {
        id: "provider-claude-code",
        name: "Claude Code",
        engine: "claude-code",
        command: "npx",
        args: ["--yes", "@agentclientprotocol/claude-agent-acp"],
      },
    ]);
    tauri.invoke.mockImplementation(async (command: string, args?: { commands?: string[] }) => {
      if (command !== "acp_probe") return [];
      return (args?.commands ?? []).map((candidate) => ({
        command: candidate,
        available: candidate === "claude" || candidate === "npx",
        path: candidate === "claude" ? "/Users/test/.local/bin/claude" : candidate === "npx" ? "/usr/local/bin/npx" : null,
      }));
    });

    const result = await discoverAcpProviders();
    expect(result.find((provider) => provider.engine === "claude-code")).toMatchObject({
      command: "npx",
      args: ["--yes", "@agentclientprotocol/claude-agent-acp@0.73.0"],
    });
  });

  it("creates the default provider agent, connects it, then disconnects it", async () => {
    const provider: AcpProviderDiscovery = {
      engine: "claude-code",
      label: "Claude Code",
      command: "npx",
      args: ["--yes", "@agentclientprotocol/claude-agent-acp@0.73.0"],
      configured: 0,
      agentIds: [],
      available: true,
      adapterAvailable: false,
      cliAvailable: true,
      bridgeOnDemand: true,
      path: "/Users/test/.local/bin/claude",
      source: "ACP registry bridge",
    };
    tauri.invoke.mockImplementation(async (command: string) => {
      if (command === "acp_start") return { agentId: "provider-claude-code", sessionId: "session-1", pid: 42 };
      if (command === "acp_statuses") return [{ agentId: "provider-claude-code", sessionId: "session-1", pid: 42 }];
      return undefined;
    });

    await expect(connectAcpProvider(provider)).resolves.toMatchObject({ sessionId: "session-1" });
    expect(JSON.parse(disk.text)).toEqual([
      expect.objectContaining({
        id: "provider-claude-code",
        name: "Claude Code",
        engine: "claude-code",
        command: "npx",
      }),
    ]);
    expect(tauri.invoke).toHaveBeenCalledWith("acp_start", { agentId: "provider-claude-code", caller: "provider" });

    await disconnectAcpProvider("claude-code");
    expect(tauri.invoke).toHaveBeenCalledWith("acp_stop", { sessionId: "session-1" });
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
