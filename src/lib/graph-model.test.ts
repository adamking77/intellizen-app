import { describe, expect, it } from "vitest";

import {
  filterGraph,
  findGraphShortestPath,
  graphEgoNetwork,
  graphSnapshotsEqual,
  type GraphSnapshot,
  type GraphVisualNode,
} from "@/lib/graph-model";
import type { GraphEdgeRecord } from "@/lib/types";

const nodes = [
  {
    node_id: "a",
    label: "Adam",
    entity_type: "person",
    position: { x: 0, y: 0 },
  },
  {
    node_id: "b",
    label: "GenZen",
    entity_type: "organisation",
    position: { x: 100, y: 0 },
  },
  {
    node_id: "c",
    label: "Tbilisi",
    entity_type: "location",
    position: { x: 200, y: 0 },
  },
] as GraphVisualNode[];

const edges = [
  {
    edge_id: "ab",
    source_node_id: "a",
    target_node_id: "b",
    label: "founded",
  },
  {
    edge_id: "bc",
    source_node_id: "b",
    target_node_id: "c",
    label: null,
  },
] as GraphEdgeRecord[];

describe("graph model", () => {
  it("finds a stable undirected shortest path with its edge evidence", () => {
    expect(findGraphShortestPath(edges, "a", "c")).toEqual({
      nodeIds: ["a", "b", "c"],
      edgeIds: ["ab", "bc"],
    });
    expect(findGraphShortestPath(edges, "a", "missing")).toBeNull();
  });

  it("bounds ego depth and filters nodes and edges as one model", () => {
    const ego = graphEgoNetwork(edges, "a", 1);
    expect([...ego!]).toEqual(["a", "b"]);
    const filtered = filterGraph({
      nodes,
      edges,
      entityTypeFilters: {
        person: true,
        organisation: true,
        location: true,
        event: true,
      },
      focusNodeIds: null,
      egoNodeIds: ego,
      search: "",
    });
    expect(filtered.nodes.map((node) => node.node_id)).toEqual(["a", "b"]);
    expect(filtered.edges.map((edge) => edge.edge_id)).toEqual(["ab"]);
    expect(filtered.metrics.labeledEdges).toBe(1);
  });

  it("treats snapshot ordering as irrelevant but content as authoritative", () => {
    const snapshot: GraphSnapshot = {
      projectId: 7,
      nodes: nodes.map((node) => ({
        nodeId: node.node_id,
        label: node.label,
        entityType: node.entity_type,
        x: node.position.x,
        y: node.position.y,
      })),
      edges: edges.map((edge) => ({
        edgeId: edge.edge_id,
        sourceNodeId: edge.source_node_id,
        targetNodeId: edge.target_node_id,
        label: edge.label,
      })),
    };
    expect(
      graphSnapshotsEqual(snapshot, {
        ...snapshot,
        nodes: [...snapshot.nodes].reverse(),
        edges: [...snapshot.edges].reverse(),
      }),
    ).toBe(true);
    expect(
      graphSnapshotsEqual(snapshot, {
        ...snapshot,
        nodes: snapshot.nodes.map((node) =>
          node.nodeId === "a" ? { ...node, label: "Changed" } : node,
        ),
      }),
    ).toBe(false);
  });
});
