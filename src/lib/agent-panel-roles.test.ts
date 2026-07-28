import { describe, expect, it } from "vitest";

import {
  buildAgentPanelRoleTargets,
  migrateFionaPanelStorage,
  panelRoleStorageKey,
  resolveInitialPanelRole,
} from "@/lib/agent-panel-roles";
import type { RuntimeBinding } from "@/services/runtime-bindings";

const codexBinding = {
  bindingId: "codex-local-primary",
  adapterId: "codex-cli",
  modelPolicy: { default: "gpt-5.3-codex", allowed: ["gpt-5.3-codex"] },
} as RuntimeBinding;

describe("Agent Panel role routing", () => {
  it("joins active roles to explicit occupants and local bindings", () => {
    const targets = buildAgentPanelRoleTargets({
      roles: [
        { id: "role-keel", fields: { role_key: "chief_engineer", role_name: "Chief Engineer", role_status: "active" } },
        { id: "role-fiona", fields: { role_key: "operations_director", role_name: "Operations Director", role_status: "active" } },
        { id: "role-verifier", fields: { role_key: "verifier", role_name: "Verifier", role_status: "active" } },
      ],
      agents: [
        { id: "agent-fiona", fields: { agent_key: "fiona", agent_display_name: "Fiona" } },
        { id: "agent-keel", fields: { agent_key: "keel", agent_display_name: "Keel" } },
      ],
      assignments: [
        { id: "assignment-fiona", fields: { role_assignment_role: ["role-fiona"], role_assignment_agent: ["agent-fiona"], role_assignment_binding_ref: null, role_assignment_status: "active" } },
        { id: "assignment-keel", fields: { role_assignment_role: ["role-keel"], role_assignment_agent: ["agent-keel"], role_assignment_binding_ref: "codex-local-primary", role_assignment_status: "active" } },
      ],
      bindings: [codexBinding],
    });

    expect(targets[0]).toMatchObject({
      roleKey: "operations_director",
      agentKey: "fiona",
      bindingRef: "hermes-fiona",
      adapterId: "hermes",
      execution: "durable",
      state: "ready",
    });
    expect(targets[1]).toMatchObject({
      roleKey: "chief_engineer",
      agentKey: "keel",
      bindingRef: "codex-local-primary",
      adapterId: "codex-cli",
      execution: "ephemeral",
      state: "ready",
    });
    expect(targets[2]).toMatchObject({
      roleKey: "verifier",
      agentKey: null,
      state: "unavailable",
    });
  });

  it("never turns an unavailable preference into an implicit selection", () => {
    expect(
      resolveInitialPanelRole({
        availableRoleKeys: ["operations_director"],
        selectedRole: "verifier",
        startRole: null,
      }),
    ).toBeNull();
  });

  it("never treats a local review fixture as a dispatch-ready assignment", () => {
    const [target] = buildAgentPanelRoleTargets({
      roles: [
        {
          id: "role-keel",
          fields: {
            role_key: "chief_engineer",
            role_name: "Chief Engineer",
            role_status: "active",
          },
        },
      ],
      agents: [
        {
          id: "agent-keel",
          fields: { agent_key: "keel", agent_display_name: "Keel" },
        },
      ],
      assignments: [
        {
          id: "local-review-fixture:role-keel",
          fields: {
            role_assignment_role: ["role-keel"],
            role_assignment_agent: ["agent-keel"],
            role_assignment_binding_ref: "codex-local-primary",
            role_assignment_status: "active",
            role_assignment_local_review_fixture: true,
          },
        },
      ],
      bindings: [codexBinding],
    });

    expect(target).toMatchObject({
      roleKey: "chief_engineer",
      agentKey: null,
      state: "unavailable",
    });
  });

  it("migrates the Fiona legacy keys once into operations_director", () => {
    const values = new Map<string, string>([
      ["intelizen:agent-panel-chat-history", "[1]"],
      ["intelizen:agent-panel-chat-draft", "draft"],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    migrateFionaPanelStorage(storage);
    expect(values.get(panelRoleStorageKey("operations_director", "history"))).toBe("[1]");
    expect(values.get(panelRoleStorageKey("operations_director", "draft"))).toBe("draft");
    expect(values.has("intelizen:agent-panel-chat-history")).toBe(false);
  });
});
