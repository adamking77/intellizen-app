import { type Edge, MarkerType, type Node, type Viewport } from "@xyflow/react";

import type {
  CanvasBackground,
  CanvasBorder,
  CanvasColor,
  CanvasColorPreset,
  CanvasDocumentData,
  CanvasEdgeData,
  CanvasLineStyle,
  CanvasNodeData,
  CanvasNodeType,
  CanvasShape,
  CanvasSide,
  CanvasTextAlign,
} from "@/lib/types";

export const colorOptions = [
  "default",
  "rosewater",
  "flamingo",
  "mauve",
  "red",
  "maroon",
  "peach",
  "yellow",
  "green",
  "teal",
  "sky",
  "sapphire",
  "blue",
  "lavender",
  "rainbow",
] as const satisfies readonly CanvasColorPreset[];

export const shapeOptions = [
  "rect",
  "pill",
  "diamond",
  "parallelogram",
  "circle",
] as const satisfies readonly CanvasShape[];

export const borderOptions = ["none", "subtle", "strong"] as const satisfies readonly CanvasBorder[];
export const alignOptions = ["left", "center", "right"] as const satisfies readonly CanvasTextAlign[];
export const backgroundOptions = ["plain", "dots", "grid"] as const satisfies readonly CanvasBackground[];
export const canvasGridSize = 24;

const colorOptionSet = new Set<string>(colorOptions);
const shapeOptionSet = new Set<string>(shapeOptions);
const borderOptionSet = new Set<string>(borderOptions);
const alignOptionSet = new Set<string>(alignOptions);

const colorAliases: Record<string, CanvasColorPreset> = {
  "0": "default",
  "1": "red",
  "2": "peach",
  "3": "yellow",
  "4": "green",
  "5": "teal",
  "6": "lavender",
  "7": "rainbow",
  gray: "default",
  grey: "default",
  neutral: "default",
  none: "default",
  rose: "red",
  magenta: "mauve",
  amber: "peach",
  orange: "peach",
  gold: "yellow",
  lime: "green",
  cyan: "teal",
  aqua: "sky",
  purple: "mauve",
  violet: "lavender",
  pink: "red",
};

const shapeAliases: Record<string, CanvasShape> = {
  rectangle: "rect",
  square: "rect",
  box: "rect",
  rounded: "rect",
  roundedrect: "rect",
  "rounded-rect": "rect",
  "rounded_rect": "rect",
  pill: "pill",
  capsule: "pill",
  oval: "pill",
  rhombus: "diamond",
  slanted: "parallelogram",
  ellipse: "circle",
};

function normalizeToken(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isPresetColor(value: string): value is CanvasColorPreset {
  return colorOptionSet.has(value);
}

export function normalizeHexColor(value?: string): string | undefined {
  const normalized = normalizeToken(value);
  if (!normalized) {
    return undefined;
  }

  const shortHexMatch = normalized.match(/^#([0-9a-f]{3})$/i);
  if (shortHexMatch) {
    return `#${shortHexMatch[1]
      .split("")
      .map((char) => `${char}${char}`)
      .join("")}`;
  }

  const longHexMatch = normalized.match(/^#([0-9a-f]{6})$/i);
  return longHexMatch ? `#${longHexMatch[1]}` : undefined;
}

export function isCustomColor(value?: string): boolean {
  return Boolean(normalizeHexColor(value));
}

export function normalizeColor(value?: string): CanvasColor {
  const normalized = normalizeToken(value);

  if (!normalized) {
    return "default";
  }

  if (normalized in colorAliases) {
    return colorAliases[normalized];
  }

  if (isPresetColor(normalized)) {
    return normalized;
  }

  return normalizeHexColor(normalized) ?? "default";
}

export function normalizeShape(value?: string): CanvasShape {
  const normalized = normalizeToken(value);

  if (!normalized) {
    return "rect";
  }

  if (normalized in shapeAliases) {
    return shapeAliases[normalized];
  }

  return shapeOptionSet.has(normalized) ? (normalized as CanvasShape) : "rect";
}

export function normalizeBorder(value?: string): CanvasBorder {
  const normalized = normalizeToken(value);
  return borderOptionSet.has(normalized ?? "") ? (normalized as CanvasBorder) : "subtle";
}

export function normalizeTextAlign(value?: string): CanvasTextAlign {
  const normalized = normalizeToken(value);
  return alignOptionSet.has(normalized ?? "") ? (normalized as CanvasTextAlign) : "left";
}

export function normalizeLineStyle(value?: string): CanvasLineStyle {
  const normalized = normalizeToken(value);
  return normalized === "dashed" ? "dashed" : "solid";
}

export function createEmptyCanvasDocument(): CanvasDocumentData {
  return {
    nodes: [],
    edges: [],
    sogo: {
      background: "dots",
      snapToGrid: false,
    },
  };
}

export function normalizeCanvasNodeData(input: CanvasNodeData): CanvasNodeData {
  return {
    ...input,
    groupId: input.groupId?.trim() || undefined,
    color: normalizeColor(input.color),
    sogo: {
      ...input.sogo,
      shape: normalizeShape(input.sogo?.shape),
      border: normalizeBorder(input.sogo?.border),
      textAlign: normalizeTextAlign(input.sogo?.textAlign),
    },
  };
}

export function normalizeCanvasEdgeData(input: CanvasEdgeData): CanvasEdgeData {
  return {
    ...input,
    color: normalizeColor(input.color),
    lineStyle: normalizeLineStyle(input.lineStyle),
    arrow: input.arrow ?? true,
  };
}

export function parseCanvasDocument(content: unknown): CanvasDocumentData {
  if (!content) {
    return createEmptyCanvasDocument();
  }

  const parsed =
    typeof content === "string" ? (JSON.parse(content) as Partial<CanvasDocumentData>) : (content as Partial<CanvasDocumentData>);

  return {
    nodes: Array.isArray(parsed.nodes)
      ? parsed.nodes.map((node) => normalizeCanvasNodeData(node as CanvasNodeData))
      : [],
    edges: Array.isArray(parsed.edges)
      ? parsed.edges.map((edge) => normalizeCanvasEdgeData(edge as CanvasEdgeData))
      : [],
    sogo: {
      background: parsed.sogo?.background ?? "dots",
      snapToGrid: parsed.sogo?.snapToGrid ?? false,
      viewport:
        isFiniteNumber(parsed.sogo?.viewport?.x) &&
        isFiniteNumber(parsed.sogo?.viewport?.y) &&
        isFiniteNumber(parsed.sogo?.viewport?.zoom)
          ? {
              x: parsed.sogo.viewport.x,
              y: parsed.sogo.viewport.y,
              zoom: parsed.sogo.viewport.zoom,
            }
          : undefined,
    },
  };
}

export function serializeCanvasDocument(document: CanvasDocumentData): CanvasDocumentData {
  return parseCanvasDocument(document);
}

export function createCanvasNode(
  type: CanvasNodeType,
  position = { x: 160, y: 120 },
  partial?: Partial<CanvasNodeData>,
): CanvasNodeData {
  const id = crypto.randomUUID();
  const base: CanvasNodeData = {
    id,
    type,
    x: position.x,
    y: position.y,
    width: type === "group" ? 360 : type === "image" ? 240 : type === "file" ? 260 : 180,
    height: type === "group" ? 200 : type === "image" ? 200 : type === "file" ? 148 : 72,
    color: "default",
    sogo: {
      shape: "rect",
      border: "subtle",
      textAlign: "left",
    },
  };

  if (type === "text") {
    base.text = "";
  }

  if (type === "group") {
    base.label = "";
  }

  if (type === "file") {
    base.label = partial?.file ? fileBasename(partial.file) : "File reference";
    base.file = partial?.file;
  }

  if (type === "image") {
    base.label = partial?.file ? fileBasename(partial.file) : "Image reference";
    base.file = partial?.file;
    base.text = "";
  }

  return { ...base, ...partial };
}

export function persistCanvasNodeData(input: unknown): CanvasNodeData {
  const node = input as CanvasNodeData;
  return normalizeCanvasNodeData({
    id: node.id,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    groupId: node.groupId,
    text: node.text,
    label: node.label,
    color: node.color,
    file: node.file,
    url: node.url,
    sogo: {
      shape: node.sogo?.shape,
      border: node.sogo?.border,
      textAlign: node.sogo?.textAlign,
    },
  });
}

function readDimension(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

export function flowNodeToCanvasData(node: Node): CanvasNodeData {
  const base = persistCanvasNodeData(node.data);
  return normalizeCanvasNodeData({
    ...base,
    x: node.position.x,
    y: node.position.y,
    width:
      readDimension(node.measured?.width) ??
      readDimension(node.width) ??
      readDimension((node.style as { width?: unknown } | undefined)?.width) ??
      base.width,
    height:
      readDimension(node.measured?.height) ??
      readDimension(node.height) ??
      readDimension((node.style as { height?: unknown } | undefined)?.height) ??
      base.height,
  });
}

export function canvasNodeToFlowNode(node: CanvasNodeData): Node {
  return {
    id: node.id,
    type: "canvasNode",
    position: {
      x: node.x,
      y: node.y,
    },
    data: persistCanvasNodeData(node) as unknown as Record<string, unknown>,
    style: {
      width: node.width,
      height: node.height,
      zIndex: node.type === "group" ? 0 : 2,
    },
    selectable: true,
    draggable: true,
  };
}

function edgeStroke(color?: string): string {
  const normalized = normalizeColor(color);
  if (isCustomColor(normalized)) {
    return normalized;
  }

  switch (normalized) {
    case "rosewater":
      return "var(--rosewater)";
    case "flamingo":
      return "var(--flamingo)";
    case "mauve":
      return "var(--mauve)";
    case "red":
      return "var(--red)";
    case "maroon":
      return "var(--maroon)";
    case "peach":
      return "var(--peach)";
    case "yellow":
      return "var(--yellow)";
    case "green":
      return "var(--green)";
    case "teal":
      return "var(--teal)";
    case "sky":
      return "var(--sky)";
    case "sapphire":
      return "var(--sapphire)";
    case "blue":
      return "var(--blue)";
    case "lavender":
      return "var(--lavender)";
    case "rainbow":
      return "var(--mauve)";
    default:
      return "var(--canvas-edge)";
  }
}

export function edgePresentation(edge: CanvasEdgeData) {
  const normalizedEdge = normalizeCanvasEdgeData(edge);
  const stroke = edgeStroke(normalizedEdge.color);

  return {
    style: {
      stroke,
      strokeWidth: 2,
      strokeDasharray: normalizedEdge.lineStyle === "dashed" ? "7 5" : undefined,
    },
    markerEnd:
      normalizedEdge.arrow === false
        ? undefined
        : {
            type: MarkerType.ArrowClosed,
            color: stroke,
          },
  };
}

export function canvasEdgeToFlowEdge(edge: CanvasEdgeData): Edge {
  const normalizedEdge = normalizeCanvasEdgeData(edge);
  const presentation = edgePresentation(normalizedEdge);
  return {
    id: normalizedEdge.id,
    source: normalizedEdge.fromNode,
    target: normalizedEdge.toNode,
    sourceHandle: normalizedEdge.fromSide,
    targetHandle: normalizedEdge.toSide,
    data: {
      color: normalizedEdge.color,
      lineStyle: normalizedEdge.lineStyle,
      arrow: normalizedEdge.arrow,
    },
    type: "bezier",
    style: presentation.style,
    markerEnd: presentation.markerEnd,
  };
}

export function groupBounds(nodes: CanvasNodeData[]) {
  const paddingX = 28;
  const paddingY = 24;

  const left = Math.min(...nodes.map((node) => node.x)) - paddingX;
  const top = Math.min(...nodes.map((node) => node.y)) - paddingY;
  const right = Math.max(...nodes.map((node) => node.x + node.width)) + paddingX;
  const bottom = Math.max(...nodes.map((node) => node.y + node.height)) + paddingY;

  return {
    x: left,
    y: top,
    width: Math.max(220, right - left),
    height: Math.max(140, bottom - top),
  };
}

function isInsideGroup(node: CanvasNodeData, group: CanvasNodeData): boolean {
  return (
    node.x >= group.x &&
    node.y >= group.y &&
    node.x + node.width <= group.x + group.width &&
    node.y + node.height <= group.y + group.height
  );
}

export function groupContainsNode(node: CanvasNodeData, group: CanvasNodeData): boolean {
  return node.groupId === group.id || (!node.groupId && isInsideGroup(node, group));
}

export function findContainingGroup(
  node: CanvasNodeData,
  nodes: CanvasNodeData[],
  excludeGroupId?: string,
): CanvasNodeData | undefined {
  return nodes
    .filter(
      (candidate) =>
        candidate.type === "group" &&
        candidate.id !== excludeGroupId &&
        candidate.id !== node.id &&
        isInsideGroup(node, candidate),
    )
    .sort((left, right) => left.width * left.height - right.width * right.height)[0];
}

export function nextNodePositionInGroup(
  type: CanvasNodeType,
  group: CanvasNodeData,
  members: CanvasNodeData[],
): { x: number; y: number } {
  const probe = createCanvasNode(type, { x: 0, y: 0 });
  const paddingX = 28;
  const paddingTop = 56;
  const gap = 20;
  const innerWidth = Math.max(probe.width, group.width - paddingX * 2);
  const columns = Math.max(1, Math.floor((innerWidth + gap) / (probe.width + gap)));
  const slot = members.length;
  const column = slot % columns;
  const row = Math.floor(slot / columns);
  const x = group.x + paddingX + column * (probe.width + gap);
  const y = group.y + paddingTop + row * (probe.height + gap);

  return {
    x: Math.min(x, group.x + group.width - probe.width - paddingX),
    y: Math.min(y, group.y + group.height - probe.height - 24),
  };
}

export function flowToCanvasDocument(
  nodes: Node[],
  edges: Edge[],
  previous: CanvasDocumentData,
): CanvasDocumentData {
  const previousNodeMap = new Map(previous.nodes.map((node) => [node.id, node]));
  const previousEdgeMap = new Map(previous.edges.map((edge) => [edge.id, edge]));

  return {
    nodes: nodes.map((node) => {
      const nodeData = persistCanvasNodeData(node.data);
      const prev = previousNodeMap.get(node.id) ?? nodeData;
      return {
        ...prev,
        ...nodeData,
        x: node.position.x,
        y: node.position.y,
        groupId: nodeData.groupId ?? prev.groupId,
        width:
          readDimension(node.measured?.width) ??
          readDimension(node.width) ??
          readDimension((node.style as { width?: unknown } | undefined)?.width) ??
          prev.width,
        height:
          readDimension(node.measured?.height) ??
          readDimension(node.height) ??
          readDimension((node.style as { height?: unknown } | undefined)?.height) ??
          prev.height,
      };
    }),
    edges: edges.map((edge) => {
      const prev = previousEdgeMap.get(edge.id);
      return {
        id: edge.id,
        fromNode: edge.source,
        toNode: edge.target,
        fromSide:
          (typeof edge.sourceHandle === "string" ? (edge.sourceHandle as CanvasSide) : undefined) ??
          prev?.fromSide ??
          "right",
        toSide:
          (typeof edge.targetHandle === "string" ? (edge.targetHandle as CanvasSide) : undefined) ??
          prev?.toSide ??
          "left",
        color: ((edge.data as { color?: string } | undefined)?.color ?? prev?.color ?? "default") as CanvasColor,
        lineStyle:
          ((edge.data as { lineStyle?: CanvasLineStyle } | undefined)?.lineStyle ??
            prev?.lineStyle ??
            "solid") as CanvasLineStyle,
        arrow: (edge.data as { arrow?: boolean } | undefined)?.arrow ?? prev?.arrow ?? true,
      };
    }),
    sogo: previous.sogo,
  };
}

export function displayTitle(node: CanvasNodeData): string {
  if (node.type === "text") {
    return node.text ?? "Untitled";
  }
  return node.label ?? "Untitled";
}

export function displayGroupTitle(node: CanvasNodeData): string {
  const value = node.label?.trim();
  return value && value.length > 0 ? value : "Untitled group";
}

export function fileBasename(path?: string): string {
  if (!path) {
    return "file";
  }

  return path.split("/").pop() ?? path;
}

export function fileExtension(path?: string): string {
  const name = fileBasename(path);
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop() ?? "" : "";
}

function filePathHint(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }

  const name = fileBasename(path);
  return path === name ? undefined : path;
}

export function compactPathHint(path?: string, tailSegments = 2): string | undefined {
  const hint = filePathHint(path);
  if (!hint) {
    return undefined;
  }

  const segments = hint.split("/").filter(Boolean);
  if (segments.length <= tailSegments) {
    return hint;
  }

  return `.../${segments.slice(-tailSegments).join("/")}`;
}

export function truncateFilename(path?: string, maxStemLength = 24): string {
  const name = fileBasename(path);
  const extension = fileExtension(name);

  if (!extension) {
    return name.length > maxStemLength + 1 ? `${name.slice(0, maxStemLength)}...` : name;
  }

  const suffix = `.${extension}`;
  const stem = name.slice(0, -suffix.length);
  if (stem.length <= maxStemLength) {
    return name;
  }

  const head = Math.max(8, Math.ceil(maxStemLength * 0.6));
  const tail = Math.max(4, maxStemLength - head);
  return `${stem.slice(0, head)}...${stem.slice(-tail)}${suffix}`;
}

export function formatFilePreview(preview?: string, extension?: string): string | undefined {
  if (!preview) {
    return undefined;
  }

  if (extension !== "md" && extension !== "mdx") {
    return preview;
  }

  const lines = preview
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*#{1,6}\s+/, "")
        .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "")
        .replace(/^\s*[-*+]\s+/, "")
        .replace(/^\s*>\s+/, "")
        .trim(),
    )
    .filter((line) => line !== "```");

  const cleaned: string[] = [];
  for (const line of lines) {
    const previous = cleaned[cleaned.length - 1];
    if (!line) {
      if (previous) {
        cleaned.push("");
      }
      continue;
    }
    cleaned.push(line);
  }

  const result = cleaned.join("\n").trim();
  return result || preview;
}

export function displayImageTitle(node: CanvasNodeData): string {
  const title = node.label?.trim();
  if (title) {
    return title;
  }

  return fileBasename(node.file) || "Image reference";
}

export function canInlineEdit(type: CanvasNodeType): boolean {
  return type === "text" || type === "group" || type === "image";
}

export type FlowViewportApi = {
  fitView: (options?: unknown) => Promise<boolean>;
  setViewport: (viewport: Viewport, options?: unknown) => Promise<boolean> | void;
  getViewport: () => Viewport;
};
