import type React from "react";

export type Point = { x: number; y: number };
export type ViewportState = { x: number; y: number; scale: number };
export type NodeAnchorSide = "top" | "right" | "bottom" | "left";

export const NODE_WIDTH = 188;
export const NODE_HEIGHT = 92;
export const NODE_ANCHOR_SIDES: NodeAnchorSide[] = ["top", "right", "bottom", "left"];
export const WORLD_WIDTH = 6000;
export const WORLD_HEIGHT = 4000;
export const WORLD_MARGIN = 32;
export const VIEWPORT_HEIGHT = 780;
export const DEFAULT_VIEW: ViewportState = { x: -2800, y: -1850, scale: 1 };

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function truncateLabel(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export function canonicalEdgePair(sourceNodeId: string, targetNodeId: string) {
  return [sourceNodeId, targetNodeId].sort().join("::");
}

export function clientToWorldPoint(
  viewportElement: HTMLDivElement,
  clientX: number,
  clientY: number,
  viewport: ViewportState,
): Point {
  const rect = viewportElement.getBoundingClientRect();
  return {
    x: (clientX - rect.left - viewport.x) / viewport.scale,
    y: (clientY - rect.top - viewport.y) / viewport.scale,
  };
}

export function clampNodePosition(point: Point): Point {
  return {
    x: clamp(point.x - NODE_WIDTH / 2, WORLD_MARGIN, WORLD_WIDTH - NODE_WIDTH - WORLD_MARGIN),
    y: clamp(point.y - NODE_HEIGHT / 2, WORLD_MARGIN, WORLD_HEIGHT - NODE_HEIGHT - WORLD_MARGIN),
  };
}

export function buildEdgePath(source: Point, target: Point) {
  const deltaX = Math.abs(target.x - source.x);
  const deltaY = Math.abs(target.y - source.y);
  const controlOffset = Math.max(42, Math.max(deltaX, deltaY) / 2);

  if (deltaX >= deltaY) {
    return [
      `M ${source.x} ${source.y}`,
      `C ${source.x + controlOffset} ${source.y},`,
      `${target.x - controlOffset} ${target.y},`,
      `${target.x} ${target.y}`,
    ].join(" ");
  }

  return [
    `M ${source.x} ${source.y}`,
    `C ${source.x} ${source.y + controlOffset},`,
    `${target.x} ${target.y - controlOffset},`,
    `${target.x} ${target.y}`,
  ].join(" ");
}

export function buildEdgePreviewPath(source: Point | undefined, pointer: Point) {
  if (!source) return "";
  const target = {
    x: clamp(pointer.x, 0, WORLD_WIDTH),
    y: clamp(pointer.y, 0, WORLD_HEIGHT),
  };
  return buildEdgePath(source, target);
}

export function getEdgeLabelPosition(source: Point, target: Point): Point {
  return {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2 - 18,
  };
}

export function getAutoAnchorSides(
  source: { centerX: number; centerY: number },
  target: { centerX: number; centerY: number },
) {
  const dx = target.centerX - source.centerX;
  const dy = target.centerY - source.centerY;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceSide: "right" as NodeAnchorSide, targetSide: "left" as NodeAnchorSide }
      : { sourceSide: "left" as NodeAnchorSide, targetSide: "right" as NodeAnchorSide };
  }

  return dy >= 0
    ? { sourceSide: "bottom" as NodeAnchorSide, targetSide: "top" as NodeAnchorSide }
    : { sourceSide: "top" as NodeAnchorSide, targetSide: "bottom" as NodeAnchorSide };
}

export function getNodeAnchorPoint(
  node:
    | { position: Point; centerX: number; centerY: number }
    | undefined,
  side: NodeAnchorSide | undefined,
): Point | undefined {
  if (!node || !side) return undefined;

  switch (side) {
    case "top":
      return { x: node.centerX, y: node.position.y };
    case "right":
      return { x: node.position.x + NODE_WIDTH, y: node.centerY };
    case "bottom":
      return { x: node.centerX, y: node.position.y + NODE_HEIGHT };
    case "left":
      return { x: node.position.x, y: node.centerY };
    default:
      return { x: node.centerX, y: node.centerY };
  }
}

export function getClosestAnchorSide(
  node:
    | { position: Point; centerX: number; centerY: number }
    | undefined,
  point: Point,
): NodeAnchorSide {
  if (!node) return "right";

  let bestSide: NodeAnchorSide = "right";
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const side of NODE_ANCHOR_SIDES) {
    const anchor = getNodeAnchorPoint(node, side);
    if (!anchor) continue;
    const dx = anchor.x - point.x;
    const dy = anchor.y - point.y;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared < bestDistance) {
      bestDistance = distanceSquared;
      bestSide = side;
    }
  }
  return bestSide;
}

export function getNodeConnectorHandleStyle(side: NodeAnchorSide): React.CSSProperties {
  switch (side) {
    case "top":
      return { left: "50%", top: 0, transform: "translate(-50%, -50%)" };
    case "right":
      return { right: 0, top: "50%", transform: "translate(50%, -50%)" };
    case "bottom":
      return { left: "50%", bottom: 0, transform: "translate(-50%, 50%)" };
    case "left":
      return { left: 0, top: "50%", transform: "translate(-50%, -50%)" };
    default:
      return { right: 0, top: "50%", transform: "translate(50%, -50%)" };
  }
}

export function findNodeAtWorldPoint<T extends { node_id: string; position: Point }>(
  nodes: T[],
  point: Point,
): T | undefined {
  return nodes.find(
    (node) =>
      point.x >= node.position.x &&
      point.x <= node.position.x + NODE_WIDTH &&
      point.y >= node.position.y &&
      point.y <= node.position.y + NODE_HEIGHT,
  );
}

export function buildMinimapViewportRect(
  viewport: ViewportState,
  viewportElement: HTMLDivElement | null,
) {
  const viewportWidth = viewportElement?.clientWidth ?? WORLD_WIDTH;
  const viewportHeight = viewportElement?.clientHeight ?? VIEWPORT_HEIGHT;

  const visibleWorldWidth = viewportWidth / viewport.scale;
  const visibleWorldHeight = viewportHeight / viewport.scale;
  const visibleWorldX = -viewport.x / viewport.scale;
  const visibleWorldY = -viewport.y / viewport.scale;

  const left = clamp((visibleWorldX / WORLD_WIDTH) * 100, 0, 100);
  const top = clamp((visibleWorldY / WORLD_HEIGHT) * 100, 0, 100);
  const width = clamp((visibleWorldWidth / WORLD_WIDTH) * 100, 4, 100);
  const height = clamp((visibleWorldHeight / WORLD_HEIGHT) * 100, 4, 100);

  return {
    left: `${left}%`,
    top: `${top}%`,
    width: `${width}%`,
    height: `${height}%`,
  };
}

export function getNextNodePosition(index: number): Point {
  const columns = 5;
  const colW = 240;
  const rowH = 156;
  const startX = WORLD_WIDTH / 2 - (columns * colW) / 2;
  const startY = WORLD_HEIGHT / 2 - 200;
  const x = startX + (index % columns) * colW;
  const y = startY + Math.floor(index / columns) * rowH;

  return {
    x: clamp(x, WORLD_MARGIN, WORLD_WIDTH - NODE_WIDTH - WORLD_MARGIN),
    y: clamp(y, WORLD_MARGIN, WORLD_HEIGHT - NODE_HEIGHT - WORLD_MARGIN),
  };
}

export function computeFitViewToNodes(
  nodes: Array<{ position: Point }>,
  viewportElement: HTMLDivElement | null,
): ViewportState {
  if (!viewportElement || nodes.length === 0) {
    return DEFAULT_VIEW;
  }

  const minX = Math.min(...nodes.map((node) => node.position.x));
  const maxX = Math.max(...nodes.map((node) => node.position.x + NODE_WIDTH));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxY = Math.max(...nodes.map((node) => node.position.y + NODE_HEIGHT));

  const padding = 100;
  const contentWidth = maxX - minX + padding * 2;
  const contentHeight = maxY - minY + padding * 2;

  const scale = clamp(
    Math.min(
      viewportElement.clientWidth / contentWidth,
      viewportElement.clientHeight / contentHeight,
    ),
    0.25,
    1.4,
  );

  return {
    scale,
    x: (viewportElement.clientWidth - contentWidth * scale) / 2 - (minX - padding) * scale,
    y: (viewportElement.clientHeight - contentHeight * scale) / 2 - (minY - padding) * scale,
  };
}

export function findNodeLabel(
  nodes: Array<{ node_id: string; label: string }>,
  nodeId: string,
) {
  return nodes.find((node) => node.node_id === nodeId)?.label ?? nodeId;
}
