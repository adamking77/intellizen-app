import { describe, expect, it } from "vitest";

import { loadProfilesList } from "@/engine/test-support";

import {
  acpFromAgent,
  agentFromAcp,
  agentFromProfileRow,
  changed,
  filterAgents,
  handleOf,
  parseTeamsFile,
  removeTeam,
  serializeTeams,
  sortAgents,
  toUiMeta,
  upsertTeam,
  validProfileName,
  type Agent,
} from "./agent-model";

const rows = loadProfilesList().result.profiles;

describe("agentFromProfileRow", () => {
  it("maps the recorded profiles.list rows, reading ui_meta and has_avatar", () => {
    const agents = rows.map(agentFromProfileRow).filter((a): a is Agent => !!a);
    expect(agents.map((a) => a.name)).toEqual(["default", "fiona", "hr-agent", "isla", "keel", "nash", "rook"]);
    const def = agents[0];
    expect(def.id).toBe("hermes:default");
    expect(def.engine).toBe("hermes");
    expect(def.isDefault).toBe(true);
    expect(def.hasAvatar).toBe(true);
    // Hermes Desktop's roster colour stands in until this app pins one.
    expect(def.avatarColor).toBe("#8b5cf6");
  });

  it("prefers this app's ui_meta block and drops nameless rows", () => {
    expect(agentFromProfileRow({})).toBeNull();
    const a = agentFromProfileRow({
      name: "x",
      description: "desc",
      ui_meta: { intellizen: { role: "Editor", avatar_color: "#123456", context: ["~/a", 3] }, "hermes-bots": { color: "#000" } },
    })!;
    expect(a.role).toBe("Editor");
    expect(a.avatarColor).toBe("#123456");
    expect(a.context).toEqual(["~/a"]);
    expect(toUiMeta(a)).toEqual({ role: "Editor", avatar_color: "#123456", context: ["~/a"] });
  });
});

describe("acp round trip", () => {
  it("keeps launch fields the editor does not show", () => {
    const entry = {
      id: "cc",
      name: "Claude",
      engine: "claude-code" as const,
      command: "npx",
      args: ["claude-code-acp"],
      cwd: "/x",
      role: "Coder",
      voice: { service: "elevenlabs", voiceId: "el1" },
    };
    const agent = agentFromAcp(entry);
    expect(agent.id).toBe("acp:cc");
    expect(agent.voiceService).toBe("elevenlabs");
    expect(agentFromAcp({ ...entry, voice: { service: "nope", voiceId: "x" } }).voiceService).toBeUndefined();
    const back = acpFromAgent({ ...agent, model: "opus", identity: "soul" }, entry);
    expect(back).toMatchObject({
      id: "cc",
      command: "npx",
      args: ["claude-code-acp"],
      cwd: "/x",
      model: "opus",
      identity: "soul",
      role: "Coder",
      voice: { service: "elevenlabs", voiceId: "el1" },
    });
    expect(acpFromAgent({ ...agent, voiceId: undefined }, entry).voice).toBeUndefined();
    expect(() => acpFromAgent({ ...agent, engine: "hermes" })).toThrow();
  });
});

describe("rules", () => {
  const mk = (name: string, extra: Partial<Agent> = {}): Agent => ({
    ...agentFromAcp({ id: name, name, engine: "codex", command: "", args: [] }),
    ...extra,
  });

  it("sorts the default first, then by name", () => {
    const sorted = sortAgents([mk("zed"), mk("Amy"), mk("mid", { isDefault: true })]);
    expect(sorted.map((a) => a.name)).toEqual(["mid", "Amy", "zed"]);
  });

  it("filters by name or handle and never hides a picked row", () => {
    const all = [mk("Fiona Ops"), mk("Keel"), mk("Nash")];
    expect(filterAgents(all, "fiona-o").map((a) => a.name)).toEqual(["Fiona Ops"]);
    expect(filterAgents(all, "zzz", ["acp:Keel"]).map((a) => a.name)).toEqual(["Keel"]);
    expect(filterAgents(all, "  ")).toHaveLength(3);
    expect(handleOf("  Fiona   Ops ")).toBe("fiona-ops");
  });

  it("validates profile names as lowercase slugs", () => {
    expect(validProfileName("fiona")).toBe(true);
    expect(validProfileName("hr-agent_2")).toBe(true);
    expect(validProfileName("Fiona")).toBe(false);
    expect(validProfileName("-x")).toBe(false);
    expect(validProfileName("")).toBe(false);
  });

  it("treats blank, absent and undefined as the same in changed()", () => {
    const a = mk("a");
    expect(changed(a, { ...a, voiceId: undefined })).toBe(false);
    expect(changed(a, { ...a, role: "" })).toBe(false);
    expect(changed(a, { ...a, role: "x" })).toBe(true);
    expect(changed(a, { ...a, context: ["~/x"] })).toBe(true);
  });
});

describe("teams file", () => {
  it("round-trips, drops malformed rows and upserts by id", () => {
    const teams = [{ id: "t1", name: "Editorial", members: ["hermes:fiona", "acp:cc"], projects: [] }];
    const text = serializeTeams(teams);
    expect(parseTeamsFile(text)).toEqual(teams);
    expect(parseTeamsFile('{"teams":[{"id":"x"},{"id":"y","name":"Y","members":[1,"a"]}]}')).toEqual([{ id: "y", name: "Y", members: ["a"], projects: [] }]);
    expect(parseTeamsFile("{}")).toEqual([]);
    const next = upsertTeam(teams, { ...teams[0], name: "Ed" });
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe("Ed");
    expect(upsertTeam(teams, { id: "t2", name: "B", members: [], projects: [] })).toHaveLength(2);
    expect(removeTeam(next, "t1")).toEqual([]);
  });
});
