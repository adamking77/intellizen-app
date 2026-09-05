import { addWorkflowDesignerStep, connectWorkflowDesignerEdge } from "./workflow-designer";
import type { WorkflowDefinitionV1, WorkflowStep } from "./workflow-schema";

// A dedicated drag handle starts on press, including coalesced pointer movement.
export const WORKFLOW_COMPOSER_NODE_DRAG_THRESHOLD = 0;

export type WorkflowNodePositions = Record<string, { x: number; y: number }>;
export type WorkflowComposerSnapshot = { definition: WorkflowDefinitionV1; positions: WorkflowNodePositions };
export type WorkflowDraftProposal = { id: string; definition: WorkflowDefinitionV1; baseRevision: string; summary?: string };
const terminals = new Set(["complete", "blocked", "escalate"]);
export function workflowStepTargets(step: WorkflowStep) { return step.kind === "condition" ? [step.then, step.else] : [step.next ?? "complete"]; }

export function connectWorkflowComposer(definition: WorkflowDefinitionV1, source: string, target: string, handle: "next" | "then" | "else") {
  const step = definition.steps.find((candidate) => candidate.id === source);
  if (!step || (!terminals.has(target) && !definition.steps.some((candidate) => candidate.id === target))) throw new Error("Choose an existing step or outcome.");
  if ((step.kind === "condition") !== (handle !== "next")) throw new Error("Choose the matching output on this step.");
  const visited = new Set<string>();
  function reachesSource(id: string): boolean {
    if (id === source) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    const current = definition.steps.find((candidate) => candidate.id === id);
    return Boolean(current && workflowStepTargets(current).some(reachesSource));
  }
  if (reachesSource(target)) throw new Error("That connection would create a cycle. Choose a later step or an outcome.");
  return connectWorkflowDesignerEdge(definition, { sourceStepId: source, target, handle });
}

export function duplicateWorkflowComposerStep(definition: WorkflowDefinitionV1, id: string) {
  const original = definition.steps.find((step) => step.id === id);
  if (!original) return definition;
  const inserted = addWorkflowDesignerStep(definition, original.kind, { afterStepId: id, ...(original.kind === "condition" ? { branch: "then" as const } : {}) });
  const added = inserted.steps.find((step) => !definition.steps.some((candidate) => candidate.id === step.id))!;
  return { ...inserted, steps: inserted.steps.map((step) => step.id === added.id ? { ...structuredClone(original), id: added.id, title: `${original.title} copy` } : step) };
}

export function removeWorkflowComposerStep(definition: WorkflowDefinitionV1, id: string) {
  const removed = definition.steps.find((step) => step.id === id);
  if (!removed) return definition;
  if (definition.steps.length === 1) throw new Error("Add another step before removing the last one.");
  const successor = removed.kind === "condition" ? removed.then : removed.next;
  let steps = definition.steps.filter((step) => step.id !== id).map((step) => step.kind === "condition"
    ? { ...step, then: step.then === id ? successor ?? "complete" : step.then, else: step.else === id ? successor ?? "complete" : step.else }
    : { ...step, next: step.next === id ? successor : step.next });
  if (definition.steps[0].id === id && successor && !terminals.has(successor)) steps = [...steps.filter((step) => step.id === successor), ...steps.filter((step) => step.id !== successor)];
  return { ...definition, steps };
}

/** Bounded breadth-first layout also handles incomplete imported drafts without looping. */
export function layoutWorkflowComposer(definition: WorkflowDefinitionV1): WorkflowNodePositions {
  const levels = new Map<string, number>();
  const queue: Array<[string, number]> = definition.steps[0] ? [[definition.steps[0].id, 1]] : [];
  while (queue.length) {
    const [id, depth] = queue.shift()!;
    if (levels.has(id)) continue;
    levels.set(id, depth);
    const step = definition.steps.find((candidate) => candidate.id === id);
    if (step) for (const target of workflowStepTargets(step)) queue.push([target, depth + 1]);
  }
  let disconnected = Math.max(1, ...levels.values());
  for (const step of definition.steps) if (!levels.has(step.id)) levels.set(step.id, ++disconnected);
  const grouped = new Map<number, string[]>();
  for (const [id, depth] of levels) grouped.set(depth, [...(grouped.get(depth) ?? []), id]);
  const positions: WorkflowNodePositions = { trigger: { x: 0, y: 0 } };
  let y = 180;
  for (const [, ids] of [...grouped].sort(([a], [b]) => a - b)) {
    ids.forEach((id, i) => { positions[terminals.has(id) ? `terminal:${id}` : `step:${id}`] = { x: i * 430, y }; });
    y += 190;
  }
  const unused = [...terminals].filter((outcome) => !positions[`terminal:${outcome}`]);
  unused.forEach((outcome, index) => { positions[`terminal:${outcome}`] = { x: index * 200, y }; });
  return positions;
}

export function workflowProposalChanges(before: WorkflowDefinitionV1, after: WorkflowDefinitionV1) {
  const changes: Array<{ label: string; before: unknown; after: unknown }> = [];
  for (const key of ["schema", "id", "version", "name", "trigger", "inputs"] as const) if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes.push({ label: key, before: before[key], after: after[key] });
  const oldSteps = new Map(before.steps.map((step) => [step.id, step]));
  for (const step of after.steps) {
    const previous = oldSteps.get(step.id);
    if (!previous) { changes.push({ label: `Add ${step.title}`, before: null, after: step }); continue; }
    for (const key of new Set([...Object.keys(previous), ...Object.keys(step)])) {
      const oldValue = (previous as unknown as Record<string, unknown>)[key];
      const newValue = (step as unknown as Record<string, unknown>)[key];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) changes.push({ label: `${step.title} · ${key}`, before: oldValue, after: newValue });
    }
  }
  for (const step of before.steps) if (!after.steps.some((candidate) => candidate.id === step.id)) changes.push({ label: `Remove ${step.title}`, before: step, after: null });
  if (before.steps.map((step) => step.id).join() !== after.steps.map((step) => step.id).join()) changes.push({ label: "Step order / entry", before: before.steps.map((step) => step.id), after: after.steps.map((step) => step.id) });
  return changes;
}

/** Canvas arrangement is local presentation state, independent of published definition versions. */
export function recoverWorkflowComposerPositions(key: string): WorkflowNodePositions {
  try { const value = JSON.parse(localStorage.getItem(`workflow-layout:2:${key}`) ?? "{}"); return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, { x: number; y: number }] => { const point = entry[1] as { x?: number; y?: number } | null; return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)); })); } catch { return {}; }
}
export function storeWorkflowComposerPositions(key: string, positions: WorkflowNodePositions) {
  try { localStorage.setItem(`workflow-layout:2:${key}`, JSON.stringify(positions)); } catch { /* Draft recovery still retains positions when available. */ }
}
