import { describe, expect, it } from "vitest";

import {
  HASH_PALETTE,
  getReadableTextColor,
  hashString,
  resolveFieldOptionColor,
} from "@/lib/database-colors";
import {
  applyFilters,
  applySorts,
  exportDatabaseCsv,
  getFieldValue,
  prepareCsvImport,
} from "@/lib/database-core";
import type {
  WorkspaceDatabaseCatalogEntry,
  WorkspaceDatabaseField,
  WorkspaceDatabaseModel,
  WorkspaceDatabaseRecordModel,
} from "@/lib/types";

function makeDatabase(
  schema: WorkspaceDatabaseField[],
  records: WorkspaceDatabaseRecordModel[],
): WorkspaceDatabaseModel {
  return {
    id: "db-main",
    name: "Main",
    schema,
    views: [],
    records,
    headerFieldIds: ["title"],
  };
}

describe("database-core", () => {
  it("filters and sorts records using schema-aware values", () => {
    const schema: WorkspaceDatabaseField[] = [
      { id: "title", name: "Title", type: "text" },
      { id: "amount", name: "Amount", type: "number" },
      { id: "status", name: "Status", type: "status", options: ["Not started", "Done"] },
    ];
    const records: WorkspaceDatabaseRecordModel[] = [
      { id: "a", title: "Zulu", amount: 5, status: "Done" },
      { id: "b", title: "Alpha", amount: 2, status: "Not started" },
      { id: "c", title: "Bravo", amount: 10, status: "Done" },
    ];

    const filtered = applyFilters(
      records,
      [{ fieldId: "status", op: "equals", value: "done" }],
      schema,
    );
    const sorted = applySorts(
      filtered,
      [{ fieldId: "amount", direction: "desc" }],
      schema,
    );

    expect(sorted.map((record) => record.id)).toEqual(["c", "a"]);
  });

  it("filters relation fields by display labels instead of raw ids", () => {
    const clientSchema: WorkspaceDatabaseField[] = [
      { id: "name", name: "Name", type: "text" },
    ];
    const initiativeSchema: WorkspaceDatabaseField[] = [
      { id: "title", name: "Title", type: "text" },
      {
        id: "client",
        name: "Client",
        type: "relation",
        relation: { targetDatabaseId: "db-clients" },
      },
    ];
    const initiativeRecords: WorkspaceDatabaseRecordModel[] = [
      { id: "initiative-a", title: "Market map refresh", client: ["client-a"] },
      { id: "initiative-b", title: "Target list v2", client: ["client-b"] },
    ];
    const catalog: WorkspaceDatabaseCatalogEntry[] = [
      {
        id: "db-main",
        name: "Initiatives",
        schema: initiativeSchema,
        headerFieldIds: ["title"],
        records: initiativeRecords,
        views: [],
      },
      {
        id: "db-clients",
        name: "Clients",
        schema: clientSchema,
        headerFieldIds: ["name"],
        records: [
          { id: "client-a", name: "Alpha Holdings" },
          { id: "client-b", name: "Northstar Capital" },
        ],
        views: [],
      },
    ];

    const filtered = applyFilters(
      initiativeRecords,
      [{ fieldId: "client", op: "contains", value: "alpha" }],
      initiativeSchema,
      catalog,
    );

    expect(filtered.map((record) => record.id)).toEqual(["initiative-a"]);
  });

  it("filters relation fields by raw ids when a view stores durable relation filters", () => {
    const taskSchema: WorkspaceDatabaseField[] = [
      { id: "title", name: "Title", type: "text" },
      {
        id: "project",
        name: "Project",
        type: "relation",
        relation: { targetDatabaseId: "db-projects" },
      },
    ];
    const taskRecords: WorkspaceDatabaseRecordModel[] = [
      { id: "task-a", title: "Draft page", project: ["project-a"] },
      { id: "task-b", title: "Review page", project: ["project-b"] },
    ];

    const filtered = applyFilters(
      taskRecords,
      [{ fieldId: "project", op: "contains", value: "project-a" }],
      taskSchema,
    );

    expect(filtered.map((record) => record.id)).toEqual(["task-a"]);
  });

  it("evaluates formula fields with references and functions", () => {
    const schema: WorkspaceDatabaseField[] = [
      { id: "title", name: "Title", type: "text" },
      { id: "amount", name: "Amount", type: "number" },
      { id: "summary", name: "Summary", type: "formula", formula: { expression: '=CONCAT({title}, " / ", ROUND({amount}))' } },
    ];
    const database = makeDatabase(schema, [{ id: "a", title: "Client A", amount: 4.6 }]);

    expect(getFieldValue(database.records[0], schema[2], database)).toBe("Client A / 5");
  });

  it("evaluates rollups across related records", () => {
    const schema: WorkspaceDatabaseField[] = [
      { id: "title", name: "Title", type: "text" },
      { id: "amount", name: "Amount", type: "number" },
      { id: "linked", name: "Linked", type: "relation" },
      {
        id: "total",
        name: "Total",
        type: "rollup",
        rollup: {
          relationFieldId: "linked",
          targetFieldId: "amount",
          aggregation: "sum",
        },
      },
    ];
    const records: WorkspaceDatabaseRecordModel[] = [
      { id: "a", title: "Parent", linked: ["b", "c"] },
      { id: "b", title: "Child 1", amount: 4 },
      { id: "c", title: "Child 2", amount: 6 },
    ];
    const database = makeDatabase(schema, records);
    const catalog: WorkspaceDatabaseCatalogEntry[] = [
      {
        id: database.id,
        name: database.name,
        schema: database.schema,
        headerFieldIds: database.headerFieldIds ?? [],
        records: database.records,
        views: database.views,
      },
    ];

    expect(getFieldValue(records[0], schema[3], database, catalog)).toBe(10);
  });

  it("parses csv imports with multiline cells, skipped rows, and ignored headers", () => {
    const schema: WorkspaceDatabaseField[] = [
      { id: "name", name: "Name", type: "text" },
      { id: "description", name: "Description", type: "text" },
      { id: "done", name: "Done", type: "checkbox" },
      { id: "amount", name: "Amount", type: "number" },
      { id: "calc", name: "Calc", type: "formula", formula: { expression: "=1" } },
    ];
    const result = prepareCsvImport(
      { schema },
      [
        "id,Name,Description,Calc,Unknown,Done,Amount",
        '1,Alpha,"line 1',
        'line 2",ignored,surplus,true,12',
        "2,,,,,,",
        "3,Beta,,, ,false,7",
      ].join("\n"),
    );

    expect(result.records).toHaveLength(2);
    expect(result.records[0].fields).toMatchObject({
      name: "Alpha",
      description: "line 1\nline 2",
      done: true,
      amount: 12,
    });
    expect(result.records[1].fields).toMatchObject({
      name: "Beta",
      done: false,
      amount: 7,
    });
    expect(result.readOnlyHeaders).toEqual(["Calc"]);
    expect(result.ignoredHeaders).toEqual(["Unknown"]);
    expect(result.skippedRows).toBe(1);
  });

  it("rejects invalid csv cell values with row context", () => {
    const schema: WorkspaceDatabaseField[] = [
      { id: "name", name: "Name", type: "text" },
      { id: "amount", name: "Amount", type: "number" },
    ];

    expect(() =>
      prepareCsvImport(
        { schema },
        ["Name,Amount", "Alpha,nope"].join("\n"),
      ),
    ).toThrowError(/Row 2 · Amount: Expected a number/);
  });

  it("exports csv with escaped commas and newlines", () => {
    const schema: WorkspaceDatabaseField[] = [
      { id: "title", name: "Title", type: "text" },
      { id: "notes", name: "Notes", type: "text" },
    ];
    const database = makeDatabase(schema, [
      { id: "a", title: "Alpha, Inc.", notes: "Line 1\nLine 2" },
    ]);

    const csv = exportDatabaseCsv(database);

    expect(csv).toContain('"Alpha, Inc."');
    expect(csv).toContain('"Line 1\nLine 2"');
  });

  it("prefers semantic colors before the cycling palette", () => {
    const field: WorkspaceDatabaseField = {
      id: "status",
      name: "Status",
      type: "status",
      options: ["Backlog", "Blocked", "Shipped"],
    };

    expect(resolveFieldOptionColor(field, "Blocked")).toBe("#f38ba8");
    expect(resolveFieldOptionColor(field, "Shipped")).toBe("#a6e3a1");
  });

  it("prefers explicit option colors over semantic colors", () => {
    const field: WorkspaceDatabaseField = {
      id: "priority",
      name: "Priority",
      type: "select",
      options: ["High"],
      optionColors: {
        High: "#ffffff",
      },
    };

    expect(resolveFieldOptionColor(field, "High")).toBe("#ffffff");
  });

  it("keeps color hashing deterministic", () => {
    expect(hashString("Acme Holdings")).toBe(hashString("Acme Holdings"));
    expect(HASH_PALETTE[hashString("Acme Holdings") % HASH_PALETTE.length]).toBe(
      HASH_PALETTE[hashString("Acme Holdings") % HASH_PALETTE.length],
    );
  });

  it("returns readable text colors for light and dark backgrounds", () => {
    expect(getReadableTextColor("#f9e2af")).toBe("var(--crust)");
    expect(getReadableTextColor("#74c7ec")).toBe("var(--crust)");
    expect(getReadableTextColor("#7f849c")).toBe("var(--text)");
    expect(getReadableTextColor("#1e1e2e")).toBe("var(--text)");
  });
});
