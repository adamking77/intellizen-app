import type { ExecutionTarget } from "@/engine/execution-targets";

export const PANEL_START_ROLE_KEY = "intelizen:agent-panel:panel_start_role";
export const PANEL_SELECTED_ROLE_KEY = "intelizen:agent-panel:selected-role";
export const PANEL_ROLE_CHANNEL = "intelizen:agent-panel-role";
export const PANEL_SPEAK_REPLIES_KEY = "intelizen:agent-panel-speak-replies";
export const OPERATIONS_DIRECTOR_ROLE = "operations_director";

export interface AgentPanelRoleMessage {
  roleKey?: string;
  open?: boolean;
  collapsed?: boolean;
}

export function publishAgentPanelRoleMessage(message: AgentPanelRoleMessage) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(PANEL_ROLE_CHANNEL);
  channel.postMessage(message);
  channel.close();
}

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
  adapterId: ExecutionTarget["kind"] | null;
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
  targets: ExecutionTarget[];
}): AgentPanelRoleTarget[] {
  const agents = new Map(input.agents.map((agent) => [agent.id, agent]));
  const assignments = new Map(
    input.assignments.flatMap((assignment) => {
      if (assignment.fields.role_assignment_status !== "active") return [];
      if (assignment.fields.role_assignment_local_review_fixture === true) {
        return [];
      }
      const roleId = firstRelation(assignment.fields.role_assignment_role);
      return roleId ? [[roleId, assignment] as const] : [];
    }),
  );
  const targets = new Map(input.targets.map((target) => [target.agentKey, target]));

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
      const agentKey = fieldString(agent?.fields.agent_key);
      const target = agentKey ? targets.get(agentKey) : null;
      return {
        roleKey,
        roleName: fieldString(role.fields.role_name) ?? roleKey,
        roleRecordId: role.id,
        agentKey,
        agentName: fieldString(agent?.fields.agent_display_name),
        agentRecordId: agent?.id ?? null,
        bindingRef: target?.ref ?? null,
        adapterId: target?.kind ?? null,
        model: target?.model ?? null,
        execution: target?.execution ?? null,
        state: agent && target ? "ready" : "unavailable",
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
