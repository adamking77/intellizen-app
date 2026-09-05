import type { WorkflowDefinitionV1 } from "./workflow-schema";

export function workflowIssueTarget(definition: WorkflowDefinitionV1, path: string) {
  const indexed = /^steps\[(\d+)\](?:\.(.*))?$/.exec(path);
  const named = definition.steps.find((step) => path === `steps.${step.id}` || path.startsWith(`steps.${step.id}.`));
  const step = indexed ? definition.steps[Number(indexed[1])] : named;
  if (step) return { stepId: step.id, field: indexed ? indexed[2] || "title" : path.slice(`steps.${step.id}.`.length) || "title", label: step.title };
  if (path.startsWith("inputs") || path.startsWith("trigger")) return { stepId: "trigger", field: path, label: "Trigger and inputs" };
  return { stepId: "", field: path, label: path === "name" ? "Workflow name" : "Workflow" };
}

type Viewport = { x: number; y: number; zoom: number };
/** Reveal only the portion that fits, keeping zoom and any already-visible card stable. */
export function revealWorkflowCard(view: Viewport, card: { x: number; y: number; width: number; height: number }, host: { width: number; height: number }, padding = 24): Viewport {
  if (host.width <= padding * 2 || host.height <= padding * 2) return view;
  const left = card.x * view.zoom + view.x, top = card.y * view.zoom + view.y;
  const width = Math.min(card.width * view.zoom, host.width - padding * 2);
  const height = Math.min(card.height * view.zoom, host.height - padding * 2);
  const dx = left < padding ? padding - left : left + width > host.width - padding ? host.width - padding - left - width : 0;
  const dy = top < padding ? padding - top : top + height > host.height - padding ? host.height - padding - top - height : 0;
  return dx || dy ? { ...view, x: view.x + dx, y: view.y + dy } : view;
}
