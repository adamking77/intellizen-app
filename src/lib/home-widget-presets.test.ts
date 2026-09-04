import { describe, expect, it } from "vitest";

import { buildHomeWidgetPresets, isHomeWidgetPresetPinned } from "@/lib/home-widget-presets";
import type { HomeDatabaseViewPin } from "@/lib/home-pins";
import type { WorkspaceDatabaseCatalogEntry } from "@/lib/types";

function database(
  id: string,
  name: string,
  schema: WorkspaceDatabaseCatalogEntry["schema"] = [],
): WorkspaceDatabaseCatalogEntry {
  return {
    id,
    name,
    schema,
    headerFieldIds: [],
    taxonomy: {},
    records: [],
    views: [{
      id: `${id}-view`,
      name: "All",
      type: "list",
      sort: [],
      filter: [],
      hiddenFields: [],
    }],
  };
}

describe("Home widget presets", () => {
  it("offers only the surviving database-backed Workflow widget", () => {
    const presets = buildHomeWidgetPresets([
      database("documents", "Documents"),
      database("654acc9c-0270-49e2-86f7-788e25c59a76", "Tasks"),
      database(
        "c1000000-0000-0000-0000-000000000001",
        "Workflow Registry",
        [{ id: "workflow_owner_role", name: "Owner role", type: "text" }],
      ),
    ]);

    expect(presets.map((preset) => preset.id)).toEqual(["workflows"]);
  });

  it("recognizes an already-pinned preset independently of its shared source view", () => {
    const pin: HomeDatabaseViewPin = {
      id: "pin-workflows",
      kind: "database-view",
      databaseId: "db",
      viewId: "view",
      config: { presetKey: "workflows" },
      x: 0,
      y: 0,
      w: 4,
      h: 11,
    };
    const preset = {
      id: "workflows" as const,
      label: "Workflows",
      description: "Workflows",
      databaseId: "db",
      viewId: "view",
      title: "Workflows",
      config: { presetKey: "workflows" },
    };

    expect(isHomeWidgetPresetPinned([pin], preset)).toBe(true);
  });
});
