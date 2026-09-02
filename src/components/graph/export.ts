import { buildEdgePath, NODE_HEIGHT, NODE_WIDTH } from "@/lib/graph-geometry";
import type { GraphEdgeRecord, GraphEntityType, GraphNodeRecord } from "@/lib/types";

export type GraphExportMode = "insight" | "construct";
export interface GraphEmbedSpec { id: string; mode: GraphExportMode }

export function graphIdFor(projectId: number | null) {
  return projectId === null ? "standalone" : String(projectId);
}

export function parseGraphId(id: string): number | null | undefined {
  if (id === "standalone") return null;
  const value = Number(id);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export function buildGraphEmbedBlock(spec: GraphEmbedSpec) {
  return `\`\`\`graph ${JSON.stringify(spec)}\n\`\`\``;
}

export function parseGraphEmbedBlocks(markdown: string): GraphEmbedSpec[] {
  const found: GraphEmbedSpec[] = [];
  for (const line of markdown.split("\n")) {
    const match = /^\s*```\s*graph\s+(\{.*\})\s*$/.exec(line);
    if (!match) continue;
    try {
      const value = JSON.parse(match[1]) as Partial<GraphEmbedSpec>;
      if (typeof value.id !== "string" || parseGraphId(value.id) === undefined) continue;
      found.push({ id: value.id, mode: value.mode === "construct" ? "construct" : "insight" });
    } catch {
      // A malformed block remains ordinary document text.
    }
  }
  return found;
}

export interface GraphSvgPalette {
  background: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
  entity: Record<GraphEntityType, string>;
}

export const TOKEN_GRAPH_PALETTE: GraphSvgPalette = {
  background: "var(--crust)",
  surface: "var(--base)",
  text: "var(--text)",
  muted: "var(--overlay-1)",
  line: "var(--overlay-0)",
  entity: {
    person: "var(--entity-person)",
    organisation: "var(--entity-org)",
    location: "var(--entity-location)",
    event: "var(--entity-event)",
  },
};

export function readGraphPalette(): GraphSvgPalette {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    background: token("--crust", "#11111b"),
    surface: token("--base", "#1e1e2e"),
    text: token("--text", "#cdd6f4"),
    muted: token("--overlay-1", "#7f849c"),
    line: token("--overlay-0", "#6c7086"),
    entity: {
      person: token("--entity-person", "#94e2d5"),
      organisation: token("--entity-org", "#89dceb"),
      location: token("--entity-location", "#fab387"),
      event: token("--entity-event", "#f38ba8"),
    },
  };
}

interface ExportNode extends GraphNodeRecord { exportX: number; exportY: number; radius: number }

function layout(nodes: GraphNodeRecord[], edges: GraphEdgeRecord[], mode: GraphExportMode): ExportNode[] {
  if (mode === "construct") {
    return nodes.map((node) => ({
      ...node,
      exportX: node.position_x + NODE_WIDTH / 2,
      exportY: node.position_y + NODE_HEIGHT / 2,
      radius: 0,
    }));
  }
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source_node_id, (degree.get(edge.source_node_id) ?? 0) + 1);
    degree.set(edge.target_node_id, (degree.get(edge.target_node_id) ?? 0) + 1);
  }
  const ring = Math.max(80, nodes.length * 16);
  return nodes.map((node, index) => {
    const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      exportX: Math.cos(angle) * ring,
      exportY: Math.sin(angle) * ring,
      radius: 8 + Math.min(16, (degree.get(node.node_id) ?? 0) * 3),
    };
  });
}

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const rounded = (value: number) => Math.round(value * 10) / 10;

export function serializeGraphSvg(
  nodes: GraphNodeRecord[],
  edges: GraphEdgeRecord[],
  mode: GraphExportMode,
  palette: GraphSvgPalette,
) {
  const placed = layout(nodes, edges, mode);
  const byId = new Map(placed.map((node) => [node.node_id, node]));
  const halfWidth = mode === "construct" ? NODE_WIDTH / 2 : 36;
  const halfHeight = mode === "construct" ? NODE_HEIGHT / 2 : 36;
  const minX = Math.min(0, ...placed.map((node) => node.exportX - halfWidth)) - 48;
  const minY = Math.min(0, ...placed.map((node) => node.exportY - halfHeight)) - 48;
  const maxX = Math.max(240, ...placed.map((node) => node.exportX + halfWidth)) + 48;
  const maxY = Math.max(160, ...placed.map((node) => node.exportY + halfHeight)) + 48;
  const width = rounded(maxX - minX);
  const height = rounded(maxY - minY);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${rounded(minX)} ${rounded(minY)} ${width} ${height}" role="img" aria-label="Relationship graph">`,
    `<rect x="${rounded(minX)}" y="${rounded(minY)}" width="${width}" height="${height}" fill="${escapeXml(palette.background)}"/>`,
  ];
  for (const edge of edges) {
    const source = byId.get(edge.source_node_id);
    const target = byId.get(edge.target_node_id);
    if (!source || !target) continue;
    const path = mode === "construct"
      ? buildEdgePath({ x: source.exportX, y: source.exportY }, { x: target.exportX, y: target.exportY })
      : `M ${rounded(source.exportX)} ${rounded(source.exportY)} L ${rounded(target.exportX)} ${rounded(target.exportY)}`;
    parts.push(`<path d="${path}" fill="none" stroke="${escapeXml(palette.line)}" stroke-width="1.2" opacity="0.7"/>`);
    if (edge.label) {
      parts.push(`<text x="${rounded((source.exportX + target.exportX) / 2)}" y="${rounded((source.exportY + target.exportY) / 2 - 5)}" text-anchor="middle" font-family="system-ui" font-size="10" fill="${escapeXml(palette.muted)}">${escapeXml(edge.label)}</text>`);
    }
  }
  for (const node of placed) {
    const color = palette.entity[node.entity_type];
    if (mode === "construct") {
      const x = rounded(node.exportX - NODE_WIDTH / 2);
      const y = rounded(node.exportY - NODE_HEIGHT / 2);
      parts.push(`<rect x="${x}" y="${y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="8" fill="${escapeXml(palette.surface)}" stroke="${escapeXml(color)}"/>`);
      parts.push(`<text x="${x + 14}" y="${y + 31}" font-family="system-ui" font-size="10" font-weight="600" fill="${escapeXml(color)}">${escapeXml(node.entity_type.toUpperCase())}</text>`);
      parts.push(`<text x="${x + 14}" y="${y + 57}" font-family="system-ui" font-size="13" fill="${escapeXml(palette.text)}">${escapeXml(node.label.slice(0, 24))}</text>`);
    } else {
      parts.push(`<circle cx="${rounded(node.exportX)}" cy="${rounded(node.exportY)}" r="${node.radius}" fill="${escapeXml(color)}"/>`);
      parts.push(`<text x="${rounded(node.exportX)}" y="${rounded(node.exportY + node.radius + 15)}" text-anchor="middle" font-family="system-ui" font-size="11" fill="${escapeXml(palette.muted)}">${escapeXml(node.label)}</text>`);
    }
  }
  parts.push("</svg>");
  return parts.join("\n");
}
