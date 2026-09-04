import { describe, expect, it } from "vitest";

import { grantsComplete, parsePluginApproval, verifyPluginApproval } from "./approval";

const approval = parsePluginApproval(JSON.stringify({
  plugin_id: "weather-card",
  name: "Weather card",
  version: "0.1.0",
  author: "Keel",
  capabilities: ["network"],
  hashes: { "plugin.yaml": "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" },
}))!;

describe("plugin approval", () => {
  it("requires a decision for every requested capability", () => {
    expect(grantsComplete(approval, {})).toBe(false);
    expect(grantsComplete(approval, { network: false })).toBe(true);
  });

  it("blocks changed staged source", async () => {
    await expect(verifyPluginApproval(approval, { "plugin.yaml": "abc" })).resolves.toBeUndefined();
    await expect(verifyPluginApproval(approval, { "plugin.yaml": "changed" })).rejects.toThrow("changed after review");
  });
});
