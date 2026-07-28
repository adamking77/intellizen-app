import { GENZEN_WORKSPACE_DATABASE_IDS } from "@/lib/data";
import {
  buildAgentPanelRoleTargets,
  type AgentPanelRoleRecord,
} from "@/lib/agent-panel-roles";
import { supabase } from "@/lib/supabase";
import {
  effectiveRuntimeBindings,
  listRuntimeBindings,
} from "@/services/runtime-bindings";

export async function listAgentPanelRoleTargets() {
  const databaseIds = [
    GENZEN_WORKSPACE_DATABASE_IDS.roles,
    GENZEN_WORKSPACE_DATABASE_IDS.agents,
    GENZEN_WORKSPACE_DATABASE_IDS.roleAssignments,
  ];
  const [{ data, error }, store] = await Promise.all([
    supabase
      .schema("workspace")
      .from("records")
      .select("id, database_id, fields")
      .in("database_id", databaseIds),
    listRuntimeBindings().catch(() => ({ version: 1 as const, bindings: [] })),
  ]);
  if (error) throw error;
  const rows = (data ?? []) as Array<
    AgentPanelRoleRecord & { database_id: string }
  >;
  return buildAgentPanelRoleTargets({
    roles: rows.filter(
      (record) => record.database_id === GENZEN_WORKSPACE_DATABASE_IDS.roles,
    ),
    agents: rows.filter(
      (record) => record.database_id === GENZEN_WORKSPACE_DATABASE_IDS.agents,
    ),
    assignments: rows.filter(
      (record) =>
        record.database_id === GENZEN_WORKSPACE_DATABASE_IDS.roleAssignments,
    ),
    bindings: effectiveRuntimeBindings(store.bindings),
  });
}
