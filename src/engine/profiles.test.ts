import { describe, expect, it } from "vitest";

import { defaultProfile, listProfiles } from "./profiles";
import { FakeGatewayClient, loadProfilesList } from "./test-support";

describe("listProfiles", () => {
  it("maps the recorded profiles.list result to the app's HermesProfile shape", async () => {
    const client = new FakeGatewayClient();
    const recorded = loadProfilesList();
    client.respondWith((call) => (call.method === "profiles.list" ? recorded.result : undefined));
    const profiles = await listProfiles(client);
    expect(client.calls[0]).toMatchObject({ method: "profiles.list", params: { include_sessions: false } });
    expect(profiles.map((p) => p.name)).toEqual(["default", "fiona", "hr-agent", "isla", "keel", "nash", "rook"]);
    expect(profiles[0]).toEqual({
      name: "default",
      isDefault: true,
      model: "deepseek-v4-flash",
      provider: "deepseek",
      gatewayRunning: true,
      description: "",
      displayName: "",
      avatarColor: "#8b5cf6",
      hasAvatar: true,
    });
    expect(profiles.filter((p) => p.isDefault)).toHaveLength(1);
    expect(defaultProfile(profiles)?.name).toBe("default");
  });

  it("drops rows without a name and tolerates missing fields", async () => {
    const client = new FakeGatewayClient();
    client.respondWith((call) =>
      call.method === "profiles.list" ? { profiles: [{ name: "" }, { name: "x", model: null }, {}] } : undefined,
    );
    const profiles = await listProfiles(client);
    expect(profiles).toEqual([
      { name: "x", isDefault: false, model: null, provider: null, gatewayRunning: true, description: "", displayName: "" },
    ]);
    expect(defaultProfile(profiles)?.name).toBe("x");
    expect(defaultProfile([])).toBeNull();
  });
});
