import type { RuntimeBinding } from "@/services/runtime-bindings";

export const PANEL_START_ROLE_KEY = "intelizen:agent-panel:panel_start_role";
export const PANEL_SELECTED_ROLE_KEY = "intelizen:agent-panel:selected-role";
export const PANEL_ROLE_CHANNEL = "intelizen:agent-panel-role";
export const PANEL_SPEAK_REPLIES_KEY = "intelizen:agent-panel-speak-replies";
export const OPERATIONS_DIRECTOR_ROLE = "operations_director";

export interface AgentPanelRoleRecord {
  id: string;
  fields: Record<string, unknown>;
}

export interface AgentPanelRoleTarget {
  roleKey: string;
  roleName: string;
  roleRecordId: string;
  agentKey: string | null;
  agentName: string | null;
  agentRecordId: string | null;
  bindingRef: string | null;
  adapterId: RuntimeBinding["adapterId"] | null;
  model: string | null;
  execution: "ephemeral" | "durable" | null;
  state: "ready" | "unavailable";
}

function fieldString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstRelation(value: unknown) {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
}

export function buildAgentPanelRoleTargets(input: {
  roles: AgentPanelRoleRecord[];
  agents: AgentPanelRoleRecord[];
  assignments: AgentPanelRoleRecord[];
  bindings: RuntimeBinding[];
}): AgentPanelRoleTarget[] {
  const agents = new Map(input.agents.map((agent) => [agent.id, agent]));
  const assignments = new Map(
    input.assignments.flatMap((assignment) => {
      if (assignment.fields.role_assignment_status !== "active") return [];
      const roleId = firstRelation(assignment.fields.role_assignment_role);
      return roleId ? [[roleId, assignment] as const] : [];
    }),
  );
  const bindings = new Map(
    input.bindings.map((binding) => [binding.bindingId, binding]),
  );

  return input.roles
    .filter(
      (role) =>
        role.fields.role_status === "active" &&
        fieldString(role.fields.role_key),
    )
    .map((role): AgentPanelRoleTarget => {
      const roleKey = fieldString(role.fields.role_key) as string;
      const assignment = assignments.get(role.id);
      const agentId = assignment
        ? firstRelation(assignment.fields.role_assignment_agent)
        : null;
      const agent = agentId ? agents.get(agentId) : null;
      const bindingRef =
        fieldString(assignment?.fields.role_assignment_binding_ref) ??
        (roleKey === OPERATIONS_DIRECTOR_ROLE && agent?.fields.agent_key === "fiona"
          ? "hermes-fiona"
          : null);
      const binding = bindingRef ? bindings.get(bindingRef) : null;
      const adapterId =
        binding?.adapterId ??
        (bindingRef === "hermes-fiona" ? "hermes" : null);
      const execution =
        adapterId === "hermes"
          ? "durable"
          : adapterId
            ? "ephemeral"
            : null;
      return {
        roleKey,
        roleName: fieldString(role.fields.role_name) ?? roleKey,
        roleRecordId: role.id,
        agentKey: fieldString(agent?.fields.agent_key),
        agentName: fieldString(agent?.fields.agent_display_name),
        agentRecordId: agent?.id ?? null,
        bindingRef,
        adapterId,
        model: binding?.modelPolicy.default || null,
        execution,
        state: agent && adapterId ? "ready" : "unavailable",
      };
    })
    .sort((left, right) => {
      if (left.roleKey === OPERATIONS_DIRECTOR_ROLE) return -1;
      if (right.roleKey === OPERATIONS_DIRECTOR_ROLE) return 1;
      return left.roleName.localeCompare(right.roleName);
    });
}

export function panelRoleStorageKey(
  roleKey: string,
  kind: "history" | "draft" | "last-read" | "cleared",
) {
  return `intelizen:agent-panel:${kind}:${roleKey}`;
}

export function resolveInitialPanelRole(input: {
  availableRoleKeys: string[];
  selectedRole: string | null;
  startRole: string | null;
}) {
  const available = new Set(input.availableRoleKeys);
  if (input.selectedRole && available.has(input.selectedRole)) {
    return input.selectedRole;
  }
  if (input.startRole && available.has(input.startRole)) {
    return input.startRole;
  }
  return null;
}

export function migrateFionaPanelStorage(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
) {
  const migrations = [
    ["intelizen:agent-panel-chat-history", panelRoleStorageKey(OPERATIONS_DIRECTOR_ROLE, "history")],
    ["intelizen:agent-panel-chat-draft", panelRoleStorageKey(OPERATIONS_DIRECTOR_ROLE, "draft")],
    ["intelizen:agent-panel-last-read", panelRoleStorageKey(OPERATIONS_DIRECTOR_ROLE, "last-read")],
    ["intelizen:agent-panel-last-read-at", panelRoleStorageKey(OPERATIONS_DIRECTOR_ROLE, "last-read")],
    ["intelizen:chat-cleared-at", panelRoleStorageKey(OPERATIONS_DIRECTOR_ROLE, "cleared")],
  ] as const;
  let migrated = false;
  for (const [legacy, target] of migrations) {
    const legacyValue = storage.getItem(legacy);
    if (legacyValue !== null && storage.getItem(target) === null) {
      storage.setItem(target, legacyValue);
      migrated = true;
    }
    if (legacyValue !== null) storage.removeItem(legacy);
  }
  if (migrated) {
    if (storage.getItem(PANEL_START_ROLE_KEY) === null) {
      storage.setItem(PANEL_START_ROLE_KEY, OPERATIONS_DIRECTOR_ROLE);
    }
    if (storage.getItem(PANEL_SELECTED_ROLE_KEY) === null) {
      storage.setItem(PANEL_SELECTED_ROLE_KEY, OPERATIONS_DIRECTOR_ROLE);
    }
  }
}
