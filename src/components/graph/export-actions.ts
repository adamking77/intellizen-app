import { homeDir, join } from "@tauri-apps/api/path";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

import { writeTextToClipboard } from "@/lib/clipboard";
import type { GraphEdgeRecord, GraphNodeRecord } from "@/lib/types";
import {
  buildGraphEmbedBlock,
  graphIdFor,
  readGraphPalette,
  serializeGraphSvg,
  type GraphExportMode,
} from "./export";

export async function exportGraphSvgFile(input: {
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
  mode: GraphExportMode;
}) {
  const filename = `graph-${new Date().toISOString().slice(0, 10)}.svg`;
  const destination = await save({
    defaultPath: await join(await homeDir(), "vault", filename),
    filters: [{ name: "SVG image", extensions: ["svg"] }],
  });
  if (!destination) return null;
  await writeTextFile(
    destination,
    serializeGraphSvg(input.nodes, input.edges, input.mode, readGraphPalette()),
  );
  return destination;
}

export function copyGraphEmbedReference(projectId: number | null, mode: GraphExportMode) {
  return writeTextToClipboard(buildGraphEmbedBlock({ id: graphIdFor(projectId), mode }));
}
