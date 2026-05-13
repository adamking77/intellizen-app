import { describe, expect, it } from "vitest";

import {
  buildTimelineRecords,
  formatTimelineDateValue,
  getTimelineFieldDefaults,
  getTimelineMajorSegments,
  getTimelineMinorSegments,
  getTimelineRangeBounds,
  parseTimelineDate,
  toTimelineDayNumber,
} from "@/lib/database-timeline";
import type { WorkspaceDatabaseField, WorkspaceDatabaseModel } from "@/lib/types";

function makeDatabase(schema: WorkspaceDatabaseField[]): WorkspaceDatabaseModel {
  return {
    id: "db-main",
    name: "Main",
    schema,
    headerFieldIds: ["name"],
    views: [],
    records: [
      {
        id: "a",
        name: "Phase one",
        start: "2026-05-10",
        end: "2026-05-12",
        progress: 40,
      },
      {
        id: "b",
        name: "Milestone",
        start: "2026-05-15",
        progress: 120,
      },
      {
        id: "c",
        name: "No dates",
      },
    ],
  };
}

describe("database-timeline", () => {
  it("selects sensible default timeline fields from schema names", () => {
    const defaults = getTimelineFieldDefaults({
      headerFieldIds: ["name"],
      schema: [
        { id: "name", name: "Name", type: "text" },
        { id: "deadline", name: "Deadline", type: "date" },
        { id: "start", name: "Start date", type: "date" },
        { id: "progress", name: "Progress", type: "number" },
      ],
    });

    expect(defaults).toMatchObject({
      timelineStartField: "start",
      timelineEndField: "deadline",
      timelineProgressField: "progress",
      timelineLabelField: "name",
      timelineViewMode: "Week",
    });
  });

  it("uses one date field as both start and end when it is the only option", () => {
    const defaults = getTimelineFieldDefaults({
      headerFieldIds: ["name"],
      schema: [
        { id: "name", name: "Name", type: "text" },
        { id: "due", name: "Due", type: "date" },
      ],
    });

    expect(defaults.timelineStartField).toBe("due");
    expect(defaults.timelineEndField).toBe("due");
  });

  it("normalizes local date strings without timezone drift", () => {
    const date = parseTimelineDate("2026-05-13T23:30:00.000Z");

    expect(date).not.toBeNull();
    expect(Number.isNaN(date!.getTime())).toBe(false);
    expect(formatTimelineDateValue(toTimelineDayNumber(parseTimelineDate("2026-05-13")!))).toBe("2026-05-13");
  });

  it("builds timeline records from configured view fields and clamps progress", () => {
    const schema: WorkspaceDatabaseField[] = [
      { id: "name", name: "Name", type: "text" },
      { id: "start", name: "Start", type: "date" },
      { id: "end", name: "End", type: "date" },
      { id: "progress", name: "Progress", type: "number" },
    ];
    const database = makeDatabase(schema);
    const view: WorkspaceDatabaseModel["views"][number] = {
      id: "view",
      name: "Timeline",
      type: "timeline",
      sort: [],
      filter: [],
      hiddenFields: [],
      timelineStartField: "start",
      timelineEndField: "end",
      timelineProgressField: "progress",
    };

    const records = buildTimelineRecords(database, view, []);

    expect(records.map((record) => record.id)).toEqual(["a", "b"]);
    expect(records[0].endDay - records[0].startDay).toBe(2);
    expect(records[1].startDay).toBe(records[1].endDay);
    expect(records[1].progress).toBe(100);
  });

  it("respects view filters when deriving timeline records", () => {
    const schema: WorkspaceDatabaseField[] = [
      { id: "name", name: "Name", type: "text" },
      { id: "start", name: "Start", type: "date" },
      { id: "end", name: "End", type: "date" },
    ];
    const database = makeDatabase(schema);
    const view: WorkspaceDatabaseModel["views"][number] = {
      id: "view",
      name: "Timeline",
      type: "timeline",
      sort: [],
      filter: [{ fieldId: "name", op: "contains", value: "milestone" }],
      hiddenFields: [],
      timelineStartField: "start",
      timelineEndField: "end",
    };

    expect(buildTimelineRecords(database, view, []).map((record) => record.id)).toEqual(["b"]);
  });

  it("derives bounded week and year segments for rendered timelines", () => {
    const start = toTimelineDayNumber(parseTimelineDate("2026-05-10")!);
    const end = toTimelineDayNumber(parseTimelineDate("2026-06-01")!);
    const bounds = getTimelineRangeBounds([{ startDay: start, endDay: end }], "Week");

    expect(bounds.startDay).toBeLessThanOrEqual(start);
    expect(bounds.endDay).toBeGreaterThanOrEqual(end);
    expect(getTimelineMinorSegments(bounds.startDay, bounds.endDay, "Week").length).toBeGreaterThan(1);
    expect(getTimelineMajorSegments(bounds.startDay, bounds.endDay, "Year")[0].label).toBe("2026");
  });
});
