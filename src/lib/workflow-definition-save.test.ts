import { expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ single: vi.fn() }));
vi.mock("@/lib/supabase", () => {
  const query = { select: () => query, eq: () => query, single: mock.single };
  return { supabase: { schema: () => ({ from: () => query }) } };
});
import { saveWorkflowDefinition, WORKFLOW_REGISTRY_FIELDS, GENZEN_WORKSPACE_DATABASE_IDS } from "./data";
import { createWorkflowDesignerDraft } from "./workflow-designer";
it("keeps a first executable definition in Draft even when its legacy SOP was Active", async () => {
  const definition = createWorkflowDesignerDraft({ id: "test", name: "Test" });
  const record = { id: "record", database_id: GENZEN_WORKSPACE_DATABASE_IDS.workflowRegistry, fields: { [WORKFLOW_REGISTRY_FIELDS.status]: "Active", [WORKFLOW_REGISTRY_FIELDS.definition]: null }, updated_at: "first" };
  mock.single.mockResolvedValue({ data: record, error: null });
  const draft = await saveWorkflowDefinition({ workflowRecordId: "record", definition, activate: false, expectedUpdatedAt: "first" });
  expect(draft).toMatchObject({ dry_run: true, next_status: "Draft", write_performed: false });
  const active = await saveWorkflowDefinition({ workflowRecordId: "record", definition, activate: true });
  expect(active).toMatchObject({ next_status: "Active" });
  mock.single.mockResolvedValue({ data: { ...record, fields: { ...record.fields, [WORKFLOW_REGISTRY_FIELDS.definition]: definition } }, error: null });
  expect(await saveWorkflowDefinition({ workflowRecordId: "record", definition, activate: false })).toMatchObject({ next_status: "Active" });
  mock.single.mockResolvedValue({ data: { ...record, fields: { ...record.fields, [WORKFLOW_REGISTRY_FIELDS.definition]: JSON.stringify(definition) } }, error: null });
  expect(await saveWorkflowDefinition({ workflowRecordId: "record", definition, activate: false })).toMatchObject({ next_status: "Active" });
  await expect(saveWorkflowDefinition({ workflowRecordId: "record", definition, activate: false, expectedUpdatedAt: "older" })).rejects.toThrow("changed elsewhere");
});
