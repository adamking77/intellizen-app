import { activeWorkForRole } from "@/lib/active-work";
import { listWorkflowRuns } from "@/lib/data";
import { listAgentPanelRoleTargets } from "@/services/agent-panel-roles";

export async function inspectActiveWork() {
  const [runs, roles] = await Promise.all([
    listWorkflowRuns({ includeCompleted: false, limit: 100 }),
    listAgentPanelRoleTargets(),
  ]);
  return Object.fromEntries(
    roles.map((role) => [
      role.roleKey,
      activeWorkForRole(runs, role.roleKey, {
        recordId: role.agentRecordId,
        agentKey: role.agentKey,
        displayName: role.agentName,
      }),
    ]),
  );
}
