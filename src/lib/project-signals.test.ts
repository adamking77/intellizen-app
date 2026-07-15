import { describe, expect, it } from "vitest";

import { normalizeProjectSignalRows } from "@/lib/project-signals";
import type { IntelSignal } from "@/lib/types";

const signal = {
  id: 41,
  title: "Visible signal",
  url: "https://example.com/signal",
} as IntelSignal;

describe("normalizeProjectSignalRows", () => {
  it("maps Supabase's signals relationship onto the UI contract", () => {
    const [row] = normalizeProjectSignalRows([{
      id: 7,
      project_id: 3,
      signal_id: 41,
      notes: null,
      added_at: "2026-07-15T00:00:00Z",
      signals: signal,
    }]);

    expect(row.intel_signals).toBe(signal);
    expect("signals" in row).toBe(false);
  });

  it("preserves an explicitly aliased relationship", () => {
    const [row] = normalizeProjectSignalRows([{
      id: 7,
      project_id: 3,
      signal_id: 41,
      notes: null,
      added_at: "2026-07-15T00:00:00Z",
      intel_signals: signal,
    }]);

    expect(row.intel_signals).toBe(signal);
  });
});
