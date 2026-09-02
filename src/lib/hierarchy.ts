import { supabase } from "@/lib/supabase";

// The navigation tree: department → workspace → project (recursive), stored in
// workspace.hierarchy_nodes. Pure tree helpers are ported from hermes-app
// (scope.ts, sessionGroups.ts) so sessions, cards and the sidebar agree on
// which project a folder belongs to: deepest folder wins, path components
// rather than string prefixes, trailing slashes ignored.

export type NodeKind = "department" | "workspace" | "project";

export interface ScopeRef {
  kind: NodeKind;
  id: string;
}

/** One row of workspace.hierarchy_nodes. */
export interface HierarchyNode {
  id: string;
  kind: NodeKind;
  parent_id: string | null;
  name: string;
  folders: string[];
  position: number;
  legacy_operation_id: number | null;
  legacy_project_id: number | null;
  legacy_investigation_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectNode {
  id: string;
  name: string;
  folders: string[];
  projects: ProjectNode[];
  legacy_project_id: number | null;
  legacy_investigation_id: number | null;
}

export interface WorkspaceNode {
  id: string;
  name: string;
  projects: ProjectNode[];
  legacy_operation_id: number | null;
}

export interface DepartmentNode {
  id: string;
  name: string;
  workspaces: WorkspaceNode[];
}

export interface Hierarchy {
  departments: DepartmentNode[];
}

export const EMPTY_HIERARCHY: Hierarchy = { departments: [] };

/** Everything the tree knows about one node, flattened for reading. */
export interface Scoped {
  ref: ScopeRef;
  name: string;
  folders: string[];
  children: string[];
  /** Where it sits, outermost first: ["GenZen Solutions", "Client Work"]. */
  path: string[];
}

const TABLE = "hierarchy_nodes";
const table = () => supabase.schema("workspace").from(TABLE);

function byPosition(a: HierarchyNode, b: HierarchyNode): number {
  return a.position - b.position || a.name.localeCompare(b.name);
}

/** Nest flat rows into the tree. Rows whose parent is missing or of the wrong
 *  kind are dropped rather than crashing the sidebar; the database trigger
 *  makes that impossible to write, so it only happens with partial data. */
export function buildTree(rows: HierarchyNode[]): Hierarchy {
  const children = new Map<string | null, HierarchyNode[]>();
  for (const row of rows) {
    const list = children.get(row.parent_id);
    if (list) list.push(row);
    else children.set(row.parent_id, [row]);
  }
  for (const list of children.values()) list.sort(byPosition);

  const projectsUnder = (parentId: string): ProjectNode[] =>
    (children.get(parentId) ?? [])
      .filter((r) => r.kind === "project")
      .map((r) => ({
        id: r.id,
        name: r.name,
        folders: Array.isArray(r.folders) ? r.folders : [],
        projects: projectsUnder(r.id),
        legacy_project_id: r.legacy_project_id,
        legacy_investigation_id: r.legacy_investigation_id,
      }));

  const departments = (children.get(null) ?? [])
    .filter((r) => r.kind === "department")
    .map((d) => ({
      id: d.id,
      name: d.name,
      workspaces: (children.get(d.id) ?? [])
        .filter((r) => r.kind === "workspace")
        .map((w) => ({
          id: w.id,
          name: w.name,
          projects: projectsUnder(w.id),
          legacy_operation_id: w.legacy_operation_id,
        })),
    }));

  return { departments };
}

function findProject(projects: ProjectNode[], ref: ScopeRef, path: string[]): Scoped | null {
  for (const p of projects) {
    if (ref.kind === "project" && p.id === ref.id) {
      return {
        ref,
        name: p.name,
        folders: p.folders,
        children: p.projects.map((c) => c.name),
        path,
      };
    }
    const deeper = findProject(p.projects, ref, [...path, p.name]);
    if (deeper) return deeper;
  }
  return null;
}

/** Find a node in the tree, with its ancestry. */
export function locate(tree: Hierarchy, ref: ScopeRef | null): Scoped | null {
  if (!ref) return null;
  for (const d of tree.departments) {
    if (ref.kind === "department" && d.id === ref.id) {
      return { ref, name: d.name, folders: [], children: d.workspaces.map((w) => w.name), path: [] };
    }
    for (const w of d.workspaces) {
      if (ref.kind === "workspace" && w.id === ref.id) {
        return { ref, name: w.name, folders: [], children: w.projects.map((p) => p.name), path: [d.name] };
      }
      const hit = findProject(w.projects, ref, [d.name, w.name]);
      if (hit) return hit;
    }
  }
  return null;
}

/** The folder a run against this node happens in. Only projects have one. */
export function folderFor(tree: Hierarchy, ref: ScopeRef | null): string | null {
  return locate(tree, ref)?.folders[0] ?? null;
}

function normalize(p: string): string {
  return p.trim().replace(/\/+$/, "");
}

/** Whether `cwd` is inside `folder`, component-wise: `/a/projects` must not
 *  swallow `/a/projects-old`. */
export function under(cwd: string, folder: string): boolean {
  const c = normalize(cwd);
  const f = normalize(folder);
  if (!f) return false;
  if (c === f) return true;
  return c.startsWith(f) && c[f.length] === "/";
}

/** Every project in the tree, flattened. */
export function allProjects(tree: Hierarchy): ProjectNode[] {
  const out: ProjectNode[] = [];
  const walk = (p: ProjectNode) => {
    out.push(p);
    p.projects.forEach(walk);
  };
  for (const d of tree.departments) for (const w of d.workspaces) w.projects.forEach(walk);
  return out;
}

/** The id of the project whose folder contains `cwd`; deepest folder wins. */
export function projectAt(tree: Hierarchy, cwd: string): string | null {
  if (!normalize(cwd)) return null;
  let best: { id: string; depth: number } | null = null;
  for (const p of allProjects(tree)) {
    for (const folder of p.folders) {
      if (!under(cwd, folder)) continue;
      const depth = normalize(folder).length;
      if (!best || depth > best.depth) best = { id: p.id, depth };
    }
  }
  return best?.id ?? null;
}

// ponytail: no revision or compare-and-swap on writes. One user, one app;
// last write wins. Add a revision column when a second writer appears.

export async function listHierarchy(): Promise<HierarchyNode[]> {
  const { data, error } = await table().select("*").order("position").order("name");
  if (error) throw error;
  return (data ?? []) as HierarchyNode[];
}

export async function createNode(kind: NodeKind, parentId: string | null, name: string): Promise<HierarchyNode> {
  const { data, error } = await table()
    .insert({ kind, parent_id: parentId, name })
    .select("*")
    .single();
  if (error) throw error;
  return data as HierarchyNode;
}

export async function renameNode(id: string, name: string): Promise<void> {
  const { error } = await table().update({ name }).eq("id", id);
  if (error) throw error;
}

export async function moveNode(id: string, parentId: string | null, position: number): Promise<void> {
  const { error } = await table().update({ parent_id: parentId, position }).eq("id", id);
  if (error) throw error;
}

export async function deleteNode(id: string): Promise<void> {
  const { error } = await table().delete().eq("id", id);
  if (error) throw error;
}

export async function setFolders(id: string, folders: string[]): Promise<void> {
  const { error } = await table().update({ folders }).eq("id", id);
  if (error) throw error;
}
