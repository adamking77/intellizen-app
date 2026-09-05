// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowDesigner } from "./workflow-designer";
import { addWorkflowDesignerStep, createWorkflowDesignerDraft } from "@/lib/workflow-designer";
import type { WorkflowTemplateItem } from "@/lib/types";
const mocks = vi.hoisted(() => ({ save: vi.fn().mockResolvedValue({}), create: vi.fn() }));
vi.mock("@/lib/data", () => ({ saveWorkflowDefinition: mocks.save }));
vi.mock("@/lib/workflow-records", () => ({ createWorkflowDraft: mocks.create }));
vi.mock("@/lib/agent-panel-roles", () => ({ publishAgentPanelRoleMessage: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
afterEach(() => { if (root) act(() => root.unmount()); host?.remove(); sessionStorage.clear(); localStorage.clear(); vi.clearAllMocks(); });
function workflow() { const definition = createWorkflowDesignerDraft({ id: "test", name: "Test" }); return { id: "record", workflow_id: "test", name: "Test", status: "Draft", updated_at: "first", definition } as WorkflowTemplateItem; }
async function render(item: WorkflowTemplateItem) { if (!host?.isConnected) { host = document.createElement("div"); document.body.append(host); root = createRoot(host); } await act(async () => root.render(<WorkflowDesigner initialSurface="steps" workflow={item} roleTargets={[]} onSaved={() => {}} onDraftWithAgent={() => {}} />)); }
async function click(label: string) { const button = [...document.querySelectorAll("button")].find((node) => node.textContent === label || node.getAttribute("aria-label") === label); expect(button, label).toBeTruthy(); await act(async () => button!.click()); }

async function choose(label: string, value: string) {
  const select = [...host.querySelectorAll("select")].find((node) => node.getAttribute("aria-label") === label);
  expect(select, label).toBeTruthy();
  await act(async () => { select!.value = value; select!.dispatchEvent(new Event("change", { bubbles: true })); });
}

describe("WorkflowDesigner repair", () => {
  it("does not turn an unchanged recovered saved definition into local edits", async () => {
    const item = workflow();
    localStorage.setItem("workflow-designer:record", JSON.stringify({ definition: item.definition, baseUpdatedAt: item.updated_at, positions: { "step:step_1": { x: 440, y: 0 } } }));
    await render(item);
    expect(localStorage.getItem("workflow-designer:record")).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("undoes and redoes manual changes without writing a saved definition", async () => {
    await render(workflow()); await click("Add input");
    expect(host.querySelector('[aria-label="Input 1 name"]')).toBeTruthy();
    await click("Undo workflow edit");
    expect(host.querySelector('[aria-label="Input 1 name"]')).toBeNull();
    await click("Redo workflow edit");
    expect(host.querySelector('[aria-label="Input 1 name"]')).toBeTruthy();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("keeps dirty inputs across refetch and prevents an overwrite after remote change", async () => {
    const item = workflow(); await render(item);
    await click("Add input");
    expect(host.querySelector('[aria-label="Input 1 name"]')).toBeTruthy();
    await render({ ...item, definition: structuredClone(item.definition) });
    expect(host.querySelector('[aria-label="Input 1 name"]')).toBeTruthy();
    await render({ ...item, updated_at: "second" });
    expect(host.textContent).toContain("changed while you were editing");
    const save = [...host.querySelectorAll("button")].find((button) => button.textContent === "Save draft");
    expect(save?.disabled).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("opens a blank card at the first plus and turns its selected type into the first step", async () => {
    await render(workflow());
    await click("Add first workflow step");
    const blank = host.querySelector('[aria-label="New workflow step"]')!;
    expect(blank).toBeTruthy();
    expect(blank.compareDocumentPosition(host.querySelector("#workflow-step-step_1")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("New step type");
    await choose("New step type", "decision");
    const cards = [...host.querySelectorAll('[id^="workflow-step-"]')];
    expect(cards.map((card) => card.id)).toEqual(["workflow-step-step_2", "workflow-step-step_1"]);
    expect(cards[0].querySelector("input")?.value).toBe("Record decision");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Title for step 1");
  });
  it("previews a draft save without activating and surfaces failures", async () => {
    await render(workflow());
    mocks.save.mockRejectedValueOnce(new Error("Server changed"));
    await click("Save draft");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ activate: false, confirmWrite: false, expectedUpdatedAt: "first" }));
    expect(host.textContent).toContain("Server changed");
  });
  it("recovers a dirty draft after leaving the page and remounting", async () => {
    const item = workflow(); await render(item); await click("Add input");
    await act(async () => root.unmount()); host.remove();
    await render(item);
    expect(host.querySelector('[aria-label="Input 1 name"]')).toBeTruthy();
    expect(host.textContent).not.toContain("changed while you were editing");
  });
  it("edits a branch destination in its branch without duplicating it", async () => {
    const item = workflow();
    const definition = addWorkflowDesignerStep(addWorkflowDesignerStep(item.definition as ReturnType<typeof createWorkflowDesignerDraft>, "condition"), "decision", { afterStepId: "step_2", branch: "else" });
    await render({ ...item, definition });
    await click("Edit Record decision");
    const branch = host.querySelector("#workflow-step-step_3");
    expect(host.querySelectorAll("#workflow-step-step_3")).toHaveLength(1);
    expect(branch?.querySelector("input")?.value).toBe("Record decision");
    expect(branch?.parentElement?.textContent).toContain("No");
  });
  it("does not silently replace an invalid saved definition", async () => {
    const item = workflow(); await render({ ...item, definition: { ...item.definition as object, version: 0 } });
    expect(host.textContent).toContain("The original is preserved");
    expect(host.querySelector('[aria-label="Workflow name"]')).toBeNull();
    await click("Start a replacement draft");
    expect(host.querySelector('[aria-label="Workflow name"]')).toBeTruthy();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("keeps just-saved edits visible before the parent refetch arrives", async () => {
    const item = workflow(); await render(item); await click("Add input");
    mocks.save.mockImplementation(async (input) => input.confirmWrite ? { workflow: { ...item, definition: input.definition, updated_at: "saved" } } : {});
    await click("Save draft"); await click("Save");
    expect(host.querySelector('[aria-label="Input 1 name"]')).toBeTruthy();
    expect(host.textContent).toContain("editing v2");
    expect(localStorage.getItem("workflow-designer:record")).toBeNull();
  });

  it("offers scoped agent drafting for unsaved local drafts", async () => {
    await render({ ...workflow(), id: "" });
    const agent = [...host.querySelectorAll("button")].find((button) => button.textContent === "Draft with an agent");
    expect(agent?.disabled).toBe(false);
  });

  it("keeps instructions and routing visible while disclosing operational controls", async () => {
    await render(workflow());
    const instructions = host.querySelector('textarea[aria-label^="Instructions"]') as HTMLTextAreaElement;
    expect(instructions.getAttribute("rows")).toBe("2");
    expect(instructions.closest(".nodrag")).toBeTruthy();
    expect(host.querySelector('[aria-label="Role for Complete assigned work"]')?.closest(".nodrag")).toBeTruthy();
    expect(host.querySelector('[aria-label="Actions for Complete assigned work"]')?.closest(".nodrag")).toBeTruthy();
    expect(instructions.className).toContain("[field-sizing:fixed]");
    const advanced = [...host.querySelectorAll("details")].find((node) => node.querySelector("summary")?.textContent?.startsWith("Controls"));
    expect(advanced?.open).toBe(false);
    expect(advanced?.textContent).toContain("Execution");
    expect(advanced?.textContent).toContain("Timeout");
    expect(host.querySelector('[aria-label="Next step after Complete assigned work"]')?.closest("details")).toBeNull();
  });

  it("saves an Active SOP without a definition as a draft unless activation is explicit", async () => {
    await render({ ...workflow(), status: "Active", definition: null });
    expect([...host.querySelectorAll("button")].some((button) => button.textContent === "Save version")).toBe(false);
    await click("Workflow actions");
    expect([...document.querySelectorAll("button")].some((button) => button.textContent === "Activate…")).toBe(true);
    await click("Workflow actions");
    await click("Save draft");
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ activate: false, confirmWrite: false }));
    expect(document.body.textContent).toContain("It will not run until you activate it.");
  });

  it("cancels an inline placeholder with Escape without changing the draft", async () => {
    await render(workflow());
    await click("Insert after Complete assigned work");
    expect(host.querySelector('[aria-label="New workflow step"]')).toBeTruthy();
    expect(host.querySelectorAll('[id^="workflow-step-"]')).toHaveLength(1);
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(host.querySelector('[aria-label="New workflow step"]')).toBeNull();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Insert after Complete assigned work");
    expect(localStorage.getItem("workflow-designer:record")).toBeNull();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("inserts a chosen type between existing steps and supports Undo", async () => {
    const item = workflow();
    item.definition = addWorkflowDesignerStep(item.definition as ReturnType<typeof createWorkflowDesignerDraft>, "decision");
    await render(item);
    await click("Insert after Complete assigned work");
    const first = host.querySelector("#workflow-step-step_1")!;
    const blank = first.querySelector('[aria-label="New workflow step"]')!;
    expect(blank.compareDocumentPosition(host.querySelector("#workflow-step-step_2")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await choose("New step type", "approval");
    expect([...host.querySelectorAll('[id^="workflow-step-"]')].map((node) => node.id)).toEqual(["workflow-step-step_1", "workflow-step-step_3", "workflow-step-step_2"]);
    expect(host.querySelector('[aria-label="Step type for Founder approval"]')).toBeTruthy();
    await click("Undo workflow edit");
    expect(host.querySelector("#workflow-step-step_3")).toBeNull();
    expect(host.querySelector("#workflow-step-step_2")).toBeTruthy();
  });

  it("changes an expanded step type in place and restores its original fields with Undo", async () => {
    await render(workflow());
    await choose("Step type for Complete assigned work", "decision");
    expect(host.querySelectorAll('[id^="workflow-step-"]')).toHaveLength(1);
    expect(host.querySelector("#workflow-step-step_1")?.textContent).toContain("Rationale");
    expect(host.querySelector<HTMLInputElement>('[aria-label="Title for step 1"]')?.value).toBe("Complete assigned work");
    expect(host.querySelector('[aria-label^="Instructions"]')).toBeNull();
    await click("Undo workflow edit");
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label^="Instructions"]')?.value).toContain("Complete the bounded workflow objective");
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("inserts a blank card on the No branch and keeps both branch destinations when converting", async () => {
    const item = workflow();
    item.definition = addWorkflowDesignerStep(item.definition as ReturnType<typeof createWorkflowDesignerDraft>, "condition");
    await render(item);
    await click("Insert on No branch of Check prior step");
    const blank = host.querySelector('[aria-label="New workflow step"]')!;
    expect(blank.parentElement?.textContent).toContain("No");
    await choose("New step type", "decision");
    await click("Edit Check prior step");
    await choose("Step type for Check prior step", "artifact");
    expect(host.querySelector('[aria-label="Choose the route to keep"]')).toBeTruthy();
    expect(host.querySelector("#workflow-step-step_2")?.textContent).toContain("Expression");
    await click("No → Record decision");
    expect(host.querySelector("#workflow-step-step_2")?.textContent).toContain("Template");
    expect(host.querySelector<HTMLSelectElement>('[aria-label="Next step after Check prior step"]')?.value).toBe("step_3");
    expect(host.querySelector("#workflow-step-step_3")).toBeTruthy();
    await click("Undo workflow edit");
    expect(host.querySelector("#workflow-step-step_2")?.textContent).toContain("Expression");
  });

});

it("keeps inputs inside Trigger and supports workflow undo in Steps without taking over text undo", async () => {
  await render(workflow()); await click("Add input");
  const input = host.querySelector('[aria-label="Input 1 name"]')!;
  expect(input.closest('[data-workflow-step="trigger"]')).toBeTruthy();
  await act(async () => input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true })));
  expect(host.querySelector('[aria-label="Input 1 name"]')).toBeTruthy();
  await act(async () => host.firstElementChild!.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true })));
  expect(host.querySelector('[aria-label="Input 1 name"]')).toBeNull();
});

it("opens the affected disclosure and focuses a field from a validation issue", async () => {
  const item = workflow();
  const definition = structuredClone(item.definition) as ReturnType<typeof createWorkflowDesignerDraft>;
  const step = definition.steps[0];
  if (step.kind !== "role-assign") throw new Error("Expected role fixture");
  step.verification = { required: true, method: "" };
  localStorage.setItem("workflow-designer:record", JSON.stringify({ definition, baseUpdatedAt: item.updated_at, positions: {} }));
  await render(item);
  const issue = [...host.querySelectorAll("button")].find((node) => node.textContent?.includes("Required verification must name a method"));
  expect(issue).toBeTruthy();
  await act(async () => issue!.click());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 180)); });
  const field = host.querySelector('[data-workflow-field="verification.method"]');
  expect(document.activeElement).toBe(field);
  expect(field?.closest("details")?.open).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
});

it("reviews a first local save as version one and focuses the review heading above Source", async () => {
  await render({ ...workflow(), id: "" });
  await click("Save draft");
  const dialog = document.querySelector("dialog")!;
  expect(document.activeElement).toBe(dialog.querySelector("h2"));
  expect(dialog.textContent).toContain("New workflow");
  expect(dialog.textContent).not.toContain("Current definition");
  expect(dialog.querySelector("details")?.open).toBe(false);
  const source = JSON.parse(dialog.querySelector("pre")!.textContent!);
  expect(source.version).toBe(1);
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
  await click("Cancel");
});
