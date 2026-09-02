import { DOCUMENTS_DB_FIELDS } from "@/lib/documents";
import { allProjects, locate, type Hierarchy, type NodeKind, type ProjectNode, type Scoped } from "@/lib/hierarchy";
import type { WorkspaceDatabaseRecord } from "@/lib/types";

// Pure helpers for the center panel: what a unit row shows, which documents a
// project owns. Tree shape comes from hierarchy.ts; nothing here touches Supabase.

export interface UnitChild {
  id: string;
  kind: NodeKind;
  name: string;
  caseLinked: boolean;
  /** This node and every project under it, for document counts. */
  projectIds: string[];
}

/** A department or workspace by id, whichever the tree holds. */
export function locateUnit(tree: Hierarchy, id: string): Scoped | null {
  return locate(tree, { kind: "department", id }) ?? locate(tree, { kind: "workspace", id });
}

export function findProjectNode(tree: Hierarchy, id: string): ProjectNode | null {
  return allProjects(tree).find((p) => p.id === id) ?? null;
}

function descendantIds(p: ProjectNode): string[] {
  return [p.id, ...p.projects.flatMap(descendantIds)];
}

export function childrenOf(tree: Hierarchy, id: string): UnitChild[] {
  for (const d of tree.departments) {
    if (d.id === id) {
      return d.workspaces.map((w) => ({
        id: w.id,
        kind: "workspace",
        name: w.name,
        caseLinked: false,
        projectIds: w.projects.flatMap(descendantIds),
      }));
    }
    for (const w of d.workspaces) {
      if (w.id !== id) continue;
      return w.projects.map((p) => ({
        id: p.id,
        kind: "project",
        name: p.name,
        caseLinked: p.legacy_investigation_id != null,
        projectIds: descendantIds(p),
      }));
    }
  }
  return [];
}

export function breadcrumb(scoped: Pick<Scoped, "path">): string {
  return scoped.path.join(" / ");
}

/** `/Users/adam/projects/x` reads as `~/projects/x`; the app is macOS-only. */
export function shortenHome(folder: string): string {
  return folder.replace(/^\/Users\/[^/]+(?=\/|$)/, "~");
}

export function projectDocuments(records: WorkspaceDatabaseRecord[], projectId: string): WorkspaceDatabaseRecord[] {
  return records.filter(
    (r) => r.fields[DOCUMENTS_DB_FIELDS.project] === projectId && r.taxonomy?.is_template !== true,
  );
}

/** Documents per project id, for the unit rows. */
export function documentCounts(records: WorkspaceDatabaseRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    const projectId = r.fields[DOCUMENTS_DB_FIELDS.project];
    if (typeof projectId !== "string" || r.taxonomy?.is_template === true) continue;
    counts.set(projectId, (counts.get(projectId) ?? 0) + 1);
  }
  return counts;
}

export function countFor(counts: Map<string, number>, child: UnitChild): number {
  return child.projectIds.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0);
}
