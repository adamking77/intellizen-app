import { describe, expect, it } from "vitest";

import { buildTree, type HierarchyNode } from "@/lib/hierarchy";
import {
  breadcrumb,
  childrenOf,
  countFor,
  documentCounts,
  findProjectNode,
  locateUnit,
  projectDocuments,
  shortenHome,
} from "@/lib/project-center";
import type { WorkspaceDatabaseRecord } from "@/lib/types";

function row(partial: Partial<HierarchyNode> & Pick<HierarchyNode, "id" | "kind" | "name">): HierarchyNode {
  return {
    parent_id: null,
    folders: [],
    position: 0,
    legacy_operation_id: null,
    legacy_project_id: null,
    legacy_investigation_id: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

const tree = buildTree([
  row({ id: "d1", kind: "department", name: "GenZen Solutions" }),
  row({ id: "w1", kind: "workspace", name: "Client Work", parent_id: "d1" }),
  row({ id: "p1", kind: "project", name: "Acme", parent_id: "w1", legacy_investigation_id: 7, folders: ["/Users/adam/projects/acme"] }),
  row({ id: "p2", kind: "project", name: "Beta", parent_id: "w1", position: 1 }),
  row({ id: "p3", kind: "project", name: "Beta sub", parent_id: "p2" }),
]);

function doc(id: string, project: string | null, template = false): WorkspaceDatabaseRecord {
  return {
    id,
    database_id: "db",
    fields: { doc_project: project },
    body: null,
    taxonomy: template ? { is_template: true } : undefined,
    created_at: "",
    updated_at: "",
  };
}

const docs = [doc("a", "p1"), doc("b", "p1"), doc("c", "p3"), doc("t", "p1", true), doc("z", null)];

describe("project-center", () => {
  it("locates a unit of either kind and builds its breadcrumb", () => {
    expect(locateUnit(tree, "d1")?.name).toBe("GenZen Solutions");
    const workspace = locateUnit(tree, "w1");
    expect(breadcrumb(workspace!)).toBe("GenZen Solutions");
    expect(breadcrumb({ path: ["a", "b"] })).toBe("a / b");
    expect(locateUnit(tree, "p1")).toBeNull();
    expect(findProjectNode(tree, "p3")?.name).toBe("Beta sub");
  });

  it("lists children with case flags and descendant project ids", () => {
    expect(childrenOf(tree, "d1")).toEqual([
      { id: "w1", kind: "workspace", name: "Client Work", caseLinked: false, projectIds: ["p1", "p2", "p3"] },
    ]);
    const projects = childrenOf(tree, "w1");
    expect(projects.map((p) => [p.name, p.caseLinked])).toEqual([["Acme", true], ["Beta", false]]);
    expect(childrenOf(tree, "missing")).toEqual([]);
  });

  it("counts real documents per project, rolling up to the workspace", () => {
    const counts = documentCounts(docs);
    const [workspace] = childrenOf(tree, "d1");
    const [acme, beta] = childrenOf(tree, "w1");
    expect(countFor(counts, acme)).toBe(2);
    expect(countFor(counts, beta)).toBe(1);
    expect(countFor(counts, workspace)).toBe(3);
    expect(projectDocuments(docs, "p1").map((d) => d.id)).toEqual(["a", "b"]);
  });

  it("shortens the home directory only", () => {
    expect(shortenHome("/Users/adam/projects/acme")).toBe("~/projects/acme");
    expect(shortenHome("/Users/adam")).toBe("~");
    expect(shortenHome("/Users/adamant/x")).toBe("~/x");
    expect(shortenHome("/opt/Users/adam")).toBe("/opt/Users/adam");
  });
});
