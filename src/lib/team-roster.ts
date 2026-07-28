import type { AgentPanelRoleRecord } from "@/lib/agent-panel-roles";
import type { RuntimeCatalogItem } from "@/lib/runtime-catalog";
import type { WorkflowRunItem, WorkflowTemplateItem } from "@/lib/types";
import type { RuntimeBinding } from "@/services/runtime-bindings";

export const TEAM_REVIEW_FIXTURE_KEY = "intelizen:team:local-review-fixture";
export const TEAM_ROSTER_CHANNEL = "intelizen:team-roster";

export type TeamReviewFixture = {
  roleRecordId: string;
  agentRecordId: string;
  bindingRef: string | null;
  scope: string;
  confirmedAt: string;
};

export type TeamRole = {
  roleKey: string;
  roleName: string;
  roleRecordId: string;
  mandate: string;
  authority: string;
  ownerGate: string;
  reportsToRoleIds: string[];
  verificationEligible: boolean;
  assignmentRecordId: string | null;
  assignmentScope: string | null;
  agentRecordId: string | null;
  agentKey: string | null;
  agentName: string | null;
  bindingRef: string | null;
  runtimeLabel: string;
  executionLabel: string;
  ready: boolean;
  localReviewFixture: boolean;
  workflowIds: string[];
  workflowNames: string[];
  recentWork: WorkflowRunItem[];
};

export type TeamAgent = {
  recordId: string;
  key: string;
  name: string;
  identity: string;
  status: string;
  roleNames: string[];
};

export type TeamAvailabilityIssue = {
  id: string;
  kind: "unstaffed-role" | "runtime" | "unassigned-binding" | "blocked-assignment";
  title: string;
  detail: string;
  roleKey?: string;
  bindingId?: string;
};

export type TeamModel = {
  roles: TeamRole[];
  agents: TeamAgent[];
  bindings: RuntimeBinding[];
  availability: TeamAvailabilityIssue[];
  fixture: TeamReviewFixture | null;
};

function fieldString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstRelation(value: unknown) {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : null;
}

function relations(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function workflowDefinition(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function workflowTargetRoles(workflow: WorkflowTemplateItem) {
  const definition = workflowDefinition(workflow.definition);
  if (definition?.schema !== "intellizen.workflow/1" || !Array.isArray(definition.steps)) {
    return [];
  }
  const roles = new Set<string>();
  for (const step of definition.steps) {
    if (!step || typeof step !== "object" || Array.isArray(step)) continue;
    const record = step as Record<string, unknown>;
    const role = fieldString(record.role);
    const gate = fieldString(record.gate);
    if (role) roles.add(role);
    if (gate) roles.add(gate);
  }
  return Array.from(roles);
}

export function applyTeamReviewFixture(
  assignments: AgentPanelRoleRecord[],
  fixture: TeamReviewFixture | null,
) {
  if (!fixture) return assignments;
  const remaining = assignments.filter(
    (assignment) =>
      firstRelation(assignment.fields.role_assignment_role) !== fixture.roleRecordId,
  );
  return [
    ...remaining,
    {
      id: `local-review-fixture:${fixture.roleRecordId}`,
      fields: {
        role_assignment_role: [fixture.roleRecordId],
        role_assignment_agent: [fixture.agentRecordId],
        role_assignment_binding_ref: fixture.bindingRef,
        role_assignment_scope: fixture.scope,
        role_assignment_status: "active",
        role_assignment_local_review_fixture: true,
      },
    },
  ];
}

export function buildTeamModel(input: {
  roles: AgentPanelRoleRecord[];
  agents: AgentPanelRoleRecord[];
  assignments: AgentPanelRoleRecord[];
  bindings: RuntimeBinding[];
  runtimeCatalog: RuntimeCatalogItem[];
  workflows: WorkflowTemplateItem[];
  runs: WorkflowRunItem[];
  fixture: TeamReviewFixture | null;
}): TeamModel {
  const assignments = applyTeamReviewFixture(input.assignments, input.fixture);
  const agentById = new Map(input.agents.map((agent) => [agent.id, agent]));
  const bindingById = new Map(input.bindings.map((binding) => [binding.bindingId, binding]));
  const runtimeByBinding = new Map(
    input.runtimeCatalog.map((runtime) => [runtime.bindingId, runtime]),
  );
  const assignmentByRole = new Map(
    assignments.flatMap((assignment) => {
      if (assignment.fields.role_assignment_status !== "active") return [];
      const roleId = firstRelation(assignment.fields.role_assignment_role);
      return roleId ? [[roleId, assignment] as const] : [];
    }),
  );
  const workflowRoles = new Map(
    input.workflows.map((workflow) => [workflow.id, workflowTargetRoles(workflow)]),
  );

  const roles = input.roles
    .filter((role) => role.fields.role_status === "active")
    .map((role): TeamRole => {
      const roleKey = fieldString(role.fields.role_key) ?? role.id;
      const assignment = assignmentByRole.get(role.id);
      const agentId = firstRelation(assignment?.fields.role_assignment_agent);
      const agent = agentId ? agentById.get(agentId) : null;
      const inferredHermes =
        roleKey === "operations_director" && agent?.fields.agent_key === "fiona";
      const inferredHuman =
        roleKey === "founder_approval_authority" && agent?.fields.agent_key === "adam";
      const bindingRef =
        fieldString(assignment?.fields.role_assignment_binding_ref) ??
        (inferredHermes ? "hermes-fiona" : null);
      const binding = bindingRef ? bindingById.get(bindingRef) : null;
      const runtime = bindingRef ? runtimeByBinding.get(bindingRef) : null;
      const workflowIds = input.workflows
        .filter((workflow) => workflowRoles.get(workflow.id)?.includes(roleKey))
        .map((workflow) => workflow.id);
      const recentWork = input.runs
        .filter(
          (run) =>
            run.owner_role === roleKey ||
            (agent && run.actor?.toLowerCase() === String(agent.fields.agent_display_name ?? "").toLowerCase()),
        )
        .slice(0, 4);
      const ready = Boolean(
        agent &&
          (inferredHuman || inferredHermes || (binding && runtime?.usable)),
      );
      return {
        roleKey,
        roleName: fieldString(role.fields.role_name) ?? roleKey,
        roleRecordId: role.id,
        mandate: fieldString(role.fields.role_mandate) ?? "No mandate recorded.",
        authority: fieldString(role.fields.role_authority_ceiling) ?? "Not recorded",
        ownerGate: fieldString(role.fields.role_owner_gate) ?? "Not recorded",
        reportsToRoleIds: relations(role.fields.role_reports_to),
        verificationEligible: role.fields.role_verification_eligible === true,
        assignmentRecordId: assignment?.id ?? null,
        assignmentScope:
          fieldString(assignment?.fields.role_assignment_scope) ?? null,
        agentRecordId: agent?.id ?? null,
        agentKey: fieldString(agent?.fields.agent_key),
        agentName: fieldString(agent?.fields.agent_display_name),
        bindingRef,
        runtimeLabel: inferredHuman
          ? "Human authority"
          : inferredHermes
            ? "Hermes"
            : binding
              ? binding.adapterId.replace("-cli", "")
              : "No runtime",
        executionLabel: inferredHuman
          ? "human"
          : inferredHermes
            ? "durable"
            : binding
              ? "local"
              : "unavailable",
        ready,
        localReviewFixture:
          assignment?.fields.role_assignment_local_review_fixture === true,
        workflowIds,
        workflowNames: input.workflows
          .filter((workflow) => workflowIds.includes(workflow.id))
          .map((workflow) => workflow.name),
        recentWork,
      };
    })
    .sort((left, right) => {
      if (left.roleKey === "founder_approval_authority") return -1;
      if (right.roleKey === "founder_approval_authority") return 1;
      return left.roleName.localeCompare(right.roleName);
    });

  const roleNamesByAgent = new Map<string, string[]>();
  for (const role of roles) {
    if (!role.agentRecordId) continue;
    roleNamesByAgent.set(role.agentRecordId, [
      ...(roleNamesByAgent.get(role.agentRecordId) ?? []),
      role.roleName,
    ]);
  }
  const agents = input.agents.map((agent): TeamAgent => ({
    recordId: agent.id,
    key: fieldString(agent.fields.agent_key) ?? agent.id,
    name: fieldString(agent.fields.agent_display_name) ?? "Unnamed agent",
    identity: fieldString(agent.fields.agent_identity) ?? "No identity recorded.",
    status: fieldString(agent.fields.agent_status) ?? "draft",
    roleNames: roleNamesByAgent.get(agent.id) ?? [],
  }));

  const availability: TeamAvailabilityIssue[] = [];
  for (const role of roles) {
    if (!role.agentRecordId) {
      availability.push({
        id: `role:${role.roleKey}`,
        kind: "unstaffed-role",
        title: `${role.roleName} is unstaffed`,
        detail:
          role.workflowNames.length > 0
            ? `Required by ${role.workflowNames.length} executable workflow${role.workflowNames.length === 1 ? "" : "s"}: ${role.workflowNames.join(", ")}.`
            : "No standing occupant or runtime assignment exists.",
        roleKey: role.roleKey,
      });
    } else if (!role.ready) {
      availability.push({
        id: `assignment:${role.roleKey}`,
        kind: "blocked-assignment",
        title: `${role.roleName} assignment is blocked`,
        detail: role.bindingRef
          ? `Binding ${role.bindingRef} is not currently usable.`
          : "The assignment has no usable runtime.",
        roleKey: role.roleKey,
        bindingId: role.bindingRef ?? undefined,
      });
    }
  }
  for (const runtime of input.runtimeCatalog) {
    if (!runtime.usable && runtime.assigned) {
      availability.push({
        id: `runtime:${runtime.bindingId}`,
        kind: "runtime",
        title: `${runtime.label} needs attention`,
        detail: runtime.blockers.join(" "),
        bindingId: runtime.bindingId,
      });
    } else if (!runtime.assigned) {
      availability.push({
        id: `binding:${runtime.bindingId}`,
        kind: "unassigned-binding",
        title: `${runtime.label} binding is unassigned`,
        detail: `Reviewed binding ${runtime.bindingId} exists but has no standing role assignment.`,
        bindingId: runtime.bindingId,
      });
    }
  }

  return { roles, agents, bindings: input.bindings, availability, fixture: input.fixture };
}

export type AgentCreationDraft = {
  name: string;
  key: string;
  purpose: string;
  mandate: string;
  boundaries: string;
  ownerGate: string;
  bindingRef: string | null;
  roleRecordId: string | null;
  scope: string;
};

export function buildAgentCreationPreview(draft: AgentCreationDraft) {
  const fields = {
    agent_key: draft.key.trim(),
    agent_display_name: draft.name.trim(),
    agent_identity: draft.purpose.trim(),
    agent_status: "draft",
  };
  const body = [
    "# Operating instructions",
    "",
    `Mandate: ${draft.mandate.trim() || "Not specified"}`,
    `Boundaries: ${draft.boundaries.trim() || "Not specified"}`,
    `Owner gate: ${draft.ownerGate}`,
    `Runtime binding reference: ${draft.bindingRef ?? "inherit default"}`,
    `Assignment scope: ${draft.scope.trim() || "Not specified"}`,
  ].join("\n");
  return {
    approvalRequired: "founder_approval_authority",
    agent: { fields, body },
    assignment: draft.roleRecordId
      ? {
          fields: {
            role_assignment_role: [draft.roleRecordId],
            role_assignment_agent: ["<created-agent-record-id>"],
            role_assignment_scope: draft.scope.trim(),
            role_assignment_status: "draft",
            role_assignment_binding_ref: draft.bindingRef,
          },
        }
      : null,
    localChanges: draft.bindingRef
      ? [`Reference existing local binding ${draft.bindingRef}; do not copy executable arguments to Supabase.`]
      : ["No local runtime binding change."],
  };
}
