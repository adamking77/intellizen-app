import { describe, expect, it } from "vitest";

import { mergeHomeDashboardLayout, pinnedDatabaseRecordPath } from "@/lib/home-dashboard";
import type { HomePin } from "@/lib/home-pins";

describe("mergeHomeDashboardLayout", () => {
  it("keeps remote pin placement authoritative over a stale local cache", () => {
    const pin: HomePin = {
      id: "pin-a",
      databaseId: "db-a",
      viewId: "view-a",
      x: 6,
      y: 8,
      w: 6,
      h: 10,
    };

    expect(
      mergeHomeDashboardLayout(
        [pin],
        [{ id: "pin-a", x: 0, y: 0, w: 4, h: 8 }],
      ),
    ).toEqual([{ id: "pin-a", x: 6, y: 8, w: 6, h: 10 }]);
  });

  it("builds a deep link to the source view and selected record", () => {
    expect(pinnedDatabaseRecordPath("db-a", "view-a", "record-a")).toBe(
      "/databases/db-a?view=view-a&record=record-a",
    );
  });
});
