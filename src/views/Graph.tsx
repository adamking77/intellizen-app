import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Crosshair,
  Link2,
  Move,
  ScanSearch,
  Trash2,
  Unlink,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

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
  updateGraphEdge,
  updateGraphNode,
  updateGraphNodePosition,
} from "@/lib/data";
import type { GraphEntityType, GraphNodeRecord } from "@/lib/types";

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

const NODE_WIDTH = 188;
const NODE_HEIGHT = 92;
const WORLD_WIDTH = 2200;
const WORLD_HEIGHT = 1400;
const WORLD_MARGIN = 32;
const VIEWPORT_HEIGHT = 780;
const DEFAULT_VIEW = { x: 140, y: 90, scale: 1 };

type Point = {
  x: number;
  y: number;
};

type ViewportState = {
  x: number;
  y: number;
  scale: number;
};

type DragState = {
  nodeId: string;
  originX: number;
  originY: number;
  startClientX: number;
  startClientY: number;
} | null;

type PanState = {
  originX: number;
  originY: number;
  startClientX: number;
  startClientY: number;
} | null;

export function GraphView() {
  const [graphProjectId, setGraphProjectId] = useState<number | null>(null);
  const [createLabel, setCreateLabel] = useState("");
  const [createEntityType, setCreateEntityType] = useState<GraphEntityType>("person");
  const [connectLabel, setConnectLabel] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [placeMode, setPlaceMode] = useState(false);
  const [pointerWorld, setPointerWorld] = useState<Point | null>(null);
  const [nodeDraftLabel, setNodeDraftLabel] = useState("");
  const [nodeDraftType, setNodeDraftType] = useState<GraphEntityType>("person");
  const [edgeDraftLabel, setEdgeDraftLabel] = useState("");
  const [dragPositions, setDragPositions] = useState<Record<string, Point>>({});
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEW);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState>(null);
  const panStateRef = useRef<PanState>(null);
  const dragPositionsRef = useRef<Record<string, Point>>({});
  const viewportStateRef = useRef<ViewportState>(DEFAULT_VIEW);

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
        }
      }

      if (Object.keys(current).length !== Object.keys(next).length) {
        changed = true;
      }

      if (!changed) {
        for (const key of Object.keys(next)) {
          if (next[key] !== current[key]) {
            changed = true;
            break;
          }
        }
      }

      return changed ? next : current;
    });
  }, [nodes]);

  useEffect(() => {
    dragPositionsRef.current = dragPositions;
  }, [dragPositions]);

  useEffect(() => {
    viewportStateRef.current = viewport;
  }, [viewport]);

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
    if (!selectedNodeId || nodes.some((node) => node.node_id === selectedNodeId)) return;
    setSelectedNodeId(null);
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    if (!selectedEdgeId || edges.some((edge) => edge.edge_id === selectedEdgeId)) return;
    setSelectedEdgeId(null);
  }, [edges, selectedEdgeId]);

  useEffect(() => {
    if (!selectedNode) {
      setNodeDraftLabel("");
      setNodeDraftType("person");
      return;
    }

    setNodeDraftLabel(selectedNode.label);
    setNodeDraftType(selectedNode.entity_type);
  }, [selectedNode]);

  useEffect(() => {
    setEdgeDraftLabel(selectedEdge?.label ?? "");
  }, [selectedEdge]);

  useEffect(() => {
    if (!connectSourceId || nodeLookup.has(connectSourceId)) return;
    setConnectSourceId(null);
  }, [connectSourceId, nodeLookup]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const viewportElement = viewportRef.current;
      if (!viewportElement) return;

      const worldPoint = clientToWorldPoint(
        viewportElement,
        event.clientX,
        event.clientY,
        viewportStateRef.current,
      );
      setPointerWorld(worldPoint);

      const dragState = dragStateRef.current;
      if (dragState) {
        const nextX = clamp(
          dragState.originX + (event.clientX - dragState.startClientX) / viewportStateRef.current.scale,
          WORLD_MARGIN,
          WORLD_WIDTH - NODE_WIDTH - WORLD_MARGIN,
        );
        const nextY = clamp(
          dragState.originY + (event.clientY - dragState.startClientY) / viewportStateRef.current.scale,
          WORLD_MARGIN,
          WORLD_HEIGHT - NODE_HEIGHT - WORLD_MARGIN,
        );

        setDragPositions((current) => {
          const next = {
            ...current,
            [dragState.nodeId]: { x: nextX, y: nextY },
          };
          dragPositionsRef.current = next;
          return next;
        });
        return;
      }

      const panState = panStateRef.current;
      if (!panState) return;

      setViewport((current) => ({
        ...current,
        x: panState.originX + event.clientX - panState.startClientX,
        y: panState.originY + event.clientY - panState.startClientY,
      }));
    }

    async function handlePointerUp() {
      const dragState = dragStateRef.current;
      if (dragState && graphProjectId) {
        dragStateRef.current = null;
        const finalPosition = dragPositionsRef.current[dragState.nodeId];

        if (finalPosition) {
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
      }

      if (panStateRef.current) {
        panStateRef.current = null;
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if (event.key === "Escape") {
        setPlaceMode(false);
        setConnectSourceId(null);
        setSelectedEdgeId(null);
        setSelectedNodeId(null);
      }

      if (event.key !== "Backspace" && event.key !== "Delete") return;

      if (selectedNodeId) {
        event.preventDefault();
        void handleDeleteNode(selectedNodeId);
        return;
      }

      if (selectedEdgeId) {
        event.preventDefault();
        void handleDeleteEdge(selectedEdgeId);
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [graphProjectId, nodesQuery, selectedEdgeId, selectedNodeId]);

  async function handleCreateNode(position?: Point) {
    if (!graphProjectId || !createLabel.trim()) return;

    try {
      setErrorMessage(null);
      setStatusMessage(null);

      await createGraphNode({
        projectId: graphProjectId,
        nodeId: crypto.randomUUID(),
        label: createLabel.trim(),
        entityType: createEntityType,
        position: position ?? getNextNodePosition(visualNodes.length),
      });

      await nodesQuery.refetch();
      setCreateLabel("");
      setPlaceMode(false);
      setStatusMessage(`Added ${createEntityType} node.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to add node.");
    }
  }

  async function handleCreateEdge(sourceNodeId: string, targetNodeId: string) {
    if (!graphProjectId) return;
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return;

    const duplicate = edges.some(
      (edge) =>
        edge.source_node_id === sourceNodeId &&
        edge.target_node_id === targetNodeId &&
        (edge.label ?? "") === connectLabel.trim(),
    );
    if (duplicate) {
      setErrorMessage("That connection already exists.");
      return;
    }

    try {
      setErrorMessage(null);
      setStatusMessage(null);

      await createGraphEdge({
        projectId: graphProjectId,
        edgeId: crypto.randomUUID(),
        sourceNodeId,
        targetNodeId,
        label: connectLabel.trim() || null,
      });

      await edgesQuery.refetch();
      setConnectSourceId(null);
      setConnectLabel("");
      setStatusMessage("Added connection.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to add connection.");
    }
  }

  async function handleSaveSelectedNode() {
    if (!graphProjectId || !selectedNode || !nodeDraftLabel.trim()) return;

    try {
      setErrorMessage(null);
      setStatusMessage(null);

      await updateGraphNode({
        projectId: graphProjectId,
        nodeId: selectedNode.node_id,
        label: nodeDraftLabel.trim(),
        entityType: nodeDraftType,
      });

      await nodesQuery.refetch();
      setStatusMessage("Updated node.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update node.");
    }
  }

  async function handleSaveSelectedEdge() {
    if (!graphProjectId || !selectedEdge) return;

    try {
      setErrorMessage(null);
      setStatusMessage(null);

      await updateGraphEdge({
        projectId: graphProjectId,
        edgeId: selectedEdge.edge_id,
        label: edgeDraftLabel.trim() || null,
      });

      await edgesQuery.refetch();
      setStatusMessage("Updated connection.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update connection.");
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
      setSelectedEdgeId(null);
      setConnectSourceId((current) => (current === nodeId ? null : current));
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

  async function handleTidyLayout() {
    if (!graphProjectId || visualNodes.length === 0) return;

    try {
      setErrorMessage(null);
      setStatusMessage(null);

      const positions = new Map<string, Point>();
      visualNodes.forEach((node, index) => {
        positions.set(node.node_id, getNextNodePosition(index));
      });

      setDragPositions((current) => {
        const next = { ...current };
        for (const [nodeId, position] of positions.entries()) {
          next[nodeId] = position;
        }
        dragPositionsRef.current = next;
        return next;
      });

      await Promise.all(
        visualNodes.map((node, index) =>
          updateGraphNodePosition({
            projectId: graphProjectId,
            nodeId: node.node_id,
            position: getNextNodePosition(index),
          }),
        ),
      );

      await nodesQuery.refetch();
      fitViewToNodes(
        visualNodes.map((node, index) => ({
          ...node,
          position: getNextNodePosition(index),
        })),
        viewportRef.current,
        setViewport,
      );
      setStatusMessage("Applied tidy layout.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to tidy layout.");
    }
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-graph-interactive='true']")) return;
    event.preventDefault();

    setSelectedNodeId(null);
    setSelectedEdgeId(null);

    const viewportElement = viewportRef.current;
    if (!viewportElement) return;

    const worldPoint = clientToWorldPoint(
      viewportElement,
      event.clientX,
      event.clientY,
      viewportStateRef.current,
    );

    if (placeMode) {
      void handleCreateNode(clampNodePosition(worldPoint));
      return;
    }

    panStateRef.current = {
      originX: viewportStateRef.current.x,
      originY: viewportStateRef.current.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
  }

  function handleCanvasPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const viewportElement = viewportRef.current;
    if (!viewportElement) return;

    setPointerWorld(
      clientToWorldPoint(viewportElement, event.clientX, event.clientY, viewportStateRef.current),
    );
  }

  function handleCanvasWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();

    const viewportElement = viewportRef.current;
    if (!viewportElement) return;

    const rect = viewportElement.getBoundingClientRect();
    const cursorWorldX = (event.clientX - rect.left - viewportStateRef.current.x) / viewportStateRef.current.scale;
    const cursorWorldY = (event.clientY - rect.top - viewportStateRef.current.y) / viewportStateRef.current.scale;

    const nextScale = clamp(
      viewportStateRef.current.scale * (event.deltaY < 0 ? 1.08 : 0.92),
      0.5,
      1.75,
    );

    setViewport({
      scale: nextScale,
      x: event.clientX - rect.left - cursorWorldX * nextScale,
      y: event.clientY - rect.top - cursorWorldY * nextScale,
    });
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
            <p className="text-sm font-medium text-[var(--foreground)]">Create node</p>
            <Input
              placeholder="Node label"
              value={createLabel}
              onChange={(event) => setCreateLabel(event.target.value)}
            />
            <select
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
              value={createEntityType}
              onChange={(event) => setCreateEntityType(event.target.value as GraphEntityType)}
            >
              <option value="person">Person</option>
              <option value="organisation">Organisation</option>
              <option value="location">Location</option>
              <option value="event">Event</option>
            </select>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void handleCreateNode()}
                disabled={!graphProjectId || !createLabel.trim()}
              >
                Add now
              </Button>
              <Button
                variant={placeMode ? "primary" : "secondary"}
                onClick={() => setPlaceMode((current) => !current)}
                disabled={!graphProjectId || !createLabel.trim()}
              >
                <Crosshair className="h-4 w-4" />
                {placeMode ? "Cancel placement" : "Place on canvas"}
              </Button>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/45 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-[var(--foreground)]">Connection mode</p>
              {connectSourceId ? (
                <Badge variant="accent">
                  From {findNodeLabel(nodes, connectSourceId)}
                </Badge>
              ) : (
                <Badge variant="neutral">Idle</Badge>
              )}
            </div>
            <Input
              placeholder="Relationship label"
              value={connectLabel}
              onChange={(event) => setConnectLabel(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  if (!selectedNode) return;
                  setConnectSourceId(selectedNode.node_id);
                  setSelectedEdgeId(null);
                  setStatusMessage(`Select a target for ${selectedNode.label}.`);
                }}
                disabled={!selectedNode}
              >
                <Link2 className="h-4 w-4" />
                Link from selected node
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConnectSourceId(null)}
                disabled={!connectSourceId}
              >
                <Unlink className="h-4 w-4" />
                Cancel link
              </Button>
            </div>
          </div>

          <div className="grid gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/35 p-4 text-sm text-[var(--muted-foreground)]">
            <div className="flex items-center gap-2 text-[var(--foreground)]">
              <Move className="h-4 w-4" />
              Drag nodes. Drag empty canvas to pan. Use wheel to zoom.
            </div>
            <p>Click nodes or edges to edit them. Press `Esc` to cancel modes and `Delete` to remove the current selection.</p>
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
            <Badge variant="neutral">Zoom {Math.round(viewport.scale * 100)}%</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{selectedProject?.name ?? "Graph canvas"}</CardTitle>
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  Manual intelligence graph with canvas placement, direct linking, and node editing.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setViewport((current) => ({ ...current, scale: clamp(current.scale * 1.12, 0.5, 1.75) }))}
                >
                  <ZoomIn className="h-4 w-4" />
                  Zoom in
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setViewport((current) => ({ ...current, scale: clamp(current.scale * 0.88, 0.5, 1.75) }))}
                >
                  <ZoomOut className="h-4 w-4" />
                  Zoom out
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => fitViewToNodes(visualNodes, viewportRef.current, setViewport)}
                  disabled={visualNodes.length === 0}
                >
                  <ScanSearch className="h-4 w-4" />
                  Fit view
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleTidyLayout()}
                  disabled={visualNodes.length === 0}
                >
                  Tidy layout
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              ref={viewportRef}
              className={`relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(15,25,27,0.98),rgba(9,17,19,0.98))] ${placeMode ? "cursor-crosshair" : panStateRef.current ? "cursor-grabbing" : "cursor-grab"}`}
              style={{ height: VIEWPORT_HEIGHT, touchAction: "none" }}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onWheel={handleCanvasWheel}
            >
              <div
                className="absolute left-0 top-0"
                style={{
                  width: WORLD_WIDTH,
                  height: WORLD_HEIGHT,
                  transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                  transformOrigin: "top left",
                  backgroundImage:
                    "linear-gradient(rgba(137,170,164,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(137,170,164,0.08) 1px, transparent 1px)",
                  backgroundSize: "36px 36px",
                }}
              >
                <svg className="absolute inset-0 h-full w-full overflow-visible">
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
                          data-graph-interactive="true"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            setSelectedNodeId(null);
                            setSelectedEdgeId(edge.edge_id);
                          }}
                        />
                        {edge.label ? (
                          <g transform={`translate(${labelPosition.x}, ${labelPosition.y})`}>
                            <rect
                              x={-56}
                              y={-12}
                              width={112}
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
                              {truncateLabel(edge.label, 22)}
                            </text>
                          </g>
                        ) : null}
                      </g>
                    );
                  })}

                  {connectSourceId && pointerWorld ? (
                    <path
                      d={buildEdgePreviewPath(nodeLookup.get(connectSourceId), pointerWorld)}
                      fill="none"
                      stroke="#7fe6ca"
                      strokeWidth={2}
                      strokeDasharray="8 6"
                    />
                  ) : null}
                </svg>

                {visualNodes.map((node) => {
                  const style = ENTITY_STYLES[node.entity_type];
                  const isSelected = node.node_id === selectedNodeId;
                  const isConnectSource = node.node_id === connectSourceId;

                  return (
                    <button
                      key={node.node_id}
                      type="button"
                      data-graph-interactive="true"
                      className="absolute flex flex-col items-start justify-between rounded-[22px] border p-4 text-left shadow-[0_18px_60px_rgba(2,8,9,0.36)] transition-transform hover:scale-[1.01]"
                      style={{
                        left: node.position.x,
                        top: node.position.y,
                        width: NODE_WIDTH,
                        height: NODE_HEIGHT,
                        background: style.fill,
                        borderColor: isConnectSource
                          ? "#7fe6ca"
                          : isSelected
                            ? "#b1f4e2"
                            : style.border,
                        color: style.text,
                        boxShadow: isSelected || isConnectSource
                          ? "0 0 0 1px rgba(127,230,202,0.35), 0 18px 60px rgba(2,8,9,0.36)"
                          : "0 18px 60px rgba(2,8,9,0.36)",
                        cursor: connectSourceId && connectSourceId !== node.node_id ? "copy" : "grab",
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        event.preventDefault();

                        if (connectSourceId) {
                          if (connectSourceId !== node.node_id) {
                            void handleCreateEdge(connectSourceId, node.node_id);
                          }
                          return;
                        }

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
                      <div className="pointer-events-none">
                        <div
                          className="inline-flex rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
                          style={{ background: style.chip }}
                        >
                          {node.entity_type}
                        </div>
                        <p className="mt-3 text-sm font-semibold leading-5">{node.label}</p>
                      </div>
                      <p className="pointer-events-none text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                        {Math.round(node.position.x)}, {Math.round(node.position.y)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="border border-[var(--border)] bg-[var(--surface)]/35">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Selected node</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedNode ? (
                    <>
                      <Input
                        value={nodeDraftLabel}
                        onChange={(event) => setNodeDraftLabel(event.target.value)}
                        placeholder="Node label"
                      />
                      <select
                        className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
                        value={nodeDraftType}
                        onChange={(event) => setNodeDraftType(event.target.value as GraphEntityType)}
                      >
                        <option value="person">Person</option>
                        <option value="organisation">Organisation</option>
                        <option value="location">Location</option>
                        <option value="event">Event</option>
                      </select>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Position {Math.round(selectedNode.position.x)}, {Math.round(selectedNode.position.y)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => void handleSaveSelectedNode()}
                          disabled={!nodeDraftLabel.trim()}
                        >
                          Save node
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setConnectSourceId(selectedNode.node_id);
                            setSelectedEdgeId(null);
                          }}
                        >
                          <Link2 className="h-4 w-4" />
                          Start link
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleDeleteNode(selectedNode.node_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Click a node on the canvas to edit it.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-[var(--border)] bg-[var(--surface)]/35">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Selected edge</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedEdge ? (
                    <>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {findNodeLabel(nodes, selectedEdge.source_node_id)} →{" "}
                        {findNodeLabel(nodes, selectedEdge.target_node_id)}
                      </p>
                      <Input
                        value={edgeDraftLabel}
                        onChange={(event) => setEdgeDraftLabel(event.target.value)}
                        placeholder="Relationship label"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => void handleSaveSelectedEdge()}>
                          Save edge
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleDeleteEdge(selectedEdge.edge_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      Click a connection line to edit its label.
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

function clientToWorldPoint(
  viewportElement: HTMLDivElement,
  clientX: number,
  clientY: number,
  viewport: ViewportState,
) {
  const rect = viewportElement.getBoundingClientRect();
  return {
    x: (clientX - rect.left - viewport.x) / viewport.scale,
    y: (clientY - rect.top - viewport.y) / viewport.scale,
  };
}

function clampNodePosition(point: Point) {
  return {
    x: clamp(point.x - NODE_WIDTH / 2, WORLD_MARGIN, WORLD_WIDTH - NODE_WIDTH - WORLD_MARGIN),
    y: clamp(point.y - NODE_HEIGHT / 2, WORLD_MARGIN, WORLD_HEIGHT - NODE_HEIGHT - WORLD_MARGIN),
  };
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

function buildEdgePreviewPath(
  source:
    | {
        centerX: number;
        centerY: number;
      }
    | undefined,
  pointer: Point,
) {
  if (!source) return "";

  const target = {
    centerX: clamp(pointer.x, 0, WORLD_WIDTH),
    centerY: clamp(pointer.y, 0, WORLD_HEIGHT),
  };

  return buildEdgePath(source, target);
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
  const columns = 5;
  const x = 72 + (index % columns) * 240;
  const y = 72 + Math.floor(index / columns) * 156;

  return {
    x: clamp(x, WORLD_MARGIN, WORLD_WIDTH - NODE_WIDTH - WORLD_MARGIN),
    y: clamp(y, WORLD_MARGIN, WORLD_HEIGHT - NODE_HEIGHT - WORLD_MARGIN),
  };
}

function fitViewToNodes(
  nodes: Array<{
    position: Point;
  }>,
  viewportElement: HTMLDivElement | null,
  setViewport: React.Dispatch<React.SetStateAction<ViewportState>>,
) {
  if (!viewportElement || nodes.length === 0) {
    setViewport(DEFAULT_VIEW);
    return;
  }

  const minX = Math.min(...nodes.map((node) => node.position.x));
  const maxX = Math.max(...nodes.map((node) => node.position.x + NODE_WIDTH));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxY = Math.max(...nodes.map((node) => node.position.y + NODE_HEIGHT));

  const padding = 100;
  const contentWidth = maxX - minX + padding * 2;
  const contentHeight = maxY - minY + padding * 2;

  const scale = clamp(
    Math.min(viewportElement.clientWidth / contentWidth, viewportElement.clientHeight / contentHeight),
    0.5,
    1.4,
  );

  setViewport({
    scale,
    x: (viewportElement.clientWidth - contentWidth * scale) / 2 - (minX - padding) * scale,
    y: (viewportElement.clientHeight - contentHeight * scale) / 2 - (minY - padding) * scale,
  });
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
