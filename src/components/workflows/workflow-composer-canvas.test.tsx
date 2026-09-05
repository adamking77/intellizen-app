// @vitest-environment happy-dom
import { act, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { WorkflowComposerCanvas } from "./workflow-composer-canvas";
import { addWorkflowDesignerStep, createWorkflowDesignerDraft } from "@/lib/workflow-designer";
const mock = vi.hoisted(() => ({ flowProps: {} as Record<string, unknown> }));
vi.mock("@xyflow/react", async (original) => ({ applyNodeChanges: (await original<typeof import("@xyflow/react")>()).applyNodeChanges, Background: () => null, Controls: () => null, Handle: () => null, MarkerType: { ArrowClosed: "arrow" }, Position: { Top: "top", Bottom: "bottom" }, ReactFlow: (props: Record<string, unknown>) => { mock.flowProps = props; return null; } }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot>; let host: HTMLDivElement;
afterEach(() => { act(() => root.unmount()); host.remove(); });
it("projects only schema connections and offers accessible connect and edit callbacks", async () => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const definition = addWorkflowDesignerStep(createWorkflowDesignerDraft({ id: "canvas", name: "Canvas" }), "condition");
  const connect = vi.fn(), duplicate = vi.fn(), undo = vi.fn(), positions = vi.fn();
  await act(async () => root.render(<WorkflowComposerCanvas definition={definition} selectedStepId="step_2" positions={{}} roleTargets={[]} renderStep={() => null} renderTrigger={null} onSelect={() => {}} onPositions={positions} onConnect={connect} onAdd={() => {}} onDuplicate={duplicate} onRemove={() => {}} onUndo={undo} onRedo={() => {}} />));
  const edges = mock.flowProps.edges as Array<{ source: string; target: string; sourceHandle: string }>;
  expect(edges.map(({ source, target, sourceHandle }) => [source, target, sourceHandle])).toEqual([["trigger", "step:step_1", "next"], ["step:step_1", "step:step_2", "next"], ["step:step_2", "terminal:complete", "then"], ["step:step_2", "terminal:blocked", "else"]]);
  expect(mock.flowProps.edgesFocusable).toBe(false);
  (mock.flowProps.onReconnect as Function)(edges[3], { source: "step:step_2", target: "terminal:escalate", sourceHandle: "else" });
  expect(connect).toHaveBeenCalledWith("step_2", "escalate", "else");
  await act(async () => host.firstElementChild!.dispatchEvent(new KeyboardEvent("keydown", { key: "d", metaKey: true, bubbles: true })));
  expect(duplicate).toHaveBeenCalledOnce();
  await act(async () => host.firstElementChild!.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true })));
  expect(undo).toHaveBeenCalledOnce();
  await act(async () => (mock.flowProps.onNodesChange as Function)([{ id: "step:step_2", type: "position", position: { x: 1, y: 2 }, dragging: false }]));
  expect(positions).not.toHaveBeenCalled();
  await act(async () => (mock.flowProps.onNodeDragStop as Function)(null, { id: "step:step_2", position: { x: 25, y: 300 } }));
  expect(positions).toHaveBeenCalledWith({ "step:step_2": { x: 25, y: 300 } });
});

it("preserves a live drag across parent rerenders and adopts committed positions for undo", async () => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const definition = createWorkflowDesignerDraft({ id: "arrange", name: "Arrange" });
  const persist = vi.fn();
  const render = async (positions: Record<string, { x: number; y: number }> = {}) => act(async () => root.render(<WorkflowComposerCanvas definition={definition} selectedStepId="" positions={positions} roleTargets={[]} renderStep={() => null} renderTrigger={null} onSelect={() => {}} onPositions={persist} onConnect={() => {}} onAdd={() => {}} onDuplicate={() => {}} onRemove={() => {}} onUndo={() => {}} onRedo={() => {}} />));
  const node = () => (mock.flowProps.nodes as Array<{ id: string; position: { x: number; y: number } }>).find((entry) => entry.id === "step:step_1")!;
  await render(); const original = node().position;
  await act(async () => (mock.flowProps.onNodesChange as Function)([{ id: "step:step_1", type: "position", position: { x: 300, y: 220 }, dragging: true }]));
  expect(node().position).toEqual({ x: 300, y: 220 });
  await render(); // Parent polling changes callback/content identity during the gesture.
  expect(node().position).toEqual({ x: 300, y: 220 });
  await act(async () => (mock.flowProps.onNodeDragStop as Function)(null, node()));
  expect(persist).toHaveBeenLastCalledWith({ "step:step_1": { x: 300, y: 220 } });
  await render({ "step:step_1": { x: 300, y: 220 } });
  await render(); // Explicit undo removes the manual position.
  expect(node().position).toEqual(original);
});

it("reflows from actual dimensions without persisting expansion, and restores base layout on collapse", async () => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const definition = createWorkflowDesignerDraft({ id: "expand", name: "Expand" }); const persist = vi.fn();
  const base = { "step:step_1": { x: 60, y: 220 } };
  const render = async (selected: string, positions = base) => act(async () => root.render(<WorkflowComposerCanvas definition={definition} selectedStepId={selected} positions={positions} roleTargets={[]} renderStep={() => null} renderTrigger={null} onSelect={() => {}} onPositions={persist} onConnect={() => {}} onAdd={() => {}} onDuplicate={() => {}} onRemove={() => {}} onUndo={() => {}} onRedo={() => {}} />));
  const node = () => (mock.flowProps.nodes as Array<{ id: string; position: { x: number; y: number } }>).find((entry) => entry.id === "step:step_1")!;
  await render("trigger");
  await act(async () => (mock.flowProps.onNodesChange as Function)([{ id: "trigger", type: "dimensions", dimensions: { width: 380, height: 760 } }, { id: "step:step_1", type: "dimensions", dimensions: { width: 280, height: 120 } }]));
  expect(node().position).toEqual({ x: 60, y: 788 }); expect(persist).not.toHaveBeenCalled();
  await act(async () => (mock.flowProps.onNodeDragStart as Function)(null, node()));
  await act(async () => (mock.flowProps.onNodeDragStop as Function)(null, { ...node(), position: { x: 100, y: 838 } }));
  expect(persist).toHaveBeenLastCalledWith({ "step:step_1": { x: 100, y: 270 } });
  await render("trigger", { "step:step_1": { x: 100, y: 270 } });
  expect(node().position).toEqual({ x: 100, y: 838 });
  await render("", { "step:step_1": { x: 100, y: 270 } }); expect(node().position).toEqual({ x: 100, y: 270 });
  await render("trigger", { "step:step_1": { x: 100, y: 270 } }); expect(node().position).toEqual({ x: 100, y: 788 });
  expect(persist).toHaveBeenCalledTimes(1);
});


it.each(["complete", "blocked", "escalate"])("lets %s move, retain its layout through rerenders and respond to undo/redo positions", async (outcome) => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const definition = createWorkflowDesignerDraft({ id: "outcomes", name: "Outcomes" });
  const persist = vi.fn(), select = vi.fn(); const id = `terminal:${outcome}`;
  const render = async (positions: Record<string, { x: number; y: number }> = {}) => act(async () => root.render(<WorkflowComposerCanvas definition={definition} selectedStepId="" positions={positions} roleTargets={[]} renderStep={() => null} renderTrigger={null} onSelect={select} onPositions={persist} onConnect={() => {}} onAdd={() => {}} onDuplicate={() => {}} onRemove={() => {}} onUndo={() => {}} onRedo={() => {}} />));
  const node = () => (mock.flowProps.nodes as Array<{ id: string; position: { x: number; y: number }; draggable: boolean; selectable: boolean; focusable: boolean; dragHandle?: string; data: object }>).find((entry) => entry.id === id)!;
  await render(); const original = node().position; const moved = { x: original.x + 120, y: original.y + 80 };
  expect(node()).toMatchObject({ draggable: true, selectable: true, focusable: true });
  expect(node().dragHandle).toBeUndefined(); // The whole compact outcome is a drag surface.
  const cardHost = document.createElement("div"); document.body.append(cardHost); const cardRoot = createRoot(cardHost);
  try {
    const NodeCard = (mock.flowProps.nodeTypes as { card: ComponentType<{ data: object; selected: boolean }> }).card;
    await act(async () => cardRoot.render(<NodeCard data={node().data} selected />));
    expect(cardHost.querySelector(".nodrag")).toBeNull();
    expect(cardHost.querySelector(".is-terminal.is-selected")).toBeTruthy();
    expect(cardHost.textContent).not.toContain("Drag to arrange");
  } finally { await act(async () => cardRoot.unmount()); cardHost.remove(); }
  await act(async () => (mock.flowProps.onNodeClick as Function)({ target: document.createElement("div") }, node()));
  expect(select).toHaveBeenCalledWith("");
  await act(async () => (mock.flowProps.onNodeDragStart as Function)(null, node()));
  await act(async () => (mock.flowProps.onNodesChange as Function)([{ id, type: "position", position: moved, dragging: true }]));
  await render(); expect(node().position).toEqual(moved);
  await act(async () => (mock.flowProps.onNodeDragStop as Function)(null, node()));
  expect(persist).toHaveBeenLastCalledWith({ [id]: moved });
  await render({ [id]: moved });
  await render(); expect(node().position).toEqual(original);
  await render({ [id]: moved }); expect(node().position).toEqual(moved);
});

it("does not delete or duplicate the previously edited step when an outcome has keyboard focus", async () => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const definition = createWorkflowDesignerDraft({ id: "keys", name: "Keys" }); const remove = vi.fn(), duplicate = vi.fn();
  await act(async () => root.render(<WorkflowComposerCanvas definition={definition} selectedStepId="step_1" positions={{}} roleTargets={[]} renderStep={() => null} renderTrigger={null} onSelect={() => {}} onPositions={() => {}} onConnect={() => {}} onAdd={() => {}} onDuplicate={duplicate} onRemove={remove} onUndo={() => {}} onRedo={() => {}} />));
  const outcome = document.createElement("div"); outcome.className = "react-flow__node"; outcome.dataset.id = "terminal:complete"; host.firstElementChild!.append(outcome);
  await act(async () => { outcome.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true })); outcome.dispatchEvent(new KeyboardEvent("keydown", { key: "d", metaKey: true, bubbles: true })); });
  expect(remove).not.toHaveBeenCalled(); expect(duplicate).not.toHaveBeenCalled();
});

it("retains the supplied viewport and opens an optional outline that selects a named step", async () => {
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const definition = createWorkflowDesignerDraft({ id: "outline", name: "Outline" });
  const select = vi.fn(), setViewport = vi.fn(), fitView = vi.fn(), changed = vi.fn();
  const viewport = { x: 123, y: -80, zoom: 0.55 };
  await act(async () => root.render(<WorkflowComposerCanvas definition={definition} selectedStepId="" positions={{}} roleTargets={[]} renderStep={() => null} renderTrigger={null} onSelect={select} onPositions={() => {}} onConnect={() => {}} onAdd={() => {}} onDuplicate={() => {}} onRemove={() => {}} onUndo={() => {}} onRedo={() => {}} initialViewport={viewport} onViewportChange={changed} />));
  await act(async () => (mock.flowProps.onInit as Function)({ setViewport, fitView, getViewport: () => viewport, getNode: () => undefined }));
  expect(setViewport).toHaveBeenCalledWith(viewport);
  expect(fitView).not.toHaveBeenCalled();
  expect(host.querySelector("nav")).toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Workflow outline"]')!.click());
  expect(host.querySelector('input[aria-label="Find a workflow step"]')).toBeTruthy();
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("nav button")].find((button) => button.textContent?.includes("Complete assigned work"))!.click());
  expect(select).toHaveBeenCalledWith("step_1");
  expect(host.querySelector("nav")).toBeNull();
  (mock.flowProps.onMoveEnd as Function)(null, viewport);
  expect(changed).toHaveBeenCalledWith(viewport);
});
