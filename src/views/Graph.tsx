import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ObsidianGraph, type ObsidianGraphRef } from "@/components/graph/obsidian-graph";
import {
  Crosshair,
  FolderKanban,
  GitBranch,
  Link2,
  Move,
  Orbit,
  Redo2,
  Route,
  ScanSearch,
  Sparkles,
  Trash2,
  Unlink,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  buildEdgePath,
  buildEdgePreviewPath,
  buildMinimapViewportRect,
  canonicalEdgePair,
  clamp,
  clampNodePosition,
  clientToWorldPoint,
  computeFitViewToNodes,
  DEFAULT_VIEW,
  findNodeAtWorldPoint,
  findNodeLabel,
  getAutoAnchorSides,
  getClosestAnchorSide,
  getEdgeLabelPosition,
  getNextNodePosition,
  getNodeAnchorPoint,
  getNodeConnectorHandleStyle,
  NODE_ANCHOR_SIDES,
  NODE_HEIGHT,
  NODE_WIDTH,
  truncateLabel,
  VIEWPORT_HEIGHT,
  WORLD_HEIGHT,
  WORLD_MARGIN,
  WORLD_WIDTH,
  type NodeAnchorSide,
  type Point,
  type ViewportState,
} from "@/lib/graph-geometry";
import {
  createGraphEdge,
  createGraphNode,
  deleteGraphEdges,
  deleteGraphNodes,
  listGraphEdges,
  listGraphNodes,
  listProjectSignals,
  listProjects,
  updateGraphEdge,
  updateGraphNode,
  updateGraphNodePosition,
} from "@/lib/data";
import type {
  GraphEdgeRecord,
  GraphEntityType,
  ProjectSignal,
} from "@/lib/types";

type GraphMode = "project" | "standalone";
type GraphInteractionMode = "insight" | "construct";

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

const INSIGHT_NODE_COLORS: Record<GraphEntityType, string> = {
  person: "#4ebea5",
  organisation: "#6f95e9",
  location: "#dfaa49",
  event: "#c77769",
};

const EMPTY_STRING_SET = new Set<string>();

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

type EdgeDragState = {
  sourceNodeId: string;
  sourceAnchor: NodeAnchorSide;
} | null;

type GraphSnapshot = {
  projectId: number | null;
  nodes: Array<{
    nodeId: string;
    label: string;
    entityType: GraphEntityType;
    x: number;
    y: number;
  }>;
  edges: Array<{
    edgeId: string;
    sourceNodeId: string;
    targetNodeId: string;
    label: string | null;
  }>;
};

type InsightNode = {
  id: string;
  label: string;
  entityType: GraphEntityType;
  color: string;
  val: number;
};

type InsightLink = {
  id: string;
  source: string;
  target: string;
  label: string | null;
};

export function GraphView() {
  const [graphMode, setGraphMode] = useState<GraphMode>("standalone");
  const [interactionMode, setInteractionMode] = useState<GraphInteractionMode>("construct");
  const [graphProjectId, setGraphProjectId] = useState<number | null>(null);
  const [nodeSearch, setNodeSearch] = useState("");
  const [focusMode, setFocusMode] = useState<"all" | "selection">("all");
  const [showEdgeLabels, setShowEdgeLabels] = useState(true);
  const [showMinimap, setShowMinimap] = useState(true);
  const [entityTypeFilters, setEntityTypeFilters] = useState<Record<GraphEntityType, boolean>>({
    person: true,
    organisation: true,
    location: true,
    event: true,
  });
  const [createLabel, setCreateLabel] = useState("");
  const [createEntityType, setCreateEntityType] = useState<GraphEntityType>("person");
  const [connectLabel, setConnectLabel] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedEdgeIds, setSelectedEdgeIds] = useState<string[]>([]);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [placeMode, setPlaceMode] = useState(false);
  const [pointerWorld, setPointerWorld] = useState<Point | null>(null);
  const [nodeDraftLabel, setNodeDraftLabel] = useState("");
  const [nodeDraftType, setNodeDraftType] = useState<GraphEntityType>("person");
  const [edgeDraftLabel, setEdgeDraftLabel] = useState("");
  const [pathFromNodeId, setPathFromNodeId] = useState<string | null>(null);
  const [pathToNodeId, setPathToNodeId] = useState<string | null>(null);
  const [shortestPathNodeIds, setShortestPathNodeIds] = useState<string[]>([]);
  const [shortestPathEdgeIds, setShortestPathEdgeIds] = useState<string[]>([]);
  const [egoCenterNodeId, setEgoCenterNodeId] = useState<string | null>(null);
  const [egoDepth, setEgoDepth] = useState(1);
  const [dragPositions, setDragPositions] = useState<Record<string, Point>>({});
  const [viewport, setViewport] = useState<ViewportState>(DEFAULT_VIEW);
  const [edgeDragState, setEdgeDragState] = useState<EdgeDragState>(null);
  const [isAutoGenerating, setIsAutoGenerating] = useState(false);
  const [historyStats, setHistoryStats] = useState({ undoCount: 0, redoCount: 0 });
  const [insightAutoLayout, setInsightAutoLayout] = useState(true);
  const [insightRepulsion, setInsightRepulsion] = useState(2.4);
  const [insightLinkDistance, setInsightLinkDistance] = useState(340);
  const [insightCenterPull, setInsightCenterPull] = useState(0.03);
  const [insightLabelMode, setInsightLabelMode] = useState<"context" | "selected" | "all">("all");
  const [insightLayoutTick, setInsightLayoutTick] = useState(0);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState>(null);
  const panStateRef = useRef<PanState>(null);
  const dragPositionsRef = useRef<Record<string, Point>>({});
  const viewportStateRef = useRef<ViewportState>(DEFAULT_VIEW);
  const edgeDragStateRef = useRef<EdgeDragState>(null);
  const visualNodesRef = useRef<
    Array<{ node_id: string; label: string; entity_type: GraphEntityType; position: Point }>
  >([]);
  const edgesRef = useRef<GraphEdgeRecord[]>([]);
  const connectLabelRef = useRef(connectLabel);
  const graphModeRef = useRef(graphMode);
  const graphProjectIdRef = useRef(graphProjectId);
  const effectiveProjectIdRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const pastSnapshotsRef = useRef<GraphSnapshot[]>([]);
  const futureSnapshotsRef = useRef<GraphSnapshot[]>([]);
  const isApplyingHistoryRef = useRef(false);
  const insightGraphRef = useRef<ObsidianGraphRef>(null);
  const insightNodePositionSeedRef = useRef<Record<string, Point>>({});

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  // Auto-select first project when switching to project mode
  useEffect(() => {
    if (graphMode === "project" && graphProjectId === null && projects && projects.length > 0) {
      setGraphProjectId(projects[0].id);
    }
  }, [graphMode, graphProjectId, projects]);

  const selectedProject = useMemo(
    () => projects?.find((project) => project.id === graphProjectId) ?? null,
    [projects, graphProjectId],
  );

  // Effective project ID: null for standalone, selected ID for project mode
  const effectiveProjectId = graphMode === "standalone" ? null : graphProjectId;

  const nodesQuery = useQuery({
    queryKey: ["graph-nodes", effectiveProjectId],
    queryFn: () => listGraphNodes(effectiveProjectId),
    enabled: graphMode === "standalone" || graphProjectId !== null,
  });

  const edgesQuery = useQuery({
    queryKey: ["graph-edges", effectiveProjectId],
    queryFn: () => listGraphEdges(effectiveProjectId),
    enabled: graphMode === "standalone" || graphProjectId !== null,
  });

  // Query project signals for auto-generation (only in project mode)
  const projectSignalsQuery = useQuery({
    queryKey: ["project-signals", graphProjectId],
    queryFn: () => listProjectSignals(graphProjectId as number),
    enabled: graphMode === "project" && graphProjectId !== null,
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

  useEffect(() => {
    edgeDragStateRef.current = edgeDragState;
  }, [edgeDragState]);

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

  useEffect(() => {
    visualNodesRef.current = visualNodes;
    edgesRef.current = edges;
    connectLabelRef.current = connectLabel;
    graphModeRef.current = graphMode;
    graphProjectIdRef.current = graphProjectId;
    effectiveProjectIdRef.current = effectiveProjectId;
  }, [visualNodes, edges, connectLabel, graphMode, graphProjectId, effectiveProjectId]);

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

  const selectedNodeIdSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const selectedEdgeIdSet = useMemo(() => new Set(selectedEdgeIds), [selectedEdgeIds]);
  const shortestPathNodeIdSet = useMemo(() => new Set(shortestPathNodeIds), [shortestPathNodeIds]);
  const shortestPathEdgeIdSet = useMemo(() => new Set(shortestPathEdgeIds), [shortestPathEdgeIds]);
  const activeSelectedNodeIds = useMemo(
    () => (selectedNodeIds.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : []),
    [selectedNodeId, selectedNodeIds],
  );
  const isConstructMode = interactionMode === "construct";
  const isInsightMode = interactionMode === "insight";

  function clearSelection() {
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeId(null);
    setSelectedEdgeIds([]);
  }

  function clearPathAnalysis() {
    setPathFromNodeId(null);
    setPathToNodeId(null);
    setShortestPathNodeIds([]);
    setShortestPathEdgeIds([]);
  }

  function updateHistoryStats() {
    setHistoryStats({
      undoCount: pastSnapshotsRef.current.length,
      redoCount: futureSnapshotsRef.current.length,
    });
  }

  function ensureConstructMode(actionLabel: string) {
    if (isConstructMode) return true;
    setErrorMessage(`${actionLabel} is only available in Construct mode.`);
    return false;
  }

  function captureSnapshot(): GraphSnapshot {
    return {
      projectId: effectiveProjectIdRef.current,
      nodes: visualNodesRef.current.map((node) => ({
        nodeId: node.node_id,
        label: node.label,
        entityType: node.entity_type,
        x: node.position.x,
        y: node.position.y,
      })),
      edges: edgesRef.current.map((edge) => ({
        edgeId: edge.edge_id,
        sourceNodeId: edge.source_node_id,
        targetNodeId: edge.target_node_id,
        label: edge.label,
      })),
    };
  }

  function snapshotsEqual(a: GraphSnapshot, b: GraphSnapshot) {
    if (a.projectId !== b.projectId) return false;
    if (a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) return false;
    const nodeSigA = a.nodes
      .map((node) => `${node.nodeId}|${node.label}|${node.entityType}|${node.x}|${node.y}`)
      .sort()
      .join(";");
    const nodeSigB = b.nodes
      .map((node) => `${node.nodeId}|${node.label}|${node.entityType}|${node.x}|${node.y}`)
      .sort()
      .join(";");
    if (nodeSigA !== nodeSigB) return false;
    const edgeSigA = a.edges
      .map((edge) => `${edge.edgeId}|${edge.sourceNodeId}|${edge.targetNodeId}|${edge.label ?? ""}`)
      .sort()
      .join(";");
    const edgeSigB = b.edges
      .map((edge) => `${edge.edgeId}|${edge.sourceNodeId}|${edge.targetNodeId}|${edge.label ?? ""}`)
      .sort()
      .join(";");
    return edgeSigA === edgeSigB;
  }

  function recordHistory() {
    if (isApplyingHistoryRef.current) return;

    const snapshot = captureSnapshot();
    const last = pastSnapshotsRef.current[pastSnapshotsRef.current.length - 1];
    if (last && snapshotsEqual(last, snapshot)) return;

    const next = [...pastSnapshotsRef.current, snapshot];
    pastSnapshotsRef.current = next.length > 40 ? next.slice(next.length - 40) : next;
    futureSnapshotsRef.current = [];
    updateHistoryStats();
  }

  async function restoreSnapshot(snapshot: GraphSnapshot) {
    const targetProjectId = snapshot.projectId;
    if (targetProjectId !== effectiveProjectIdRef.current) return;

    const currentNodes = await listGraphNodes(targetProjectId);
    const currentEdges = await listGraphEdges(targetProjectId);

    const snapshotNodeMap = new Map(snapshot.nodes.map((node) => [node.nodeId, node]));
    const snapshotEdgeMap = new Map(snapshot.edges.map((edge) => [edge.edgeId, edge]));
    const nodeIdsToDelete = currentNodes
      .filter((node) => !snapshotNodeMap.has(node.node_id))
      .map((node) => node.node_id);
    const edgeIdsToDelete = currentEdges
      .filter(
        (edge) =>
          !snapshotEdgeMap.has(edge.edge_id) ||
          nodeIdsToDelete.includes(edge.source_node_id) ||
          nodeIdsToDelete.includes(edge.target_node_id),
      )
      .map((edge) => edge.edge_id);

    if (edgeIdsToDelete.length > 0) {
      await deleteGraphEdges({ projectId: targetProjectId, edgeIds: edgeIdsToDelete });
    }

    if (nodeIdsToDelete.length > 0) {
      await deleteGraphNodes({ projectId: targetProjectId, nodeIds: nodeIdsToDelete });
    }

    const currentNodeMap = new Map(currentNodes.map((node) => [node.node_id, node]));
    const existingNodeIds = new Set(currentNodes.map((node) => node.node_id));

    for (const node of snapshot.nodes) {
      if (!existingNodeIds.has(node.nodeId)) {
        await createGraphNode({
          projectId: targetProjectId,
          nodeId: node.nodeId,
          label: node.label,
          entityType: node.entityType,
          position: { x: node.x, y: node.y },
        });
        continue;
      }

      const current = currentNodeMap.get(node.nodeId);
      if (!current) continue;

      if (current.label !== node.label || current.entity_type !== node.entityType) {
        await updateGraphNode({
          projectId: targetProjectId,
          nodeId: node.nodeId,
          label: node.label,
          entityType: node.entityType,
        });
      }

      if (current.position_x !== node.x || current.position_y !== node.y) {
        await updateGraphNodePosition({
          projectId: targetProjectId,
          nodeId: node.nodeId,
          position: { x: node.x, y: node.y },
        });
      }
    }

    const refreshedEdges = await listGraphEdges(targetProjectId);
    const currentEdgeMap = new Map(refreshedEdges.map((edge) => [edge.edge_id, edge]));

    for (const edge of snapshot.edges) {
      const existing = currentEdgeMap.get(edge.edgeId);
      if (!existing) {
        await createGraphEdge({
          projectId: targetProjectId,
          edgeId: edge.edgeId,
          sourceNodeId: edge.sourceNodeId,
          targetNodeId: edge.targetNodeId,
          label: edge.label,
        });
        continue;
      }

      if (existing.label !== edge.label) {
        await updateGraphEdge({
          projectId: targetProjectId,
          edgeId: edge.edgeId,
          label: edge.label,
        });
      }
    }

    setSelectedNodeIds([]);
    setSelectedEdgeIds([]);
    clearSelection();
    setShortestPathNodeIds([]);
    setShortestPathEdgeIds([]);
    await nodesQuery.refetch();
    await edgesQuery.refetch();
  }

  async function handleUndo() {
    if (pastSnapshotsRef.current.length === 0) return;

    const current = captureSnapshot();
    const target = pastSnapshotsRef.current[pastSnapshotsRef.current.length - 1];
    pastSnapshotsRef.current = pastSnapshotsRef.current.slice(0, -1);
    futureSnapshotsRef.current = [...futureSnapshotsRef.current, current];
    updateHistoryStats();

    try {
      isApplyingHistoryRef.current = true;
      await restoreSnapshot(target);
      setStatusMessage("Undo applied.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Undo failed.");
    } finally {
      isApplyingHistoryRef.current = false;
    }
  }

  async function handleRedo() {
    if (futureSnapshotsRef.current.length === 0) return;

    const current = captureSnapshot();
    const target = futureSnapshotsRef.current[futureSnapshotsRef.current.length - 1];
    futureSnapshotsRef.current = futureSnapshotsRef.current.slice(0, -1);
    pastSnapshotsRef.current = [...pastSnapshotsRef.current, current];
    updateHistoryStats();

    try {
      isApplyingHistoryRef.current = true;
      await restoreSnapshot(target);
      setStatusMessage("Redo applied.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Redo failed.");
    } finally {
      isApplyingHistoryRef.current = false;
    }
  }

  function selectSingleNode(nodeId: string) {
    setSelectedNodeId(nodeId);
    setSelectedNodeIds([nodeId]);
    setSelectedEdgeId(null);
    setSelectedEdgeIds([]);
  }

  function toggleNodeSelection(nodeId: string) {
    setSelectedEdgeId(null);
    setSelectedEdgeIds([]);
    setSelectedNodeIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      const values = [...next];
      setSelectedNodeId(values[values.length - 1] ?? null);
      return values;
    });
  }

  function selectSingleEdge(edgeId: string) {
    setSelectedEdgeId(edgeId);
    setSelectedEdgeIds([edgeId]);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
  }

  function toggleEdgeSelection(edgeId: string) {
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeIds((current) => {
      const next = new Set(current);
      if (next.has(edgeId)) {
        next.delete(edgeId);
      } else {
        next.add(edgeId);
      }
      const values = [...next];
      setSelectedEdgeId(values[values.length - 1] ?? null);
      return values;
    });
  }

  const selectedNodeNeighborIds = useMemo(() => {
    if (focusMode !== "selection" || activeSelectedNodeIds.length === 0) return EMPTY_STRING_SET;

    const seedSet = new Set(activeSelectedNodeIds);
    const neighbors = new Set<string>(activeSelectedNodeIds);
    for (const edge of edges) {
      if (seedSet.has(edge.source_node_id)) neighbors.add(edge.target_node_id);
      if (seedSet.has(edge.target_node_id)) neighbors.add(edge.source_node_id);
    }
    return neighbors;
  }, [activeSelectedNodeIds, edges, focusMode]);

  const selectedNodeRelations = useMemo(() => {
    if (!selectedNodeId) return [];

    const relations = edges
      .filter(
        (edge) =>
          edge.source_node_id === selectedNodeId || edge.target_node_id === selectedNodeId,
      )
      .map((edge) => {
        const incoming = edge.target_node_id === selectedNodeId;
        const otherNodeId = incoming ? edge.source_node_id : edge.target_node_id;
        return {
          edgeId: edge.edge_id,
          otherNodeId,
          otherLabel: findNodeLabel(nodes, otherNodeId),
          label: edge.label ?? "unlabeled",
          direction: incoming ? "in" : "out",
        };
      })
      .sort((a, b) => a.otherLabel.localeCompare(b.otherLabel));

    return relations;
  }, [edges, nodes, selectedNodeId]);

  const egoNodeIdSet = useMemo(() => {
    if (!egoCenterNodeId) return null;
    const maxDepth = clamp(Math.round(egoDepth), 1, 4);
    const adjacency = new Map<string, string[]>();

    for (const edge of edges) {
      if (!adjacency.has(edge.source_node_id)) adjacency.set(edge.source_node_id, []);
      if (!adjacency.has(edge.target_node_id)) adjacency.set(edge.target_node_id, []);
      adjacency.get(edge.source_node_id)?.push(edge.target_node_id);
      adjacency.get(edge.target_node_id)?.push(edge.source_node_id);
    }

    const visited = new Set<string>([egoCenterNodeId]);
    const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: egoCenterNodeId, depth: 0 }];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      if (current.depth >= maxDepth) continue;

      for (const nextNodeId of adjacency.get(current.nodeId) ?? []) {
        if (visited.has(nextNodeId)) continue;
        visited.add(nextNodeId);
        queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
      }
    }
    return visited;
  }, [edges, egoCenterNodeId, egoDepth]);

  const filteredNodes = useMemo(() => {
    const query = nodeSearch.trim().toLowerCase();

    return visualNodes.filter((node) => {
      if (!entityTypeFilters[node.entity_type]) return false;
      if (focusMode === "selection" && selectedNodeNeighborIds.size > 0 && !selectedNodeNeighborIds.has(node.node_id)) {
        return false;
      }
      if (egoNodeIdSet && !egoNodeIdSet.has(node.node_id)) return false;
      if (query && !node.label.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [
    egoNodeIdSet,
    entityTypeFilters,
    focusMode,
    nodeSearch,
    selectedNodeNeighborIds,
    visualNodes,
  ]);

  const visibleNodeIds = useMemo(
    () => new Set(filteredNodes.map((node) => node.node_id)),
    [filteredNodes],
  );

  const filteredEdges = useMemo(
    () =>
      edges.filter(
        (edge) =>
          visibleNodeIds.has(edge.source_node_id) && visibleNodeIds.has(edge.target_node_id),
      ),
    [edges, visibleNodeIds],
  );

  const nodeDegreeById = useMemo(() => {
    const degreeMap = new Map<string, number>();
    for (const node of filteredNodes) {
      degreeMap.set(node.node_id, 0);
    }
    for (const edge of filteredEdges) {
      degreeMap.set(edge.source_node_id, (degreeMap.get(edge.source_node_id) ?? 0) + 1);
      degreeMap.set(edge.target_node_id, (degreeMap.get(edge.target_node_id) ?? 0) + 1);
    }
    return degreeMap;
  }, [filteredEdges, filteredNodes]);

  const renderedFilteredNodes = useMemo(
    () => filteredNodes,
    [filteredNodes],
  );

  const visibleNodeLookup = useMemo(
    () =>
      new Map(
        renderedFilteredNodes.map((node) => [
          node.node_id,
          {
            ...node,
            centerX: node.position.x + NODE_WIDTH / 2,
            centerY: node.position.y + NODE_HEIGHT / 2,
          },
        ]),
      ),
    [renderedFilteredNodes],
  );

  const visibleNodePositionMap = useMemo(
    () => new Map(renderedFilteredNodes.map((node) => [node.node_id, node.position])),
    [renderedFilteredNodes],
  );

  const selectedNodeDisplayPosition = useMemo(() => {
    if (!selectedNode || isInsightMode) return null;
    return visibleNodePositionMap.get(selectedNode.node_id) ?? selectedNode.position;
  }, [isInsightMode, selectedNode, visibleNodePositionMap]);

  const hoveredEdgeDragTargetNodeId = useMemo(() => {
    if (!edgeDragState || !pointerWorld) return null;
    const targetNode = findNodeAtWorldPoint(renderedFilteredNodes, pointerWorld);
    if (!targetNode || targetNode.node_id === edgeDragState.sourceNodeId) return null;
    return targetNode.node_id;
  }, [edgeDragState, renderedFilteredNodes, pointerWorld]);

  const hoveredConnectTargetNodeId = useMemo(() => {
    if (!connectSourceId || !pointerWorld) return null;
    const targetNode = findNodeAtWorldPoint(renderedFilteredNodes, pointerWorld);
    if (!targetNode || targetNode.node_id === connectSourceId) return null;
    return targetNode.node_id;
  }, [connectSourceId, renderedFilteredNodes, pointerWorld]);

  const insightGraphData = useMemo(() => {
    const nodesData: InsightNode[] = filteredNodes.map((node) => {
      const degree = nodeDegreeById.get(node.node_id) ?? 0;
      return {
        id: node.node_id,
        label: node.label,
        entityType: node.entity_type,
        color: INSIGHT_NODE_COLORS[node.entity_type],
        val: clamp(2 + degree * 0.75, 2, 8),
      };
    });

    const linksData: InsightLink[] = filteredEdges.map((edge) => ({
      id: edge.edge_id,
      source: edge.source_node_id,
      target: edge.target_node_id,
      label: edge.label,
    }));

    return { nodes: nodesData, links: linksData };
  }, [filteredEdges, filteredNodes, nodeDegreeById]);

  const graphMetrics = useMemo(() => {
    const typeCounts = {
      person: 0,
      organisation: 0,
      location: 0,
      event: 0,
    } satisfies Record<GraphEntityType, number>;

    for (const node of filteredNodes) {
      typeCounts[node.entity_type] += 1;
    }

    const labeledEdges = filteredEdges.filter((edge) => Boolean(edge.label?.trim())).length;
    const edgeDensity =
      filteredNodes.length > 1
        ? filteredEdges.length / ((filteredNodes.length * (filteredNodes.length - 1)) / 2)
        : 0;

    return {
      typeCounts,
      labeledEdges,
      edgeDensity,
    };
  }, [filteredEdges, filteredNodes]);

  useEffect(() => {
    if (!selectedNodeId || nodes.some((node) => node.node_id === selectedNodeId)) return;
    setSelectedNodeId(null);
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    setSelectedNodeIds((current) =>
      current.filter((nodeId) => nodes.some((node) => node.node_id === nodeId)),
    );
  }, [nodes]);

  useEffect(() => {
    if (!selectedEdgeId || edges.some((edge) => edge.edge_id === selectedEdgeId)) return;
    setSelectedEdgeId(null);
  }, [edges, selectedEdgeId]);

  useEffect(() => {
    setSelectedEdgeIds((current) =>
      current.filter((edgeId) => edges.some((edge) => edge.edge_id === edgeId)),
    );
  }, [edges]);

  useEffect(() => {
    setShortestPathNodeIds((current) =>
      current.filter((nodeId) => nodes.some((node) => node.node_id === nodeId)),
    );
  }, [nodes]);

  useEffect(() => {
    setShortestPathEdgeIds((current) =>
      current.filter((edgeId) => edges.some((edge) => edge.edge_id === edgeId)),
    );
  }, [edges]);

  useEffect(() => {
    if (pathFromNodeId && !nodes.some((node) => node.node_id === pathFromNodeId)) {
      setPathFromNodeId(null);
    }
    if (pathToNodeId && !nodes.some((node) => node.node_id === pathToNodeId)) {
      setPathToNodeId(null);
    }
  }, [nodes, pathFromNodeId, pathToNodeId]);

  useEffect(() => {
    if (egoCenterNodeId && !nodes.some((node) => node.node_id === egoCenterNodeId)) {
      setEgoCenterNodeId(null);
    }
  }, [egoCenterNodeId, nodes]);

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
    if (isConstructMode) return;
    setPlaceMode(false);
    setConnectSourceId(null);
    edgeDragStateRef.current = null;
    setEdgeDragState(null);
  }, [isConstructMode]);

  useEffect(() => {
    if (selectedNodeId && !visibleNodeIds.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, visibleNodeIds]);

  useEffect(() => {
    setSelectedNodeIds((current) => current.filter((nodeId) => visibleNodeIds.has(nodeId)));
  }, [visibleNodeIds]);

  useEffect(() => {
    if (selectedEdgeId && !filteredEdges.some((edge) => edge.edge_id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [filteredEdges, selectedEdgeId]);

  useEffect(() => {
    const visibleEdgeIdSet = new Set(filteredEdges.map((edge) => edge.edge_id));
    setSelectedEdgeIds((current) => current.filter((edgeId) => visibleEdgeIdSet.has(edgeId)));
    setShortestPathEdgeIds((current) => current.filter((edgeId) => visibleEdgeIdSet.has(edgeId)));
    setShortestPathNodeIds((current) => current.filter((nodeId) => visibleNodeIds.has(nodeId)));
  }, [filteredEdges, visibleNodeIds]);

  useEffect(() => {
    pastSnapshotsRef.current = [];
    futureSnapshotsRef.current = [];
    updateHistoryStats();
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setSelectedEdgeId(null);
    setSelectedEdgeIds([]);
    setPathFromNodeId(null);
    setPathToNodeId(null);
    setShortestPathNodeIds([]);
    setShortestPathEdgeIds([]);
    setEgoCenterNodeId(null);
    setEgoDepth(1);
    setInsightLayoutTick(0);
    insightNodePositionSeedRef.current = {};
  }, [effectiveProjectId]);

  function toggleEntityTypeFilter(type: GraphEntityType) {
    setEntityTypeFilters((current) => ({
      ...current,
      [type]: !current[type],
    }));
  }

  function fitVisibleGraph() {
    if (isInsightMode) {
      insightGraphRef.current?.zoomToFit(64);
      return;
    }
    const targetNodes = renderedFilteredNodes.length > 0 ? renderedFilteredNodes : visualNodes;
    setViewport(computeFitViewToNodes(targetNodes, viewportRef.current));
  }

  function centerViewportOnNode(nodeId: string) {
    if (isInsightMode) {
      insightGraphRef.current?.centerAt(nodeId, 2.25);
      return;
    }

    const nodePosition =
      visibleNodePositionMap.get(nodeId) ??
      visualNodes.find((item) => item.node_id === nodeId)?.position;
    const viewportElement = viewportRef.current;
    if (!nodePosition || !viewportElement) return;

    setViewport((current) => ({
      ...current,
      x: viewportElement.clientWidth / 2 - (nodePosition.x + NODE_WIDTH / 2) * current.scale,
      y: viewportElement.clientHeight / 2 - (nodePosition.y + NODE_HEIGHT / 2) * current.scale,
    }));
  }

  function handleUseSelectedForPath() {
    const ids = activeSelectedNodeIds;
    if (ids.length >= 1) {
      setPathFromNodeId(ids[0]);
    }
    if (ids.length >= 2) {
      setPathToNodeId(ids[1]);
    }
  }

  function handleApplyEgoFromSelection() {
    const ids = activeSelectedNodeIds;
    if (ids.length === 0) {
      setErrorMessage("Select at least one node to anchor an ego network.");
      return;
    }
    setErrorMessage(null);
    setEgoCenterNodeId(ids[0]);
    setStatusMessage(`Ego network centered on ${findNodeLabel(nodes, ids[0])}.`);
  }

  function handleClearEgoNetwork() {
    setEgoCenterNodeId(null);
    setEgoDepth(1);
  }

  function handleFindShortestPath() {
    if (!pathFromNodeId || !pathToNodeId) {
      setErrorMessage("Choose both start and end nodes to find a route.");
      return;
    }
    if (pathFromNodeId === pathToNodeId) {
      setShortestPathNodeIds([pathFromNodeId]);
      setShortestPathEdgeIds([]);
      setStatusMessage("Start and end are the same node.");
      return;
    }

    const adjacency = new Map<string, Array<{ nodeId: string; edgeId: string }>>();
    for (const edge of edges) {
      if (!adjacency.has(edge.source_node_id)) adjacency.set(edge.source_node_id, []);
      if (!adjacency.has(edge.target_node_id)) adjacency.set(edge.target_node_id, []);
      adjacency.get(edge.source_node_id)?.push({ nodeId: edge.target_node_id, edgeId: edge.edge_id });
      adjacency.get(edge.target_node_id)?.push({ nodeId: edge.source_node_id, edgeId: edge.edge_id });
    }

    const queue = [pathFromNodeId];
    const visited = new Set<string>([pathFromNodeId]);
    const previousByNode = new Map<string, { nodeId: string; edgeId: string }>();

    while (queue.length > 0) {
      const currentNodeId = queue.shift();
      if (!currentNodeId) continue;
      if (currentNodeId === pathToNodeId) break;

      for (const next of adjacency.get(currentNodeId) ?? []) {
        if (visited.has(next.nodeId)) continue;
        visited.add(next.nodeId);
        previousByNode.set(next.nodeId, { nodeId: currentNodeId, edgeId: next.edgeId });
        queue.push(next.nodeId);
      }
    }

    if (!previousByNode.has(pathToNodeId)) {
      setShortestPathNodeIds([]);
      setShortestPathEdgeIds([]);
      setErrorMessage("No path found between those nodes.");
      return;
    }

    const nodePath: string[] = [pathToNodeId];
    const edgePath: string[] = [];
    let cursor = pathToNodeId;
    while (cursor !== pathFromNodeId) {
      const previous = previousByNode.get(cursor);
      if (!previous) break;
      edgePath.push(previous.edgeId);
      nodePath.push(previous.nodeId);
      cursor = previous.nodeId;
    }

    const orderedNodePath = nodePath.reverse();
    const orderedEdgePath = edgePath.reverse();
    setShortestPathNodeIds(orderedNodePath);
    setShortestPathEdgeIds(orderedEdgePath);
    setSelectedNodeId(pathToNodeId);
    setSelectedNodeIds(orderedNodePath);
    setSelectedEdgeId(orderedEdgePath[orderedEdgePath.length - 1] ?? null);
    setSelectedEdgeIds(orderedEdgePath);
    setErrorMessage(null);
    setStatusMessage(`Route found: ${orderedNodePath.length - 1} hop${orderedNodePath.length - 1 === 1 ? "" : "s"}.`);
    centerViewportOnNode(pathToNodeId);
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      if (!isConstructMode) return;
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

    async function handlePointerUp(event: PointerEvent) {
      if (!isConstructMode) return;
      const dragState = dragStateRef.current;
      if (dragState && (graphMode === "standalone" || graphProjectId)) {
        dragStateRef.current = null;
        const finalPosition = dragPositionsRef.current[dragState.nodeId];

        if (finalPosition) {
          try {
            if (
              Math.round(finalPosition.x) !== Math.round(dragState.originX) ||
              Math.round(finalPosition.y) !== Math.round(dragState.originY)
            ) {
              recordHistory();
            }
            await updateGraphNodePosition({
              projectId: effectiveProjectId,
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
      
      const edgeDragState = edgeDragStateRef.current;
      if (!edgeDragState) return;

      edgeDragStateRef.current = null;
      setEdgeDragState(null);

      const viewportElement = viewportRef.current;
      if (!viewportElement) return;

      const worldPoint = clientToWorldPoint(
        viewportElement,
        event.clientX,
        event.clientY,
        viewportStateRef.current,
      );
      const targetNode = findNodeAtWorldPoint(visualNodesRef.current, worldPoint);

      if (!targetNode || targetNode.node_id === edgeDragState.sourceNodeId) return;
      if (graphModeRef.current === "project" && !graphProjectIdRef.current) return;

      const label = connectLabelRef.current.trim() || null;
      const duplicate = edgesRef.current.some(
        (edge) =>
          edge.source_node_id === edgeDragState.sourceNodeId &&
          edge.target_node_id === targetNode.node_id &&
          (edge.label ?? "") === (label ?? ""),
      );

      if (duplicate) {
        setErrorMessage("That connection already exists.");
        return;
      }

      try {
        setErrorMessage(null);
        setStatusMessage(null);
        recordHistory();

        await createGraphEdge({
          projectId: effectiveProjectIdRef.current,
          edgeId: crypto.randomUUID(),
          sourceNodeId: edgeDragState.sourceNodeId,
          targetNodeId: targetNode.node_id,
          label,
        });

        await edgesQuery.refetch();
        setConnectSourceId(null);
        setConnectLabel("");
        setSelectedEdgeId(null);
        setSelectedEdgeIds([]);
        setStatusMessage("Added connection.");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to add connection.");
      }

    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTextInputTarget = Boolean(
        target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName),
      );

      if (!isTextInputTarget && event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (isTextInputTarget) return;

      if (event.key === "Escape") {
        setPlaceMode(false);
        setConnectSourceId(null);
        edgeDragStateRef.current = null;
        setEdgeDragState(null);
        clearSelection();
        clearPathAnalysis();
        return;
      }

      if (
        isConstructMode &&
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        void handleUndo();
        return;
      }

      if (
        isConstructMode &&
        (
          ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "z") ||
          ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y")
        )
      ) {
        event.preventDefault();
        void handleRedo();
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        fitVisibleGraph();
        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        setViewport(DEFAULT_VIEW);
        return;
      }

      if (event.key.toLowerCase() === "g" && selectedNodeId) {
        event.preventDefault();
        centerViewportOnNode(selectedNodeId);
        return;
      }

      if (event.key !== "Backspace" && event.key !== "Delete") return;
      if (!isConstructMode) return;

      if (selectedNodeIds.length > 0) {
        event.preventDefault();
        void handleDeleteNodes(selectedNodeIds);
        return;
      }

      if (selectedEdgeIds.length > 0) {
        event.preventDefault();
        void handleDeleteEdges(selectedEdgeIds);
        return;
      }

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

    if (isConstructMode) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    }
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (isConstructMode) {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      }
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    graphMode,
    graphProjectId,
    effectiveProjectId,
    nodesQuery,
    selectedEdgeId,
    selectedEdgeIds,
    selectedNodeId,
    selectedNodeIds,
    isConstructMode,
  ]);

  async function handleCreateNode(position?: Point) {
    if (!ensureConstructMode("Node creation")) return;
    if ((graphMode === "project" && !graphProjectId) || !createLabel.trim()) return;

    try {
      setErrorMessage(null);
      setStatusMessage(null);
      recordHistory();

      await createGraphNode({
        projectId: effectiveProjectId,
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
    if (!ensureConstructMode("Connection creation")) return;
    if (graphMode === "project" && !graphProjectId) return;
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
      recordHistory();

      await createGraphEdge({
        projectId: effectiveProjectId,
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
    if (!ensureConstructMode("Node editing")) return;
    if ((graphMode === "project" && !graphProjectId) || !selectedNode || !nodeDraftLabel.trim()) return;

    try {
      setErrorMessage(null);
      setStatusMessage(null);
      recordHistory();

      await updateGraphNode({
        projectId: effectiveProjectId,
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
    if (!ensureConstructMode("Connection editing")) return;
    if ((graphMode === "project" && !graphProjectId) || !selectedEdge) return;

    try {
      setErrorMessage(null);
      setStatusMessage(null);
      recordHistory();

      await updateGraphEdge({
        projectId: effectiveProjectId,
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
    await handleDeleteNodes([nodeId]);
  }

  async function handleDeleteNodes(nodeIds: string[]) {
    if (!ensureConstructMode("Node deletion")) return;
    if (graphMode === "project" && !graphProjectId) return;
    if (nodeIds.length === 0) return;

    try {
      setErrorMessage(null);
      setStatusMessage(null);
      recordHistory();

      const nodeIdSet = new Set(nodeIds);

      const relatedEdgeIds = edges
        .filter(
          (edge) => nodeIdSet.has(edge.source_node_id) || nodeIdSet.has(edge.target_node_id),
        )
        .map((edge) => edge.edge_id);

      if (relatedEdgeIds.length > 0) {
        await deleteGraphEdges({ projectId: effectiveProjectId, edgeIds: relatedEdgeIds });
      }

      await deleteGraphNodes({ projectId: effectiveProjectId, nodeIds });
      await nodesQuery.refetch();
      await edgesQuery.refetch();
      clearSelection();
      setConnectSourceId((current) => (current && nodeIdSet.has(current) ? null : current));
      setStatusMessage(
        nodeIds.length === 1 ? "Deleted node." : `Deleted ${nodeIds.length} nodes.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete node.");
    }
  }

  async function handleDeleteEdge(edgeId: string) {
    await handleDeleteEdges([edgeId]);
  }

  async function handleDeleteEdges(edgeIds: string[]) {
    if (!ensureConstructMode("Connection deletion")) return;
    if (graphMode === "project" && !graphProjectId) return;
    if (edgeIds.length === 0) return;

    try {
      setErrorMessage(null);
      setStatusMessage(null);
      recordHistory();

      await deleteGraphEdges({ projectId: effectiveProjectId, edgeIds });
      await edgesQuery.refetch();
      setSelectedEdgeId(null);
      const edgeIdSet = new Set(edgeIds);
      setSelectedEdgeIds((current) => current.filter((candidate) => !edgeIdSet.has(candidate)));
      setStatusMessage(
        edgeIds.length === 1 ? "Deleted connection." : `Deleted ${edgeIds.length} connections.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete connection.");
    }
  }

  async function handleTidyLayout() {
    if (!ensureConstructMode("Layout editing")) return;
    if ((graphMode === "project" && !graphProjectId) || visualNodes.length === 0) return;

    try {
      setErrorMessage(null);
      setStatusMessage(null);
      recordHistory();

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
            projectId: effectiveProjectId,
            nodeId: node.node_id,
            position: getNextNodePosition(index),
          }),
        ),
      );

      await nodesQuery.refetch();
      setViewport(
        computeFitViewToNodes(
          visualNodes.map((node, index) => ({
            ...node,
            position: getNextNodePosition(index),
          })),
          viewportRef.current,
        ),
      );
      setStatusMessage("Applied tidy layout.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to tidy layout.");
    }
  }

  // Auto-generate graph from project signals using entity extraction
  async function handleAutoGenerateFromProject() {
    if (graphMode !== "project" || !graphProjectId) return;
    
    const projectSignals = projectSignalsQuery.data;
    if (!projectSignals || projectSignals.length === 0) {
      setErrorMessage("No signals in this project to analyze.");
      return;
    }

    try {
      setIsAutoGenerating(true);
      setErrorMessage(null);
      setStatusMessage("Analyzing signals for entities...");

      // Extract entities from signal content using simple pattern matching
      // In a full implementation, this would call an NLP service or LLM
      const extractedEntities = extractEntitiesFromSignals(projectSignals);
      
      if (extractedEntities.length === 0) {
        setStatusMessage("No entities found in project signals.");
        setIsAutoGenerating(false);
        return;
      }

      recordHistory();

      // Create nodes for extracted entities
      const existingLabels = new Set(nodes.map(n => n.label.toLowerCase()));
      const newNodes: Array<{ label: string; type: GraphEntityType }> = [];
      
      for (const entity of extractedEntities) {
        if (!existingLabels.has(entity.label.toLowerCase())) {
          newNodes.push(entity);
          existingLabels.add(entity.label.toLowerCase());
        }
      }

      // Batch create nodes
      const nodePositions = calculateAutoLayoutPositions(newNodes.length, visualNodes.length);
      for (let i = 0; i < newNodes.length; i++) {
        const entity = newNodes[i];
        const nodeId = crypto.randomUUID();
        await createGraphNode({
          projectId: graphProjectId,
          nodeId,
          label: entity.label,
          entityType: entity.type,
          position: nodePositions[i],
        });
      }

      // Create edges based on co-occurrence in signals
      const edgesCreated = await createEdgesFromCooccurrence(projectSignals, graphProjectId);

      await nodesQuery.refetch();
      await edgesQuery.refetch();
      
      setStatusMessage(`Generated ${newNodes.length} nodes and ${edgesCreated} connections from project signals.`);
      setViewport(
        computeFitViewToNodes(
          [...visualNodes, ...newNodes.map((_, i) => ({ position: nodePositions[i] }))],
          viewportRef.current,
        ),
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to auto-generate graph.");
    } finally {
      setIsAutoGenerating(false);
    }
  }

  // Extract entities from signal content using pattern matching
  function extractEntitiesFromSignals(signals: ProjectSignal[]): Array<{ label: string; type: GraphEntityType }> {
    const entities: Array<{ label: string; type: GraphEntityType }> = [];
    const seen = new Set<string>();
    
    // Common entity patterns
    const patterns = {
      person: /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g,
      organisation: /\b([A-Z][a-z]*(?:\s+[A-Z][a-z]*)+(?:\s+(?:Inc|Ltd|LLC|Corp|Corporation|Company|Group|Fund|Capital|Partners))?\b)/g,
      location: /\b(?:in|at|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
    };
    
    for (const ps of signals) {
      const signalTitle = ps.intel_signals?.title ?? "";
      const signalSnippet = ps.intel_signals?.snippet ?? "";
      const content = `${signalTitle} ${signalSnippet}`.trim();
      if (!content) continue;
      
      // Extract people (capitalized names)
      patterns.person.lastIndex = 0;
      let match;
      while ((match = patterns.person.exec(content)) !== null) {
        const name = match[1];
        if (name.length > 3 && !seen.has(name.toLowerCase())) {
          seen.add(name.toLowerCase());
          entities.push({ label: name, type: "person" });
        }
      }
      
      // Extract organizations
      patterns.organisation.lastIndex = 0;
      while ((match = patterns.organisation.exec(content)) !== null) {
        const org = match[1];
        if (org.length > 3 && !seen.has(org.toLowerCase()) && !entities.find(e => e.label === org)) {
          seen.add(org.toLowerCase());
          entities.push({ label: org, type: "organisation" });
        }
      }

      // Extract locations
      patterns.location.lastIndex = 0;
      while ((match = patterns.location.exec(content)) !== null) {
        const location = match[1].trim();
        if (location.length > 2 && !seen.has(location.toLowerCase())) {
          seen.add(location.toLowerCase());
          entities.push({ label: location, type: "location" });
        }
      }
    }
    
    return entities.slice(0, 20); // Limit to 20 entities
  }

  // Calculate positions for auto-layout
  function calculateAutoLayoutPositions(count: number, existingCount: number): Point[] {
    const positions: Point[] = [];
    const startX = 100 + (existingCount % 5) * 240;
    const startY = 100 + Math.floor(existingCount / 5) * 156;
    
    for (let i = 0; i < count; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      positions.push({
        x: clamp(startX + col * 240, WORLD_MARGIN, WORLD_WIDTH - NODE_WIDTH - WORLD_MARGIN),
        y: clamp(startY + row * 156, WORLD_MARGIN, WORLD_HEIGHT - NODE_HEIGHT - WORLD_MARGIN),
      });
    }
    return positions;
  }

  // Create edges based on entity co-occurrence in signals
  async function createEdgesFromCooccurrence(
    signals: ProjectSignal[],
    projectId: number
  ): Promise<number> {
    // Get all nodes including newly created ones
    const allNodes = await listGraphNodes(projectId);
    const allEdges = await listGraphEdges(projectId);
    let edgeCount = 0;
    const seenEdgePairs = new Set(
      allEdges.map((edge) => canonicalEdgePair(edge.source_node_id, edge.target_node_id)),
    );
    
    // For each signal, find entities that appear together and create edges
    for (const ps of signals) {
      const signalTitle = ps.intel_signals?.title ?? "";
      const signalSnippet = ps.intel_signals?.snippet ?? "";
      const content = `${signalTitle} ${signalSnippet}`.toLowerCase().trim();
      if (!content) continue;
      
      // Find which entities appear in this signal
      const entitiesInSignal = allNodes.filter(n => 
        content.includes(n.label.toLowerCase())
      );
      
      // Create edges between co-occurring entities
      for (let i = 0; i < entitiesInSignal.length; i++) {
        for (let j = i + 1; j < entitiesInSignal.length; j++) {
          const source = entitiesInSignal[i];
          const target = entitiesInSignal[j];
          
          const edgePair = canonicalEdgePair(source.node_id, target.node_id);
          
          if (!seenEdgePairs.has(edgePair)) {
            await createGraphEdge({
              projectId,
              edgeId: crypto.randomUUID(),
              sourceNodeId: source.node_id,
              targetNodeId: target.node_id,
              label: "mentioned together",
            });
            seenEdgePairs.add(edgePair);
            edgeCount++;
          }
        }
      }
    }
    
    return edgeCount;
  }

  function handleCanvasPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("[data-graph-interactive='true']")) return;
    event.preventDefault();

    clearSelection();

    const viewportElement = viewportRef.current;
    if (!viewportElement) return;

    const worldPoint = clientToWorldPoint(
      viewportElement,
      event.clientX,
      event.clientY,
      viewportStateRef.current,
    );

    if (isConstructMode && placeMode) {
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
      <Card className="transition-all duration-300 hover:border-[var(--accent)]/10 hover:shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
        <CardHeader>
          <CardTitle className="tracking-tight">Graph controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Graph Mode Selector */}
          <div className="relative grid grid-cols-2 gap-1 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/35 p-1.5">
            <div
              className="absolute top-1.5 bottom-1.5 rounded-xl bg-[var(--surface-strong)] shadow-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width: "calc(50% - 6px)",
                left: graphMode === "standalone" ? "6px" : "calc(50%)",
              }}
            />
            <button
              type="button"
              onClick={() => {
                setGraphMode("standalone");
                setInteractionMode("construct");
                setGraphProjectId(null);
                clearSelection();
                clearPathAnalysis();
                handleClearEgoNetwork();
                setConnectSourceId(null);
              }}
              className={`relative z-10 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                graphMode === "standalone"
                  ? "text-[var(--foreground)]"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <GitBranch className="h-4 w-4" />
              Manual
            </button>
            <button
              type="button"
              onClick={() => {
                setGraphMode("project");
                setInteractionMode("insight");
                if (projects && projects.length > 0 && !graphProjectId) {
                  setGraphProjectId(projects[0].id);
                }
                clearSelection();
                clearPathAnalysis();
                handleClearEgoNetwork();
                setConnectSourceId(null);
              }}
              className={`relative z-10 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                graphMode === "project"
                  ? "text-[var(--foreground)]"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <FolderKanban className="h-4 w-4" />
              Project
            </button>
          </div>

          <div className="grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
            {/* Project Selector (only in project mode) */}
            {graphMode === "project" && (
              <div className="grid gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <select
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm transition focus:border-[var(--accent)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                  value={graphProjectId ?? ""}
                  onChange={(event) => setGraphProjectId(Number(event.target.value))}
                  disabled={!projects || projects.length === 0}
                >
                  {!projects || projects.length === 0 ? (
                    <option value="">No projects available</option>
                  ) : (
                    projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))
                  )}
                </select>

                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/35 p-3 text-xs leading-5 text-[var(--foreground-muted)] backdrop-blur-sm">
                  Active project:{" "}
                  <span className="font-medium text-[var(--foreground)]">
                    {selectedProject?.name ?? "none"}
                  </span>
                </div>
                
                {/* Auto-generate from project signals */}
                <Button
                  variant="secondary"
                  onClick={() => void handleAutoGenerateFromProject()}
                  disabled={isAutoGenerating || !graphProjectId || (projectSignalsQuery.data?.length ?? 0) === 0}
                  className="w-full transition-all duration-200 active:scale-[0.98]"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {isAutoGenerating ? "Analyzing..." : "Auto-generate from signals"}
                </Button>
                
                {projectSignalsQuery.data && projectSignalsQuery.data.length > 0 && (
                  <p className="text-xs text-[var(--foreground-muted)]">
                    {projectSignalsQuery.data.length} signal{projectSignalsQuery.data.length !== 1 ? 's' : ''} available for analysis
                  </p>
                )}
              </div>
            )}

            {/* Standalone mode indicator */}
            {graphMode === "standalone" && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/35 p-3 text-xs leading-5 text-[var(--foreground-muted)] backdrop-blur-sm">
                <span className="font-medium text-[var(--accent)]">Standalone mode:</span>{" "}
                Build a free-form graph not tied to any project.
              </div>
            )}
          </div>

          <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/45 p-4 backdrop-blur-sm transition-all duration-300 hover:border-[var(--accent)]/10">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-[var(--foreground)]">Interaction mode</p>
              <Badge variant={isConstructMode ? "accent" : "neutral"} className="transition-all duration-300">
                {isConstructMode ? "Construct" : "Insight"}
              </Badge>
            </div>
            <div className="relative grid grid-cols-2 gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)]/30 p-1">
              <div
                className="absolute top-1 bottom-1 rounded-lg bg-[var(--surface-strong)] shadow-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{
                  width: "calc(50% - 4px)",
                  left: interactionMode === "insight" ? "4px" : "calc(50%)",
                }}
              />
              <button
                type="button"
                className={`relative z-10 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                  interactionMode === "insight"
                    ? "text-[var(--foreground)]"
                    : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => setInteractionMode("insight")}
              >
                Insight view
              </button>
              <button
                type="button"
                className={`relative z-10 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                  interactionMode === "construct"
                    ? "text-[var(--foreground)]"
                    : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                }`}
                onClick={() => setInteractionMode("construct")}
              >
                Construct
              </button>
            </div>
            <p className="text-xs text-[var(--foreground-muted)] transition-opacity duration-300">
              {interactionMode === "insight"
                ? "Insight keeps the graph read-first, like an investigation map."
                : "Construct enables manual add/edit/delete and connector workflows."}
            </p>
          </div>

          <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/45 p-4 backdrop-blur-sm transition-all duration-300 hover:border-[var(--accent)]/10">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-[var(--foreground)]">Explore graph</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={focusMode === "selection" ? "primary" : "secondary"}
                  onClick={() =>
                    setFocusMode((current) =>
                      current === "selection" ? "all" : "selection",
                    )
                  }
                  disabled={activeSelectedNodeIds.length === 0}
                  className="transition-all duration-200 active:scale-[0.98]"
                >
                  {focusMode === "selection" ? "Selection focus" : "Focus selection"}
                </Button>
                <Button size="sm" variant="secondary" onClick={fitVisibleGraph} className="transition-all duration-200 active:scale-[0.98]">
                  Fit visible
                </Button>
              </div>
            </div>
            <Input
              ref={searchInputRef}
              placeholder="Search nodes (/)"
              value={nodeSearch}
              onChange={(event) => setNodeSearch(event.target.value)}
              className="transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/20"
            />
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ENTITY_STYLES) as GraphEntityType[]).map((type) => (
                <Button
                  key={type}
                  size="sm"
                  variant={entityTypeFilters[type] ? "primary" : "secondary"}
                  onClick={() => toggleEntityTypeFilter(type)}
                  className="capitalize transition-all duration-200 active:scale-[0.96]"
                >
                  {type}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={showEdgeLabels ? "primary" : "secondary"}
                onClick={() => setShowEdgeLabels((current) => !current)}
                className="transition-all duration-200 active:scale-[0.98]"
              >
                {showEdgeLabels ? "Hide edge labels" : "Show edge labels"}
              </Button>
              <Button
                size="sm"
                variant={showMinimap ? "primary" : "secondary"}
                onClick={() => setShowMinimap((current) => !current)}
                className="transition-all duration-200 active:scale-[0.98]"
              >
                {showMinimap ? "Hide minimap" : "Show minimap"}
              </Button>
            </div>
          </div>

          {/* Insight layout panel with smooth expand/collapse */}
          <div
            className="grid grid-rows-[1fr] transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ gridTemplateRows: isInsightMode ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
              <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/45 p-4 backdrop-blur-sm transition-all duration-300 hover:border-[var(--accent)]/10">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--foreground)]">Insight layout</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={insightAutoLayout ? "primary" : "secondary"}
                      onClick={() => setInsightAutoLayout((current) => !current)}
                      className="transition-all duration-200 active:scale-[0.98]"
                    >
                      {insightAutoLayout ? "Live physics" : "Physics paused"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setInsightLayoutTick((current) => current + 1)}
                      className="transition-all duration-200 active:scale-[0.98]"
                    >
                      Reflow now
                    </Button>
                  </div>
                </div>
                <label className="grid gap-1.5 text-xs text-[var(--foreground-muted)]">
                  Spread ({insightRepulsion.toFixed(2)})
                  <input
                    type="range"
                    min={0.8}
                    max={3.2}
                    step={0.05}
                    value={insightRepulsion}
                    onChange={(event) => setInsightRepulsion(Number(event.target.value))}
                    className="accent-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-[var(--foreground-muted)]">
                  Link distance ({Math.round(insightLinkDistance)})
                  <input
                    type="range"
                    min={140}
                    max={520}
                    step={10}
                    value={insightLinkDistance}
                    onChange={(event) => setInsightLinkDistance(Number(event.target.value))}
                    className="accent-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-[var(--foreground-muted)]">
                  Center pull ({insightCenterPull.toFixed(2)})
                  <input
                    type="range"
                    min={0.01}
                    max={0.2}
                    step={0.01}
                    value={insightCenterPull}
                    onChange={(event) => setInsightCenterPull(Number(event.target.value))}
                    className="accent-[var(--accent)]"
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-[var(--foreground-muted)]">
                  Label density
                  <select
                    className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-2 text-sm text-[var(--foreground)] transition focus:border-[var(--accent)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                    value={insightLabelMode}
                    onChange={(event) =>
                      setInsightLabelMode(event.target.value as "context" | "selected" | "all")
                    }
                  >
                    <option value="context">Contextual</option>
                    <option value="selected">Only selected/hovered</option>
                    <option value="all">Show all labels</option>
                  </select>
                </label>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Hover a node to emphasize its local neighborhood.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/45 p-4 backdrop-blur-sm transition-all duration-300 hover:border-[var(--accent)]/10">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-[var(--foreground)]">Selection tools</p>
              <Badge variant="neutral" className="transition-all duration-300">
                {selectedNodeIds.length} nodes / {selectedEdgeIds.length} edges
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={clearSelection}
                disabled={selectedNodeIds.length === 0 && selectedEdgeIds.length === 0}
                className="transition-all duration-200 active:scale-[0.98]"
              >
                Clear selection
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void handleDeleteNodes(selectedNodeIds)}
                disabled={!isConstructMode || selectedNodeIds.length === 0}
                className="transition-all duration-200 active:scale-[0.98]"
              >
                <Trash2 className="h-4 w-4" />
                Delete nodes
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void handleDeleteEdges(selectedEdgeIds)}
                disabled={!isConstructMode || selectedEdgeIds.length === 0}
                className="transition-all duration-200 active:scale-[0.98]"
              >
                <Trash2 className="h-4 w-4" />
                Delete edges
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleUndo()}
                disabled={!isConstructMode || historyStats.undoCount === 0}
                className="transition-all duration-200 active:scale-[0.98]"
              >
                <Undo2 className="h-4 w-4" />
                Undo
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleRedo()}
                disabled={!isConstructMode || historyStats.redoCount === 0}
                className="transition-all duration-200 active:scale-[0.98]"
              >
                <Redo2 className="h-4 w-4" />
                Redo
              </Button>
              <Badge variant="neutral" className="transition-all duration-300">
                {historyStats.undoCount} undo / {historyStats.redoCount} redo
              </Badge>
            </div>
          </div>

          <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/45 p-4 backdrop-blur-sm transition-all duration-300 hover:border-[var(--accent)]/10">
            <p className="text-sm font-medium text-[var(--foreground)]">Analysis tools</p>
            <div className="grid gap-2">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--foreground-muted)]">
                Shortest path
              </p>
              <select
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm transition focus:border-[var(--accent)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                value={pathFromNodeId ?? ""}
                onChange={(event) => setPathFromNodeId(event.target.value || null)}
              >
                <option value="">From node</option>
                {visualNodes.map((node) => (
                  <option key={`path-from-${node.node_id}`} value={node.node_id}>
                    {node.label}
                  </option>
                ))}
              </select>
              <select
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm transition focus:border-[var(--accent)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                value={pathToNodeId ?? ""}
                onChange={(event) => setPathToNodeId(event.target.value || null)}
              >
                <option value="">To node</option>
                {visualNodes.map((node) => (
                  <option key={`path-to-${node.node_id}`} value={node.node_id}>
                    {node.label}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={handleUseSelectedForPath} className="transition-all duration-200 active:scale-[0.98]">
                  <Route className="h-4 w-4" />
                  Use selection
                </Button>
                <Button
                  size="sm"
                  onClick={handleFindShortestPath}
                  disabled={!pathFromNodeId || !pathToNodeId}
                  className="transition-all duration-200 active:scale-[0.98]"
                >
                  <Route className="h-4 w-4" />
                  Find route
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearPathAnalysis}
                  disabled={shortestPathNodeIds.length === 0}
                  className="transition-all duration-200 active:scale-[0.98]"
                >
                  Clear route
                </Button>
              </div>
            </div>
            <div className="grid gap-2">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--foreground-muted)]">
                Ego network
              </p>
              <select
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm transition focus:border-[var(--accent)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
                value={egoCenterNodeId ?? ""}
                onChange={(event) => setEgoCenterNodeId(event.target.value || null)}
              >
                <option value="">Center node</option>
                {visualNodes.map((node) => (
                  <option key={`ego-${node.node_id}`} value={node.node_id}>
                    {node.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={4}
                  value={egoDepth}
                  onChange={(event) => setEgoDepth(clamp(Number(event.target.value) || 1, 1, 4))}
                  className="transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/20"
                />
                <span className="text-xs text-[var(--foreground-muted)]">Depth 1-4 hops</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={handleApplyEgoFromSelection} className="transition-all duration-200 active:scale-[0.98]">
                  <Orbit className="h-4 w-4" />
                  Use selection
                </Button>
                <Button size="sm" variant="ghost" onClick={handleClearEgoNetwork} disabled={!egoCenterNodeId} className="transition-all duration-200 active:scale-[0.98]">
                  Clear ego
                </Button>
              </div>
            </div>
          </div>

          {/* Construct mode panels with smooth cross-fade */}
          <div className="relative">
            {isConstructMode ? (
              <div className="grid gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/45 p-4 backdrop-blur-sm transition-all duration-300 hover:border-[var(--accent)]/10">
                  <p className="text-sm font-medium text-[var(--foreground)]">Create node</p>
                  <Input
                    placeholder="Node label"
                    value={createLabel}
                    onChange={(event) => setCreateLabel(event.target.value)}
                    className="transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                  <select
                    className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm transition focus:border-[var(--accent)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
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
                      disabled={(graphMode === "project" && !graphProjectId) || !createLabel.trim()}
                      className="transition-all duration-200 active:scale-[0.98]"
                    >
                      Add now
                    </Button>
                    <Button
                      variant={placeMode ? "primary" : "secondary"}
                      onClick={() => setPlaceMode((current) => !current)}
                      disabled={(graphMode === "project" && !graphProjectId) || !createLabel.trim()}
                      className="transition-all duration-200 active:scale-[0.98]"
                    >
                      <Crosshair className="h-4 w-4" />
                      {placeMode ? "Cancel placement" : "Place on canvas"}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/45 p-4 backdrop-blur-sm transition-all duration-300 hover:border-[var(--accent)]/10">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[var(--foreground)]">Connection mode</p>
                    {connectSourceId ? (
                      <Badge variant="accent" className="animate-in fade-in zoom-in duration-200">
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
                    className="transition focus:border-[var(--accent)]/50 focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (!selectedNode && activeSelectedNodeIds.length === 0) return;
                        const sourceNodeId = selectedNode?.node_id ?? activeSelectedNodeIds[0];
                        if (!sourceNodeId) return;
                        setConnectSourceId(sourceNodeId);
                        setSelectedEdgeId(null);
                        setSelectedEdgeIds([]);
                        setStatusMessage(`Select a target for ${findNodeLabel(nodes, sourceNodeId)}.`);
                      }}
                      disabled={!selectedNode && activeSelectedNodeIds.length === 0}
                      className="transition-all duration-200 active:scale-[0.98]"
                    >
                      <Link2 className="h-4 w-4" />
                      Link from selected node
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setConnectSourceId(null)}
                      disabled={!connectSourceId}
                      className="transition-all duration-200 active:scale-[0.98]"
                    >
                      <Unlink className="h-4 w-4" />
                      Cancel link
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/35 p-4 text-sm text-[var(--foreground-muted)] backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-300">
                <p>
                  Insight mode is active. Switch to <span className="font-medium text-[var(--foreground)]">Construct</span> to add nodes, draw connections, or edit graph structure.
                </p>
                <Button size="sm" variant="secondary" onClick={() => setInteractionMode("construct")} className="transition-all duration-200 active:scale-[0.98]">
                  Switch to Construct
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/35 p-4 text-sm text-[var(--foreground-muted)] backdrop-blur-sm transition-all duration-300 hover:border-[var(--accent)]/10">
            <div className="flex items-center gap-2 text-[var(--foreground)]">
              <Move className="h-4 w-4" />
              {isConstructMode
                ? "Drag nodes. Drag empty canvas to pan. Use wheel to zoom."
                : "Pan, zoom, search, and inspect relationships in a read-first map view."}
            </div>
            <p className="transition-opacity duration-300">
              {isConstructMode ? (
                <>
                  <strong>Click a node to reveal connectors on all edges</strong>, then drag any connector to another node.
                  Shift/Cmd-click to multi-select. Press <kbd className="rounded bg-[var(--surface-strong)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--foreground)]">Esc</kbd> to clear selection, <kbd className="rounded bg-[var(--surface-strong)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--foreground)]">Delete</kbd> to remove.
                </>
              ) : (
                <>
                  <strong>Insight mode mirrors an Obsidian-style graph experience</strong> for understanding relationships.
                  Switch to Construct mode when you need manual graph editing.
                </>
              )}
            </p>
            <p className="transition-opacity duration-300">
              {isConstructMode
                ? "Click an edge to select it, then use inline × or Delete to remove. Shortcuts: /, F, G, 0, Cmd/Ctrl+Z."
                : "Shortcuts: / search, F fit, G center selected node, 0 reset view."}
            </p>
            {graphMode === "project" && (
              <p className="text-[var(--accent)] transition-opacity duration-300">
                Use "Auto-generate" to extract entities from project signals automatically.
              </p>
            )}
          </div>

          {statusMessage ? (
            <Badge variant="success" className="w-full justify-center py-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {statusMessage}
            </Badge>
          ) : null}

          {errorMessage ? (
            <Badge variant="warning" className="w-full justify-center py-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {errorMessage}
            </Badge>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Badge variant="neutral" className="transition-all duration-200 hover:bg-[var(--surface-strong)]">
              Nodes {filteredNodes.length}/{visualNodes.length}
            </Badge>
            <Badge variant="neutral" className="transition-all duration-200 hover:bg-[var(--surface-strong)]">
              Edges {filteredEdges.length}/{edges.length}
            </Badge>
            <Badge variant="neutral" className="transition-all duration-200 hover:bg-[var(--surface-strong)]">
              Zoom {Math.round(viewport.scale * 100)}%
            </Badge>
            <Badge variant="neutral" className="transition-all duration-200 hover:bg-[var(--surface-strong)]">
              Density {(graphMetrics.edgeDensity * 100).toFixed(1)}%
            </Badge>
            {(selectedNodeIds.length > 0 || selectedEdgeIds.length > 0) && (
              <Badge variant="accent" className="animate-in fade-in zoom-in duration-200">
                Selected {selectedNodeIds.length}N/{selectedEdgeIds.length}E
              </Badge>
            )}
            {shortestPathNodeIds.length > 1 && (
              <Badge variant="accent" className="animate-in fade-in zoom-in duration-200">
                Route {shortestPathNodeIds.length - 1} hop{shortestPathNodeIds.length - 1 === 1 ? "" : "s"}
              </Badge>
            )}
            {egoCenterNodeId && (
              <Badge variant="accent" className="animate-in fade-in zoom-in duration-200">Ego d{egoDepth}</Badge>
            )}
            {graphMode === "standalone" && (
              <Badge variant="accent" className="animate-in fade-in zoom-in duration-200">Standalone</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card className="transition-all duration-300 hover:border-[var(--accent)]/10 hover:shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>
                  {graphMode === "standalone" 
                    ? "Standalone Graph" 
                    : selectedProject?.name ?? "Select a project"}
                </CardTitle>
                <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                  {graphMode === "standalone"
                    ? "Free-form entity graph for ad-hoc investigation and relationship mapping."
                    : "Project-linked intelligence graph mapping entities within this case."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <Badge variant="neutral">P {graphMetrics.typeCounts.person}</Badge>
                  <Badge variant="neutral">O {graphMetrics.typeCounts.organisation}</Badge>
                  <Badge variant="neutral">L {graphMetrics.typeCounts.location}</Badge>
                  <Badge variant="neutral">E {graphMetrics.typeCounts.event}</Badge>
                  <Badge variant="neutral">
                    Labeled edges {graphMetrics.labeledEdges}/{filteredEdges.length}
                  </Badge>
                  <Badge variant={isConstructMode ? "accent" : "neutral"}>
                    {isConstructMode ? "Construct" : "Insight"}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (isInsightMode) {
                      insightGraphRef.current?.zoomBy(1.12);
                    } else {
                      setViewport((current) => ({ ...current, scale: clamp(current.scale * 1.12, 0.5, 1.75) }));
                    }
                  }}
                >
                  <ZoomIn className="h-4 w-4" />
                  Zoom in
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    if (isInsightMode) {
                      insightGraphRef.current?.zoomBy(0.88);
                    } else {
                      setViewport((current) => ({ ...current, scale: clamp(current.scale * 0.88, 0.5, 1.75) }));
                    }
                  }}
                >
                  <ZoomOut className="h-4 w-4" />
                  Zoom out
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={fitVisibleGraph}
                  disabled={filteredNodes.length === 0 && visualNodes.length === 0}
                >
                  <ScanSearch className="h-4 w-4" />
                  Fit view
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleTidyLayout()}
                  disabled={!isConstructMode || visualNodes.length === 0}
                >
                  Tidy layout
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (isInsightMode) {
                      insightGraphRef.current?.zoomToFit(64);
                    } else {
                      setViewport(DEFAULT_VIEW);
                    }
                  }}
                >
                  Reset view
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleUndo()}
                  disabled={!isConstructMode || historyStats.undoCount === 0}
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleRedo()}
                  disabled={!isConstructMode || historyStats.redoCount === 0}
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              data-graph-interactive="true"
              className="relative overflow-hidden rounded-[28px] border border-[var(--border)] bg-[#0b1517]"
              style={{ height: VIEWPORT_HEIGHT, width: "100%" }}
            >
              <div
                className={`absolute inset-0 transition-opacity duration-150 ${
                  isInsightMode ? "z-20 opacity-100" : "z-0 pointer-events-none opacity-0"
                }`}
              >
                <ObsidianGraph
                  ref={insightGraphRef}
                  nodes={insightGraphData.nodes}
                  links={insightGraphData.links}
                  positionSeedByNodeId={insightNodePositionSeedRef.current}
                  selectedNodeId={selectedNodeId}
                  selectedNodeIds={selectedNodeIds}
                  selectedEdgeId={selectedEdgeId}
                  selectedEdgeIds={selectedEdgeIds}
                  shortestPathNodeIds={shortestPathNodeIds}
                  shortestPathEdgeIds={shortestPathEdgeIds}
                  egoCenterNodeId={egoCenterNodeId}
                  labelMode={insightLabelMode}
                  autoLayout={insightAutoLayout}
                  repulsion={insightRepulsion}
                  linkDistance={insightLinkDistance}
                  centerPull={insightCenterPull}
                  layoutTick={insightLayoutTick}
                  onPositionSnapshot={(positions) => {
                    insightNodePositionSeedRef.current = positions;
                  }}
                  onNodeClick={(_id, event) => {
                    if (event.shiftKey || event.metaKey || event.ctrlKey) {
                      toggleNodeSelection(_id);
                    } else {
                      selectSingleNode(_id);
                    }
                  }}
                  onLinkClick={(_id, event) => {
                    if (event.shiftKey || event.metaKey || event.ctrlKey) {
                      toggleEdgeSelection(_id);
                    } else {
                      selectSingleEdge(_id);
                    }
                  }}
                  onBackgroundClick={() => {
                    clearSelection();
                    clearPathAnalysis();
                  }}
                />
                {isInsightMode && graphMode === "project" && visualNodes.length === 0 ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
                    <div className="w-full max-w-[560px] rounded-2xl border border-[var(--border)] bg-[rgba(9,17,19,0.85)] p-6 text-center backdrop-blur-md shadow-[0_20px_60px_rgba(0,0,0,0.35)] animate-subtle-float">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                        <Sparkles className="h-5 w-5 text-[var(--accent)]" />
                      </div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        This project graph is empty
                      </p>
                      <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                        Build a relationship map from project signals, then inspect it in Insight view.
                      </p>
                      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => void handleAutoGenerateFromProject()}
                          disabled={
                            isAutoGenerating ||
                            !graphProjectId ||
                            (projectSignalsQuery.data?.length ?? 0) === 0
                          }
                          className="transition-all duration-200 active:scale-[0.98]"
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          {isAutoGenerating ? "Generating..." : "Generate from project signals"}
                        </Button>
                        <Button variant="ghost" onClick={() => setInteractionMode("construct")} className="transition-all duration-200 active:scale-[0.98]">
                          Switch to Construct
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <div
              ref={viewportRef}
              className={`absolute inset-0 transition-opacity duration-150 ${placeMode ? "cursor-crosshair" : panStateRef.current ? "cursor-grabbing" : "cursor-grab"} ${
                isInsightMode ? "z-0 pointer-events-none opacity-0" : "z-20 pointer-events-auto opacity-100"
              }`}
              style={{
                touchAction: "none",
              }}
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

                  {filteredEdges.map((edge) => {
                    const source = visibleNodeLookup.get(edge.source_node_id);
                    const target = visibleNodeLookup.get(edge.target_node_id);
                    if (!source || !target) return null;

                    const sourceAnchorPoint = isConstructMode
                      ? (getNodeAnchorPoint(source, getAutoAnchorSides(source, target).sourceSide) ?? {
                          x: source.centerX,
                          y: source.centerY,
                        })
                      : { x: source.centerX, y: source.centerY };
                    const targetAnchorPoint = isConstructMode
                      ? (getNodeAnchorPoint(target, getAutoAnchorSides(source, target).targetSide) ?? {
                          x: target.centerX,
                          y: target.centerY,
                        })
                      : { x: target.centerX, y: target.centerY };
                    const path = buildEdgePath(sourceAnchorPoint, targetAnchorPoint);
                    const labelPosition = getEdgeLabelPosition(sourceAnchorPoint, targetAnchorPoint);
                    const isSelected =
                      edge.edge_id === selectedEdgeId || selectedEdgeIdSet.has(edge.edge_id);
                    const isOnRoute = shortestPathEdgeIdSet.has(edge.edge_id);
                    const linkedToSelectedNode =
                      activeSelectedNodeIds.length === 0 ||
                      activeSelectedNodeIds.includes(edge.source_node_id) ||
                      activeSelectedNodeIds.includes(edge.target_node_id);
                    const edgeOpacity = linkedToSelectedNode ? 1 : 0.22;

                    return (
                      <g key={edge.edge_id}>
                        <path
                          d={path}
                          fill="none"
                          stroke={isSelected ? "#7fe6ca" : isOnRoute ? "#f2cf74" : "#8abec0"}
                          strokeWidth={
                            isInsightMode
                              ? isSelected
                                ? 2.8
                                : isOnRoute
                                  ? 2.3
                                  : 1.2
                              : isSelected
                                ? 3.5
                                : isOnRoute
                                  ? 3
                                  : 2
                          }
                          opacity={edgeOpacity}
                          markerEnd={isConstructMode ? "url(#graph-arrow)" : undefined}
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
                            const isMultiToggle = event.shiftKey || event.metaKey || event.ctrlKey;
                            if (isMultiToggle) {
                              toggleEdgeSelection(edge.edge_id);
                            } else {
                              selectSingleEdge(edge.edge_id);
                            }
                          }}
                        />
                        {showEdgeLabels && edge.label ? (
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
                        {isConstructMode && isSelected ? (
                          <g transform={`translate(${labelPosition.x + 62}, ${labelPosition.y - 12})`}>
                            <circle
                              r={10}
                              fill="rgba(187, 80, 80, 0.92)"
                              stroke="rgba(255, 203, 203, 0.65)"
                              strokeWidth={1.25}
                              style={{ cursor: "pointer" }}
                              data-graph-interactive="true"
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                event.preventDefault();
                                void handleDeleteEdge(edge.edge_id);
                              }}
                            />
                            <text
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill="#fff4f4"
                              fontSize="12"
                              fontWeight="700"
                              style={{ pointerEvents: "none" }}
                            >
                              ×
                            </text>
                          </g>
                        ) : null}
                      </g>
                    );
                  })}

                  {/* Edge preview for connection mode */}
                  {isConstructMode && connectSourceId && pointerWorld ? (
                    <path
                      d={buildEdgePreviewPath(
                        getNodeAnchorPoint(
                          nodeLookup.get(connectSourceId),
                          getClosestAnchorSide(nodeLookup.get(connectSourceId), pointerWorld),
                        ),
                        pointerWorld,
                      )}
                      fill="none"
                      stroke="#7fe6ca"
                      strokeWidth={2}
                      strokeDasharray="8 6"
                    />
                  ) : null}
                  
                  {/* Edge preview for drag-to-connect */}
                  {isConstructMode && edgeDragState && pointerWorld && (
                    <path
                      d={buildEdgePreviewPath(
                        getNodeAnchorPoint(
                          nodeLookup.get(edgeDragState.sourceNodeId),
                          edgeDragState.sourceAnchor,
                        ),
                        pointerWorld,
                      )}
                      fill="none"
                      stroke="#7fe6ca"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                    />
                  )}
                </svg>

                {renderedFilteredNodes.map((node) => {
                  const style = ENTITY_STYLES[node.entity_type];
                  const isSelected =
                    node.node_id === selectedNodeId || selectedNodeIdSet.has(node.node_id);
                  const isOnRoute = shortestPathNodeIdSet.has(node.node_id);
                  const isEgoCenter = egoCenterNodeId === node.node_id;
                  const isConnectSource = node.node_id === connectSourceId;
                  const isEdgeDragSource = edgeDragState?.sourceNodeId === node.node_id;
                  const isConnectorTarget =
                    node.node_id === hoveredEdgeDragTargetNodeId ||
                    node.node_id === hoveredConnectTargetNodeId;
                  const linkedToSelectedNode =
                    activeSelectedNodeIds.length === 0 || selectedNodeNeighborIds.has(node.node_id);
                  const nodeOpacity = linkedToSelectedNode ? 1 : 0.3;
                  const showConnectorHandles =
                    isConstructMode &&
                    (isSelected || isConnectSource || Boolean(edgeDragState) || Boolean(connectSourceId));

                  return (
                    <div
                      key={node.node_id}
                      data-graph-interactive="true"
                      className="absolute rounded-[22px] border shadow-[0_18px_60px_rgba(2,8,9,0.36)] transition-transform"
                      style={{
                        left: node.position.x,
                        top: node.position.y,
                        width: NODE_WIDTH,
                        height: NODE_HEIGHT,
                        background: style.fill,
                        borderColor: isConnectSource || isEdgeDragSource
                          ? "#7fe6ca"
                          : isEgoCenter
                            ? "#f2cf74"
                          : isSelected
                            ? "#b1f4e2"
                            : style.border,
                        color: style.text,
                        opacity: nodeOpacity,
                        boxShadow: isSelected || isConnectSource || isEdgeDragSource
                          ? "0 0 0 1px rgba(127,230,202,0.35), 0 18px 60px rgba(2,8,9,0.36)"
                          : isOnRoute
                            ? "0 0 0 1px rgba(242,207,116,0.45), 0 18px 60px rgba(2,8,9,0.36)"
                          : "0 18px 60px rgba(2,8,9,0.36)",
                      }}
                    >
                      {/* Node content - clickable for selection and drag */}
                      <button
                        type="button"
                        className="h-full w-full flex flex-col items-start justify-between p-4 text-left"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          event.preventDefault();

                          if (connectSourceId) {
                            if (connectSourceId !== node.node_id) {
                              void handleCreateEdge(connectSourceId, node.node_id);
                            }
                            return;
                          }

                          // Handle edge drop if dragging
                          if (edgeDragState && edgeDragState.sourceNodeId !== node.node_id) {
                            void handleCreateEdge(edgeDragState.sourceNodeId, node.node_id);
                            edgeDragStateRef.current = null;
                            setEdgeDragState(null);
                            return;
                          }

                          const isMultiToggle = event.shiftKey || event.metaKey || event.ctrlKey;
                          if (isMultiToggle) {
                            toggleNodeSelection(node.node_id);
                            return;
                          } else {
                            selectSingleNode(node.node_id);
                          }
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
                        <p className="pointer-events-none text-[11px] uppercase tracking-[0.18em] text-[var(--foreground-muted)]">
                          {Math.round(node.position.x)}, {Math.round(node.position.y)}
                        </p>
                      </button>

                      {showConnectorHandles &&
                        NODE_ANCHOR_SIDES.map((anchorSide) => (
                          <button
                            key={`${node.node_id}-connector-${anchorSide}`}
                            type="button"
                            data-graph-interactive="true"
                            className="absolute h-4 w-4 rounded-full border-2 cursor-crosshair transition-transform shadow-lg hover:scale-125"
                            style={{
                              ...getNodeConnectorHandleStyle(anchorSide),
                              zIndex: 10,
                              background: isConnectorTarget
                                ? "#f2cf74"
                                : isConnectSource || isEdgeDragSource
                                  ? "#7fe6ca"
                                  : "var(--accent)",
                              borderColor: "var(--surface-strong)",
                              opacity: edgeDragState && !isEdgeDragSource ? 0.92 : 1,
                            }}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              event.preventDefault();

                              if (edgeDragState && edgeDragState.sourceNodeId !== node.node_id) {
                                void handleCreateEdge(edgeDragState.sourceNodeId, node.node_id);
                                edgeDragStateRef.current = null;
                                setEdgeDragState(null);
                                return;
                              }

                              setEdgeDragState({
                                sourceNodeId: node.node_id,
                                sourceAnchor: anchorSide,
                              });
                              selectSingleNode(node.node_id);
                            }}
                            title={`Drag from ${anchorSide} edge to connect`}
                          />
                        ))}
                    </div>
                  );
                })}

                {graphMode === "project" && visualNodes.length === 0 ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
                    <div className="w-full max-w-[560px] rounded-2xl border border-[var(--border)] bg-[rgba(9,17,19,0.92)] p-5 text-center">
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        This project graph is empty
                      </p>
                      <p className="mt-2 text-sm text-[var(--foreground-muted)]">
                        Build a relationship map from project signals, then inspect it in Insight view.
                      </p>
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => void handleAutoGenerateFromProject()}
                          disabled={
                            isAutoGenerating ||
                            !graphProjectId ||
                            (projectSignalsQuery.data?.length ?? 0) === 0
                          }
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          {isAutoGenerating ? "Generating..." : "Generate from project signals"}
                        </Button>
                        <Button variant="ghost" onClick={() => setInteractionMode("construct")}>
                          Switch to Construct
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              {!isInsightMode && showMinimap ? (
                <div
                  data-graph-interactive="true"
                  className="absolute bottom-4 right-4 z-20 overflow-hidden rounded-xl border border-[var(--border)] bg-[rgba(7,14,16,0.94)] p-2 shadow-[0_10px_40px_rgba(0,0,0,0.35)]"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    const target = event.currentTarget.getBoundingClientRect();
                    const viewportElement = viewportRef.current;
                    if (!viewportElement) return;

                    const nx = (event.clientX - target.left) / target.width;
                    const ny = (event.clientY - target.top) / target.height;
                    const worldX = clamp(nx, 0, 1) * WORLD_WIDTH;
                    const worldY = clamp(ny, 0, 1) * WORLD_HEIGHT;

                    setViewport((current) => ({
                      ...current,
                      x: viewportElement.clientWidth / 2 - worldX * current.scale,
                      y: viewportElement.clientHeight / 2 - worldY * current.scale,
                    }));
                  }}
                >
                  <div className="relative h-[140px] w-[220px] overflow-hidden rounded-md bg-[rgba(11,24,26,0.9)]">
                    {renderedFilteredNodes.map((node) => (
                      <span
                        key={`mini-${node.node_id}`}
                        className="absolute h-1.5 w-1.5 rounded-full"
                        style={{
                          left: `${(node.position.x / WORLD_WIDTH) * 100}%`,
                          top: `${(node.position.y / WORLD_HEIGHT) * 100}%`,
                          background:
                            selectedNodeIdSet.has(node.node_id) || node.node_id === selectedNodeId
                              ? "#7fe6ca"
                              : shortestPathNodeIdSet.has(node.node_id)
                                ? "#f2cf74"
                                : "rgba(188, 216, 210, 0.8)",
                        }}
                      />
                    ))}
                    <div
                      className="pointer-events-none absolute border border-[rgba(127,230,202,0.85)] bg-[rgba(127,230,202,0.08)]"
                      style={buildMinimapViewportRect(viewport, viewportRef.current)}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="border border-[var(--border)] bg-[var(--surface)]/35">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Selected node</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedNodeIds.length > 1 ? (
                    <>
                      <p className="text-sm text-[var(--foreground)]">
                        {selectedNodeIds.length} nodes selected.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" onClick={handleUseSelectedForPath}>
                          <Route className="h-4 w-4" />
                          Use for route
                        </Button>
                        <Button size="sm" variant="secondary" onClick={handleApplyEgoFromSelection}>
                          <Orbit className="h-4 w-4" />
                          Use for ego
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleDeleteNodes(selectedNodeIds)}
                          disabled={!isConstructMode}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete selected
                        </Button>
                      </div>
                    </>
                  ) : selectedNode ? (
                    isInsightMode ? (
                      <>
                        <p className="text-sm font-semibold text-[var(--foreground)]">
                          {selectedNode.label}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="neutral">{selectedNode.entity_type}</Badge>
                          <Badge variant="neutral">{selectedNodeRelations.length} relations</Badge>
                        </div>
                        {selectedNodeDisplayPosition ? (
                          <p className="text-xs text-[var(--foreground-muted)]">
                            Position {Math.round(selectedNodeDisplayPosition.x)}, {Math.round(selectedNodeDisplayPosition.y)}
                          </p>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => centerViewportOnNode(selectedNode.node_id)}
                          >
                            Center
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setPathFromNodeId(selectedNode.node_id);
                              setStatusMessage(`Set route start to ${selectedNode.label}.`);
                            }}
                          >
                            Route from node
                          </Button>
                        </div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-3">
                          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[var(--foreground-muted)]">
                            Relationships ({selectedNodeRelations.length})
                          </p>
                          {selectedNodeRelations.length === 0 ? (
                            <p className="text-xs text-[var(--foreground-muted)]">
                              No linked entities yet.
                            </p>
                          ) : (
                            <div className="grid max-h-32 gap-1 overflow-y-auto">
                              {selectedNodeRelations.map((relation) => (
                                <button
                                  key={relation.edgeId}
                                  type="button"
                                  className="flex items-center justify-between rounded-md px-2 py-1 text-left text-xs hover:bg-[var(--surface-strong)]"
                                  onClick={() => {
                                    selectSingleNode(relation.otherNodeId);
                                    setSelectedEdgeId(relation.edgeId);
                                    setSelectedEdgeIds([relation.edgeId]);
                                    centerViewportOnNode(relation.otherNodeId);
                                  }}
                                >
                                  <span className="truncate">
                                    {relation.direction === "in" ? "←" : "→"} {relation.otherLabel}
                                  </span>
                                  <span className="ml-2 truncate text-[var(--foreground-muted)]">
                                    {truncateLabel(relation.label, 18)}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                      <Input
                        value={nodeDraftLabel}
                        onChange={(event) => setNodeDraftLabel(event.target.value)}
                        placeholder="Node label"
                        readOnly={!isConstructMode}
                        disabled={!isConstructMode}
                      />
                      <select
                        className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 text-sm"
                        value={nodeDraftType}
                        onChange={(event) => setNodeDraftType(event.target.value as GraphEntityType)}
                        disabled={!isConstructMode}
                      >
                        <option value="person">Person</option>
                        <option value="organisation">Organisation</option>
                        <option value="location">Location</option>
                        <option value="event">Event</option>
                      </select>
                      {selectedNodeDisplayPosition ? (
                        <p className="text-xs text-[var(--foreground-muted)]">
                          Position {Math.round(selectedNodeDisplayPosition.x)}, {Math.round(selectedNodeDisplayPosition.y)}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => void handleSaveSelectedNode()}
                          disabled={!isConstructMode || !nodeDraftLabel.trim()}
                        >
                          Save node
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => centerViewportOnNode(selectedNode.node_id)}
                        >
                          Center
                        </Button>
                        {isConstructMode ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setConnectSourceId(selectedNode.node_id);
                                setSelectedEdgeId(null);
                                setSelectedEdgeIds([]);
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
                          </>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-3">
                        <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[var(--foreground-muted)]">
                          Relationships ({selectedNodeRelations.length})
                        </p>
                        {selectedNodeRelations.length === 0 ? (
                          <p className="text-xs text-[var(--foreground-muted)]">
                            No linked entities yet.
                          </p>
                        ) : (
                          <div className="grid max-h-32 gap-1 overflow-y-auto">
                            {selectedNodeRelations.map((relation) => (
                              <button
                                key={relation.edgeId}
                                type="button"
                                className="flex items-center justify-between rounded-md px-2 py-1 text-left text-xs hover:bg-[var(--surface-strong)]"
                                onClick={() => {
                                  selectSingleNode(relation.otherNodeId);
                                  setSelectedEdgeId(relation.edgeId);
                                  setSelectedEdgeIds([relation.edgeId]);
                                  centerViewportOnNode(relation.otherNodeId);
                                }}
                              >
                                <span className="truncate">
                                  {relation.direction === "in" ? "←" : "→"} {relation.otherLabel}
                                </span>
                                <span className="ml-2 truncate text-[var(--foreground-muted)]">
                                  {truncateLabel(relation.label, 18)}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                    )
                  ) : (
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {isConstructMode
                        ? "Click a node to edit it, or multi-select nodes for bulk actions."
                        : "Click a node to inspect it, then switch to Construct to edit graph structure."}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="border border-[var(--border)] bg-[var(--surface)]/35">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Selected edge</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedEdgeIds.length > 1 ? (
                    <>
                      <p className="text-sm text-[var(--foreground)]">
                        {selectedEdgeIds.length} connections selected.
                      </p>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void handleDeleteEdges(selectedEdgeIds)}
                        disabled={!isConstructMode}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete selected edges
                      </Button>
                    </>
                  ) : selectedEdge ? (
                    isInsightMode ? (
                      <>
                        <p className="text-sm font-medium text-[var(--foreground)]">
                          {findNodeLabel(nodes, selectedEdge.source_node_id)} →{" "}
                          {findNodeLabel(nodes, selectedEdge.target_node_id)}
                        </p>
                        <p className="text-xs text-[var(--foreground-muted)]">
                          {selectedEdge.label?.trim() ? selectedEdge.label : "Unlabeled relationship"}
                        </p>
                      </>
                    ) : (
                      <>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {findNodeLabel(nodes, selectedEdge.source_node_id)} →{" "}
                        {findNodeLabel(nodes, selectedEdge.target_node_id)}
                      </p>
                      <Input
                        value={edgeDraftLabel}
                        onChange={(event) => setEdgeDraftLabel(event.target.value)}
                        placeholder="Relationship label"
                        readOnly={!isConstructMode}
                        disabled={!isConstructMode}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => void handleSaveSelectedEdge()} disabled={!isConstructMode}>
                          Save edge
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleDeleteEdge(selectedEdge.edge_id)}
                          disabled={!isConstructMode}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </>
                    )
                  ) : (
                    <p className="text-sm text-[var(--foreground-muted)]">
                      {isConstructMode
                        ? "Click a connection to edit it, or multi-select for bulk delete."
                        : "Click a connection to inspect relationship details."}
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
