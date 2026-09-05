// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorkflowProposalPreview } from "./workflow-proposal-preview";
import { createWorkflowDesignerDraft } from "@/lib/workflow-designer";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>; let host: HTMLDivElement;
afterEach(() => { act(() => root.unmount()); host.remove(); });
it("requires a matching resolved revision and preserves manual edits when a proposal becomes stale", async () => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const definition = createWorkflowDesignerDraft({ id: "proposal", name: "Current" }); const proposal = { id: "p1", baseRevision: "base", definition: { ...definition, name: "Proposed" } }; const apply = vi.fn();
  const render = async (revision: string | null, current = definition) => act(async () => root.render(<WorkflowProposalPreview proposal={proposal} definition={current} draftRevision={revision} onApply={apply} />));
  await render(null);
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Review proposal")!.click());
  const applyButton = () => [...document.querySelectorAll("button")].find((button) => button.textContent === "Apply to draft")!;
  expect(applyButton().disabled).toBe(true);
  await render("base"); expect(applyButton().disabled).toBe(false);
  await render("base", { ...definition, name: "Manual work" }); expect(applyButton().disabled).toBe(true);
  await act(async () => applyButton().click()); expect(apply).not.toHaveBeenCalled();
});
it("reviews human changes with Source closed and applies only to the local draft", async () => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const definition = createWorkflowDesignerDraft({ id: "proposal", name: "Current" });
  const proposal = { id: "p2", baseRevision: "base", definition: { ...definition, name: "Proposed" } }; const apply = vi.fn();
  await act(async () => root.render(<WorkflowProposalPreview proposal={proposal} definition={definition} draftRevision="base" onApply={apply} />));
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Review proposal")!.click());
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.textContent).toContain("Current: Current"); expect(dialog.textContent).toContain("After: Proposed");
  expect(dialog.querySelector("details")?.open).toBe(false);
  await act(async () => [...dialog.querySelectorAll("button")].find((button) => button.textContent === "Apply to draft")!.click());
  expect(apply).toHaveBeenCalledOnce();
});
