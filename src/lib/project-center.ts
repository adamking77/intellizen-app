import { DOCUMENTS_DB_FIELDS } from "@/lib/documents";
import { allProjects, locate, type Hierarchy, type NodeKind, type ProjectNode, type Scoped } from "@/lib/hierarchy";
import { GENZEN_WORKSPACE_DATABASE_IDS } from "@/lib/workspace-ids";
import { blockReason } from "@/lib/block-kind";
import type { KanbanCard } from "@/services/hermes-kanban";
import type { WorkspaceDatabaseCatalogEntry, WorkspaceDatabaseRecord, WorkspaceDatabaseRecordModel } from "@/lib/types";

// Pure helpers for the center panel: what a unit row shows, which documents a
// project owns. Tree shape comes from hierarchy.ts; nothing here touches Supabase.

export interface UnitChild {
  id: string;
  kind: NodeKind;
  name: string;
  caseLinked: boolean;
  folders: string[];
  legacyProjectId: number | null;
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
        folders: [],
        legacyProjectId: null,
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
        folders: p.folders,
        legacyProjectId: p.legacy_project_id,
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

export interface UnitProjectSummary {
  holder: string | null;
  state: string | null;
  blocker: string | null;
  waiting: string | null;
}

function text(record: WorkspaceDatabaseRecordModel | null, field: string) {
  const value = record?.[field];
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value)) {
    const values = value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
    return values.length ? values.join(", ") : null;
  }
  return null;
}

function relatesTo(record: WorkspaceDatabaseRecordModel, field: string, id: string) {
  const value = record[field];
  return value === id || (Array.isArray(value) && value.includes(id));
}

/** Derive the four operating facts without creating duplicate project state. */
export function unitProjectSummary(
  project: UnitChild,
  catalog: WorkspaceDatabaseCatalogEntry[],
  cards: KanbanCard[] = [],
): UnitProjectSummary {
  const bizOps = catalog.find((entry) => entry.id === GENZEN_WORKSPACE_DATABASE_IDS.bizOps);
  const tasks = catalog.find((entry) => entry.id === GENZEN_WORKSPACE_DATABASE_IDS.tasks);
  const projects = catalog.find((entry) => entry.name === "Projects");
  const normalizedName = project.name.trim().toLocaleLowerCase();
  const initiative = bizOps?.records.find((record) =>
    (project.legacyProjectId != null && record.legacy_project_id === project.legacyProjectId) ||
    text(record, "initiative_name")?.toLocaleLowerCase() === normalizedName
  ) ?? null;
  const projectRecord = projects?.records.find((record) =>
    project.legacyProjectId != null && record.legacy_project_id === project.legacyProjectId
  ) ?? null;
  const relatedTasks = initiative
    ? (tasks?.records ?? []).filter((record) => relatesTo(record, "task_project", initiative.id))
    : [];
  const blockedTask = relatedTasks.find((record) =>
    [text(record, "task_status"), text(record, "task_stage")].some((value) => value?.toLocaleLowerCase() === "blocked")
  );
  const waitingTask = relatedTasks.find((record) =>
    text(record, "task_status")?.toLocaleLowerCase() === "needs approval" ||
    text(record, "task_stage")?.toLocaleLowerCase() === "review" ||
    /(?:^|\n)Approval needed(?: before)?:\s*(?!none\b)([^\n]+)/i.test(record._body ?? "")
  );
  const blockedCard = cards.find((card) => card.status === "blocked" && !blockReason(card.blockKind ?? "")?.needsYou);
  const waitingCard = cards.find((card) => blockReason(card.blockKind ?? "")?.needsYou);

  return {
    holder: text(initiative, "initiative_agent_owner") ?? text(initiative, "initiative_assignee"),
    state: text(initiative, "initiative_stage") ?? text(projectRecord, "status"),
    blocker: text(blockedTask ?? null, "task_name") ?? blockedCard?.title ?? null,
    waiting: text(waitingTask ?? null, "task_name") ?? waitingCard?.title ?? null,
  };
}
