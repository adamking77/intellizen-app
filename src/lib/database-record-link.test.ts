import { describe, expect, it } from "vitest";

import { withDatabaseRecordParam } from "@/lib/database-record-link";

describe("database record links", () => {
  it("adds and replaces a record while preserving other view state", () => {
    const next = withDatabaseRecordParam(new URLSearchParams("view=timeline&record=old"), "new");
    expect(next.toString()).toBe("view=timeline&record=new");
  });

  it("removes only the record parameter", () => {
    const next = withDatabaseRecordParam(new URLSearchParams("view=timeline&record=old"), null);
    expect(next.toString()).toBe("view=timeline");
  });
});
