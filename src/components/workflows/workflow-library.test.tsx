// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkflowLibrary } from "./workflow-library";
import { createWorkflowDesignerDraft } from "@/lib/workflow-designer";
import type { WorkflowCatalogItem } from "@/lib/workflow-catalog";
vi.mock("@/lib/view-transitions", () => ({ runViewTransition: (_: unknown, action: () => void) => action() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>; let host: HTMLDivElement;
const open = vi.fn(); const create = vi.fn();
const items = ["Research brief", "Publish report"].map((name, i) => ({ workflow: { id: String(i), name, workflow_id: `workflow-${i}`, owner_role: "chief_engineer" }, definition: createWorkflowDesignerDraft({ id: `workflow-${i}`, name }), state: i ? "draft" : "runnable", blockers: [], runnable: !i, executable: true }) as unknown as WorkflowCatalogItem);
beforeEach(() => { host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllMocks(); });
async function render(data = items) { await act(async () => root.render(<WorkflowLibrary items={data} onOpen={open} onCreate={create} />)); }
it("opens an exact workflow from a semantic card, without rendering run history", async () => {
  await render();
  const card = host.querySelector<HTMLButtonElement>('[aria-label="Edit Publish report"]')!;
  await act(async () => card.click()); expect(open).toHaveBeenCalledWith(items[1]);
  expect(host.querySelector("table")).toBeNull(); expect(host.textContent).not.toContain("Last ran");
});
it("filters drafts without selecting or starting any workflow", async () => {
  await render();
  await act(async () => [...host.querySelectorAll("button")].find((el) => el.textContent === "Drafts")!.click());
  expect(host.querySelector('[aria-label="Edit Publish report"]')).toBeTruthy(); expect(host.querySelector('[aria-label="Edit Research brief"]')).toBeNull(); expect(open).not.toHaveBeenCalled();
});
it("provides an actionable empty library and restores filters", async () => {
  await render([]); expect(host.textContent).toContain("Build your first workflow");
  await act(async () => [...host.querySelectorAll("button")].find((el) => el.textContent === "New workflow")!.click()); expect(create).toHaveBeenCalledOnce();
  await render(); await act(async () => [...host.querySelectorAll("button")].find((el) => el.textContent === "Needs attention")!.click()); expect(host.textContent).toContain("No matching workflows");
  await act(async () => [...host.querySelectorAll("button")].find((el) => el.textContent === "Clear filters")!.click()); expect(host.querySelectorAll('[aria-label^="Edit "]')).toHaveLength(2);
});
it("shows purpose, owner, readiness and the concrete first blocker on the card", async () => {
  const blocked = { ...items[0], state: "blocked" as const, runnable: false, workflow: { ...items[0].workflow, expected_output: "A brief with attributed evidence." }, blockers: [
    { kind: "assignment" as const, stepId: "prepare", message: "Prepare findings: Chief Engineer has no active occupant." },
    { kind: "approval" as const, stepId: "approve", message: "Founder approval is unavailable." },
  ] };
  await render([blocked]);
  const card = host.querySelector('[aria-label="Edit Research brief"]')!;
  expect(card.textContent).toContain("A brief with attributed evidence."); expect(card.textContent).toContain("Chief Engineer");
  expect(card.textContent).toContain("Needs attention"); expect(card.textContent).toContain("Prepare findings: Chief Engineer has no active occupant. (1 more issue)");
  expect(card.querySelector('[aria-label="Workflow steps"]')).toBeNull(); expect(card.querySelector("svg")).toBeNull();
});
