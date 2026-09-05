// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { addWorkflowDesignerStep, createWorkflowDesignerDraft, listRecoveredWorkflowDesignerDrafts, recoverWorkflowDesignerDraft, storeWorkflowDesignerDraft } from "./workflow-designer";
import { connectWorkflowComposer, duplicateWorkflowComposerStep, layoutWorkflowComposer, removeWorkflowComposerStep, workflowProposalChanges } from "./workflow-composer";
import { validateWorkflowDefinition } from "./workflow-schema";
const seed = () => createWorkflowDesignerDraft({ id: "composer", name: "Composer" });
afterEach(() => { localStorage.clear(); sessionStorage.clear(); });
describe("editable workflow composer", () => {
  it("reconnects exactly one conditional output and rejects cycles or invented targets", () => {
    const definition = addWorkflowDesignerStep(seed(), "condition");
    const next = connectWorkflowComposer(definition, "step_2", "escalate", "else");
    expect(next.steps[1]).toMatchObject({ then: "complete", else: "escalate" });
    expect(definition.steps[1]).toMatchObject({ else: "blocked" });
    expect(() => connectWorkflowComposer(next, "step_2", "step_1", "then")).toThrow("cycle");
    expect(() => connectWorkflowComposer(next, "step_2", "missing", "then")).toThrow("existing");
    expect(() => connectWorkflowComposer(next, "step_1", "complete", "then")).toThrow("matching");
    expect(validateWorkflowDefinition(next).valid).toBe(true);
  });
  it("duplicates role content while inserting into its real outgoing connection", () => {
    const definition = addWorkflowDesignerStep(seed(), "decision");
    const next = duplicateWorkflowComposerStep(definition, "step_1");
    expect(next.steps[0]).toMatchObject({ next: "step_3" });
    expect(next.steps.find((step) => step.id === "step_3")).toMatchObject({ title: `${definition.steps[0].title} copy`, next: "step_2" });
    expect(validateWorkflowDefinition(next).valid).toBe(true);
    expect(removeWorkflowComposerStep(next, "step_3")).toEqual(definition);
  });
  it("removing a shared target rewires both branches to its successor", () => {
    let definition = addWorkflowDesignerStep(addWorkflowDesignerStep(seed(), "condition"), "decision", { afterStepId: "step_2", branch: "then" });
    definition = connectWorkflowComposer(definition, "step_2", "step_3", "else");
    const next = removeWorkflowComposerStep(definition, "step_3");
    expect(next.steps[1]).toMatchObject({ then: "complete", else: "complete" });
    expect(() => removeWorkflowComposerStep(seed(), "step_1")).toThrow("last");
  });
  it("lays out imported cycles in bounded time and keeps all nodes addressable", () => {
    const definition = addWorkflowDesignerStep(seed(), "decision");
    definition.steps[1] = { ...definition.steps[1], next: "step_1" } as typeof definition.steps[number];
    const positions = layoutWorkflowComposer(definition);
    expect(positions["step:step_1"].y).toBeLessThan(positions["step:step_2"].y);
    expect(positions.trigger).toEqual({ x: 0, y: 0 });
  });
  it("lists exact role, authority, verification, input, and pointer proposal differences", () => {
    const before = seed(); const after = structuredClone(before);
    after.inputs = [{ key: "project", type: "record-ref" }];
    if (after.steps[0].kind !== "role-assign") throw new Error("fixture");
    after.steps[0].role = "chief_engineer"; after.steps[0].mediatedAuthority = "room-write"; after.steps[0].verification.required = true; after.steps[0].next = "blocked";
    expect(workflowProposalChanges(before, after).map((entry) => entry.label)).toEqual(expect.arrayContaining(["inputs", expect.stringContaining("role"), expect.stringContaining("mediatedAuthority"), expect.stringContaining("verification"), expect.stringContaining("next")]));
  });
  it("migrates old drafts and lists recoverable new drafts after session storage is cleared", () => {
    const value = { definition: seed(), baseUpdatedAt: "base", positionsVersion: 2, positions: { "step:step_1": { x: 42, y: 65 } } };
    sessionStorage.setItem("workflow-designer:old", JSON.stringify(value));
    expect(recoverWorkflowDesignerDraft("old")).toEqual(value);
    expect(sessionStorage.getItem("workflow-designer:old")).toBeNull();
    storeWorkflowDesignerDraft("workflow-new", value); sessionStorage.clear();
    expect(listRecoveredWorkflowDesignerDrafts().map((item) => item.recordId).sort()).toEqual(["old", "workflow-new"]);
    expect(recoverWorkflowDesignerDraft("workflow-new")?.positions).toEqual(value.positions);
    localStorage.setItem("workflow-designer:bad", JSON.stringify({ definition: { steps: [{}] }, baseUpdatedAt: "base" }));
    expect(recoverWorkflowDesignerDraft("bad")).toBeNull();
  });
});
