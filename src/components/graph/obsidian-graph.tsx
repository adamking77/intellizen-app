import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d";
import { forceCollide, forceX, forceY } from "d3-force";

import type { GraphEntityType } from "@/lib/types";

interface InsightNode {
  id: string;
  label: string;
  entityType: GraphEntityType;
  color: string;
  val: number;
}

interface InsightLink {
  id: string;
  source: string;
  target: string;
  label: string | null;
}

interface ObsidianGraphProps {
  nodes: InsightNode[];
  links: InsightLink[];
  positionSeedByNodeId?: Record<string, { x: number; y: number }>;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  selectedEdgeIds: string[];
  shortestPathNodeIds: string[];
  shortestPathEdgeIds: string[];
  egoCenterNodeId: string | null;
  labelMode: "context" | "selected" | "all";
  autoLayout: boolean;
  repulsion: number;
  linkDistance: number;
  centerPull: number;
  layoutTick: number;
  onPositionSnapshot?: (positions: Record<string, { x: number; y: number }>) => void;
  onNodeClick: (nodeId: string, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  onLinkClick: (linkId: string, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => void;
  onBackgroundClick: () => void;
}

export interface ObsidianGraphRef {
  zoomToFit: (padding?: number) => void;
  centerAt: (nodeId: string, zoom?: number) => void;
  zoomBy: (factor: number) => void;
  captureCanvas: () => string | null;
}

type GraphNode = NodeObject<InsightNode> &
  InsightNode & {
    degree: number;
    neighbors: Set<string>;
    isUserPinned?: boolean;
  };

type GraphLink = LinkObject<GraphNode, InsightLink> & InsightLink;

type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const MAX_AUTO_FIT_ZOOM = 1.5;

export const ObsidianGraph = forwardRef<ObsidianGraphRef, ObsidianGraphProps>((props, ref) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink>>();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const lastLayoutTickRef = useRef(props.layoutTick);
  const nodeCacheRef = useRef<Map<string, GraphNode>>(new Map());

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const contentRect = entries[0]?.contentRect;
      if (!contentRect) return;
      const nextWidth = Math.max(1, Math.floor(contentRect.width));
      const nextHeight = Math.max(1, Math.floor(contentRect.height));

      setSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }
        return { width: nextWidth, height: nextHeight };
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo<GraphData>(() => {
    const previous = nodeCacheRef.current;
    const nextCache = new Map<string, GraphNode>();

    for (const rawNode of props.nodes) {
      const prevNode = previous.get(rawNode.id);
      const node: GraphNode = prevNode
        ? Object.assign(prevNode, {
            ...rawNode,
            degree: 0,
            neighbors: new Set<string>(),
          })
        : {
            ...rawNode,
            degree: 0,
            neighbors: new Set<string>(),
          };

      if (!prevNode) {
        const seed = props.positionSeedByNodeId?.[rawNode.id];
        if (seed && Number.isFinite(seed.x) && Number.isFinite(seed.y)) {
          node.x = seed.x;
          node.y = seed.y;
        }
      }

      nextCache.set(rawNode.id, node);
    }

    const links: GraphLink[] = props.links.map((rawLink) => {
      const sourceNode = nextCache.get(rawLink.source);
      const targetNode = nextCache.get(rawLink.target);

      if (sourceNode && targetNode) {
        sourceNode.degree += 1;
        targetNode.degree += 1;
        sourceNode.neighbors.add(targetNode.id);
        targetNode.neighbors.add(sourceNode.id);
      }

      return {
        ...rawLink,
        source: rawLink.source,
        target: rawLink.target,
      };
    });

    nodeCacheRef.current = nextCache;

    return {
      nodes: Array.from(nextCache.values()),
      links,
    };
  }, [props.links, props.nodes, props.positionSeedByNodeId]);

  function emitPositionSnapshot() {
    if (!props.onPositionSnapshot) return;
    const snapshot: Record<string, { x: number; y: number }> = {};
    for (const node of nodeCacheRef.current.values()) {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue;
      snapshot[node.id] = { x: node.x as number, y: node.y as number };
    }
    props.onPositionSnapshot(snapshot);
  }

  useEffect(
    () => () => {
      emitPositionSnapshot();
    },
    [],
  );

  const nodeLookup = useMemo(
    () => new Map(graphData.nodes.map((node) => [node.id, node])),
    [graphData.nodes],
  );

  const selectedNodeSet = useMemo(() => new Set(props.selectedNodeIds), [props.selectedNodeIds]);
  const selectedEdgeSet = useMemo(() => new Set(props.selectedEdgeIds), [props.selectedEdgeIds]);
  const pathNodeSet = useMemo(() => new Set(props.shortestPathNodeIds), [props.shortestPathNodeIds]);
  const pathEdgeSet = useMemo(() => new Set(props.shortestPathEdgeIds), [props.shortestPathEdgeIds]);

  const activeSelectedNodeIds = useMemo(
    () => (props.selectedNodeIds.length > 0 ? props.selectedNodeIds : props.selectedNodeId ? [props.selectedNodeId] : []),
    [props.selectedNodeId, props.selectedNodeIds],
  );

  const contextualNodeSet = useMemo(() => {
    if (props.labelMode !== "context" || activeSelectedNodeIds.length === 0) {
      return null;
    }

    const neighbors = new Set<string>(activeSelectedNodeIds);
    for (const nodeId of activeSelectedNodeIds) {
      const node = nodeLookup.get(nodeId);
      if (!node) continue;
      for (const neighborId of node.neighbors) {
        neighbors.add(neighborId);
      }
    }

    return neighbors;
  }, [activeSelectedNodeIds, nodeLookup, props.labelMode]);

  useEffect(() => {
    const graph = fgRef.current;
    if (!graph) return;

    const nodeCount = Math.max(1, graphData.nodes.length);
    const chargeStrength = -clamp(props.repulsion * 90 * Math.sqrt(nodeCount / 36), 60, 680);
    const collisionRadius = clamp(14 + Math.log2(nodeCount + 1) * 2.6, 14, 30);
    const centerStrength = clamp(props.centerPull * 0.9, 0.002, 0.22);

    const chargeForce = graph.d3Force("charge") as { strength?: (value: number) => void } | undefined;
    chargeForce?.strength?.(chargeStrength);

    const linkForce = graph.d3Force("link") as
      | {
          distance?: (value: number | ((link: GraphLink) => number)) => void;
          strength?: (value: number | ((link: GraphLink) => number)) => void;
        }
      | undefined;
    linkForce?.distance?.(() => props.linkDistance);
    linkForce?.strength?.(() => clamp(0.06 + 15 / (nodeCount + 20), 0.06, 0.16));

    graph.d3Force("x", forceX<GraphNode>(0).strength(centerStrength));
    graph.d3Force("y", forceY<GraphNode>(0).strength(centerStrength));
    graph.d3Force(
      "collide",
      forceCollide<GraphNode>()
        .radius((node: GraphNode) => collisionRadius + (node.val ?? 1) * 2.4)
        .strength(0.96)
        .iterations(2),
    );

    if (props.layoutTick !== lastLayoutTickRef.current) {
      lastLayoutTickRef.current = props.layoutTick;
      for (const node of graphData.nodes) {
        node.isUserPinned = false;
        node.fx = undefined;
        node.fy = undefined;
      }
    }

    if (props.autoLayout) {
      for (const node of graphData.nodes) {
        if (!node.isUserPinned) {
          node.fx = undefined;
          node.fy = undefined;
        }
      }
    } else {
      for (const node of graphData.nodes) {
        node.fx = typeof node.x === "number" ? node.x : node.fx;
        node.fy = typeof node.y === "number" ? node.y : node.fy;
      }
    }

    graph.d3ReheatSimulation();
  }, [
    graphData.nodes,
    props.autoLayout,
    props.centerPull,
    props.layoutTick,
    props.linkDistance,
    props.repulsion,
  ]);

  useImperativeHandle(
    ref,
    (): ObsidianGraphRef => ({
      zoomToFit: (padding = 64) => {
        const graph = fgRef.current;
        if (!graph) return;
        graph.zoomToFit(350, padding);
        graph.zoom(Math.min(graph.zoom(), MAX_AUTO_FIT_ZOOM), 0);
      },
      centerAt: (nodeId: string, zoom = 2.25) => {
        const graph = fgRef.current;
        const node = nodeLookup.get(nodeId);
        if (!graph || !node) return;
        const x = typeof node.x === "number" ? node.x : 0;
        const y = typeof node.y === "number" ? node.y : 0;
        graph.centerAt(x, y, 350);
        graph.zoom(clamp(zoom, 0.25, 6), 280);
      },
      zoomBy: (factor: number) => {
        const graph = fgRef.current;
        if (!graph) return;
        graph.zoom(clamp(graph.zoom() * factor, 0.25, 6), 220);
      },
      captureCanvas: () => {
        const canvas = containerRef.current?.querySelector("canvas");
        return canvas?.toDataURL("image/png") ?? null;
      },
    }),
    [nodeLookup],
  );

  function shouldShowLabel(node: GraphNode) {
    if (props.labelMode === "all") return true;

    const selected = node.id === props.selectedNodeId || selectedNodeSet.has(node.id);
    const onPath = pathNodeSet.has(node.id);
    const isEgoCenter = props.egoCenterNodeId === node.id;

    if (props.labelMode === "selected") {
      return selected || onPath || isEgoCenter;
    }

    if (!contextualNodeSet) return false;
    if (selected || onPath || isEgoCenter) return true;
    return contextualNodeSet.has(node.id);
  }

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {size.width > 0 && size.height > 0 ? (
        <ForceGraph2D<GraphNode, GraphLink>
          ref={fgRef}
          width={size.width}
          height={size.height}
          graphData={graphData}
          backgroundColor="#11111b"
          nodeId="id"
          nodeRelSize={5.2}
          nodeVal={(node) => node.val}
          nodeColor={(node) => {
            const isContextVisible = !contextualNodeSet || contextualNodeSet.has(node.id);
            if (!isContextVisible) return "rgba(127, 132, 156, 0.22)";
            return node.color;
          }}
          nodeCanvasObjectMode={() => "after"}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const selected = node.id === props.selectedNodeId || selectedNodeSet.has(node.id);
            const onPath = pathNodeSet.has(node.id);
            const isEgoCenter = props.egoCenterNodeId === node.id;
            const x = node.x ?? 0;
            const y = node.y ?? 0;
            const radius = Math.sqrt(node.val ?? 1) * 5.2;

            // Selected halo — 1px accent ring at 4px offset
            if (selected || isEgoCenter || onPath) {
              ctx.beginPath();
              ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
              ctx.strokeStyle = selected ? "#89b4fa" : "#b4befe";
              ctx.lineWidth = 1;
              ctx.stroke();
            }

            if (globalScale < 0.8 && props.labelMode === "context") return;
            if (!shouldShowLabel(node)) return;

            const fontSize = clamp(11 / globalScale, 10, 13);
            const label = node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label;
            ctx.font = `500 ${fontSize}px Switzer, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";

            // Label pill background (only for selected / on-path / ego)
            if (selected || onPath || isEgoCenter) {
              const metrics = ctx.measureText(label);
              const padX = 6;
              const padY = 3;
              const w = metrics.width + padX * 2;
              const h = fontSize + padY * 2;
              const px = x - w / 2;
              const py = y + radius + 6;
              ctx.fillStyle = "#181825";
              ctx.strokeStyle = "rgba(69, 71, 90, 0.6)";
              ctx.lineWidth = 1;
              ctx.beginPath();
              // rounded rect
              const r = 4;
              ctx.moveTo(px + r, py);
              ctx.lineTo(px + w - r, py);
              ctx.quadraticCurveTo(px + w, py, px + w, py + r);
              ctx.lineTo(px + w, py + h - r);
              ctx.quadraticCurveTo(px + w, py + h, px + w - r, py + h);
              ctx.lineTo(px + r, py + h);
              ctx.quadraticCurveTo(px, py + h, px, py + h - r);
              ctx.lineTo(px, py + r);
              ctx.quadraticCurveTo(px, py, px + r, py);
              ctx.closePath();
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = "#cdd6f4";
              ctx.fillText(label, x, py + padY);
            } else {
              ctx.fillStyle = "rgba(166, 173, 200, 0.55)";
              ctx.fillText(label, x, y + radius + 6);
            }
          }}
          linkColor={(link) => {
            const selected = link.id === props.selectedEdgeId || selectedEdgeSet.has(link.id);
            const onPath = pathEdgeSet.has(link.id);
            if (selected) return "#89b4fa";
            if (onPath) return "#b4befe";
            // Entity-hue tint when incident to an active selection
            const activeSelection = props.selectedNodeId || selectedNodeSet.size > 0;
            if (activeSelection) {
              const sourceId = typeof link.source === "object" ? (link.source as GraphNode).id : (link.source as string);
              const targetId = typeof link.target === "object" ? (link.target as GraphNode).id : (link.target as string);
              if (
                sourceId === props.selectedNodeId ||
                targetId === props.selectedNodeId ||
                selectedNodeSet.has(sourceId) ||
                selectedNodeSet.has(targetId)
              ) {
                return "rgba(137, 180, 250, 0.8)";
              }
            }
            return "rgba(108, 112, 134, 0.4)";
          }}
          linkWidth={(link) => {
            const selected = link.id === props.selectedEdgeId || selectedEdgeSet.has(link.id);
            const onPath = pathEdgeSet.has(link.id);
            return selected ? 2 : onPath ? 1.5 : 1;
          }}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={0.96}
          linkHoverPrecision={10}
          minZoom={0.2}
          maxZoom={6}
          d3AlphaDecay={props.autoLayout ? 0.05 : 0.28}
          d3VelocityDecay={props.autoLayout ? 0.34 : 0.74}
          warmupTicks={40}
          cooldownTicks={props.autoLayout ? 220 : 1}
          autoPauseRedraw
          showPointerCursor
          onNodeDragEnd={(node) => {
            node.fx = node.x;
            node.fy = node.y;
            node.isUserPinned = true;
            emitPositionSnapshot();
          }}
          onNodeClick={(node, event) => {
            props.onNodeClick(node.id, {
              shiftKey: event.shiftKey,
              metaKey: event.metaKey,
              ctrlKey: event.ctrlKey,
            });
          }}
          onLinkClick={(link, event) => {
            props.onLinkClick(link.id, {
              shiftKey: event.shiftKey,
              metaKey: event.metaKey,
              ctrlKey: event.ctrlKey,
            });
          }}
          onBackgroundClick={() => {
            props.onBackgroundClick();
          }}
          onEngineStop={() => {
            emitPositionSnapshot();
          }}
        />
      ) : null}
    </div>
  );
});

ObsidianGraph.displayName = "ObsidianGraph";
