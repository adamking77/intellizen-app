import { supabase } from "@/lib/supabase";
import type {
  GraphEdgeRecord,
  GraphEntityType,
  GraphNodeRecord,
} from "@/lib/types";

export async function listGraphNodes(projectId: number | null) {
  let query = supabase
    .schema("intel")
    .from("graph_nodes")
    .select("*")
    .order("created_at", { ascending: true });

  query =
    projectId === null
      ? query.is("project_id", null)
      : query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as GraphNodeRecord[];
}

export async function listGraphEdges(projectId: number | null) {
  let query = supabase
    .schema("intel")
    .from("graph_edges")
    .select("*")
    .order("created_at", { ascending: true });

  query =
    projectId === null
      ? query.is("project_id", null)
      : query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as GraphEdgeRecord[];
}

export async function createGraphNode(input: {
  projectId: number | null;
  nodeId: string;
  label: string;
  entityType: GraphEntityType;
  position: { x: number; y: number };
}) {
  const { data, error } = await supabase
    .schema("intel")
    .from("graph_nodes")
    .insert([
      {
        project_id: input.projectId,
        node_id: input.nodeId,
        label: input.label,
        entity_type: input.entityType,
        position_x: input.position.x,
        position_y: input.position.y,
      },
    ])
    .select("*")
    .single();
  if (error) throw error;
  return data as GraphNodeRecord;
}

export async function updateGraphNodePosition(input: {
  projectId: number | null;
  nodeId: string;
  position: { x: number; y: number };
}) {
  let query = supabase
    .schema("intel")
    .from("graph_nodes")
    .update({
      position_x: input.position.x,
      position_y: input.position.y,
    })
    .eq("node_id", input.nodeId);

  query =
    input.projectId === null
      ? query.is("project_id", null)
      : query.eq("project_id", input.projectId);
  const { error } = await query;
  if (error) throw error;
}

export async function updateGraphNode(input: {
  projectId: number | null;
  nodeId: string;
  label: string;
  entityType: GraphEntityType;
}) {
  let query = supabase
    .schema("intel")
    .from("graph_nodes")
    .update({
      label: input.label,
      entity_type: input.entityType,
    })
    .eq("node_id", input.nodeId);

  query =
    input.projectId === null
      ? query.is("project_id", null)
      : query.eq("project_id", input.projectId);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data as GraphNodeRecord;
}

export async function deleteGraphNodes(input: {
  projectId: number | null;
  nodeIds: string[];
}) {
  if (input.nodeIds.length === 0) return;
  let query = supabase
    .schema("intel")
    .from("graph_nodes")
    .delete()
    .in("node_id", input.nodeIds);

  query =
    input.projectId === null
      ? query.is("project_id", null)
      : query.eq("project_id", input.projectId);
  const { error } = await query;
  if (error) throw error;
}

export async function createGraphEdge(input: {
  projectId: number | null;
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
}) {
  const { data, error } = await supabase
    .schema("intel")
    .from("graph_edges")
    .insert([
      {
        project_id: input.projectId,
        edge_id: input.edgeId,
        source_node_id: input.sourceNodeId,
        target_node_id: input.targetNodeId,
        label: input.label,
      },
    ])
    .select("*")
    .single();
  if (error) throw error;
  return data as GraphEdgeRecord;
}

export async function updateGraphEdge(input: {
  projectId: number | null;
  edgeId: string;
  label: string | null;
}) {
  let query = supabase
    .schema("intel")
    .from("graph_edges")
    .update({ label: input.label })
    .eq("edge_id", input.edgeId);

  query =
    input.projectId === null
      ? query.is("project_id", null)
      : query.eq("project_id", input.projectId);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  return data as GraphEdgeRecord;
}

export async function deleteGraphEdges(input: {
  projectId: number | null;
  edgeIds: string[];
}) {
  if (input.edgeIds.length === 0) return;
  let query = supabase
    .schema("intel")
    .from("graph_edges")
    .delete()
    .in("edge_id", input.edgeIds);

  query =
    input.projectId === null
      ? query.is("project_id", null)
      : query.eq("project_id", input.projectId);
  const { error } = await query;
  if (error) throw error;
}
