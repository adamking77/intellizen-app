import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addEdge,
  Background,
  Controls,
  Position,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";

import { Badge } from "@/components/ui/badge";
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
  GraphEdgeRecord,
  GraphEntityType,
  GraphNodeRecord,
} from "@/lib/types";
import { useAppStore } from "@/store";

type CanvasNodeData = {
  label: string;
  entityType: GraphEntityType;
};

type CanvasNode = Node<CanvasNodeData>;
type CanvasEdge = Edge;

const ENTITY_STYLES: Record<
  GraphEntityType,
  {
    fill: string;
    border: string;
    text: string;
    shape: React.CSSProperties;
  }
> = {
  person: {
    fill: "rgba(127, 230, 202, 0.18)",
    border: "rgba(127, 230, 202, 0.44)",
    text: "#dff8ee",
    shape: {
      borderRadius: 999,
      minWidth: 120,
    },
  },
  organisation: {
    fill: "rgba(117, 166, 255, 0.16)",
    border: "rgba(117, 166, 255, 0.42)",
    text: "#dce8ff",
    shape: {
      borderRadius: 18,
      minWidth: 136,
    },
  },
  location: {
    fill: "rgba(242, 193, 86, 0.18)",
    border: "rgba(242, 193, 86, 0.42)",
    text: "#ffefbf",
    shape: {
      borderRadius: 8,
      minWidth: 124,
      transform: "rotate(45deg)",
    },
  },
  event: {
    fill: "rgba(210, 128, 110, 0.18)",
    border: "rgba(210, 128, 110, 0.42)",
    text: "#ffe1d6",
    shape: {
      minWidth: 140,
      clipPath: "polygon(14% 0%, 86% 0%, 100% 50%, 86% 100%, 14% 100%, 0% 50%)",
    },
  },
};

export function GraphView() {
  return (
    <ReactFlowProvider>
      <GraphWorkspace />
    </ReactFlowProvider>
  );
}

function GraphWorkspace() {
  const graphProjectId = useAppStore((state) => state.graphProjectId);
  const setGraphProjectId = useAppStore((state) => state.setGraphProjectId);
  const [label, setLabel] = useState("");
  const [entityType, setEntityType] = useState<GraphEntityType>("person");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>([]);
  const { screenToFlowPosition } = useReactFlow();

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  useEffect(() => {
    if (graphProjectId === null && projects && projects.length > 0) {
      setGraphProjectId(projects[0].id);
    }
  }, [graphProjectId, projects, setGraphProjectId]);

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

  useEffect(() => {
    setNodes((nodesQuery.data ?? []).map(mapNodeRecordToCanvasNode));
  }, [nodesQuery.data, setNodes]);

  useEffect(() => {
    setEdges((edgesQuery.data ?? []).map(mapEdgeRecordToCanvasEdge));
  }, [edgesQuery.data, setEdges]);

  async function placeNodeAt(point: { x: number; y: number }) {
    if (!graphProjectId || !label.trim()) return;

    const created = await createGraphNode({
      projectId: graphProjectId,
      nodeId: crypto.randomUUID(),
      label: label.trim(),
      entityType,
      position: point,
    });

    setNodes((current) => [...current, mapNodeRecordToCanvasNode(created)]);
    setLabel("");
    setStatusMessage(`Added ${entityType} node to ${selectedProject?.name ?? "project"}.`);
  }

  async function handleConnect(connection: Connection) {
    if (!graphProjectId || !connection.source || !connection.target) return;

    const relationship = window.prompt("Relationship label", "")?.trim() ?? "";
    const created = await createGraphEdge({
      projectId: graphProjectId,
      edgeId: crypto.randomUUID(),
      sourceNodeId: connection.source,
      targetNodeId: connection.target,
      label: relationship || null,
    });

    setEdges((current) => addEdge(mapEdgeRecordToCanvasEdge(created), current));
    setStatusMessage("Connection saved.");
  }

  async function handleNodesDelete(deletedNodes: CanvasNode[]) {
    if (!graphProjectId || deletedNodes.length === 0) return;

    const nodeIds = deletedNodes.map((node) => node.id);
    const relatedEdgeIds = edges
      .filter((edge) => nodeIds.includes(edge.source) || nodeIds.includes(edge.target))
      .map((edge) => edge.id);

    await deleteGraphNodes({ projectId: graphProjectId, nodeIds });
    await deleteGraphEdges({ projectId: graphProjectId, edgeIds: relatedEdgeIds });
    setStatusMessage(`Deleted ${deletedNodes.length} node${deletedNodes.length === 1 ? "" : "s"}.`);
  }

  async function handleEdgesDelete(deletedEdges: CanvasEdge[]) {
    if (!graphProjectId || deletedEdges.length === 0) return;

    await deleteGraphEdges({
      projectId: graphProjectId,
      edgeIds: deletedEdges.map((edge) => edge.id),
    });
    setStatusMessage(`Deleted ${deletedEdges.length} edge${deletedEdges.length === 1 ? "" : "s"}.`);
  }

  async function handleNodeDragStop(_: React.MouseEvent, node: CanvasNode) {
    if (!graphProjectId) return;

    await updateGraphNodePosition({
      projectId: graphProjectId,
      nodeId: node.id,
      position: node.position,
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
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

          <Input
            placeholder="Node label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />

          <select
            className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
            value={entityType}
            onChange={(event) =>
              setEntityType(event.target.value as GraphEntityType)
            }
          >
            <option value="person">Person</option>
            <option value="organisation">Organisation</option>
            <option value="location">Location</option>
            <option value="event">Event</option>
          </select>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/40 p-4 text-sm leading-6 text-[var(--muted-foreground)]">
            Enter a label and entity type, then click an empty area of the canvas
            to place the node. Drag between nodes to create a labeled edge. Use
            <span className="px-1 text-[var(--foreground)]">Delete</span>
            to remove selected nodes or edges.
          </div>

          {statusMessage ? (
            <Badge variant="success" className="w-full justify-center py-2">
              {statusMessage}
            </Badge>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Badge variant="neutral">Nodes {(nodesQuery.data ?? []).length}</Badge>
            <Badge variant="neutral">Edges {(edgesQuery.data ?? []).length}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-[720px]">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{selectedProject?.name ?? "No project selected"}</CardTitle>
            {selectedProject ? <Badge variant="accent">{selectedProject.type}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="h-[640px]">
          {nodesQuery.error || edgesQuery.error ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] p-5 text-sm text-[var(--muted-foreground)]">
              {(nodesQuery.error ?? edgesQuery.error)?.message}
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={(connection) => void handleConnect(connection)}
              onPaneClick={(event) => {
                if (!label.trim()) return;
                const position = screenToFlowPosition({
                  x: event.clientX,
                  y: event.clientY,
                });
                void placeNodeAt(position);
              }}
              onNodesDelete={(deleted) => void handleNodesDelete(deleted)}
              onEdgesDelete={(deleted) => void handleEdgesDelete(deleted)}
              onNodeDragStop={(event, node) => void handleNodeDragStop(event, node)}
              fitView
              deleteKeyCode={["Delete", "Backspace"]}
              defaultEdgeOptions={{
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: "#8dbfc1",
                },
                style: {
                  stroke: "#8dbfc1",
                  strokeWidth: 1.5,
                },
              }}
              className="rounded-[28px] border border-[var(--border)] bg-[radial-gradient(circle_at_top,rgba(42,85,92,0.24),transparent_55%),linear-gradient(180deg,rgba(14,24,27,0.92),rgba(8,15,17,0.98))]"
            >
              <MiniMap
                pannable
                zoomable
                style={{
                  background: "rgba(8, 17, 19, 0.96)",
                }}
              />
              <Controls />
              <Background gap={24} color="rgba(141, 191, 193, 0.13)" />
            </ReactFlow>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function mapNodeRecordToCanvasNode(record: GraphNodeRecord): CanvasNode {
  const style = ENTITY_STYLES[record.entity_type];
  const rotated = record.entity_type === "location";

  return {
    id: record.node_id,
    position: {
      x: record.position_x,
      y: record.position_y,
    },
    data: {
      label: record.label,
      entityType: record.entity_type,
    },
    style: {
      background: style.fill,
      border: `1px solid ${style.border}`,
      color: style.text,
      fontSize: 12,
      fontWeight: 600,
      padding: "12px 16px",
      boxShadow: "0 12px 40px rgba(4, 10, 11, 0.34)",
      ...style.shape,
    },
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    draggable: true,
    deletable: true,
    selectable: true,
    type: "default",
    ...(rotated
      ? {
          data: {
            ...{
              label: `◇ ${record.label}`,
              entityType: record.entity_type,
            },
          },
        }
      : {}),
  };
}

function mapEdgeRecordToCanvasEdge(record: GraphEdgeRecord): CanvasEdge {
  return {
    id: record.edge_id,
    source: record.source_node_id,
    target: record.target_node_id,
    label: record.label ?? undefined,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: "#8dbfc1",
    },
    style: {
      stroke: "#8dbfc1",
      strokeWidth: 1.5,
    },
    labelStyle: {
      fill: "#d9ece7",
      fontSize: 12,
      fontWeight: 600,
    },
    labelBgStyle: {
      fill: "rgba(8, 17, 19, 0.88)",
      fillOpacity: 1,
    },
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 999,
  };
}
