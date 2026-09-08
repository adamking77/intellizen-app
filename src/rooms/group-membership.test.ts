import { describe, expect, it } from "vitest";

import { durableGroupChatMembers, memberFromProfile } from "./group-membership";

describe("room member identity", () => {
  it("keeps a trace seed in the saved offline room roster", () => {
    const member = memberFromProfile({
      name: "fiona",
      displayName: "Fiona",
      description: "Researcher",
      model: "model",
      provider: "Hermes",
      isDefault: true,
      gatewayRunning: true,
      avatarStyle: "trace",
      avatarSeed: 73,
      avatarKind: "cloud",
    });
    expect(durableGroupChatMembers([member])[0]).toMatchObject({
      avatar_style: "trace",
      avatar_seed: 73,
      avatar_kind: "cloud",
    });
  });
});
