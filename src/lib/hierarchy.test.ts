import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import {
  buildTree,
  folderFor,
  locate,
  projectAt,
  under,
  type HierarchyNode,
} from "@/lib/hierarchy";

function row(partial: Partial<HierarchyNode> & Pick<HierarchyNode, "id" | "kind" | "name">): HierarchyNode {
  return {
    parent_id: null,
    folders: [],
    position: 0,
    legacy_operation_id: null,
    legacy_project_id: null,
    legacy_investigation_id: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...partial,
  };
}

const rows: HierarchyNode[] = [
  row({ id: "d1", kind: "department", name: "GenZen Solutions" }),
  row({ id: "w2", kind: "workspace", name: "Zeta", parent_id: "d1", position: 1 }),
  row({ id: "w1", kind: "workspace", name: "Alpha", parent_id: "d1", position: 0, legacy_operation_id: 7 }),
  row({ id: "p1", kind: "project", name: "Foo", parent_id: "w1", folders: ["/repos/foo/"], legacy_project_id: 3 }),
  row({ id: "p2", kind: "project", name: "Foobar", parent_id: "w1", folders: ["/repos/foobar"] }),
  row({ id: "p3", kind: "project", name: "Foo Sub", parent_id: "p1", folders: ["/repos/foo/sub"], legacy_investigation_id: 9 }),
  row({ id: "p4", kind: "project", name: "Deeper", parent_id: "p3" }),
  row({ id: "p5", kind: "project", name: "Zeta Case", parent_id: "w2" }),
];

const tree = buildTree(rows);

describe("buildTree", () => {
  it("nests departments, workspaces and recursive projects in position order", () => {
    expect(tree.departments).toHaveLength(1);
    const [d] = tree.departments;
    expect(d.workspaces.map((w) => w.name)).toEqual(["Alpha", "Zeta"]);
    const alpha = d.workspaces[0];
    expect(alpha.legacy_operation_id).toBe(7);
    expect(alpha.projects.map((p) => p.name)).toEqual(["Foo", "Foobar"]);
    const foo = alpha.projects[0];
    expect(foo.legacy_project_id).toBe(3);
    expect(foo.projects[0].name).toBe("Foo Sub");
    expect(foo.projects[0].legacy_investigation_id).toBe(9);
    expect(foo.projects[0].projects[0].name).toBe("Deeper");
    expect(d.workspaces[1].projects[0].name).toBe("Zeta Case");
  });

  it("drops rows whose parent is missing", () => {
    const orphan = buildTree([...rows, row({ id: "px", kind: "project", name: "Lost", parent_id: "nope" })]);
    expect(orphan.departments[0].workspaces[0].projects).toHaveLength(2);
  });
});

describe("locate", () => {
  it("returns a node with its ancestry and children", () => {
    expect(locate(tree, { kind: "department", id: "d1" })?.children).toEqual(["Alpha", "Zeta"]);
    expect(locate(tree, { kind: "workspace", id: "w1" })?.path).toEqual(["GenZen Solutions"]);
    const sub = locate(tree, { kind: "project", id: "p3" });
    expect(sub?.name).toBe("Foo Sub");
    expect(sub?.path).toEqual(["GenZen Solutions", "Alpha", "Foo"]);
    expect(sub?.children).toEqual(["Deeper"]);
  });

  it("is null for nothing or an unknown ref", () => {
    expect(locate(tree, null)).toBeNull();
    expect(locate(tree, { kind: "project", id: "w1" })).toBeNull();
  });
});

describe("folderFor", () => {
  it("is the first folder of a project and null for the rest", () => {
    expect(folderFor(tree, { kind: "project", id: "p1" })).toBe("/repos/foo/");
    expect(folderFor(tree, { kind: "project", id: "p4" })).toBeNull();
    expect(folderFor(tree, { kind: "workspace", id: "w1" })).toBeNull();
  });
});

describe("under", () => {
  it("matches the folder itself and anything inside it, ignoring trailing slashes", () => {
    expect(under("/a/b", "/a/b/")).toBe(true);
    expect(under("/a/b/c", "/a/b")).toBe(true);
    expect(under("/a/b-old", "/a/b")).toBe(false);
    expect(under("/a", "/a/b")).toBe(false);
    expect(under("/a/b", "")).toBe(false);
  });
});

describe("projectAt", () => {
  it("picks the deepest folder", () => {
    expect(projectAt(tree, "/repos/foo")).toBe("p1");
    expect(projectAt(tree, "/repos/foo/src")).toBe("p1");
    expect(projectAt(tree, "/repos/foo/sub/x")).toBe("p3");
  });

  it("does not let /foo swallow /foobar", () => {
    expect(projectAt(tree, "/repos/foobar")).toBe("p2");
    expect(projectAt(tree, "/repos/foobar/lib")).toBe("p2");
  });

  it("is null outside every folder", () => {
    expect(projectAt(tree, "/elsewhere")).toBeNull();
    expect(projectAt(tree, "  ")).toBeNull();
  });
});
