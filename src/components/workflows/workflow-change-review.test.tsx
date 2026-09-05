// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createWorkflowDesignerDraft } from "@/lib/workflow-designer";
import type { WorkflowDefinitionV1 } from "@/lib/workflow-schema";
import { WorkflowChangeReview, workflowReviewChanges } from "./workflow-change-review";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>; let host: HTMLDivElement;
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
function definition(): WorkflowDefinitionV1 {
  return { ...createWorkflowDesignerDraft({ id: "review", name: "Research brief" }), steps: [
    { id: "prepare", kind: "role-assign", title: "Prepare findings", role: "chief_engineer", resolution: "primary-active-occupant", instructions: "Keep source quotations intact.", execution: "ephemeral", mediatedAuthority: "draft-only", verification: { required: false }, timeoutMinutes: 10, next: "approve" },
    { id: "approve", kind: "approval", title: "Review findings", gate: "founder", payloadRef: "steps.prepare.output", next: "complete" },
  ] };
}
it("names both route destinations and preserves instruction text", () => {
  const before = definition(); const after = structuredClone(before);
  if (after.steps[0].kind !== "role-assign") throw new Error("Fixture must start with a role");
  after.steps[0].next = "blocked"; after.steps[0].instructions = "Use record_key literally.";
  const group = workflowReviewChanges(before, after).find((entry) => entry.title === "Prepare findings")!;
  expect(group.fields).toContainEqual({ label: "Next", before: "Review findings", after: "Blocked" });
  expect(group.fields).toContainEqual({ label: "Instructions", before: "Keep source quotations intact.", after: "Use record_key literally." });
});
it("summarizes a new workflow without exposing nested objects as JSON in its main review", async () => {
  await act(async () => root.render(<WorkflowChangeReview after={definition()} />));
  const source = host.querySelector("details")!;
  expect(source.open).toBe(false); expect(source.querySelector("summary")?.textContent).toBe("Source");
  expect(source.querySelector("pre")?.textContent).toContain('"schema": "intellizen.workflow/1"');
  const review = host.cloneNode(true) as HTMLElement; review.querySelector("details")!.remove();
  expect(review.textContent).toContain("Assigned roleChief Engineer");
  expect(review.textContent).toContain("TriggerStart manually");
  expect(review.textContent).toContain("Independent verification not required");
  expect(review.textContent).not.toContain('"instructions"');
});
it("keeps authority expansion and removed approval roles explicit", async () => {
  const before = definition(); const after = structuredClone(before);
  if (after.steps[0].kind !== "role-assign") throw new Error("Fixture must start with a role");
  after.steps[0].mediatedAuthority = "external-action-request"; after.steps[0].next = "complete"; after.steps.pop();
  await act(async () => root.render(<WorkflowChangeReview before={before} after={after} />));
  const authority = host.querySelector('[aria-label="Authority review"]')!;
  expect(authority.textContent).toContain("Authority expands from Draft only to Request external action.");
  expect(authority.textContent).toContain("Removed approval roles: Founder.");
  expect(host.textContent).toContain("Remove Review findings");
});
it("reports changed entry and a return to inherited role authority", () => {
  const before = definition(); const after = structuredClone(before);
  if (after.steps[0].kind !== "role-assign") throw new Error("Fixture must start with a role");
  after.steps[0].mediatedAuthority = undefined; after.steps.reverse();
  const changes = workflowReviewChanges(before, after);
  expect(changes.find((group) => group.title === "Starting step")?.fields).toEqual([{ label: "Start at", before: "Prepare findings", after: "Review findings" }]);
  expect(changes.find((group) => group.title === "Prepare findings")?.fields).toContainEqual({ label: "Authority", before: "Draft only", after: "Use role authority" });
});
it("does not invent changes when definitions match", () => {
  const before = definition(); expect(workflowReviewChanges(before, structuredClone(before))).toEqual([]);
});
