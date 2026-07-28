import { describe, expect, it } from "vitest";

import {
  normalizeRuntimeModelPolicy,
  runtimeBindingCandidate,
} from "@/lib/runtime-binding-candidates";
import type { RuntimeDiscovery } from "@/services/runtimes";

function discovery(
  adapterId: RuntimeDiscovery["adapterId"],
): RuntimeDiscovery {
  return {
    adapterId,
    installed: true,
    binary: `/Users/adamking/.local/bin/${adapterId === "codex-cli" ? "codex" : "claude"}`,
    resolutionSource: "PATH",
    version:
      adapterId === "codex-cli"
        ? "codex-cli 0.145.0"
        : "2.1.220 (Claude Code)",
    supported: true,
    supportRange:
      adapterId === "codex-cli"
        ? ">=0.145.0 <0.146.0"
        : ">=2.1.220 <2.2.0",
    authState: "ready",
    workerProfileHome: `/tmp/${adapterId}`,
    checkedAtMs: 1,
    remediation: "No action required.",
  };
}

describe("runtime binding candidates", () => {
  it("normalizes a reviewed deny-by-default model allowlist", () => {
    expect(normalizeRuntimeModelPolicy("", "")).toEqual({
      default: "",
      allowed: [],
    });
    expect(
      normalizeRuntimeModelPolicy(
        "gpt-5.3-codex",
        "gpt-5.3-codex, gpt-5.3-codex, gpt-5.2-codex",
      ),
    ).toEqual({
      default: "gpt-5.3-codex",
      allowed: ["gpt-5.3-codex", "gpt-5.2-codex"],
    });
  });

  it("keeps the Codex worker sandbox and strict config", () => {
    const candidate = runtimeBindingCandidate(discovery("codex-cli"));
    expect(candidate.bindingId).toBe("codex-local-primary");
    expect(candidate.argTemplates).toContain("--strict-config");
    expect(candidate.providerPermissionMode).toBe("workspace-write");
  });

  it("uses an isolated strict Claude MCP config with no resume claim", () => {
    const candidate = runtimeBindingCandidate(discovery("claude-cli"));
    expect(candidate.bindingId).toBe("claude-local-primary");
    expect(candidate.argTemplates).toContain("--strict-mcp-config");
    expect(candidate.argTemplates).toContain("--no-session-persistence");
    expect(candidate.argTemplates).not.toContain("--safe-mode");
    expect(candidate.argTemplates).toContain("/tmp/claude-cli/mcp-worker.json");
    expect(candidate.capabilityEvidence.passed).not.toContain("resume");
    expect(candidate.secretRefs).toEqual([]);
  });
});
