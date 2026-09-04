// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";

import {
  boardsForProject,
  groupSessionsByProject,
  linkedWorkspaceRecords,
  loadRoomView,
  projectRoomViews,
  saveRoomView,
  sessionsForProject,
} from "@/lib/project-room";
import type { Hierarchy } from "@/lib/hierarchy";
import type { WorkspaceDatabaseCatalogEntry } from "@/lib/types";

const catalog: WorkspaceDatabaseCatalogEntry[] = [
  {
    id: "projects",
    name: "Projects",
    schema: [{ id: "name", name: "Name", type: "text" }],
    headerFieldIds: ["name"],
    views: [],
    records: [{ id: "project-row", name: "Acme", legacy_project_id: 7 }],
  },
  {
    id: "tasks",
    name: "Tasks",
    schema: [
      { id: "name", name: "Task", type: "text" },
      { id: "status", name: "Status", type: "status" },
      { id: "project", name: "Project", type: "relation", relation: { targetDatabaseId: "projects" } },
    ],
    headerFieldIds: ["name"],
    views: [],
    records: [
      { id: "linked", name: "Write report", status: "Doing", project: ["project-row"] },
      { id: "direct", name: "Hierarchy note", project: "hierarchy-id" },
      { id: "other", name: "Other", project: ["elsewhere"] },
    ],
  },
];

describe("project room", () => {
  it("uses the material's prescribed views and remembers a valid choice", () => {
    expect(projectRoomViews(false)).toEqual(["brief", "table", "board", "canvas"]);
    expect(projectRoomViews(true)).toEqual(["brief", "table", "board", "graph", "timeline", "session"]);
    saveRoomView("case", "timeline");
    expect(loadRoomView("case", projectRoomViews(true))).toBe("timeline");
    expect(loadRoomView("case", projectRoomViews(false))).toBe("brief");
  });

  it("finds records linked through either project identity", () => {
    expect(linkedWorkspaceRecords(catalog, "hierarchy-id", 7)).toEqual([
      { databaseId: "tasks", databaseName: "Tasks", recordId: "linked", title: "Write report", status: "Doing" },
      { databaseId: "tasks", databaseName: "Tasks", recordId: "direct", title: "Hierarchy note", status: null },
    ]);
  });

  it("matches boards and sessions by component-safe folder containment", () => {
    expect(boardsForProject([
      { slug: "acme", defaultWorkdir: "/work/acme" },
      { slug: "wrong-prefix", defaultWorkdir: "/work/acme-old" },
    ], ["/work/acme"])).toHaveLength(1);
    expect(sessionsForProject([
      { id: "a", profile: "fiona", cwd: "/work/acme/report" },
      { id: "a", profile: "fiona", cwd: "/work/acme/report" },
      { id: "b", profile: "fiona", cwd: "/work/acme-old" },
    ], ["/work/acme"])).toEqual([{ id: "a", profile: "fiona", cwd: "/work/acme/report" }]);
  });

  it("files a session under the deepest matching project", () => {
    const tree: Hierarchy = { departments: [{
      id: "department",
      name: "Product",
      workspaces: [{
        id: "workspace",
        name: "Apps",
        legacy_operation_id: null,
        projects: [{
          id: "parent",
          name: "Suite",
          folders: ["/work"],
          legacy_project_id: null,
          legacy_investigation_id: null,
          projects: [{
            id: "child",
            name: "App",
            folders: ["/work/app"],
            projects: [],
            legacy_project_id: null,
            legacy_investigation_id: null,
          }],
        }],
      }],
    }] };

    const groups = groupSessionsByProject(tree, [
      { id: "old", profile: "keel", cwd: "/work/app/src", lastActive: 1 },
      { id: "new", profile: "keel", cwd: "/work/app", lastActive: 2 },
    ]);
    expect(groups.get("parent")).toBeUndefined();
    expect(groups.get("child")?.map((session) => session.id)).toEqual(["new", "old"]);
  });
});
