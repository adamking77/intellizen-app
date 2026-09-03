import { GENZEN_WORKSPACE_DATABASE_IDS } from "@/lib/data";
import {
  buildAgentPanelRoleTargets,
  type AgentPanelRoleRecord,
} from "@/lib/agent-panel-roles";
import { supabase } from "@/lib/supabase";
import { listExecutionTargets } from "@/engine/execution-targets";

export async function listAgentPanelRoleTargets() {
  const databaseIds = [
    GENZEN_WORKSPACE_DATABASE_IDS.roles,
    GENZEN_WORKSPACE_DATABASE_IDS.agents,
    GENZEN_WORKSPACE_DATABASE_IDS.roleAssignments,
  ];
  const [{ data, error }, targets] = await Promise.all([
    supabase
      .schema("workspace")
      .from("records")
      .select("id, database_id, fields")
      .in("database_id", databaseIds),
    listExecutionTargets(),
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
    targets,
  });
}
