import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, Trash2 } from "lucide-react";

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
} from "@/lib/data";
import type { GraphEntityType } from "@/lib/types";

const ENTITY_COLORS: Record<GraphEntityType, string> = {
  person: "rgba(127, 230, 202, 0.14)",
  organisation: "rgba(117, 166, 255, 0.14)",
  location: "rgba(242, 193, 86, 0.16)",
  event: "rgba(210, 128, 110, 0.16)",
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

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
  });

  useEffect(() => {
    if ((graphProjectId === null || !projects?.some((p) => p.id === graphProjectId)) && projects && projects.length > 0) {
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
    if (!edgeSourceId && nodes[0]) setEdgeSourceId(nodes[0].node_id);
    if (!edgeTargetId && nodes[1]) setEdgeTargetId(nodes[1].node_id);
    if (nodes.length === 1 && !edgeTargetId) setEdgeTargetId(nodes[0].node_id);
  }, [nodes, edgeSourceId, edgeTargetId]);

  async function handleAddNode() {
    if (!graphProjectId || !label.trim()) return;

    try {
      setErrorMessage(null);
      setStatusMessage(null);

      await createGraphNode({
        projectId: graphProjectId,
        nodeId: crypto.randomUUID(),
        label: label.trim(),
        entityType,
        position: {
          x: 80 + (nodes.length % 4) * 160,
          y: 80 + Math.floor(nodes.length / 4) * 120,
        },
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
              onChange={(event) =>
                setEntityType(event.target.value as GraphEntityType)
              }
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
              {nodes.map((node) => (
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
              {nodes.map((node) => (
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
            <Badge variant="neutral">Nodes {nodes.length}</Badge>
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
            <CardTitle>Nodes</CardTitle>
          </CardHeader>
          <CardContent>
            {nodes.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No nodes stored for this project.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {nodes.map((node) => (
                  <div
                    key={node.node_id}
                    className="rounded-2xl border border-[var(--border)] p-4"
                    style={{ background: ENTITY_COLORS[node.entity_type] }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-[var(--foreground)]">{node.label}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                          {node.entity_type}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleDeleteNode(node.node_id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="mt-3 text-xs text-[var(--muted-foreground)]">
                      Position {Math.round(node.position_x)}, {Math.round(node.position_y)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connections</CardTitle>
          </CardHeader>
          <CardContent>
            {edges.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                No connections stored for this project.
              </p>
            ) : (
              <div className="grid gap-3">
                {edges.map((edge) => (
                  <div
                    key={edge.edge_id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/45 p-4"
                  >
                    <div>
                      <p className="font-medium text-[var(--foreground)]">
                        {findNodeLabel(nodes, edge.source_node_id)} →{" "}
                        {findNodeLabel(nodes, edge.target_node_id)}
                      </p>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                        {edge.label ?? "Unlabeled relationship"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleDeleteEdge(edge.edge_id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function findNodeLabel(
  nodes: Array<{ node_id: string; label: string }>,
  nodeId: string,
) {
  return nodes.find((node) => node.node_id === nodeId)?.label ?? nodeId;
}
