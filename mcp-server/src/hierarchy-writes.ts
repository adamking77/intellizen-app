import type { SupabaseClient } from "@supabase/supabase-js";

import { listHierarchy, type HierarchyNode, type NodeKind } from "./hierarchy.js";
import { dryRunPreview } from "./write-contract.js";

type WorkEvent = (input: {
  event_kind: string;
  actor: string;
  durable_role?: string | null;
  summary?: string | null;
  payload?: Record<string, unknown>;
}) => Promise<void>;

type WriteInput = {
  actor: string;
  durable_role?: string | null;
  summary?: string | null;
  confirm_write?: boolean;
};

const fields = "id, kind, parent_id, name, folders, position, created_at, updated_at";
const kinds = new Set<NodeKind>(["department", "workspace", "project"]);
const table = (supabase: SupabaseClient) => supabase.schema("workspace").from("hierarchy_nodes");

export const hierarchyWriteTools = [
  {
    name: "create_hierarchy_node",
    description: "Preview or create a department, workspace, or project in the shared sidebar tree. Every confirmed write emits a workspace.work_events receipt.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["department", "workspace", "project"] },
        parent_id: { type: ["string", "null"], description: "Null for a department; required for a workspace or project." },
        name: { type: "string" },
        folders: { type: "array", items: { type: "string" }, description: "Optional project working folders." },
        position: { type: "number", description: "Optional integer sibling position." },
        actor: { type: "string" },
        durable_role: { type: "string" },
        summary: { type: "string" },
        confirm_write: { type: "boolean", description: "Required true to write. Defaults to preview only." },
      },
      required: ["kind", "name", "actor"],
    },
  },
  {
    name: "rename_hierarchy_node",
    description: "Preview or rename one sidebar tree node. Every confirmed write emits a workspace.work_events receipt.",
    inputSchema: {
      type: "object",
      properties: {
        node_id: { type: "string" },
        name: { type: "string" },
        actor: { type: "string" },
        durable_role: { type: "string" },
        summary: { type: "string" },
        confirm_write: { type: "boolean", description: "Required true to write. Defaults to preview only." },
      },
      required: ["node_id", "name", "actor"],
    },
  },
  {
    name: "move_hierarchy_node",
    description: "Preview or move one sidebar tree node under a valid parent and set its sibling position. Every confirmed write emits a workspace.work_events receipt.",
    inputSchema: {
      type: "object",
      properties: {
        node_id: { type: "string" },
        parent_id: { type: ["string", "null"] },
        position: { type: "number" },
        actor: { type: "string" },
        durable_role: { type: "string" },
        summary: { type: "string" },
        confirm_write: { type: "boolean", description: "Required true to write. Defaults to preview only." },
      },
      required: ["node_id", "parent_id", "position", "actor"],
    },
  },
  {
    name: "delete_hierarchy_node",
    description: "Preview or delete one sidebar tree node and its descendants. The preview names every node the database cascade will remove. Every confirmed write emits a workspace.work_events receipt.",
    inputSchema: {
      type: "object",
      properties: {
        node_id: { type: "string" },
        actor: { type: "string" },
        durable_role: { type: "string" },
        summary: { type: "string" },
        confirm_write: { type: "boolean", description: "Required true to delete. Defaults to preview only." },
      },
      required: ["node_id", "actor"],
    },
  },
] as const;

async function node(supabase: SupabaseClient, id: string): Promise<HierarchyNode> {
  const { data, error } = await table(supabase).select(fields).eq("id", id).single();
  if (error || !data) throw new Error(error?.message ?? `Hierarchy node ${id} was not found.`);
  return data as HierarchyNode;
}

export function validateParent(kind: NodeKind, parent: HierarchyNode | null) {
  if (kind === "department" && parent) throw new Error("A department cannot have a parent.");
  if (kind === "workspace" && parent?.kind !== "department") throw new Error("A workspace needs a department parent.");
  if (kind === "project" && parent?.kind !== "workspace" && parent?.kind !== "project") {
    throw new Error("A project needs a workspace or project parent.");
  }
}

export function descendants(rows: HierarchyNode[], id: string): HierarchyNode[] {
  const found: HierarchyNode[] = [];
  const visit = (parentId: string) => {
    for (const child of rows.filter((candidate) => candidate.parent_id === parentId)) {
      found.push(child);
      visit(child.id);
    }
  };
  visit(id);
  return found;
}

function cleanName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new Error("A hierarchy node needs a name.");
  return name;
}

function position(value: unknown, fallback = 0) {
  const number = value === undefined ? fallback : value;
  if (!Number.isInteger(number) || (number as number) < 0) throw new Error("Position must be a non-negative integer.");
  return number as number;
}

async function createNode(supabase: SupabaseClient, input: WriteInput & {
  kind: NodeKind;
  parent_id?: string | null;
  name: string;
  folders?: string[];
  position?: number;
}, receipt: WorkEvent) {
  if (!kinds.has(input.kind)) throw new Error(`Unknown hierarchy kind: ${input.kind}`);
  const name = cleanName(input.name);
  const parent = input.parent_id ? await node(supabase, input.parent_id) : null;
  validateParent(input.kind, parent);
  const rows = await listHierarchy(supabase);
  const nextPosition = position(input.position, rows.filter((item) => item.parent_id === (input.parent_id ?? null)).length);
  const folders = (input.folders ?? []).map((folder) => folder.trim()).filter(Boolean);
  if (input.kind !== "project" && folders.length) throw new Error("Only a project can carry working folders.");
  const payload = { kind: input.kind, parent_id: input.parent_id ?? null, name, folders, position: nextPosition };
  if (!input.confirm_write) return dryRunPreview("create_hierarchy_node", "create this hierarchy node", payload);

  const { data, error } = await table(supabase).insert(payload).select(fields).single();
  if (error) throw new Error(error.message);
  const created = data as HierarchyNode;
  await receipt({
    event_kind: "hierarchy.created",
    actor: input.actor,
    durable_role: input.durable_role,
    summary: input.summary ?? `Created ${input.kind} “${name}”`,
    payload: { tool: "create_hierarchy_node", node: created },
  });
  return { dry_run: false, write_performed: true, node: created };
}

async function renameNode(supabase: SupabaseClient, input: WriteInput & { node_id: string; name: string }, receipt: WorkEvent) {
  const current = await node(supabase, input.node_id);
  const name = cleanName(input.name);
  const payload = { node_id: current.id, kind: current.kind, from: current.name, to: name };
  if (!input.confirm_write) return dryRunPreview("rename_hierarchy_node", "rename this hierarchy node", payload);
  const { data, error } = await table(supabase).update({ name }).eq("id", current.id).select(fields).single();
  if (error) throw new Error(error.message);
  await receipt({
    event_kind: "hierarchy.renamed",
    actor: input.actor,
    durable_role: input.durable_role,
    summary: input.summary ?? `Renamed “${current.name}” to “${name}”`,
    payload: { tool: "rename_hierarchy_node", ...payload },
  });
  return { dry_run: false, write_performed: true, node: data };
}

async function moveNode(supabase: SupabaseClient, input: WriteInput & {
  node_id: string;
  parent_id: string | null;
  position: number;
}, receipt: WorkEvent) {
  const rows = await listHierarchy(supabase);
  const current = rows.find((item) => item.id === input.node_id);
  if (!current) throw new Error(`Hierarchy node ${input.node_id} was not found.`);
  const parent = input.parent_id ? rows.find((item) => item.id === input.parent_id) ?? null : null;
  if (input.parent_id && !parent) throw new Error(`Hierarchy parent ${input.parent_id} was not found.`);
  validateParent(current.kind, parent);
  if (input.parent_id === current.id || descendants(rows, current.id).some((child) => child.id === input.parent_id)) {
    throw new Error("A hierarchy node cannot move inside one of its descendants.");
  }
  const nextPosition = position(input.position);
  const payload = { node_id: current.id, from_parent_id: current.parent_id, parent_id: input.parent_id, position: nextPosition };
  if (!input.confirm_write) return dryRunPreview("move_hierarchy_node", "move this hierarchy node", payload);
  const { data, error } = await table(supabase)
    .update({ parent_id: input.parent_id, position: nextPosition })
    .eq("id", current.id)
    .select(fields)
    .single();
  if (error) throw new Error(error.message);
  await receipt({
    event_kind: "hierarchy.moved",
    actor: input.actor,
    durable_role: input.durable_role,
    summary: input.summary ?? `Moved ${current.kind} “${current.name}”`,
    payload: { tool: "move_hierarchy_node", ...payload },
  });
  return { dry_run: false, write_performed: true, node: data };
}

async function deleteNode(supabase: SupabaseClient, input: WriteInput & { node_id: string }, receipt: WorkEvent) {
  const rows = await listHierarchy(supabase);
  const current = rows.find((item) => item.id === input.node_id);
  if (!current) throw new Error(`Hierarchy node ${input.node_id} was not found.`);
  const removed = [current, ...descendants(rows, current.id)].map(({ id, kind, name, parent_id }) => ({ id, kind, name, parent_id }));
  const payload = { node_id: current.id, nodes_removed: removed };
  if (!input.confirm_write) return dryRunPreview("delete_hierarchy_node", "delete these hierarchy nodes", payload);
  const { error } = await table(supabase).delete().eq("id", current.id);
  if (error) throw new Error(error.message);
  await receipt({
    event_kind: "hierarchy.deleted",
    actor: input.actor,
    durable_role: input.durable_role,
    summary: input.summary ?? `Deleted ${current.kind} “${current.name}” and ${removed.length - 1} descendants`,
    payload: { tool: "delete_hierarchy_node", ...payload },
  });
  return { dry_run: false, write_performed: true, ...payload };
}

export async function callHierarchyWriteTool(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
  receipt: WorkEvent,
): Promise<unknown | null> {
  if (name === "create_hierarchy_node") return createNode(supabase, args as never, receipt);
  if (name === "rename_hierarchy_node") return renameNode(supabase, args as never, receipt);
  if (name === "move_hierarchy_node") return moveNode(supabase, args as never, receipt);
  if (name === "delete_hierarchy_node") return deleteNode(supabase, args as never, receipt);
  return null;
}
