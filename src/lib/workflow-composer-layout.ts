import type { WorkflowNodePositions } from "./workflow-composer";
export type WorkflowNodeMeasurements = Record<string, { width: number; height: number }>;

/** Temporary display geometry. The expanded card stays anchored; colliding cards flow down. */
export function reflowExpandedWorkflowCards(base: WorkflowNodePositions, sizes: WorkflowNodeMeasurements, expandedId: string | null, gap = 28): WorkflowNodePositions {
  if (!expandedId || !base[expandedId] || !sizes[expandedId]) return base;
  const placed: Array<{ x: number; y: number; width: number; height: number }> = [];
  const display = { ...base };
  const ids = Object.keys(base).sort((a, b) => a === expandedId ? -1 : b === expandedId ? 1 : base[a].y - base[b].y || base[a].x - base[b].x || a.localeCompare(b));
  for (const id of ids) {
    const size = sizes[id];
    if (!size || size.width <= 0 || size.height <= 0) continue;
    const point = { ...base[id] };
    // Every collision moves strictly past an already placed rectangle. At most
    // one pass per placed card is needed, regardless of manual coordinates.
    for (let pass = 0; pass <= placed.length; pass++) {
      const collisions = placed.filter((other) => point.x < other.x + other.width + gap && point.x + size.width + gap > other.x && point.y < other.y + other.height + gap && point.y + size.height + gap > other.y);
      if (!collisions.length) break;
      point.y = Math.max(...collisions.map((other) => other.y + other.height + gap));
    }
    display[id] = point;
    placed.push({ ...point, ...size });
  }
  return display;
}

/** Reflow is presentation state; persist only the user's movement in base coordinates. */
export function workflowBasePositionAfterDrag(position: { x: number; y: number }, offset: { x: number; y: number }) {
  return { x: position.x - offset.x, y: position.y - offset.y };
}
