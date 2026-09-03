import { Network, PanelsTopLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ProjectTabFrame } from "@/components/project/project-board";
import type { CanvasDocumentSummary, GraphNodeRecord } from "@/lib/types";

export function ProjectCanvases({ canvases }: { canvases: CanvasDocumentSummary[] }) {
  const navigate = useNavigate();
  return (
    <ProjectTabFrame>
      <div className="divide-y divide-[var(--border-subtle)] rounded-[var(--r-plane)] border border-[var(--border)]">
        {canvases.map((canvas) => (
          <button
            key={canvas.id}
            type="button"
            onClick={() => navigate(`/canvas?canvas=${canvas.id}`)}
            className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-wash)]"
          >
            <PanelsTopLeft className="h-3.5 w-3.5 text-[var(--overlay-1)]" />
            <span className="min-w-0 flex-1 truncate font-ui text-[var(--t-ui)] font-medium text-[var(--text)] group-hover:text-[var(--accent)]">{canvas.name}</span>
            <span className="text-meta">Open canvas</span>
          </button>
        ))}
      </div>
    </ProjectTabFrame>
  );
}

export function ProjectGraph({ projectId, nodes }: { projectId: number; nodes: GraphNodeRecord[] }) {
  const navigate = useNavigate();
  const byType = Object.entries(nodes.reduce<Record<string, number>>((counts, node) => {
    counts[node.entity_type] = (counts[node.entity_type] ?? 0) + 1;
    return counts;
  }, {}));
  return (
    <ProjectTabFrame>
      <button
        type="button"
        onClick={() => navigate(`/graph?project=${projectId}`)}
        className="flex w-full items-center gap-4 rounded-[var(--r-plane)] border border-[var(--border)] bg-[var(--surface-wash)] p-5 text-left transition-colors hover:border-[var(--border-strong)]"
      >
        <Network className="h-5 w-5 shrink-0 text-[var(--accent)]" />
        <span className="min-w-0 flex-1">
          <span className="block font-ui text-[var(--t-ui)] font-semibold text-[var(--text)]">Relationship graph</span>
          <span className="mt-1 block font-ui text-[var(--t-section)] text-[var(--subtext-0)]">{nodes.length} linked entities</span>
        </span>
        <span className="flex flex-wrap justify-end gap-1.5">
          {byType.map(([type, count]) => <span key={type} className="rounded-[var(--r-pill)] border border-[var(--border)] px-2 py-1 text-meta">{type} {count}</span>)}
        </span>
      </button>
    </ProjectTabFrame>
  );
}
