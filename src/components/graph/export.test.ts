import { describe, expect, it } from "vitest";

import type { GraphEdgeRecord, GraphNodeRecord } from "@/lib/types";
import {
  buildGraphDocumentBody,
  buildGraphDocumentSection,
  buildGraphEmbedBlock,
  buildGraphSnapshotImageBlock,
  decodePngDataUrl,
  documentHasGraphEmbed,
  graphSnapshotPaths,
  parseGraphEmbedBlocks,
  serializeGraphSvg,
  TOKEN_GRAPH_PALETTE,
} from "./export";

const nodes: GraphNodeRecord[] = [
  { id: 1, project_id: 7, node_id: "adam", label: "Adam <Founder>", entity_type: "person", position_x: 40, position_y: 60, created_at: "", updated_at: "" },
  { id: 2, project_id: 7, node_id: "genzen", label: "GenZen", entity_type: "organisation", position_x: 320, position_y: 180, created_at: "", updated_at: "" },
];
const edges: GraphEdgeRecord[] = [
  { id: 1, project_id: 7, edge_id: "owns", source_node_id: "adam", target_node_id: "genzen", label: "founded", created_at: "", updated_at: "" },
];

describe("graph export contract", () => {
  it("round-trips valid document embed blocks and ignores malformed references", () => {
    const block = buildGraphEmbedBlock({ id: "7", mode: "construct" });
    expect(block).toBe('```graph {"id":"7","mode":"construct"}\n```');
    expect(parseGraphEmbedBlocks(`${block}\n\`\`\`graph {bad}\n\`\`\``)).toEqual([
      { id: "7", mode: "construct" },
    ]);
  });

  it("reads the fenced-code form preserved by the document editor", () => {
    expect(parseGraphEmbedBlocks('```graph\n{"id":"7","mode":"insight"}\n```')).toEqual([
      { id: "7", mode: "insight" },
    ]);
  });

  it("builds a linked snapshot document and detects the same embed on retry", () => {
    const spec = { id: "42", mode: "insight" } as const;
    const markdown = buildGraphDocumentBody("Relationship map", spec);
    expect(markdown).toContain("# Relationship map");
    expect(documentHasGraphEmbed(markdown, spec)).toBe(true);
    expect(documentHasGraphEmbed(markdown, { ...spec, mode: "construct" })).toBe(false);
  });

  it("stores a PNG beside the portable document and embeds it as ordinary markdown", () => {
    const paths = graphSnapshotPaths("documents/relationship-map.md", { id: "42", mode: "insight" }, new Date("2026-09-04T12:34:56.000Z"));
    expect(paths).toEqual({
      vaultPath: "documents/assets/graph-42-insight-20260904T123456000Z.png",
      markdownPath: "assets/graph-42-insight-20260904T123456000Z.png",
    });
    expect(buildGraphSnapshotImageBlock(paths.markdownPath)).toBe("![Graph snapshot](assets/graph-42-insight-20260904T123456000Z.png)");
    expect([...decodePngDataUrl("data:image/png;base64,AQID")]).toEqual([1, 2, 3]);
    const section = buildGraphDocumentSection("Existing notes", { id: "42", mode: "insight" }, paths.markdownPath);
    expect(section).toContain("![Graph snapshot]");
    expect(section).toContain('```graph {"id":"42","mode":"insight"}');
    expect(buildGraphDocumentSection(section, { id: "42", mode: "insight" }, "assets/new.png")).toBe("![Graph snapshot](assets/new.png)");
  });

  it("serializes a safe, self-contained construct SVG", () => {
    const svg = serializeGraphSvg(nodes, edges, "construct", TOKEN_GRAPH_PALETTE);
    expect(svg).toContain('aria-label="Relationship graph"');
    expect(svg).toContain("Adam &lt;Founder&gt;");
    expect(svg).toContain("GenZen");
    expect(svg).toContain("<path");
    expect(svg).not.toContain("Adam <Founder>");
  });

  it("renders the same records as an insight snapshot", () => {
    const svg = serializeGraphSvg(nodes, edges, "insight", TOKEN_GRAPH_PALETTE);
    expect(svg).toContain("<circle");
    expect(svg).toContain("founded");
  });
});
