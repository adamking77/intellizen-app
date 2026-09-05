import { createWorkspaceRecord, GENZEN_WORKSPACE_DATABASE_IDS, toWorkflowTemplateItem, WORKFLOW_REGISTRY_FIELDS as F } from "@/lib/data";
import type { WorkspaceDatabaseFieldValue } from "@/lib/types";
import { validateWorkflowDefinition, type WorkflowDefinitionV1 } from "@/lib/workflow-schema";

export async function createWorkflowDraft(definition: WorkflowDefinitionV1) {
  const validation = validateWorkflowDefinition(definition);
  if (!validation.valid) throw new Error(validation.errors.map((error) => error.message).join("; "));
  const roleStep = definition.steps.find((step) => step.kind === "role-assign");
  const record = await createWorkspaceRecord({
    databaseId: GENZEN_WORKSPACE_DATABASE_IDS.workflowRegistry,
    skipSystemSync: true,
    fields: {
      [F.name]: definition.name,
      [F.workflowId]: definition.id,
      [F.status]: "Draft",
      [F.trigger]: definition.trigger.kind,
      [F.ownerRole]: roleStep?.kind === "role-assign" ? roleStep.role : null,
      [F.definition]: definition as unknown as WorkspaceDatabaseFieldValue,
      [F.definitionVersion]: definition.version,
    },
  });
  return toWorkflowTemplateItem(record);
}
