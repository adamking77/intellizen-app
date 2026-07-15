import type { IntelSignal, ProjectSignal } from "@/lib/types";

type ProjectSignalQueryRow = Omit<ProjectSignal, "intel_signals"> & {
  intel_signals?: IntelSignal | null;
  signals?: IntelSignal | null;
};

/** Normalize Supabase's relationship key to the UI's durable field name. */
export function normalizeProjectSignalRows(rows: ProjectSignalQueryRow[]): ProjectSignal[] {
  return rows.map(({ signals, ...row }) => ({
    ...row,
    intel_signals: row.intel_signals ?? signals ?? null,
  }));
}
