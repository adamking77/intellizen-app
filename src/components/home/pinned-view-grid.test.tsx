import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { HomeRecordRows } from "./pinned-view-grid";

describe("HomeRecordRows", () => {
  it("renders each record as one attributed row without property labels", () => {
    const html = renderToStaticMarkup(createElement(HomeRecordRows, {
      database: {
        id: "tasks",
        name: "Tasks",
        schema: [
          { id: "title", name: "Title", type: "text" },
          { id: "assignee", name: "Assignee", type: "text" },
          { id: "status", name: "Status", type: "status" },
          { id: "due", name: "Due", type: "date" },
        ],
        views: [],
        records: [{ id: "task-1", title: "Review brief", assignee: "Keel", status: "In progress", due: "2026-09-04" }],
      },
      view: { id: "today", name: "Today", type: "list", filter: [], sort: [], hiddenFields: [] },
      catalog: [],
      onOpenRecord: vi.fn(),
    }));

    expect(html).toContain("Review brief");
    expect(html).toContain("Keel");
    expect(html).toContain("In progress");
    expect(html).toContain("2026-09-04");
    expect(html).not.toContain(">Assignee<");
    expect(html).not.toContain(">Status<");
    expect(html).not.toContain(">Due<");
  });
});
