import { expect, it } from "vitest";
import { createWorkflowDesignerDraft } from "./workflow-designer";
import { revealWorkflowCard, workflowIssueTarget } from "./workflow-editor-navigation";
it("maps schema and runtime errors to the same editable step and field", () => {
  const definition = createWorkflowDesignerDraft({ id: "test", name: "Test" });
  expect(workflowIssueTarget(definition, "steps[0].verification.method")).toMatchObject({ stepId: "step_1", field: "verification.method" });
  expect(workflowIssueTarget(definition, "steps.step_1.role")).toMatchObject({ stepId: "step_1", field: "role" });
  expect(workflowIssueTarget(definition, "inputs[2].key")).toMatchObject({ stepId: "trigger", field: "inputs[2].key" });
  expect(workflowIssueTarget(definition, "name")).toMatchObject({ stepId: "", field: "name" });
});
it("preserves the viewport for a visible card and only pans enough for an obscured one", () => {
  const viewport = { x: 50, y: 40, zoom: 0.6 }, host = { width: 800, height: 600 };
  expect(revealWorkflowCard(viewport, { x: 50, y: 40, width: 380, height: 420 }, host)).toBe(viewport);
  expect(revealWorkflowCard(viewport, { x: 1100, y: 900, width: 380, height: 420 }, host)).toEqual({ x: -112, y: -216, zoom: 0.6 });
});
it("reveals the top of an oversized editor without zooming the whole canvas out", () => {
  expect(revealWorkflowCard({ x: 0, y: 0, zoom: 1 }, { x: 50, y: 200, width: 380, height: 1000 }, { width: 600, height: 400 })).toEqual({ x: 0, y: -176, zoom: 1 });
});
