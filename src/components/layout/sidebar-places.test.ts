import { describe, expect, it } from "vitest";

import { PLACE_ITEMS, placeRouteForShortcut } from "./sidebar";

describe("sidebar places", () => {
  it("keeps the approved eight destinations in shortcut order", () => {
    expect(PLACE_ITEMS.map(({ label, to, shortcut }) => ({ label, to, shortcut }))).toEqual([
      { label: "Home", to: "/home", shortcut: "⌘1" },
      { label: "Databases", to: "/databases", shortcut: "⌘2" },
      { label: "Docs", to: "/docs", shortcut: "⌘3" },
      { label: "Graph", to: "/graph", shortcut: "⌘4" },
      { label: "Canvas", to: "/canvas", shortcut: "⌘5" },
      { label: "Workflows", to: "/workflows", shortcut: "⌘6" },
      { label: "Agents", to: "/agents", shortcut: "⌘7" },
      { label: "Settings", to: "/settings", shortcut: "⌘8" },
    ]);
    expect(placeRouteForShortcut("3")).toBe("/docs");
    expect(placeRouteForShortcut("9")).toBeUndefined();
  });
});
