import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, Move, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createGraphEdge,
  createGraphNode,
  deleteGraphEdges,
  deleteGraphNodes,
  listGraphEdges,
  listGraphNodes,
  listProjects,
  updateGraphNodePosition,
} from "@/lib/data";
import type {
  GraphEntityType,
  GraphNodeRecord,
} from "@/lib/types";

const ENTITY_STYLES: Record<
  GraphEntityType,
  {
    chip: string;
    fill: string;
    border: string;
    text: string;
  }
> = {
  person: {
    chip: "rgba(127, 230, 202, 0.18)",
    fill: "rgba(127, 230, 202, 0.14)",
    border: "rgba(127, 230, 202, 0.38)",
    text: "#def6ef",
  },
  organisation: {
    chip: "rgba(117, 166, 255, 0.18)",
    fill: "rgba(117, 166, 255, 0.14)",
    border: "rgba(117, 166, 255, 0.4)",
    text: "#dce8ff",
  },
  location: {
    chip: "rgba(242, 193, 86, 0.2)",
    fill: "rgba(242, 193, 86, 0.16)",
    border: "rgba(242, 193, 86, 0.42)",
    text: "#fff0c3",
  },
  event: {
    chip: "rgba(210, 128, 110, 0.18)",
    fill: "rgba(210, 128, 110, 0.14)",
    border: "rgba(210, 128, 110, 0.42)",
    text: "#ffe2d8",
  },
};

const NODE_WIDTH = 180;
const NODE_HEIGHT = 88;
const WORKSPACE_WIDTH = 1400;
const WORKSPACE_HEIGHT = 860;
const NODE_MARGIN = 24;

type DragState = {
  nodeId: string;
  originX: number;
  originY: number;
  startClientX: number;
  startClientY: number;
} | null;

type Point = {
  x: number;
  y: number;
};

export function GraphView() {
  const [graphProjectId, setGraphProjectId] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [entityType, setEntityType] = useState<GraphEntityType>("person");
  const [edgeSourceId, setEdgeSourceId] = useState("");
  const [edgeTargetId, setEdgeTargetId] = useState("");
  const [edgeLabel, setEdgeLabel] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [dragPositions, setDragPositions] = useState<Record<string, Point>>({});
  const dragStateRef = useRef<DragState>(null);

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  useEffect(() => {
    if (
      (graphProjectId === null || !projects?.some((project) => project.id === graphProjectId)) &&
      projects &&
      projects.length > 0
    ) {
      setGraphProjectId(projects[0].id);
    }
  }, [graphProjectId, projects]);

  const selectedProject = useMemo(
    () => projects?.find((project) => project.id === graphProjectId) ?? null,
    [projects, graphProjectId],
  );

  const nodesQuery = useQuery({
    queryKey: ["graph-nodes", graphProjectId],
    queryFn: () => listGraphNodes(graphProjectId as number),
    enabled: graphProjectId !== null,
  });

  const edgesQuery = useQuery({
    queryKey: ["graph-edges", graphProjectId],
    queryFn: () => listGraphEdges(graphProjectId as number),
    enabled: graphProjectId !== null,
  });

  const nodes = nodesQuery.data ?? [];
  const edges = edgesQuery.data ?? [];

  useEffect(() => {
    setDragPositions((current) => {
      const next: Record<string, Point> = {};
      let changed = false;

      for (const node of nodes) {
        if (current[node.node_id]) {
          next[node.node_id] = current[node.node_id];
          if (!changed && next[node.node_id] !== current[node.node_id]) {
            changed = true;
          }
        }
      }

      if (Object.keys(current).length !== Object.keys(next).length) {
        changed = true;
      }

      return changed ? next : current;
    });
  }, [nodes]);

  useEffect(() => {
    if (!selectedNodeId || nodes.some((node) => node.node_id === selectedNodeId)) return;
    setSelectedNodeId(null);
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    if (!selectedEdgeId || edges.some((edge) => edge.edge_id === selectedEdgeId)) return;
    setSelectedEdgeId(null);
  }, [edges, selectedEdgeId]);

  useEffect(() => {
    if (!edgeSourceId && nodes[0]) setEdgeSourceId(nodes[0].node_id);
    if (!edgeTargetId && nodes[1]) setEdgeTargetId(nodes[1].node_id);
    if (nodes.length === 1 && !edgeTargetId) setEdgeTargetId(nodes[0].node_id);
  }, [nodes, edgeSourceId, edgeTargetId]);

  const visualNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        position: dragPositions[node.node_id] ?? {
          x: node.position_x,
          y: node.position_y,
        },
      })),
    [dragPositions, nodes],
  );

  const nodeLookup = useMemo(
    () =>
      new Map(
        visualNodes.map((node) => [
          node.node_id,
          {
            ...node,
            centerX: node.position.x + NODE_WIDTH / 2,
            centerY: node.position.y + NODE_HEIGHT / 2,
          },
        ]),
      ),
    [visualNodes],
  );

  const selectedNode = useMemo(
    () => visualNodes.find((node) => node.node_id === selectedNodeId) ?? null,
    [selectedNodeId, visualNodes],
  );

  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.edge_id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      const nextX = clamp(
        dragState.originX + event.clientX - dragState.startClientX,
        NODE_MARGIN,
        WORKSPACE_WIDTH - NODE_WIDTH - NODE_MARGIN,
      );
      const nextY = clamp(
        dragState.originY + event.clientY - dragState.startClientY,
        NODE_MARGIN,
        WORKSPACE_HEIGHT - NODE_HEIGHT - NODE_MARGIN,
      );

      setDragPositions((current) => ({
        ...current,
        [dragState.nodeId]: { x: nextX, y: nextY },
      }));
    }

    async function handlePointerUp() {
      const dragState = dragStateRef.current;
      if (!dragState || !graphProjectId) return;

      dragStateRef.current = null;
      const finalPosition = dragPositions[dragState.nodeId];
      if (!finalPosition) return;

      try {
        await updateGraphNodePosition({
          projectId: graphProjectId,
          nodeId: dragState.nodeId,
          position: finalPosition,
        });
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to save node position.",
        );
      } finally {
        void nodesQuery.refetch();
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragPositions, graphProjectId, nodesQuery]);

  async function handleAddNode() {
    if (!graphProjectId || !label.trim()) return;

    try {
      setErrorMessage(null);
      setStatusMessage(null);

      const nextPosition = getNextNodePosition(visualNodes.length);

      await createGraphNode({
        projectId: graphProjectId,
        nodeId: crypto.randomUUID(),
        label: label.trim(),
        entityType,
        position: nextPosition,
      });

      await nodesQuery.refetch();
      setLabel("");
      setStatusMessage(`Added ${entityType} node.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to add node.");
    }
  }

  async function handleAddEdge() {
    if (!graphProjectId || !edgeSourceId || !edgeTargetId) return;

    try {
      setErrorMessage(null);
      setStatusMessage(null);

      await createGraphEdge({
        projectId: graphProjectId,
        edgeId: crypto.randomUUID(),
        sourceNodeId: edgeSourceId,
        targetNodeId: edgeTargetId,
        label: edgeLabel.trim() || null,
      });

      await edgesQuery.refetch();
      setEdgeLabel("");
      setStatusMessage("Added connection.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to add connection.");
    }
  }

  async function handleDeleteNode(nodeId: string) {
    if (!graphProjectId) return;

    try {
      setErrorMessage(null);
      setStatusMessage(null);

      const relatedEdgeIds = edges
        .filter((edge) => edge.source_node_id === nodeId || edge.target_node_id === nodeId)
        .map((edge) => edge.edge_id);

      if (relatedEdgeIds.length > 0) {
        await deleteGraphEdges({ projectId: graphProjectId, edgeIds: relatedEdgeIds });
      }

      await deleteGraphNodes({ projectId: graphProjectId, nodeIds: [nodeId] });
      await nodesQuery.refetch();
      await edgesQuery.refetch();
      setSelectedNodeId(null);
      setStatusMessage("Deleted node.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete node.");
    }
  }

  async function handleDeleteEdge(edgeId: string) {
    if (!graphProjectId) return;

    try {
      setErrorMessage(null);
      setStatusMessage(null);

      await deleteGraphEdges({ projectId: graphProjectId, edgeIds: [edgeId] });
      await edgesQuery.refetch();
      setSelectedEdgeId(null);
      setStatusMessage("Deleted connection.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete connection.");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Graph controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <select
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
            value={graphProjectId ?? ""}
            onChange={(event) => setGraphProjectId(Number(event.target.value))}
          >
            {(projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/35 p-3 text-xs leading-5 text-[var(--muted-foreground)]">
            Active project:{" "}
            <span className="text-[var(--foreground)]">
              {selectedProject?.name ?? "none"}
            </span>
          </div>

          <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/45 p-4">
            <p className="text-sm font-medium text-[var(--foreground)]">Add node</p>
            <Input
              placeholder="Node label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <select
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
              value={entityType}
              onChange={(event) => setEntityType(event.target.value as GraphEntityType)}
            >
              <option value="person">Person</option>
              <option value="organisation">Organisation</option>
              <option value="location">Location</option>
              <option value="event">Event</option>
            </select>
            <Button onClick={() => void handleAddNode()} disabled={!graphProjectId || !label.trim()}>
              Add node
            </Button>
          </div>

          <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/45 p-4">
            <p className="text-sm font-medium text-[var(--foreground)]">Add connection</p>
            <select
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
              value={edgeSourceId}
              onChange={(event) => setEdgeSourceId(event.target.value)}
            >
              <option value="">Source node</option>
              {visualNodes.map((node) => (
                <option key={node.node_id} value={node.node_id}>
                  {node.label}
                </option>
              ))}
            </select>
            <select
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
              value={edgeTargetId}
              onChange={(event) => setEdgeTargetId(event.target.value)}
            >
              <option value="">Target node</option>
              {visualNodes.map((node) => (
                <option key={node.node_id} value={node.node_id}>
                  {node.label}
                </option>
              ))}
            </select>
            <Input
              placeholder="Relationship label"
              value={edgeLabel}
              onChange={(event) => setEdgeLabel(event.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() => void handleAddEdge()}
              disabled={!graphProjectId || !edgeSourceId || !edgeTargetId}
            >
              <Link2 className="h-4 w-4" />
              Add connection
            </Button>
          </div>

          <div className="grid gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/35 p-4 text-sm text-[var(--muted-foreground)]">
            <div className="flex items-center gap-2 text-[var(--foreground)]">
              <Move className="h-4 w-4" />
              Drag nodes on the canvas to reposition them
            </div>
            <p>Click a node or edge to inspect it. Delete acts on the current selection.</p>
          </div>

          {statusMessage ? (
            <Badge variant="success" className="w-full justify-center py-2">
              {statusMessage}
            </Badge>
          ) : null}

          {errorMessage ? (
            <Badge variant="warning" className="w-full justify-center py-2">
              {errorMessage}
            </Badge>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Badge variant="neutral">Nodes {visualNodes.length}</Badge>
            <Badge variant="neutral">Edges {edges.length}</Badge>
          </div>

          <Button
            variant="ghost"
            onClick={() => {
              void nodesQuery.refetch();
              void edgesQuery.refetch();
            }}
            disabled={!graphProjectId}
          >
            Reload graph
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{selectedProject?.name ?? "Graph canvas"}</CardTitle>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  Real node layout with live connection lines and drag persistence.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedNode ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void handleDeleteNode(selectedNode.node_id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete node
                  </Button>
                ) : null}
                {selectedEdge ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void handleDeleteEdge(selectedEdge.edge_id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete edge
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto overflow-y-hidden rounded-[28px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(15,25,27,0.98),rgba(9,17,19,0.98))]">
              <div
                className="relative"
                style={{
                  width: WORKSPACE_WIDTH,
                  height: WORKSPACE_HEIGHT,
                  backgroundImage:
                    "linear-gradient(rgba(137,170,164,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(137,170,164,0.08) 1px, transparent 1px)",
                  backgroundSize: "36px 36px",
                }}
                onPointerDown={() => {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                }}
              >
                <svg className="absolute inset-0 h-full w-full">
                  <defs>
                    <marker
                      id="graph-arrow"
                      markerWidth="10"
                      markerHeight="10"
                      refX="8"
                      refY="5"
                      orient="auto"
                    >
                      <path d="M0,0 L10,5 L0,10 z" fill="#8abec0" />
                    </marker>
                  </defs>

                  {edges.map((edge) => {
                    const source = nodeLookup.get(edge.source_node_id);
                    const target = nodeLookup.get(edge.target_node_id);
                    if (!source || !target) return null;

                    const path = buildEdgePath(source, target);
                    const labelPosition = getEdgeLabelPosition(source, target);
                    const isSelected = edge.edge_id === selectedEdgeId;

                    return (
                      <g key={edge.edge_id}>
                        <path
                          d={path}
                          fill="none"
                          stroke={isSelected ? "#7fe6ca" : "#8abec0"}
                          strokeWidth={isSelected ? 3 : 2}
                          markerEnd="url(#graph-arrow)"
                        />
                        <path
                          d={path}
                          fill="none"
                          stroke="transparent"
                          strokeWidth={18}
                          style={{ cursor: "pointer" }}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setSelectedNodeId(null);
                            setSelectedEdgeId(edge.edge_id);
                          }}
                        />
                        {edge.label ? (
                          <g transform={`translate(${labelPosition.x}, ${labelPosition.y})`}>
                            <rect
                              x={-54}
                              y={-12}
                              width={108}
                              height={24}
                              rx={12}
                              fill="rgba(8, 17, 19, 0.94)"
                              stroke="rgba(138, 190, 192, 0.26)"
                            />
                            <text
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="#dce8e5"
                              fontSize="11"
                              fontWeight="600"
                            >
                              {truncateLabel(edge.label, 20)}
                            </text>
                          </g>
                        ) : null}
                      </g>
                    );
                  })}
                </svg>

                {visualNodes.map((node) => {
                  const style = ENTITY_STYLES[node.entity_type];
                  const isSelected = node.node_id === selectedNodeId;

                  return (
                    <button
                      key={node.node_id}
                      type="button"
                      className="absolute flex flex-col items-start justify-between rounded-[22px] border p-4 text-left shadow-[0_18px_60px_rgba(2,8,9,0.36)] transition-transform hover:scale-[1.01]"
                      style={{
                        left: node.position.x,
                        top: node.position.y,
                        width: NODE_WIDTH,
                        height: NODE_HEIGHT,
                        background: style.fill,
                        borderColor: isSelected ? "#7fe6ca" : style.border,
                        color: style.text,
                        boxShadow: isSelected
                          ? "0 0 0 1px rgba(127,230,202,0.35), 0 18px 60px rgba(2,8,9,0.36)"
                          : "0 18px 60px rgba(2,8,9,0.36)",
                        cursor: "grab",
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setSelectedEdgeId(null);
                        setSelectedNodeId(node.node_id);
                        dragStateRef.current = {
                          nodeId: node.node_id,
                          originX: node.position.x,
                          originY: node.position.y,
                          startClientX: event.clientX,
                          startClientY: event.clientY,
                        };
                      }}
                    >
                      <div>
                        <div
                          className="inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
                          style={{ background: style.chip }}
                        >
                          {node.entity_type}
                        </div>
                        <p className="mt-3 text-sm font-semibold leading-5">{node.label}</p>
                      </div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        {Math.round(node.position.x)}, {Math.round(node.position.y)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border border-[var(--border)] bg-[var(--surface)]/35">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Selected node</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedNode ? (
                    <div className="space-y-2 text-sm">
                      <p className="font-medium text-[var(--foreground)]">{selectedNode.label}</p>
                      <p className="text-[var(--muted-foreground)]">
                        Type: {selectedNode.entity_type}
                      </p>
                      <p className="text-[var(--muted-foreground)]">
                        Position: {Math.round(selectedNode.position.x)},{" "}
                        {Math.round(selectedNode.position.y)}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Click a node on the canvas.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-[var(--border)] bg-[var(--surface)]/35">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Selected edge</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedEdge ? (
                    <div className="space-y-2 text-sm">
                      <p className="font-medium text-[var(--foreground)]">
                        {findNodeLabel(nodes, selectedEdge.source_node_id)} →{" "}
                        {findNodeLabel(nodes, selectedEdge.target_node_id)}
                      </p>
                      <p className="text-[var(--muted-foreground)]">
                        Label: {selectedEdge.label ?? "Unlabeled relationship"}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Click a connection line on the canvas.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function buildEdgePath(
  source: { centerX: number; centerY: number },
  target: { centerX: number; centerY: number },
) {
  const deltaX = Math.abs(target.centerX - source.centerX);
  const controlOffset = Math.max(60, deltaX / 2);

  return [
    `M ${source.centerX} ${source.centerY}`,
    `C ${source.centerX + controlOffset} ${source.centerY},`,
    `${target.centerX - controlOffset} ${target.centerY},`,
    `${target.centerX} ${target.centerY}`,
  ].join(" ");
}

function getEdgeLabelPosition(
  source: { centerX: number; centerY: number },
  target: { centerX: number; centerY: number },
) {
  return {
    x: (source.centerX + target.centerX) / 2,
    y: (source.centerY + target.centerY) / 2 - 18,
  };
}

function getNextNodePosition(index: number) {
  const columns = 4;
  const x = 72 + (index % columns) * 260;
  const y = 72 + Math.floor(index / columns) * 160;

  return {
    x: clamp(x, NODE_MARGIN, WORKSPACE_WIDTH - NODE_WIDTH - NODE_MARGIN),
    y: clamp(y, NODE_MARGIN, WORKSPACE_HEIGHT - NODE_HEIGHT - NODE_MARGIN),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function truncateLabel(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function findNodeLabel(
  nodes: Array<Pick<GraphNodeRecord, "node_id" | "label">>,
  nodeId: string,
) {
  return nodes.find((node) => node.node_id === nodeId)?.label ?? nodeId;
}
