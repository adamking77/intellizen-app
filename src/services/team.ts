import {
  GENZEN_WORKSPACE_DATABASE_IDS,
  createWorkspaceRecord,
  listWorkflowRuns,
  listWorkflows,
  updateWorkspaceRecord,
} from "@/lib/data";
import type { AgentPanelRoleRecord } from "@/lib/agent-panel-roles";
import {
  buildAgentCreationPreview,
  buildTeamModel,
  type AgentCreationDraft,
  type TeamReviewFixture,
} from "@/lib/team-roster";
import { supabase } from "@/lib/supabase";
import { listRuntimeBindings } from "@/services/runtime-bindings";
import { inspectRuntimeCatalog } from "@/services/runtime-catalog";
import { readTeamReviewFixture } from "@/services/team-review-fixture";

type TeamRecord = AgentPanelRoleRecord & { database_id: string };

async function listCanonicalTeamRecords() {
  const databaseIds = [
    GENZEN_WORKSPACE_DATABASE_IDS.roles,
    GENZEN_WORKSPACE_DATABASE_IDS.agents,
    GENZEN_WORKSPACE_DATABASE_IDS.roleAssignments,
  ];
  const { data, error } = await supabase
    .schema("workspace")
    .from("records")
    .select("id, database_id, fields")
    .in("database_id", databaseIds);
  if (error) throw error;
  return (data ?? []) as TeamRecord[];
}

export async function inspectTeam() {
  const [records, store, runtimeCatalog, workflows, runs] = await Promise.all([
    listCanonicalTeamRecords(),
    listRuntimeBindings(),
    inspectRuntimeCatalog(),
    listWorkflows({ includeInactive: true, limit: 100 }),
    listWorkflowRuns({ includeCompleted: true, limit: 100 }),
  ]);
  return buildTeamModel({
    roles: records.filter(
      (record) => record.database_id === GENZEN_WORKSPACE_DATABASE_IDS.roles,
    ),
    agents: records.filter(
      (record) => record.database_id === GENZEN_WORKSPACE_DATABASE_IDS.agents,
    ),
    assignments: records.filter(
      (record) =>
        record.database_id === GENZEN_WORKSPACE_DATABASE_IDS.roleAssignments,
    ),
    bindings: store.bindings,
    runtimeCatalog,
    workflows,
    runs,
    fixture: readTeamReviewFixture(),
  });
}

export async function createReviewedTeamAgent(draft: AgentCreationDraft) {
  const preview = buildAgentCreationPreview(draft);
  const agent = await createWorkspaceRecord({
    databaseId: GENZEN_WORKSPACE_DATABASE_IDS.agents,
    fields: preview.agent.fields,
    body: preview.agent.body,
    skipSystemSync: true,
  });
  let assignment = null;
  if (preview.assignment) {
    assignment = await createWorkspaceRecord({
      databaseId: GENZEN_WORKSPACE_DATABASE_IDS.roleAssignments,
      fields: {
        ...preview.assignment.fields,
        role_assignment_agent: [agent.id],
      },
      body: `Draft assignment created through the reviewed Team flow. Activation remains founder-gated.`,
      skipSystemSync: true,
    });
  }
  return { agent, assignment };
}

export type RoleReassignmentDraft = {
  roleRecordId: string;
  agentRecordId: string;
  bindingRef: string | null;
  scope: string;
};

export async function previewRoleReassignment(draft: RoleReassignmentDraft) {
  const records = await listCanonicalTeamRecords();
  const existing = records.find(
    (record) =>
      record.database_id === GENZEN_WORKSPACE_DATABASE_IDS.roleAssignments &&
      record.fields.role_assignment_status === "active" &&
      Array.isArray(record.fields.role_assignment_role) &&
      record.fields.role_assignment_role[0] === draft.roleRecordId,
  );
  return {
    approvalRequired: "founder_approval_authority",
    existingAssignmentId: existing?.id ?? null,
    exactChange: {
      role_assignment_role: [draft.roleRecordId],
      role_assignment_agent: [draft.agentRecordId],
      role_assignment_scope: draft.scope,
      role_assignment_status: "active",
      role_assignment_binding_ref: draft.bindingRef,
    },
  };
}

export async function applyCanonicalRoleReassignment(
  draft: RoleReassignmentDraft,
) {
  const preview = await previewRoleReassignment(draft);
  if (preview.existingAssignmentId) {
    return updateWorkspaceRecord(
      preview.existingAssignmentId,
      { fields: preview.exactChange },
      true,
    );
  }
  return createWorkspaceRecord({
    databaseId: GENZEN_WORKSPACE_DATABASE_IDS.roleAssignments,
    fields: preview.exactChange,
    body: "Standing assignment created through the reviewed Team flow.",
    skipSystemSync: true,
  });
}

export function toTeamReviewFixture(
  draft: RoleReassignmentDraft,
): TeamReviewFixture {
  return { ...draft, confirmedAt: new Date().toISOString() };
}
