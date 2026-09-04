import { describe, expect, it } from "vitest";

import { groupDocuments } from "./docs-rail";

const record = (id: string, project?: string, template = false) => ({
  id,
  doc_title: id,
  doc_project: project,
  doc_vault_path: `documents/${id}.md`,
  _isTemplate: template,
});

describe("groupDocuments", () => {
  it("puts waiting documents first and does not repeat them in project groups", () => {
    const groups = groupDocuments(
      [record("waiting", "p1"), record("project", "p1"), record("loose"), record("template", undefined, true)],
      [{ id: "p1", name: "Client case" }],
      { "documents/waiting.md": 2 },
    );

    expect(groups.map(({ label }) => label)).toEqual(["Waiting on you", "Client case", "Unfiled", "Templates"]);
    expect(groups.flatMap(({ items }) => items.map(({ id }) => id))).toEqual(["waiting", "project", "loose", "template"]);
  });

  it("treats records whose project is absent from the hierarchy as unfiled", () => {
    const groups = groupDocuments([record("orphan", "missing")], [], {});
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Unfiled");
  });
});
