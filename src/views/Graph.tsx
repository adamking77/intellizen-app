import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NodePicker } from "@/components/graph/node-picker";
import { ObsidianGraph, type ObsidianGraphRef } from "@/components/graph/obsidian-graph";
import {
  Building2,
  CalendarClock,
  ChevronRight,
  Crosshair,
  Download,
  Link2,
  MapPin,
  Maximize2,
  MoreHorizontal,
  Orbit,
  PanelRightClose,
  PanelRightOpen,
  Redo2,
  Route,
  Search,
  Sparkles,
  Trash2,
  Undo2,
  Unlink,
  User,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
  WORLD_HEIGHT,
  WORLD_MARGIN,
  WORLD_WIDTH,
  type NodeAnchorSide,
  type Point,
  type ViewportState,
} from "@/lib/graph-geometry";
import { useWindowSize } from "@/lib/use-window-size";
import {
  createGraphEdge,
  createGraphNode,
  createGraphExportVaultFile,
  deleteGraphEdges,
  deleteGraphNodes,
  listGraphEdges,
  listGraphNodes,
  listInvestigations,
  listProjectSignals,
  listProjects,
  updateGraphEdge,
  updateGraphNode,
  updateGraphNodePosition,
} from "@/lib/data";
import {
  ensureInvestigationDirectory,
  ensureProjectDirectory,
  writeVaultBinaryFile,
} from "@/lib/vault";
import { buildGraphExtractionPrompt, spawnClaude } from "@/lib/shell";
import type {
  GraphEdgeRecord,
  GraphEntityType,
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
    accent: string;
  }
> = {
  person: {
    chip: "rgba(46, 205, 184, 0.15)",
    fill: "var(--base)",
    border: "#2ecdb8",
    text: "var(--text)",
    accent: "#2ecdb8",
  },
  organisation: {
    chip: "rgba(48, 184, 232, 0.15)",
    fill: "var(--base)",
    border: "#30b8e8",
    text: "var(--text)",
    accent: "#30b8e8",
  },
  location: {
    chip: "rgba(255, 138, 80, 0.15)",
    fill: "var(--base)",
    border: "#ff8a50",
    text: "var(--text)",
    accent: "#ff8a50",
  },
  event: {
    chip: "rgba(240, 82, 122, 0.15)",
    fill: "var(--base)",
    border: "#f0527a",
    text: "var(--text)",
    accent: "#f0527a",
  },
};

const INSIGHT_NODE_COLORS: Record<GraphEntityType, string> = {
  person: "#2ecdb8",
  organisation: "#30b8e8",
  location: "#ff8a50",
  event: "#f0527a",
};

const ENTITY_ICON: Record<GraphEntityType, typeof User> = {
  person: User,
  organisation: Building2,
  location: MapPin,
  event: CalendarClock,
};

const ENTITY_LABEL: Record<GraphEntityType, string> = {
  person: "Person",
  organisation: "Organisation",
  location: "Location",
  event: "Event",
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

function normalizeGraphSignalText(value: string, maxLength: number): string | null {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function extractGraphSignalContent(rawPayload: unknown): string | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;

  const payload = rawPayload as {
    content?: unknown;
    text?: unknown;
    highlights?: unknown;
  };

  if (typeof payload.content === "string") {
    return normalizeGraphSignalText(payload.content, 2400);
  }

  if (typeof payload.text === "string") {
    return normalizeGraphSignalText(payload.text, 2400);
  }

  if (Array.isArray(payload.highlights)) {
    const joined = payload.highlights.filter((item): item is string => typeof item === "string").join(" ");
    return normalizeGraphSignalText(joined, 1200);
  }

  return null;
}

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
  const [railOpen, setRailOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem("intelizen:graph-rail-open") !== "0";
    } catch {
      return true;
    }
  });
  const [railTab, setRailTab] = useState<"inspect" | "controls">("inspect");
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportFilename, setExportFilename] = useState("graph-export");
  const [exportTarget, setExportTarget] = useState<"project" | "investigation">("project");
  const [exportTargetId, setExportTargetId] = useState<string | number | null>(null);
  const [exportSaving, setExportSaving] = useState(false);
  const [exportDataUrl, setExportDataUrl] = useState<string | null>(null);
  const { isCramped } = useWindowSize();

  useEffect(() => {
    try {
      localStorage.setItem("intelizen:graph-rail-open", railOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [railOpen]);

  // Auto-close the rail when the window gets cramped; user can still re-open.
  useEffect(() => {
    if (isCramped) setRailOpen(false);
  }, [isCramped]);

  // Auto-swap rail to inspect when a selection is made
  useEffect(() => {
    if (selectedNodeId || selectedEdgeId || selectedNodeIds.length > 0 || selectedEdgeIds.length > 0) {
      setRailTab("inspect");
      setRailOpen(true);
    }
  }, [selectedNodeId, selectedEdgeId, selectedNodeIds.length, selectedEdgeIds.length]);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<DragState>(null);
  const panStateRef = useRef<PanState>(null);
  const dragPositionsRef = useRef<Record<string, Point>>({});
  const viewportStateRef = useRef<ViewportState>(DEFAULT_VIEW);
  const edgeDragStateRef = useRef<EdgeDragState>(null);
  const hasAutoFitRef = useRef<string | null>(null);
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
  const worldContainerRef = useRef<HTMLDivElement | null>(null);

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  const { data: investigations } = useQuery({
    queryKey: ["investigations"],
    queryFn: listInvestigations,
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

  // Auto-fit viewport to nodes on initial Construct mode load (once per graph)
  useEffect(() => {
    if (!isConstructMode) return;
    if (!nodesQuery.isSuccess || visualNodes.length === 0) return;
    const graphKey = effectiveProjectId == null ? "standalone" : String(effectiveProjectId);
    if (hasAutoFitRef.current === graphKey) return;
    hasAutoFitRef.current = graphKey;
    setViewport(computeFitViewToNodes(visualNodes, viewportRef.current));
  }, [isConstructMode, nodesQuery.isSuccess, visualNodes, effectiveProjectId]);

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
        if (clearConfirmOpen) { setClearConfirmOpen(false); return; }
        if (exportModalOpen) { setExportModalOpen(false); setExportDataUrl(null); return; }
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

  async function handleClearGraph() {
    if (!isConstructMode) return;
    const allNodeIds = nodes.map((n) => n.node_id);
    const allEdgeIds = edges.map((e) => e.edge_id);
    if (allNodeIds.length === 0 && allEdgeIds.length === 0) {
      setClearConfirmOpen(false);
      return;
    }
    try {
      setErrorMessage(null);
      recordHistory();
      if (allEdgeIds.length > 0) {
        await deleteGraphEdges({ projectId: effectiveProjectId, edgeIds: allEdgeIds });
      }
      if (allNodeIds.length > 0) {
        await deleteGraphNodes({ projectId: effectiveProjectId, nodeIds: allNodeIds });
      }
      await nodesQuery.refetch();
      await edgesQuery.refetch();
      clearSelection();
      setConnectSourceId(null);
      setClearConfirmOpen(false);
      setStatusMessage(`Cleared ${allNodeIds.length} nodes and ${allEdgeIds.length} edges.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to clear graph.");
    }
  }

  async function handleExportPng() {
    let dataUrl: string | null = null;

    if (isInsightMode) {
      dataUrl = insightGraphRef.current?.captureCanvas() ?? null;
    } else {
      const worldEl = worldContainerRef.current;
      if (worldEl) {
        try {
          const { toPng } = await import("html-to-image");
          dataUrl = await toPng(worldEl, { backgroundColor: "#1e1e2e", pixelRatio: 2 });
        } catch {
          dataUrl = null;
        }
      }
    }

    if (!dataUrl) {
      setErrorMessage("Failed to capture graph image.");
      return;
    }

    const ts = new Date().toISOString().slice(0, 10);
    setExportFilename(`graph-${ts}`);
    setExportDataUrl(dataUrl);

    if (graphMode === "project" && graphProjectId) {
      setExportTarget("project");
      setExportTargetId(graphProjectId);
    } else {
      setExportTarget("investigation");
      setExportTargetId(investigations?.[0]?.case_id ?? null);
    }

    setExportModalOpen(true);
  }

  async function handleSaveGraphExport() {
    if (!exportDataUrl || !exportTargetId) return;
    try {
      setExportSaving(true);
      const base64 = exportDataUrl.split(",")[1];
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const filename = `${exportFilename.trim() || "graph-export"}.png`;
      let filePath: string;

      if (exportTarget === "project") {
        const pid = Number(exportTargetId);
        await ensureProjectDirectory(pid);
        filePath = `projects/${pid}/${filename}`;
        await writeVaultBinaryFile(filePath, bytes);
        await createGraphExportVaultFile({ projectId: pid, filePath, fileName: filename });
      } else {
        const cid = String(exportTargetId);
        await ensureInvestigationDirectory(cid);
        filePath = `investigations/${cid}/${filename}`;
        await writeVaultBinaryFile(filePath, bytes);
        await createGraphExportVaultFile({ caseId: cid, filePath, fileName: filename });
      }

      setExportModalOpen(false);
      setExportDataUrl(null);
      setStatusMessage(`Saved: ${filename}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save export.");
    } finally {
      setExportSaving(false);
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

  // Auto-generate graph from project signals using Claude entity + relationship extraction
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
      setStatusMessage("Extracting entities and relationships via Claude…");

      const signalInputs = projectSignals
        .slice(0, 30)
        .map((ps) => ({
          title: ps.intel_signals?.title ?? "",
          snippet: ps.intel_signals?.snippet ?? null,
          content: extractGraphSignalContent(ps.intel_signals?.raw_payload),
        }))
        .filter((s) => s.title);

      const result = await spawnClaude({
        prompt: buildGraphExtractionPrompt(signalInputs),
      });

      if (!result.success || !result.output) {
        setErrorMessage(result.error ?? "Claude extraction failed.");
        return;
      }

      // Strip markdown fences if Claude wrapped the JSON
      const raw = result.output.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");

      let parsed: {
        entities: Array<{ label: string; type: GraphEntityType }>;
        relationships: Array<{ source: string; target: string; relation: string }>;
      };
      try {
        parsed = JSON.parse(raw);
      } catch {
        setErrorMessage("Could not parse Claude's extraction output.");
        return;
      }

      if (!parsed.entities?.length) {
        setStatusMessage("No entities found in signals.");
        return;
      }

      recordHistory();

      // Build label → node_id map from existing nodes
      const labelToNodeId = new Map(nodes.map((n) => [n.label.toLowerCase(), n.node_id]));

      // Create nodes for entities not already on the canvas
      const newEntities = parsed.entities.filter(
        (e) => !labelToNodeId.has(e.label.toLowerCase()),
      );
      const positions = calculateAutoLayoutPositions(newEntities.length, visualNodes.length);

      for (let i = 0; i < newEntities.length; i++) {
        const entity = newEntities[i];
        const nodeId = crypto.randomUUID();
        await createGraphNode({
          projectId: graphProjectId,
          nodeId,
          label: entity.label,
          entityType: entity.type,
          position: positions[i],
        });
        labelToNodeId.set(entity.label.toLowerCase(), nodeId);
      }

      // Create edges — only between entities whose labels Claude matched
      const allEdges = await listGraphEdges(graphProjectId);
      const seenPairs = new Set(
        allEdges.map((e) => canonicalEdgePair(e.source_node_id, e.target_node_id)),
      );

      let edgesCreated = 0;
      for (const rel of parsed.relationships ?? []) {
        const sourceId = labelToNodeId.get(rel.source.toLowerCase());
        const targetId = labelToNodeId.get(rel.target.toLowerCase());
        if (!sourceId || !targetId || sourceId === targetId) continue;

        const pair = canonicalEdgePair(sourceId, targetId);
        if (seenPairs.has(pair)) continue;

        await createGraphEdge({
          projectId: graphProjectId,
          edgeId: crypto.randomUUID(),
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          label: rel.relation,
        });
        seenPairs.add(pair);
        edgesCreated++;
      }

      await nodesQuery.refetch();
      await edgesQuery.refetch();

      setStatusMessage(
        `Generated ${newEntities.length} entities and ${edgesCreated} relationships.`,
      );
      if (newEntities.length > 0) {
        setViewport(
          computeFitViewToNodes(
            [...visualNodes, ...newEntities.map((_, i) => ({ position: positions[i] }))],
            viewportRef.current,
          ),
        );
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to auto-generate graph.");
    } finally {
      setIsAutoGenerating(false);
    }
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
      0.25,
      1.75,
    );

    setViewport({
      scale: nextScale,
      x: event.clientX - rect.left - cursorWorldX * nextScale,
      y: event.clientY - rect.top - cursorWorldY * nextScale,
    });
  }


  return (
    <div className="relative flex h-[calc(100dvh)] w-full overflow-hidden bg-[var(--crust)]">
      {/* ============================================================
          Main column: topbar + full-bleed canvas
          ============================================================ */}
      <div className="relative flex flex-1 min-w-0 flex-col">
        {/* ---------- TOP BAR ---------- */}
        <div className="relative z-30 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--base)] px-4">
          {/* Left — breadcrumb + scope */}
          <div className="flex min-w-0 items-center gap-3">
            {!isCramped && (
              <div className="text-meta flex items-center gap-1.5">
                <span className="text-[var(--overlay-1)]">Graph</span>
                <ChevronRight className="h-3 w-3 shrink-0 text-[var(--overlay-0)]" />
                <span className="truncate text-[var(--text)]">
                  {graphMode === "standalone"
                    ? "Standalone"
                    : selectedProject?.name ?? "Select project"}
                </span>
              </div>
            )}
            <select
              value={graphMode === "standalone" ? "standalone" : String(graphProjectId ?? "")}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "standalone") {
                  setGraphMode("standalone");
                  setInteractionMode("construct");
                  setGraphProjectId(null);
                } else {
                  setGraphMode("project");
                  setInteractionMode("insight");
                  setGraphProjectId(Number(v));
                }
                clearSelection();
                clearPathAnalysis();
                handleClearEgoNetwork();
                setConnectSourceId(null);
                hasAutoFitRef.current = null;
              }}
              className="h-7 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2 font-ui text-[12px] text-[var(--text)] transition-colors duration-150 hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="standalone">Standalone</option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Center — Insight | Construct */}
          <div className="flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-0.5">
            <button
              type="button"
              onClick={() => setInteractionMode("insight")}
              className={cn(
                "rounded px-3 py-1 font-ui text-[11px] font-medium transition-colors duration-150",
                isInsightMode
                  ? "bg-[var(--surface-wash-strong)] text-[var(--text)]"
                  : "text-[var(--subtext-0)] hover:text-[var(--text)]",
              )}
            >
              Insight
            </button>
            <button
              type="button"
              onClick={() => setInteractionMode("construct")}
              className={cn(
                "rounded px-3 py-1 font-ui text-[11px] font-medium transition-colors duration-150",
                isConstructMode
                  ? "bg-[var(--surface-wash-strong)] text-[var(--text)]"
                  : "text-[var(--subtext-0)] hover:text-[var(--text)]",
              )}
            >
              Construct
            </button>
          </div>

          {/* Right — search + actions */}
          <div className="flex items-center gap-1.5">
            {!isCramped && (
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--overlay-1)]" />
                <input
                  ref={searchInputRef}
                  value={nodeSearch}
                  onChange={(e) => setNodeSearch(e.target.value)}
                  placeholder="Search ( / )"
                  className="h-7 w-[160px] rounded-md border border-[var(--border)] bg-[var(--mantle)] pl-7 pr-2 font-ui text-[12px] text-[var(--text)] placeholder:text-[var(--overlay-0)] transition-colors duration-150 hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:outline-none"
                />
              </div>
            )}

            <TopbarIconBtn
              title="Zoom in"
              onClick={() => {
                if (isInsightMode) insightGraphRef.current?.zoomBy(1.12);
                else
                  setViewport((c) => ({
                    ...c,
                    scale: clamp(c.scale * 1.12, 0.25, 1.75),
                  }));
              }}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </TopbarIconBtn>
            <TopbarIconBtn
              title="Zoom out"
              onClick={() => {
                if (isInsightMode) insightGraphRef.current?.zoomBy(0.88);
                else
                  setViewport((c) => ({
                    ...c,
                    scale: clamp(c.scale * 0.88, 0.25, 1.75),
                  }));
              }}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </TopbarIconBtn>
            <TopbarIconBtn title="Fit view" onClick={fitVisibleGraph}>
              <Maximize2 className="h-3.5 w-3.5" />
            </TopbarIconBtn>

            {/* Overflow */}
            <div className="relative">
              <TopbarIconBtn title="More" onClick={() => setOverflowOpen((o) => !o)}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </TopbarIconBtn>
              {overflowOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setOverflowOpen(false)} />
                  <div className="absolute right-0 top-full z-50 mt-1 w-[220px] rounded-md border border-[var(--border)] bg-[var(--mantle)] py-1 shadow-[var(--shadow-elevated)]">
                    <OverflowItem
                      label="Reset view"
                      onClick={() => {
                        setOverflowOpen(false);
                        if (isInsightMode) insightGraphRef.current?.zoomToFit(64);
                        else setViewport(DEFAULT_VIEW);
                      }}
                    />
                    <OverflowItem
                      label="Tidy layout"
                      disabled={!isConstructMode || visualNodes.length === 0}
                      onClick={() => {
                        setOverflowOpen(false);
                        void handleTidyLayout();
                      }}
                    />
                    <OverflowItem
                      label="Reflow (Insight)"
                      disabled={!isInsightMode}
                      onClick={() => {
                        setOverflowOpen(false);
                        setInsightLayoutTick((c) => c + 1);
                      }}
                    />
                    {graphMode === "project" && (
                      <OverflowItem
                        label={isAutoGenerating ? "Generating…" : "Generate from signals"}
                        disabled={
                          isAutoGenerating ||
                          !graphProjectId ||
                          (projectSignalsQuery.data?.length ?? 0) === 0
                        }
                        onClick={() => {
                          setOverflowOpen(false);
                          void handleAutoGenerateFromProject();
                        }}
                      />
                    )}
                    <div className="my-1 h-px bg-[var(--border)]" />
                    <OverflowItem
                      label="Export PNG…"
                      disabled={visualNodes.length === 0}
                      onClick={() => {
                        setOverflowOpen(false);
                        void handleExportPng();
                      }}
                    />
                    <OverflowItem
                      label="Clear graph…"
                      disabled={!isConstructMode || (nodes.length === 0 && edges.length === 0)}
                      onClick={() => {
                        setOverflowOpen(false);
                        setClearConfirmOpen(true);
                      }}
                    />
                  </div>
                </>
              )}
            </div>

            <TopbarIconBtn
              title={railOpen ? "Hide rail" : "Show rail"}
              onClick={() => setRailOpen((o) => !o)}
            >
              {railOpen ? (
                <PanelRightClose className="h-3.5 w-3.5" />
              ) : (
                <PanelRightOpen className="h-3.5 w-3.5" />
              )}
            </TopbarIconBtn>
          </div>
        </div>

        {/* ---------- CANVAS AREA ---------- */}
        <div className="relative min-h-0 flex-1">
          {/* Insight mode */}
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-150",
              isInsightMode ? "z-20 opacity-100" : "z-0 pointer-events-none opacity-0",
            )}
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
                <div className="w-full max-w-[480px] rounded-xl border border-[var(--border)] bg-[var(--mantle)] p-6 text-center">
                  <Sparkles className="mx-auto mb-3 h-5 w-5 text-[var(--accent)]" />
                  <p className="text-heading">
                    This project graph is empty
                  </p>
                  <p className="text-meta mt-2 text-[var(--subtext-0)]">
                    Build a relationship map from project signals, then inspect it here.
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
                      <Sparkles className="mr-2 h-3.5 w-3.5" />
                      {isAutoGenerating ? "Generating…" : "Generate from signals"}
                    </Button>
                    <Button variant="ghost" onClick={() => setInteractionMode("construct")}>
                      Switch to Construct
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Construct mode */}
          <div
            ref={viewportRef}
            className={cn(
              "absolute inset-0 transition-opacity duration-150",
              placeMode
                ? "cursor-crosshair"
                : panStateRef.current
                  ? "cursor-grabbing"
                  : "cursor-grab",
              isInsightMode
                ? "z-0 pointer-events-none opacity-0"
                : "z-20 pointer-events-auto opacity-100",
            )}
            style={{ touchAction: "none" }}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onWheel={handleCanvasWheel}
          >
            <div
              ref={worldContainerRef}
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
                    <path d="M0,0 L10,5 L0,10 z" fill="var(--overlay-0)" />
                  </marker>
                </defs>

                {filteredEdges.map((edge) => {
                  const source = visibleNodeLookup.get(edge.source_node_id);
                  const target = visibleNodeLookup.get(edge.target_node_id);
                  if (!source || !target) return null;

                  const sourceAnchorPoint = isConstructMode
                    ? (getNodeAnchorPoint(
                        source,
                        getAutoAnchorSides(source, target).sourceSide,
                      ) ?? { x: source.centerX, y: source.centerY })
                    : { x: source.centerX, y: source.centerY };
                  const targetAnchorPoint = isConstructMode
                    ? (getNodeAnchorPoint(
                        target,
                        getAutoAnchorSides(source, target).targetSide,
                      ) ?? { x: target.centerX, y: target.centerY })
                    : { x: target.centerX, y: target.centerY };
                  const path = buildEdgePath(sourceAnchorPoint, targetAnchorPoint);
                  const labelPosition = getEdgeLabelPosition(
                    sourceAnchorPoint,
                    targetAnchorPoint,
                  );
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
                        stroke={
                          isSelected
                            ? "var(--accent)"
                            : isOnRoute
                              ? "#b4befe"
                              : "var(--overlay-0)"
                        }
                        strokeWidth={isSelected ? 2 : isOnRoute ? 1.5 : 1}
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
                          const isMultiToggle =
                            event.shiftKey || event.metaKey || event.ctrlKey;
                          if (isMultiToggle) toggleEdgeSelection(edge.edge_id);
                          else selectSingleEdge(edge.edge_id);
                        }}
                      />
                      {showEdgeLabels && edge.label ? (
                        <g transform={`translate(${labelPosition.x}, ${labelPosition.y})`}>
                          <rect
                            x={-56}
                            y={-12}
                            width={112}
                            height={24}
                            rx={4}
                            fill="#181825"
                            stroke="rgba(69, 71, 90, 0.6)"
                          />
                          <text
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fill="#cdd6f4"
                            fontSize="11"
                            fontWeight="500"
                          >
                            {truncateLabel(edge.label, 22)}
                          </text>
                        </g>
                      ) : null}
                      {isConstructMode && isSelected ? (
                        <g
                          transform={`translate(${labelPosition.x + 62}, ${labelPosition.y - 12})`}
                        >
                          <circle
                            r={9}
                            fill="#f03f3f"
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
                            fill="#11111b"
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
                    stroke="var(--accent)"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                  />
                ) : null}
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
                    stroke="var(--accent)"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                  />
                )}
              </svg>

              {renderedFilteredNodes.map((node) => {
                const style = ENTITY_STYLES[node.entity_type];
                const isSelected =
                  node.node_id === selectedNodeId ||
                  selectedNodeIdSet.has(node.node_id);
                const isOnRoute = shortestPathNodeIdSet.has(node.node_id);
                const isEgoCenter = egoCenterNodeId === node.node_id;
                const isConnectSource = node.node_id === connectSourceId;
                const isEdgeDragSource =
                  edgeDragState?.sourceNodeId === node.node_id;
                const isConnectorTarget =
                  node.node_id === hoveredEdgeDragTargetNodeId ||
                  node.node_id === hoveredConnectTargetNodeId;
                const linkedToSelectedNode =
                  activeSelectedNodeIds.length === 0 ||
                  selectedNodeNeighborIds.has(node.node_id);
                const nodeOpacity = linkedToSelectedNode ? 1 : 0.3;
                const showConnectorHandles =
                  isConstructMode &&
                  (isSelected ||
                    isConnectSource ||
                    Boolean(edgeDragState) ||
                    Boolean(connectSourceId));

                return (
                  <div
                    key={node.node_id}
                    data-graph-interactive="true"
                    className="absolute rounded-lg border transition-transform"
                    style={{
                      left: node.position.x,
                      top: node.position.y,
                      width: NODE_WIDTH,
                      height: NODE_HEIGHT,
                      background: style.fill,
                      borderColor:
                        isConnectSource || isEdgeDragSource
                          ? "var(--accent)"
                          : isEgoCenter
                            ? "#b4befe"
                            : isSelected
                              ? "var(--accent)"
                              : style.border,
                      color: style.text,
                      opacity: nodeOpacity,
                      boxShadow:
                        isSelected || isConnectSource || isEdgeDragSource
                          ? "0 0 0 1px var(--accent-border)"
                          : isOnRoute
                            ? "0 0 0 1px rgba(180, 190, 254, 0.45)"
                            : "none",
                    }}
                  >
                    <button
                      type="button"
                      className="flex h-full w-full items-center gap-3 p-3 text-left"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        event.preventDefault();

                        if (connectSourceId) {
                          if (connectSourceId !== node.node_id) {
                            void handleCreateEdge(connectSourceId, node.node_id);
                          }
                          return;
                        }

                        if (
                          edgeDragState &&
                          edgeDragState.sourceNodeId !== node.node_id
                        ) {
                          void handleCreateEdge(
                            edgeDragState.sourceNodeId,
                            node.node_id,
                          );
                          edgeDragStateRef.current = null;
                          setEdgeDragState(null);
                          return;
                        }

                        const isMultiToggle =
                          event.shiftKey || event.metaKey || event.ctrlKey;
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
                      <div
                        className="pointer-events-none flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
                        style={{ background: style.chip, color: style.accent }}
                      >
                        {(() => {
                          const Icon = ENTITY_ICON[node.entity_type];
                          return <Icon className="h-4 w-4" />;
                        })()}
                      </div>
                      <div className="pointer-events-none min-w-0 flex-1">
                        <p className="truncate font-ui text-[12.5px] font-medium leading-tight text-[var(--text)]">
                          {node.label}
                        </p>
                        <p className="mt-0.5 truncate font-ui text-[10.5px] text-[var(--overlay-1)]">
                          {ENTITY_LABEL[node.entity_type]}
                        </p>
                      </div>
                    </button>

                    {showConnectorHandles &&
                      NODE_ANCHOR_SIDES.map((anchorSide) => (
                        <button
                          key={`${node.node_id}-connector-${anchorSide}`}
                          type="button"
                          data-graph-interactive="true"
                          className="absolute h-3 w-3 rounded-full border cursor-crosshair transition-transform hover:scale-125"
                          style={{
                            ...getNodeConnectorHandleStyle(anchorSide),
                            zIndex: 10,
                            background: isConnectorTarget
                              ? "#b4befe"
                              : isConnectSource || isEdgeDragSource
                                ? "var(--accent)"
                                : "var(--accent)",
                            borderColor: "var(--mantle)",
                            opacity:
                              edgeDragState && !isEdgeDragSource ? 0.92 : 1,
                          }}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            event.preventDefault();

                            if (
                              edgeDragState &&
                              edgeDragState.sourceNodeId !== node.node_id
                            ) {
                              void handleCreateEdge(
                                edgeDragState.sourceNodeId,
                                node.node_id,
                              );
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
            </div>

            {graphMode === "project" && visualNodes.length === 0 ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
                <div className="w-full max-w-[480px] rounded-xl border border-[var(--border)] bg-[var(--mantle)] p-6 text-center">
                  <p className="text-heading">
                    This project graph is empty
                  </p>
                  <p className="text-meta mt-2 text-[var(--subtext-0)]">
                    Build a relationship map from project signals, then inspect it here.
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
                      <Sparkles className="mr-2 h-3.5 w-3.5" />
                      {isAutoGenerating ? "Generating…" : "Generate from signals"}
                    </Button>
                    <Button variant="ghost" onClick={() => setInteractionMode("construct")}>
                      Switch to Construct
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Minimap (construct only) */}
          {!isInsightMode && showMinimap ? (
            <div
              data-graph-interactive="true"
              className="absolute bottom-4 right-4 z-30 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--mantle)] p-1.5"
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
              <div className="relative h-[120px] w-[180px] overflow-hidden rounded bg-[var(--crust)]">
                {renderedFilteredNodes.map((node) => (
                  <span
                    key={`mini-${node.node_id}`}
                    className="absolute h-1 w-1 rounded-full"
                    style={{
                      left: `${(node.position.x / WORLD_WIDTH) * 100}%`,
                      top: `${(node.position.y / WORLD_HEIGHT) * 100}%`,
                      background:
                        selectedNodeIdSet.has(node.node_id) ||
                        node.node_id === selectedNodeId
                          ? "var(--accent)"
                          : shortestPathNodeIdSet.has(node.node_id)
                            ? "#b4befe"
                            : "var(--overlay-1)",
                    }}
                  />
                ))}
                <div
                  className="pointer-events-none absolute border border-[var(--accent-border)] bg-[var(--accent-soft)]"
                  style={buildMinimapViewportRect(viewport, viewportRef.current)}
                />
              </div>
            </div>
          ) : null}

          {/* Floating construct toolbar (construct only) */}
          {isConstructMode && (
            <div className="pointer-events-auto absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
              <div className="flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--mantle)] p-1 shadow-[var(--shadow-elevated)]">
                <ToolbarBtn
                  title="Create node"
                  onClick={() => {
                    setRailTab("controls");
                    setRailOpen(true);
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="font-ui text-[11px] font-medium">New</span>
                </ToolbarBtn>
                <ToolbarBtn
                  title={placeMode ? "Cancel placement" : "Place node on canvas"}
                  active={placeMode}
                  disabled={
                    (graphMode === "project" && !graphProjectId) ||
                    !createLabel.trim()
                  }
                  onClick={() => setPlaceMode((c) => !c)}
                >
                  <Crosshair className="h-3.5 w-3.5" />
                </ToolbarBtn>
                <div className="mx-1 h-5 w-px bg-[var(--border)]" />
                <ToolbarBtn
                  title="Start link from selected"
                  disabled={!selectedNode && activeSelectedNodeIds.length === 0}
                  active={Boolean(connectSourceId)}
                  onClick={() => {
                    if (!selectedNode && activeSelectedNodeIds.length === 0) return;
                    const sourceNodeId =
                      selectedNode?.node_id ?? activeSelectedNodeIds[0];
                    if (!sourceNodeId) return;
                    setConnectSourceId(sourceNodeId);
                    setSelectedEdgeId(null);
                    setSelectedEdgeIds([]);
                    setStatusMessage(
                      `Select a target for ${findNodeLabel(nodes, sourceNodeId)}.`,
                    );
                  }}
                >
                  <Link2 className="h-3.5 w-3.5" />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Cancel link"
                  disabled={!connectSourceId}
                  onClick={() => setConnectSourceId(null)}
                >
                  <Unlink className="h-3.5 w-3.5" />
                </ToolbarBtn>
                <div className="mx-1 h-5 w-px bg-[var(--border)]" />
                <ToolbarBtn
                  title="Undo"
                  disabled={historyStats.undoCount === 0}
                  onClick={() => void handleUndo()}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </ToolbarBtn>
                <ToolbarBtn
                  title="Redo"
                  disabled={historyStats.redoCount === 0}
                  onClick={() => void handleRedo()}
                >
                  <Redo2 className="h-3.5 w-3.5" />
                </ToolbarBtn>
                <div className="mx-1 h-5 w-px bg-[var(--border)]" />
                <ToolbarBtn
                  title="Delete selected"
                  disabled={
                    selectedNodeIds.length === 0 && selectedEdgeIds.length === 0
                  }
                  onClick={() => {
                    if (selectedNodeIds.length > 0)
                      void handleDeleteNodes(selectedNodeIds);
                    if (selectedEdgeIds.length > 0)
                      void handleDeleteEdges(selectedEdgeIds);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </ToolbarBtn>
              </div>
            </div>
          )}

          {/* Floating status (bottom-left) */}
          {(statusMessage || errorMessage) && (
            <div className="pointer-events-none absolute bottom-4 left-4 z-30">
              <div
                className={cn(
                  "rounded-md border px-3 py-1.5 font-ui text-[11px] backdrop-blur",
                  errorMessage
                    ? "border-[rgba(240,63,63,0.4)] bg-[rgba(240,63,63,0.1)] text-[#f03f3f]"
                    : "border-[rgba(166,227,161,0.4)] bg-[rgba(166,227,161,0.1)] text-[#a6e3a1]",
                )}
              >
                {errorMessage ?? statusMessage}
              </div>
            </div>
          )}

          {/* Graph stats strip (top-left of canvas) */}
          <div className="pointer-events-none absolute left-4 top-4 z-30 flex gap-2">
            <StatChip label="Nodes" value={`${filteredNodes.length}/${visualNodes.length}`} />
            <StatChip label="Edges" value={`${filteredEdges.length}/${edges.length}`} />
            {isInsightMode ? null : (
              <StatChip label="Zoom" value={`${Math.round(viewport.scale * 100)}%`} />
            )}
            {shortestPathNodeIds.length > 1 && (
              <StatChip
                label="Route"
                value={`${shortestPathNodeIds.length - 1}h`}
                accent
              />
            )}
          </div>
        </div>
      </div>

      {/* ============================================================
          Right rail — tabbed Inspect | Controls
          ============================================================ */}
      <aside
        className={cn(
          "relative z-30 flex shrink-0 flex-col border-l border-[var(--border)] bg-[var(--mantle)]",
          "transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
        )}
        style={{ width: railOpen ? 340 : 0 }}
      >
        {railOpen && (
          <>
            {/* Tab toggle */}
            <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--border)] px-3">
              <RailTab
                label="Inspect"
                active={railTab === "inspect"}
                onClick={() => setRailTab("inspect")}
              />
              <RailTab
                label="Controls"
                active={railTab === "controls"}
                onClick={() => setRailTab("controls")}
              />
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setRailOpen(false)}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--overlay-1)] transition-colors duration-150 hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
                title="Hide"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto">
              {railTab === "inspect" ? (
                /* ============ INSPECT PANEL ============ */
                <div className="flex flex-col divide-y divide-[var(--border)]">
                  {/* Multi-select */}
                  {selectedNodeIds.length > 1 || selectedEdgeIds.length > 1 ? (
                    <div className="flex flex-col gap-3 px-4 py-4">
                      <span className="text-label">Multi-selection</span>
                      <p className="text-meta text-[var(--subtext-0)]">
                        {selectedNodeIds.length} node{selectedNodeIds.length === 1 ? "" : "s"} /{" "}
                        {selectedEdgeIds.length} edge{selectedEdgeIds.length === 1 ? "" : "s"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={handleUseSelectedForPath}
                          disabled={selectedNodeIds.length < 2}
                        >
                          <Route className="mr-1.5 h-3 w-3" />
                          Route
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={handleApplyEgoFromSelection}
                          disabled={selectedNodeIds.length === 0}
                        >
                          <Orbit className="mr-1.5 h-3 w-3" />
                          Ego
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={!isConstructMode}
                          onClick={() => {
                            if (selectedNodeIds.length > 0)
                              void handleDeleteNodes(selectedNodeIds);
                            if (selectedEdgeIds.length > 0)
                              void handleDeleteEdges(selectedEdgeIds);
                          }}
                        >
                          <Trash2 className="mr-1.5 h-3 w-3" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ) : selectedNode ? (
                    /* Single node */
                    <>
                      <div className="flex flex-col gap-2 px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{
                              background: ENTITY_STYLES[selectedNode.entity_type].accent,
                            }}
                          />
                          <span
                            className="font-ui text-[9px] font-semibold uppercase tracking-[0.14em]"
                            style={{
                              color: ENTITY_STYLES[selectedNode.entity_type].accent,
                            }}
                          >
                            {selectedNode.entity_type}
                          </span>
                        </div>
                        {isConstructMode ? (
                          <Input
                            value={nodeDraftLabel}
                            onChange={(e) => setNodeDraftLabel(e.target.value)}
                            placeholder="Node label"
                          />
                        ) : (
                          <p className="text-heading">{selectedNode.label}</p>
                        )}
                        {isConstructMode && (
                          <select
                            className="h-8 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                            value={nodeDraftType}
                            onChange={(e) =>
                              setNodeDraftType(e.target.value as GraphEntityType)
                            }
                          >
                            <option value="person">Person</option>
                            <option value="organisation">Organisation</option>
                            <option value="location">Location</option>
                            <option value="event">Event</option>
                          </select>
                        )}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {isConstructMode && (
                            <Button
                              size="sm"
                              onClick={() => void handleSaveSelectedNode()}
                              disabled={!nodeDraftLabel.trim()}
                            >
                              Save
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              if (isInsightMode)
                                insightGraphRef.current?.centerAt(selectedNode.node_id);
                              else centerViewportOnNode(selectedNode.node_id);
                            }}
                          >
                            Center
                          </Button>
                          {isConstructMode && (
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
                                <Link2 className="mr-1 h-3 w-3" />
                                Link
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void handleDeleteNode(selectedNode.node_id)}
                              >
                                <Trash2 className="mr-1 h-3 w-3" />
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 px-4 py-4">
                        <span className="text-label">
                          Connections ({selectedNodeRelations.length})
                        </span>
                        {selectedNodeRelations.length === 0 ? (
                          <p className="text-meta">No linked entities yet.</p>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {selectedNodeRelations.map((relation) => (
                              <button
                                key={relation.edgeId}
                                type="button"
                                className="flex items-center justify-between rounded px-1.5 py-1 text-left transition-colors duration-150 hover:bg-[var(--surface-wash)]"
                                onClick={() => {
                                  selectSingleNode(relation.otherNodeId);
                                  setSelectedEdgeId(relation.edgeId);
                                  setSelectedEdgeIds([relation.edgeId]);
                                  if (isInsightMode)
                                    insightGraphRef.current?.centerAt(relation.otherNodeId);
                                  else centerViewportOnNode(relation.otherNodeId);
                                }}
                              >
                                <span className="text-meta flex items-center gap-1.5 truncate text-[var(--subtext-1)]">
                                  <span className="text-[var(--overlay-0)]">
                                    {relation.direction === "in" ? "←" : "→"}
                                  </span>
                                  <span className="truncate">{relation.otherLabel}</span>
                                </span>
                                {relation.label && (
                                  <span className="ml-2 truncate font-mono text-[10px] text-[var(--overlay-1)]">
                                    {truncateLabel(relation.label, 16)}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  ) : selectedEdge ? (
                    /* Single edge */
                    <div className="flex flex-col gap-3 px-4 py-4">
                      <span className="text-label">Connection</span>
                      <p className="text-ui font-medium">
                        {findNodeLabel(nodes, selectedEdge.source_node_id)}{" "}
                        <span className="text-[var(--overlay-0)]">→</span>{" "}
                        {findNodeLabel(nodes, selectedEdge.target_node_id)}
                      </p>
                      {isConstructMode ? (
                        <>
                          <Input
                            value={edgeDraftLabel}
                            onChange={(e) => setEdgeDraftLabel(e.target.value)}
                            placeholder="Relationship label"
                          />
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              size="sm"
                              onClick={() => void handleSaveSelectedEdge()}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => void handleDeleteEdge(selectedEdge.edge_id)}
                            >
                              <Trash2 className="mr-1 h-3 w-3" />
                              Delete
                            </Button>
                          </div>
                        </>
                      ) : (
                        <p className="text-meta text-[var(--subtext-0)]">
                          {selectedEdge.label?.trim() ?? "Unlabeled relationship"}
                        </p>
                      )}
                    </div>
                  ) : (
                    /* No selection — stats */
                    <>
                      <div className="flex flex-col gap-3 px-4 py-4">
                        <span className="text-label">Overview</span>
                        <div className="grid grid-cols-2 gap-3">
                          <StatBlock label="Nodes" value={visualNodes.length} />
                          <StatBlock label="Edges" value={edges.length} />
                          <StatBlock
                            label="Density"
                            value={`${(graphMetrics.edgeDensity * 100).toFixed(1)}%`}
                          />
                          <StatBlock
                            label="Labeled"
                            value={`${graphMetrics.labeledEdges}/${filteredEdges.length}`}
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 px-4 py-4">
                        <span className="text-label">Entities</span>
                        <div className="flex flex-col gap-1">
                          {(
                            Object.keys(ENTITY_STYLES) as GraphEntityType[]
                          ).map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => toggleEntityTypeFilter(type)}
                              className={cn(
                                "flex items-center justify-between rounded px-2 py-1.5 transition-colors duration-150",
                                entityTypeFilters[type]
                                  ? "hover:bg-[var(--surface-wash)]"
                                  : "opacity-50 hover:opacity-80 hover:bg-[var(--surface-wash)]",
                              )}
                            >
                              <span className="flex items-center gap-2">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ background: ENTITY_STYLES[type].accent }}
                                />
                                <span className="text-meta capitalize text-[var(--subtext-1)]">
                                  {type}
                                </span>
                              </span>
                              <span className="font-mono text-[11px] text-[var(--overlay-1)]">
                                {graphMetrics.typeCounts[type]}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="px-4 py-4">
                        <p className="text-meta">
                          Click a node or edge to inspect. Shift-click to multi-select.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* ============ CONTROLS PANEL ============ */
                <div className="flex flex-col divide-y divide-[var(--border)]">
                  {/* Create node (construct only) */}
                  {isConstructMode && (
                    <div className="flex flex-col gap-2 px-4 py-4">
                      <span className="text-label">New node</span>
                      <Input
                        placeholder="Node label"
                        value={createLabel}
                        onChange={(e) => setCreateLabel(e.target.value)}
                      />
                      <select
                        className="h-8 rounded-md border border-[var(--border)] bg-[var(--mantle)] px-2 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                        value={createEntityType}
                        onChange={(e) =>
                          setCreateEntityType(e.target.value as GraphEntityType)
                        }
                      >
                        <option value="person">Person</option>
                        <option value="organisation">Organisation</option>
                        <option value="location">Location</option>
                        <option value="event">Event</option>
                      </select>
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          size="sm"
                          onClick={() => void handleCreateNode()}
                          disabled={
                            (graphMode === "project" && !graphProjectId) ||
                            !createLabel.trim()
                          }
                        >
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant={placeMode ? "primary" : "secondary"}
                          onClick={() => setPlaceMode((c) => !c)}
                          disabled={
                            (graphMode === "project" && !graphProjectId) ||
                            !createLabel.trim()
                          }
                        >
                          <Crosshair className="mr-1 h-3 w-3" />
                          {placeMode ? "Cancel" : "Place"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Connection label (construct only) */}
                  {isConstructMode && (
                    <div className="flex flex-col gap-2 px-4 py-4">
                      <span className="text-label">Next link label</span>
                      <Input
                        placeholder="Relationship label"
                        value={connectLabel}
                        onChange={(e) => setConnectLabel(e.target.value)}
                      />
                      <p className="text-meta">
                        Applied to the next connection you create.
                      </p>
                    </div>
                  )}

                  {/* Filters */}
                  <div className="flex flex-col gap-2 px-4 py-4">
                    <span className="text-label">Filters</span>
                    <div className="flex flex-col gap-1">
                      {(Object.keys(ENTITY_STYLES) as GraphEntityType[]).map((type) => (
                        <label
                          key={type}
                          className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 transition-colors duration-150 hover:bg-[var(--surface-wash)]"
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={entityTypeFilters[type]}
                              onChange={() => toggleEntityTypeFilter(type)}
                              className="accent-[var(--accent)]"
                            />
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ background: ENTITY_STYLES[type].accent }}
                            />
                            <span className="text-meta capitalize text-[var(--subtext-1)]">
                              {type}
                            </span>
                          </span>
                          <span className="font-mono text-[11px] text-[var(--overlay-1)]">
                            {graphMetrics.typeCounts[type]}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-col gap-1.5">
                      <label className="flex cursor-pointer items-center gap-2 px-2 py-1">
                        <input
                          type="checkbox"
                          checked={showEdgeLabels}
                          onChange={() => setShowEdgeLabels((c) => !c)}
                          className="accent-[var(--accent)]"
                        />
                        <span className="text-meta text-[var(--subtext-1)]">
                          Edge labels
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 px-2 py-1">
                        <input
                          type="checkbox"
                          checked={showMinimap}
                          onChange={() => setShowMinimap((c) => !c)}
                          className="accent-[var(--accent)]"
                        />
                        <span className="text-meta text-[var(--subtext-1)]">
                          Minimap (Construct)
                        </span>
                      </label>
                      <Button
                        size="sm"
                        variant={focusMode === "selection" ? "primary" : "secondary"}
                        className="mt-1 w-full"
                        onClick={() =>
                          setFocusMode((c) => (c === "selection" ? "all" : "selection"))
                        }
                        disabled={activeSelectedNodeIds.length === 0}
                      >
                        {focusMode === "selection" ? "Selection focus on" : "Focus selection"}
                      </Button>
                    </div>
                  </div>

                  {/* Insight layout (insight only) */}
                  {isInsightMode && (
                    <div className="flex flex-col gap-3 px-4 py-4">
                      <div className="flex items-center justify-between">
                        <span className="text-label">Layout</span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant={insightAutoLayout ? "primary" : "secondary"}
                            onClick={() => setInsightAutoLayout((c) => !c)}
                          >
                            {insightAutoLayout ? "Live" : "Paused"}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setInsightLayoutTick((c) => c + 1)}
                          >
                            Reflow
                          </Button>
                        </div>
                      </div>
                      <SliderRow
                        label={`Spread (${insightRepulsion.toFixed(2)})`}
                        value={insightRepulsion}
                        min={0.8}
                        max={3.2}
                        step={0.05}
                        onChange={setInsightRepulsion}
                      />
                      <SliderRow
                        label={`Link distance (${Math.round(insightLinkDistance)})`}
                        value={insightLinkDistance}
                        min={140}
                        max={520}
                        step={10}
                        onChange={setInsightLinkDistance}
                      />
                      <SliderRow
                        label={`Center pull (${insightCenterPull.toFixed(2)})`}
                        value={insightCenterPull}
                        min={0.01}
                        max={0.2}
                        step={0.01}
                        onChange={setInsightCenterPull}
                      />
                      <div className="flex flex-col gap-1.5">
                        <span className="text-label">Label density</span>
                        <div className="flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--base)] p-0.5">
                          {(["context", "selected", "all"] as const).map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setInsightLabelMode(mode)}
                              className={cn(
                                "flex-1 rounded px-2 py-1 font-ui text-[11px] font-medium capitalize transition-colors duration-150",
                                insightLabelMode === mode
                                  ? "bg-[var(--surface-wash-strong)] text-[var(--text)]"
                                  : "text-[var(--subtext-0)] hover:text-[var(--text)]",
                              )}
                            >
                              {mode}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Shortest path */}
                  <div className="flex flex-col gap-2 px-4 py-4">
                    <span className="text-label">Shortest path</span>
                    <NodePicker
                      nodes={visualNodes}
                      value={pathFromNodeId}
                      onChange={setPathFromNodeId}
                      placeholder="From…"
                      entityAccent={INSIGHT_NODE_COLORS}
                    />
                    <NodePicker
                      nodes={visualNodes}
                      value={pathToNodeId}
                      onChange={setPathToNodeId}
                      placeholder="To…"
                      entityAccent={INSIGHT_NODE_COLORS}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleUseSelectedForPath}
                      >
                        Use selection
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleFindShortestPath}
                        disabled={!pathFromNodeId || !pathToNodeId}
                      >
                        Find
                      </Button>
                      {shortestPathNodeIds.length > 0 && (
                        <Button size="sm" variant="ghost" onClick={clearPathAnalysis}>
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Ego network */}
                  <div className="flex flex-col gap-2 px-4 py-4">
                    <span className="text-label">Ego network</span>
                    <NodePicker
                      nodes={visualNodes}
                      value={egoCenterNodeId}
                      onChange={setEgoCenterNodeId}
                      placeholder="Center…"
                      entityAccent={INSIGHT_NODE_COLORS}
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={4}
                        value={egoDepth}
                        onChange={(e) =>
                          setEgoDepth(clamp(Number(e.target.value) || 1, 1, 4))
                        }
                        className="h-8 w-20"
                      />
                      <span className="text-meta">Depth (1–4)</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleApplyEgoFromSelection}
                      >
                        Use selection
                      </Button>
                      {egoCenterNodeId && (
                        <Button size="sm" variant="ghost" onClick={handleClearEgoNetwork}>
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </aside>

      {/* ============================================================
          Clear graph confirm dialog
          ============================================================ */}
      {clearConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,7,8,0.72)] p-6 backdrop-blur-sm"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setClearConfirmOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Clear graph"
            className="flex w-full max-w-[380px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div className="min-w-0">
                <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--overlay-1)]">
                  Graph
                </p>
                <h3 className="mt-1 font-ui text-[15px] font-medium text-[var(--text)]">
                  Clear entire graph?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setClearConfirmOpen(false)}
                aria-label="Close"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="font-ui text-[13px] text-[var(--subtext-0)]">
                Removes all{" "}
                <span className="text-[var(--text)]">{nodes.length} nodes</span> and{" "}
                <span className="text-[var(--text)]">{edges.length} edges</span> from the canvas.
                You can undo immediately after.
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setClearConfirmOpen(false)}
                  className="font-ui text-[12px] text-[var(--subtext-0)] hover:text-[var(--text)]"
                >
                  Cancel
                </button>
                <Button variant="destructive" size="sm" onClick={() => void handleClearGraph()}>
                  <Trash2 className="mr-1.5 h-3 w-3" />
                  Clear graph
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          Export PNG modal
          ============================================================ */}
      {exportModalOpen && exportDataUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(3,7,8,0.72)] p-6 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setExportModalOpen(false);
              setExportDataUrl(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Export graph as PNG"
            className="flex w-full max-w-[480px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--mantle)] shadow-[0_30px_80px_rgba(0,0,0,0.55)]"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
              <div className="min-w-0">
                <p className="font-ui text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--overlay-1)]">
                  Graph
                </p>
                <h3 className="mt-1 font-ui text-[15px] font-medium text-[var(--text)]">
                  Export as PNG
                </h3>
              </div>
              <button
                type="button"
                onClick={() => { setExportModalOpen(false); setExportDataUrl(null); }}
                aria-label="Close"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--overlay-1)] transition-colors hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="grid gap-4 px-5 py-4">
              {/* Preview */}
              <div
                className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--crust)]"
                style={{ height: 110 }}
              >
                <img src={exportDataUrl} alt="" className="h-full w-full object-contain" />
              </div>

              {/* Filename */}
              <label className="grid gap-1.5">
                <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                  Filename
                </span>
                <div className="flex items-center gap-1.5">
                  <input
                    value={exportFilename}
                    onChange={(e) => setExportFilename(e.target.value)}
                    autoFocus
                    className="h-9 flex-1 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                  />
                  <span className="font-ui text-[12px] text-[var(--overlay-1)]">.png</span>
                </div>
              </label>

              {/* Target */}
              <div className="grid gap-1.5">
                <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                  Save to
                </span>
                <div className="flex items-center gap-0.5 rounded-md border border-[var(--border)] bg-[var(--base)] p-0.5">
                  {(["project", "investigation"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setExportTarget(t);
                        setExportTargetId(
                          t === "project"
                            ? (projects?.[0]?.id ?? null)
                            : (investigations?.[0]?.case_id ?? null),
                        );
                      }}
                      className={cn(
                        "flex-1 rounded px-3 py-1.5 font-ui text-[11px] font-medium capitalize transition-colors duration-150",
                        exportTarget === t
                          ? "bg-[var(--surface-wash-strong)] text-[var(--text)]"
                          : "text-[var(--subtext-0)] hover:text-[var(--text)]",
                      )}
                    >
                      {t === "project" ? "Project" : "Investigation"}
                    </button>
                  ))}
                </div>
                {exportTarget === "project" ? (
                  <select
                    value={String(exportTargetId ?? "")}
                    onChange={(e) => setExportTargetId(Number(e.target.value))}
                    className="h-9 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                  >
                    {(projects ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={String(exportTargetId ?? "")}
                    onChange={(e) => setExportTargetId(e.target.value)}
                    className="h-9 rounded-md border border-[var(--border)] bg-[var(--base)] px-2.5 font-ui text-[12px] text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                  >
                    {(investigations ?? []).map((inv) => (
                      <option key={inv.case_id} value={inv.case_id}>
                        {inv.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setExportModalOpen(false); setExportDataUrl(null); }}
                  disabled={exportSaving}
                  className="font-ui text-[12px] text-[var(--subtext-0)] hover:text-[var(--text)]"
                >
                  Cancel
                </button>
                <Button
                  onClick={() => void handleSaveGraphExport()}
                  disabled={exportSaving || !exportTargetId}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  {exportSaving ? "Saving…" : "Save to vault"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Topbar / rail / toolbar primitives
// ============================================================

function TopbarIconBtn({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded text-[var(--overlay-1)]",
        "transition-colors duration-150",
        "hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--overlay-1)]",
      )}
    >
      {children}
    </button>
  );
}

function OverflowItem({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center px-3 py-1.5 text-left font-ui text-[12px] transition-colors duration-150",
        disabled
          ? "cursor-not-allowed text-[var(--overlay-0)]"
          : "text-[var(--subtext-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
      )}
    >
      {label}
    </button>
  );
}

function RailTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2.5 py-1 font-ui text-[11px] font-medium transition-colors duration-150",
        active
          ? "bg-[var(--surface-wash-strong)] text-[var(--text)]"
          : "text-[var(--subtext-0)] hover:text-[var(--text)]",
      )}
    >
      {label}
    </button>
  );
}

function ToolbarBtn({
  children,
  onClick,
  title,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded px-2 transition-colors duration-150",
        active
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "text-[var(--subtext-0)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]",
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}

function StatChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1 backdrop-blur",
        accent
          ? "border-[var(--accent-border)] bg-[var(--accent-soft)]"
          : "border-[var(--border)] bg-[rgba(24,24,37,0.85)]",
      )}
    >
      <span
        className={cn(
          "font-ui text-[9px] font-semibold uppercase tracking-[0.14em]",
          accent ? "text-[var(--accent)]" : "text-[var(--overlay-1)]",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-mono text-[11px] tabular-nums",
          accent ? "text-[var(--accent)]" : "text-[var(--text)]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-ui text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
        {label}
      </span>
      <span className="font-mono text-[16px] tabular-nums text-[var(--text)]">{value}</span>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-meta">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-[var(--accent)]"
      />
    </label>
  );
}
