import type {
  GraphEdgeRecord,
  GraphEntityType,
  GraphNodeRecord,
} from "@/lib/types";

export interface GraphVisualNode extends GraphNodeRecord {
  position: { x: number; y: number };
}

export interface GraphSnapshot {
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
}

export function graphSnapshotsEqual(
  left: GraphSnapshot,
  right: GraphSnapshot,
) {
  if (left.projectId !== right.projectId) return false;
  if (
    left.nodes.length !== right.nodes.length ||
    left.edges.length !== right.edges.length
  ) {
    return false;
  }
  const nodeSignature = (snapshot: GraphSnapshot) =>
    snapshot.nodes
      .map(
        (node) =>
          `${node.nodeId}|${node.label}|${node.entityType}|${node.x}|${node.y}`,
      )
      .sort()
      .join(";");
  const edgeSignature = (snapshot: GraphSnapshot) =>
    snapshot.edges
      .map(
        (edge) =>
          `${edge.edgeId}|${edge.sourceNodeId}|${edge.targetNodeId}|${edge.label ?? ""}`,
      )
      .sort()
      .join(";");
  return (
    nodeSignature(left) === nodeSignature(right) &&
    edgeSignature(left) === edgeSignature(right)
  );
}

export function graphNeighborhood(
  edges: GraphEdgeRecord[],
  selectedNodeIds: string[],
) {
  const selected = new Set(selectedNodeIds);
  const neighbors = new Set(selectedNodeIds);
  for (const edge of edges) {
    if (selected.has(edge.source_node_id)) {
      neighbors.add(edge.target_node_id);
    }
    if (selected.has(edge.target_node_id)) {
      neighbors.add(edge.source_node_id);
    }
  }
  return neighbors;
}

export function graphEgoNetwork(
  edges: GraphEdgeRecord[],
  centerNodeId: string | null,
  requestedDepth: number,
) {
  if (!centerNodeId) return null;
  const depthLimit = Math.min(Math.max(Math.round(requestedDepth), 1), 4);
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const source = adjacency.get(edge.source_node_id) ?? [];
    source.push(edge.target_node_id);
    adjacency.set(edge.source_node_id, source);
    const target = adjacency.get(edge.target_node_id) ?? [];
    target.push(edge.source_node_id);
    adjacency.set(edge.target_node_id, target);
  }

  const visited = new Set([centerNodeId]);
  const queue = [{ nodeId: centerNodeId, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (!current || current.depth >= depthLimit) continue;
    for (const nextNodeId of adjacency.get(current.nodeId) ?? []) {
      if (visited.has(nextNodeId)) continue;
      visited.add(nextNodeId);
      queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
    }
  }
  return visited;
}

export function graphRelations(
  nodes: GraphNodeRecord[],
  edges: GraphEdgeRecord[],
  selectedNodeId: string | null,
) {
  if (!selectedNodeId) return [];
  const labels = new Map(nodes.map((node) => [node.node_id, node.label]));
  return edges
    .filter(
      (edge) =>
        edge.source_node_id === selectedNodeId ||
        edge.target_node_id === selectedNodeId,
    )
    .map((edge) => {
      const incoming = edge.target_node_id === selectedNodeId;
      const otherNodeId = incoming
        ? edge.source_node_id
        : edge.target_node_id;
      return {
        edgeId: edge.edge_id,
        otherNodeId,
        otherLabel: labels.get(otherNodeId) ?? "Unknown node",
        label: edge.label ?? "unlabeled",
        direction: incoming ? ("in" as const) : ("out" as const),
      };
    })
    .sort((left, right) => left.otherLabel.localeCompare(right.otherLabel));
}

export function filterGraph(input: {
  nodes: GraphVisualNode[];
  edges: GraphEdgeRecord[];
  entityTypeFilters: Record<GraphEntityType, boolean>;
  focusNodeIds: Set<string> | null;
  egoNodeIds: Set<string> | null;
  search: string;
}) {
  const search = input.search.trim().toLowerCase();
  const nodes = input.nodes.filter((node) => {
    if (!input.entityTypeFilters[node.entity_type]) return false;
    if (input.focusNodeIds?.size && !input.focusNodeIds.has(node.node_id)) {
      return false;
    }
    if (input.egoNodeIds && !input.egoNodeIds.has(node.node_id)) return false;
    return !search || node.label.toLowerCase().includes(search);
  });
  const nodeIds = new Set(nodes.map((node) => node.node_id));
  const edges = input.edges.filter(
    (edge) =>
      nodeIds.has(edge.source_node_id) && nodeIds.has(edge.target_node_id),
  );
  const degreeByNodeId = new Map(nodes.map((node) => [node.node_id, 0]));
  for (const edge of edges) {
    degreeByNodeId.set(
      edge.source_node_id,
      (degreeByNodeId.get(edge.source_node_id) ?? 0) + 1,
    );
    degreeByNodeId.set(
      edge.target_node_id,
      (degreeByNodeId.get(edge.target_node_id) ?? 0) + 1,
    );
  }
  const typeCounts = {
    person: 0,
    organisation: 0,
    location: 0,
    event: 0,
  } satisfies Record<GraphEntityType, number>;
  for (const node of nodes) typeCounts[node.entity_type] += 1;
  return {
    nodes,
    edges,
    degreeByNodeId,
    metrics: {
      typeCounts,
      labeledEdges: edges.filter((edge) => Boolean(edge.label?.trim())).length,
      edgeDensity:
        nodes.length > 1
          ? edges.length / ((nodes.length * (nodes.length - 1)) / 2)
          : 0,
    },
  };
}

export function findGraphShortestPath(
  edges: GraphEdgeRecord[],
  fromNodeId: string,
  toNodeId: string,
) {
  if (fromNodeId === toNodeId) {
    return { nodeIds: [fromNodeId], edgeIds: [] };
  }
  const adjacency = new Map<
    string,
    Array<{ nodeId: string; edgeId: string }>
  >();
  for (const edge of edges) {
    const source = adjacency.get(edge.source_node_id) ?? [];
    source.push({ nodeId: edge.target_node_id, edgeId: edge.edge_id });
    adjacency.set(edge.source_node_id, source);
    const target = adjacency.get(edge.target_node_id) ?? [];
    target.push({ nodeId: edge.source_node_id, edgeId: edge.edge_id });
    adjacency.set(edge.target_node_id, target);
  }

  const queue = [fromNodeId];
  const visited = new Set([fromNodeId]);
  const previous = new Map<string, { nodeId: string; edgeId: string }>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || current === toNodeId) break;
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next.nodeId)) continue;
      visited.add(next.nodeId);
      previous.set(next.nodeId, { nodeId: current, edgeId: next.edgeId });
      queue.push(next.nodeId);
    }
  }
  if (!previous.has(toNodeId)) return null;

  const nodeIds = [toNodeId];
  const edgeIds: string[] = [];
  let cursor = toNodeId;
  while (cursor !== fromNodeId) {
    const step = previous.get(cursor);
    if (!step) return null;
    edgeIds.push(step.edgeId);
    nodeIds.push(step.nodeId);
    cursor = step.nodeId;
  }
  return { nodeIds: nodeIds.reverse(), edgeIds: edgeIds.reverse() };
}
