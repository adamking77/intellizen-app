// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorkflowStepCard } from "./workflow-step-card";
import { WorkflowStepTypePicker } from "./workflow-step-type";
import { addWorkflowDesignerStep, createWorkflowDesignerDraft } from "@/lib/workflow-designer";
import type { AgentPanelRoleTarget } from "@/lib/agent-panel-roles";
import type { WorkflowStep } from "@/lib/workflow-schema";
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>, host: HTMLDivElement;
afterEach(() => { act(() => root.unmount()); host.remove(); });
const definition = addWorkflowDesignerStep(createWorkflowDesignerDraft({ id: "cards", name: "Cards" }), "decision");
async function render(step: WorkflowStep, selected = true, roleTargets: AgentPanelRoleTarget[] = []) {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const change = vi.fn(), ask = vi.fn(), select = vi.fn();
  await act(async () => root.render(<WorkflowStepCard step={step} index={0} definition={{ ...definition, steps: [step, definition.steps[1]] }} selected={selected} roleTargets={roleTargets} onSelect={select} onChange={change} onAskRole={ask} typeEditor={selected ? <WorkflowStepTypePicker step={step} definition={definition} onChange={() => {}} /> : undefined} />));
  return { change, ask, select };
}
function field<T extends HTMLElement = HTMLElement>(name: string) { return host.querySelector<T>(`[data-workflow-field="${name}"]`)!; }
async function changeSelect(name: string, value: string) { await act(async () => { const node = field<HTMLSelectElement>(name); node.value = value; node.dispatchEvent(new Event("change", { bubbles: true })); }); }
it("leads collapsed cards with the task title, then type and owner/result without editing", async () => {
  const step = definition.steps[0]; const { change, select } = await render(step, false);
  const button = host.querySelector("button")!;
  expect(host.firstElementChild?.classList.contains("nodrag")).toBe(false);
  expect(button.closest(".nodrag")).toBeNull();
  expect(button.firstElementChild?.textContent).toBe(step.title);
  expect(button.children[1].textContent).toContain("Role assignment");
  expect(host.textContent).toContain("Step result");
  expect(host.querySelector("input,textarea,select")).toBeNull();
  await act(async () => button.click()); expect(select).toHaveBeenCalledWith(step.id); expect(change).not.toHaveBeenCalled();
});
it("keeps the task and Next visible while disclosing inputs, output and authority controls without changing data", async () => {
  const original = definition.steps[0]; if (original.kind !== "role-assign") throw Error("Expected role");
  const step = { ...original, mediatedAuthority: "draft-only" as const, verification: { required: true, method: "review" } };
  const { change, ask } = await render(step);
  expect(host.firstElementChild?.getAttribute("data-workflow-step")).toBe(step.id);
  expect(field("title").compareDocumentPosition(field("kind")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(host.firstElementChild?.classList.contains("nodrag")).toBe(false);
  expect(field("title").closest(".nodrag.nopan")).toBeTruthy();
  expect(field("instructions").closest(".nodrag.nopan")).toBeTruthy();
  expect(field("kind").closest(".nodrag.nopan")).toBeTruthy();
  for (const name of ["title", "role", "instructions", "next"]) expect(field(name).closest("details")).toBeNull();
  const controls = field("mediatedAuthority").closest("details")!;
  expect(controls.open).toBe(false);
  expect(controls.querySelector("summary")?.textContent).toContain("Draft only · Independent verification: review");
  for (const name of ["verification.required", "verification.method", "execution", "timeoutMinutes"]) expect(field(name).closest("details")).toBe(controls);
  expect(field("contextRefs").closest("details")?.open).toBe(false);
  await act(async () => controls.querySelector("summary")!.click());
  expect(change).not.toHaveBeenCalled();
  await act(async () => [...host.querySelectorAll("button")].find((node) => node.textContent === "Ask role")!.click());
  expect(ask).toHaveBeenCalledWith(step.role);
  await changeSelect("mediatedAuthority", "read-only");
  expect(change).toHaveBeenLastCalledWith({ ...step, mediatedAuthority: "read-only" });
});
it("offers one readable Complete route for null and explicit terminal successors", async () => {
  const step = { ...definition.steps[0], next: "complete" }; if (step.kind === "condition") throw Error("Expected next");
  const { change } = await render(step);
  const next = field<HTMLSelectElement>("next");
  expect(next.value).toBe("complete");
  expect([...next.options].filter((option) => option.textContent === "Complete")).toHaveLength(1);
  expect([...next.options].map((option) => option.textContent)).toContain(definition.steps[1].title);
  await changeSelect("next", "blocked"); expect(change).toHaveBeenLastCalledWith({ ...step, next: "blocked" });
  await changeSelect("next", "complete"); expect(change).toHaveBeenLastCalledWith({ ...step, next: null });
});
it("exposes condition branches as core controls with readable destination names and stable IDs", async () => {
  const step: WorkflowStep = { id: "route", title: "Check result", kind: "condition", expr: "steps.step_1.state == 'complete'", then: "step_2", else: "escalate" };
  const { change } = await render(step);
  for (const name of ["expr", "then", "else"]) expect(field(name).closest("details")).toBeNull();
  expect(field<HTMLSelectElement>("then").selectedOptions[0].textContent).toBe(definition.steps[1].title);
  expect(field<HTMLSelectElement>("else").selectedOptions[0].textContent).toBe("Escalate");
  await changeSelect("then", "blocked"); expect(change).toHaveBeenLastCalledWith({ ...step, then: "blocked" });
});
it.each(["approval", "artifact", "decision"] as const)("provides validation targets and preserves the core %s fields", async (kind) => {
  const draft = addWorkflowDesignerStep(definition, kind); const step = draft.steps.at(-1)!;
  await render(step);
  const core = kind === "approval" ? "gate" : kind === "artifact" ? "action" : "rationale";
  expect(field(core).closest("details")).toBeNull();
  expect(field("next").closest("details")).toBeNull();
  if (kind !== "decision") expect(field("payloadRef").closest("details")?.querySelector("summary")?.textContent).toContain("Inputs");
  if (kind === "artifact") expect(field("template").closest("details")?.querySelector("summary")?.textContent).toContain("Output");
});

it("removes an optional artifact payload when cleared without changing its other fields", async () => {
  const step: WorkflowStep = { id: "artifact", kind: "artifact", title: "Create report", action: "create-doc", template: "report", payloadRef: "steps.step_1.result", next: "blocked" };
  const { change } = await render(step);
  await act(async () => {
    const input = field<HTMLInputElement>("payloadRef");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const { payloadRef: _payloadRef, ...rest } = step;
  expect(change).toHaveBeenLastCalledWith(rest);
});

it("retains a new context-reference line while typing rather than deleting the delimiter", async () => {
  const step = definition.steps[0]; if (step.kind !== "role-assign") throw Error("Expected role");
  const { change } = await render(step);
  await act(async () => {
    const input = field<HTMLTextAreaElement>("contextRefs");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "steps.step_2.result\n");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(change).toHaveBeenLastCalledWith({ ...step, contextRefs: ["steps.step_2.result", ""] });
});

it("flags a known unavailable binding on the collapsed card", async () => {
  const step = definition.steps[0]; if (step.kind !== "role-assign") throw Error("Expected role");
  await render(step, false, [{ roleKey: step.role, roleName: "Reviewer", state: "unavailable", agentName: null } as AgentPanelRoleTarget]);
  expect(host.textContent).toContain("Reviewer · unavailable · Step result");
});
