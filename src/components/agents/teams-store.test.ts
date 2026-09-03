import { beforeEach, describe, expect, it, vi } from "vitest";

const disk = vi.hoisted(() => ({ directory: false, files: new Map<string, string>() }));
const calls = vi.hoisted(() => [] as Array<{ operation: string; path: string; options: unknown }>);

vi.mock("@tauri-apps/plugin-fs", () => ({
  BaseDirectory: { AppData: 1 },
  exists: async (path: string, options: unknown) => {
    calls.push({ operation: "exists", path, options });
    return path === "" ? disk.directory : disk.files.has(path);
  },
  mkdir: async (path: string, options: unknown) => {
    calls.push({ operation: "mkdir", path, options });
    disk.directory = true;
  },
  readTextFile: async (path: string, options: unknown) => {
    calls.push({ operation: "read", path, options });
    return disk.files.get(path) ?? "";
  },
  writeFile: async (path: string, bytes: Uint8Array, options: unknown) => {
    calls.push({ operation: "write", path, options });
    disk.files.set(path, new TextDecoder().decode(bytes));
  },
}));

import { deleteTeam, loadTeams, saveTeam } from "./teams-store";

beforeEach(() => {
  disk.directory = false;
  disk.files.clear();
  calls.length = 0;
});

describe("team storage", () => {
  it("persists team rows under Tauri AppData", async () => {
    const team = { id: "team-1", name: "Product", members: ["hermes:fiona", "acp:keel"], projects: [] };
    await expect(saveTeam(team)).resolves.toEqual([team]);
    await expect(loadTeams()).resolves.toEqual([team]);
    await expect(deleteTeam(team.id)).resolves.toEqual([]);
    expect(calls.filter((call) => call.operation === "write").map((call) => call.path)).toEqual(["teams.json", "teams.json"]);
    expect(calls.every((call) => (call.options as { baseDir?: number }).baseDir === 1)).toBe(true);
  });
});
