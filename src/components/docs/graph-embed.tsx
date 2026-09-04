import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import {
  parseGraphEmbedBlocks,
  parseGraphId,
  serializeGraphSvg,
  TOKEN_GRAPH_PALETTE,
  type GraphEmbedSpec,
} from "@/components/graph/export";
import { listGraphEdges, listGraphNodes } from "@/lib/data/graph";
import { Skeleton } from "@/components/ui/skeleton";

function GraphEmbedPreview({ spec }: { spec: GraphEmbedSpec }) {
  const projectId = parseGraphId(spec.id);
  const query = useQuery({
    queryKey: ["document-graph-embed", spec.id],
    queryFn: async () => {
      if (projectId === undefined) throw new Error("Invalid graph reference");
      const [nodes, edges] = await Promise.all([listGraphNodes(projectId), listGraphEdges(projectId)]);
      return { nodes, edges };
    },
  });
  const svg = useMemo(
    () => query.data ? serializeGraphSvg(query.data.nodes, query.data.edges, spec.mode, TOKEN_GRAPH_PALETTE) : "",
    [query.data, spec.mode],
  );
  const href = projectId === null ? "/graph" : `/graph?project=${projectId}`;

  return (
    <figure className="overflow-hidden rounded-[var(--r-plane)] border border-[var(--border)] bg-[var(--crust)]">
      <figcaption className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span className="font-ui text-[var(--t-count)] font-light uppercase tracking-[0.1em] text-[var(--overlay-1)]">
          Relationship graph · {spec.mode}
        </span>
        <Link className="inline-flex items-center gap-1 font-ui text-[var(--t-count)] text-[var(--accent)] hover:underline" to={href}>
          Open graph <ArrowUpRight className="h-3 w-3" />
        </Link>
      </figcaption>
      <div className="flex min-h-[180px] items-center justify-center p-3">
        {query.isLoading ? (
          <Skeleton lines={3} className="w-full" />
        ) : query.error ? (
          <p className="font-ui text-[var(--t-section)] text-[var(--danger)]">Graph snapshot could not be loaded.</p>
        ) : query.data?.nodes.length ? (
          <div className="h-[260px] w-full [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <p className="font-ui text-[var(--t-section)] text-[var(--overlay-1)]">This graph has no nodes.</p>
        )}
      </div>
    </figure>
  );
}

export function GraphEmbeds({ markdown }: { markdown: string }) {
  const specs = useMemo(() => parseGraphEmbedBlocks(markdown), [markdown]);
  if (!specs.length) return null;
  return (
    <div className="mb-5 grid gap-3">
      {specs.map((spec, index) => <GraphEmbedPreview key={`${spec.id}:${spec.mode}:${index}`} spec={spec} />)}
    </div>
  );
}
