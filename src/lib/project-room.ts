import { getRecordTitle } from "@/lib/database-core";
import { allProjects, under, type Hierarchy } from "@/lib/hierarchy";
import type { WorkspaceDatabaseCatalogEntry, WorkspaceDatabaseRecordModel } from "@/lib/types";

export type ProjectRoomTab = "files" | "board" | "data" | "sessions" | "canvas" | "graph" | "case";

export interface ProjectLinkedRecord {
  databaseId: string;
  databaseName: string;
  recordId: string;
  title: string;
  status: string | null;
}

export interface ProjectBoardRef {
  slug: string;
  defaultWorkdir: string | null;
}

export interface ProjectSessionRef {
  id: string;
  cwd?: string | null;
  profile?: string;
  lastActive?: number;
}

export function projectSessionKey(session: Pick<ProjectSessionRef, "id" | "profile">): string {
  return `${session.profile ?? "default"}:${session.id}`;
}

export function projectRoomTabs(input: {
  hasCanvas: boolean;
  hasGraph: boolean;
  hasCase: boolean;
}): ProjectRoomTab[] {
  return [
    "files",
    "board",
    "data",
    "sessions",
    ...(input.hasCanvas ? ["canvas" as const] : []),
    ...(input.hasGraph ? ["graph" as const] : []),
    ...(input.hasCase ? ["case" as const] : []),
  ];
}

function statusOf(entry: WorkspaceDatabaseCatalogEntry, record: WorkspaceDatabaseRecordModel): string | null {
  const field = entry.schema.find((candidate) =>
    candidate.type === "status" || /^(status|stage)$/i.test(candidate.name),
  );
  const value = field ? record[field.id] : null;
  return typeof value === "string" && value.trim() ? value : null;
}

/** Records that point at the hierarchy project itself or its migrated Projects row. */
export function linkedWorkspaceRecords(
  catalog: WorkspaceDatabaseCatalogEntry[],
  hierarchyProjectId: string,
  legacyProjectId: number | null,
): ProjectLinkedRecord[] {
  const projectRecord = legacyProjectId == null
    ? null
    : catalog.find((entry) => entry.name === "Projects")?.records
      .find((record) => record.legacy_project_id === legacyProjectId) ?? null;
  const targets = new Set([hierarchyProjectId, ...(projectRecord ? [projectRecord.id] : [])]);

  return catalog.flatMap((entry) => entry.records.flatMap((record) => {
    if (record.id === projectRecord?.id) return [];
    const linked = entry.schema.some((field) => {
      const value = record[field.id];
      return typeof value === "string"
        ? targets.has(value)
        : Array.isArray(value) && value.some((item) => typeof item === "string" && targets.has(item));
    });
    if (!linked) return [];
    return [{
      databaseId: entry.id,
      databaseName: entry.name,
      recordId: record.id,
      title: getRecordTitle(record, entry),
      status: statusOf(entry, record),
    }];
  }));
}

export function boardsForProject<T extends ProjectBoardRef>(boards: T[], folders: string[]): T[] {
  return boards.filter((board) => {
    const workdir = board.defaultWorkdir?.trim();
    return Boolean(workdir && folders.some((folder) => under(workdir, folder)));
  });
}

export function sessionsForProject<T extends ProjectSessionRef>(sessions: T[], folders: string[]): T[] {
  const seen = new Set<string>();
  return sessions.filter((session) => {
    const cwd = session.cwd?.trim();
    const key = projectSessionKey(session);
    if (!cwd || seen.has(key) || !folders.some((folder) => under(cwd, folder))) return false;
    seen.add(key);
    return true;
  });
}

/** Match the donor: a nested project's deepest folder owns the session. */
export function groupSessionsByProject<T extends ProjectSessionRef>(tree: Hierarchy, sessions: T[]): Map<string, T[]> {
  const projects = allProjects(tree);
  const groups = new Map<string, T[]>();
  const seen = new Set<string>();

  for (const session of sessions) {
    const cwd = session.cwd?.trim();
    const key = projectSessionKey(session);
    if (!cwd || seen.has(key)) continue;
    seen.add(key);
    let best: { id: string; depth: number } | null = null;
    for (const project of projects) {
      for (const folder of project.folders) {
        if (!under(cwd, folder)) continue;
        const depth = folder.trim().replace(/\/+$/, "").length;
        if (!best || depth > best.depth) best = { id: project.id, depth };
      }
    }
    if (!best) continue;
    const group = groups.get(best.id);
    if (group) group.push(session);
    else groups.set(best.id, [session]);
  }

  for (const group of groups.values()) {
    group.sort((left, right) => (right.lastActive ?? 0) - (left.lastActive ?? 0));
  }
  return groups;
}
