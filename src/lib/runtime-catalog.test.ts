import { describe, expect, it } from "vitest";

import { buildRuntimeCatalog, deriveSystemHealth } from "@/lib/runtime-catalog";
import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import type { RuntimeBinding } from "@/services/runtime-bindings";
import type { RuntimeDiscovery } from "@/services/runtimes";

const discovery: RuntimeDiscovery = {
  adapterId: "claude-cli",
  installed: true,
  binary: "/usr/local/bin/claude",
  resolutionSource: "PATH",
  version: "2.1.220 (Claude Code)",
  supported: true,
  supportRange: ">=2.1.220 <2.2.0",
  authState: "ready",
  workerProfileHome: "/tmp/claude-local-primary",
  checkedAtMs: 1,
  remediation: "No action required.",
};

const binding: RuntimeBinding = {
  bindingId: "claude-local-primary",
  adapterId: "claude-cli",
  canonicalBinary: discovery.binary,
  argTemplates: [],
  workingDirGrants: ["/workspace"],
  providerPermissionMode: "dontAsk",
  envPolicy: "sanitized",
  workerProfileHome: discovery.workerProfileHome,
  secretRefs: [],
  capabilityEvidence: { suiteVersion: "gate6", passed: ["stream"], cliVersion: discovery.version },
  modelPolicy: { default: "", allowed: [] },
};

describe("runtime catalog", () => {
  it("keeps bound separate from assigned and usable", () => {
    const [runtime] = buildRuntimeCatalog({ discoveries: [discovery], bindings: [binding], roleTargets: [] });
    expect(runtime).toMatchObject({ installed: true, supported: true, authenticated: true, bound: true, assigned: false, usable: false });
    expect(runtime.blockers).toEqual(["Binding is not assigned to an active role."]);
    expect(runtime.modelChoices).toEqual([]);
  });

  it("becomes usable only when the reviewed binding is actively assigned", () => {
    const role = { bindingRef: binding.bindingId } as AgentPanelRoleTarget;
    const [runtime] = buildRuntimeCatalog({ discoveries: [discovery], bindings: [binding], roleTargets: [role] });
    expect(runtime.usable).toBe(true);
    expect(runtime.assignedRoles).toEqual([role]);
  });

  it("never reports nominal health while a runtime or connection has a blocker", () => {
    const [runtime] = buildRuntimeCatalog({ discoveries: [discovery], bindings: [binding], roleTargets: [] });
    expect(deriveSystemHealth({ runtimes: [runtime], connections: [], loading: false })).toMatchObject({ state: "attention", problemCount: 1 });
  });

  it.each([
    ["unknown", "has not been prepared or probed"],
    ["config_invalid", "configuration is invalid"],
    ["login_required", "requires provider sign-in"],
  ] as const)("keeps %s authentication diagnostics distinct", (authState, copy) => {
    const [runtime] = buildRuntimeCatalog({
      discoveries: [{ ...discovery, authState }],
      bindings: [binding],
      roleTargets: [{ bindingRef: binding.bindingId } as AgentPanelRoleTarget],
    });
    expect(runtime.authenticated).toBe(false);
    expect(runtime.blockers.join(" ")).toContain(copy);
  });
});
