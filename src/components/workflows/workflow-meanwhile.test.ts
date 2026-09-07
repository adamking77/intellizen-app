import { expect, it } from "vitest";
import { createWorkflowDesignerDraft, addWorkflowDesignerStep } from "@/lib/workflow-designer";
import { eligibleMeanwhileSteps, MEANWHILE_BINDING_BLOCKER, meanwhileBindingBlocker, meanwhileRunSummary } from "./workflow-meanwhile";

it("offers only schema-safe, unclaimed independent role steps for meanwhile work", () => {
  const definition = addWorkflowDesignerStep(addWorkflowDesignerStep(createWorkflowDesignerDraft({ id: "meanwhile", name: "Meanwhile" }), "approval"), "role-assign");
  const [normal, approval, side] = definition.steps;
  if (normal.kind !== "role-assign" || approval.kind !== "approval" || side.kind !== "role-assign") throw new Error("Unexpected workflow fixture");
  approval.next = "complete";
  side.next = null;
  side.execution = "ephemeral";
  side.mediatedAuthority = "read-only";
  side.verification = { required: false };
  const candidates = eligibleMeanwhileSteps(definition, approval);
  expect(candidates.map((step) => step.id)).toEqual([side.id]);
  approval.meanwhile = [side.id];
  expect(eligibleMeanwhileSteps(definition, approval).map((step) => step.id)).toEqual([side.id]);
  const run = { definition_snapshot: definition, current_step_id: approval.id, step_states: { [side.id]: "running", [normal.id]: "running" } };
  expect(meanwhileRunSummary(run)).toBe(`${side.title} — started; no completion recorded`);
  run.step_states[side.id] = "completed";
  expect(meanwhileRunSummary(run)).toBe(`${side.title} — completed`);
  expect(meanwhileRunSummary({ ...run, step_states: null })).toBe(`${side.title} — status not recorded`);
});

it("surfaces the runtime's exact Codex ACP binding requirement", () => {
  const step = createWorkflowDesignerDraft({ id: "binding", name: "Binding" }).steps[0];
  if (step.kind !== "role-assign") throw new Error("Unexpected workflow fixture");
  expect(meanwhileBindingBlocker(step, [{ roleKey: step.role, roleName: step.role, roleRecordId: "role", agentKey: "agent", agentName: "Agent", agentRecordId: "agent", bindingRef: "acp:agent", adapterId: "acp", engine: "codex", model: null, execution: "ephemeral", state: "ready" }])).toBeNull();
  expect(meanwhileBindingBlocker(step, [])).toBe(MEANWHILE_BINDING_BLOCKER);
});
