import { Network, PanelsTopLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ProjectTabFrame } from "@/components/project/project-board";
import { Card } from "@/components/ui/card";
import { Control } from "@/components/ui/control";
import { Pill } from "@/components/ui/status-pill";
import type { CanvasDocumentSummary, GraphNodeRecord } from "@/lib/types";

export function ProjectCanvases({ canvases }: { canvases: CanvasDocumentSummary[] }) {
  const navigate = useNavigate();
  return (
    <ProjectTabFrame>
      <div className="grid gap-px overflow-hidden rounded-[var(--r-ctl)] bg-[var(--hair)]">
        {canvases.map((canvas) => (
          <button
            key={canvas.id}
            type="button"
            onClick={() => navigate(`/canvas?canvas=${canvas.id}`)}
            className="group flex h-[var(--h-line)] w-full items-center gap-3 bg-[var(--base)] px-3 text-left hover:bg-[var(--hover)]"
          >
            <PanelsTopLeft className="h-3.5 w-3.5 text-[var(--overlay-1)]" />
            <span className="min-w-0 flex-1 truncate font-ui text-[var(--t-ui)] font-medium text-[var(--text)]">{canvas.name}</span>
            <span className="text-meta">—</span>
            <Pill>canvas</Pill>
          </button>
        ))}
        {!canvases.length ? <p className="bg-[var(--base)] py-2 text-[var(--t-ui)] text-[var(--text-muted)]">Canvases linked to this project will appear here.</p> : null}
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
      <Card className="flex items-center gap-4 p-5">
        <Network className="h-5 w-5 shrink-0 text-[var(--accent-text)]" />
        <span className="min-w-0 flex-1">
          <span className="block font-ui text-[var(--t-ui)] font-semibold text-[var(--text)]">Relationship graph</span>
          <span className="mt-1 block font-ui text-[var(--t-section)] text-[var(--subtext-0)]">{nodes.length} linked entities</span>
        </span>
        <span className="flex flex-wrap justify-end gap-1.5">
          {byType.map(([type, count]) => <Pill key={type}>{type} {count}</Pill>)}
        </span>
        <Control onClick={() => navigate(`/graph?project=${projectId}`)}>Open graph</Control>
      </Card>
    </ProjectTabFrame>
  );
}
