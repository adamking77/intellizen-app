import { supabase } from "@/lib/supabase";

// ============================
// Sandboxed GenUI query gate (Tier 2)
// ============================

// The ONLY capability exposed to agent-generated HTML: read-only Supabase
// queries against an explicit table/column allowlist with hard row caps.
// No raw SQL, no writes, no tables outside this map.
const SANDBOX_QUERY_ALLOWLIST: Record<
  string,
  { schema: string; table: string; columns: string[]; filterColumns: string[] }
> = {
  workspace_records: {
    schema: "workspace",
    table: "records",
    columns: ["id", "database_id", "fields", "created_at", "updated_at"],
    filterColumns: ["id", "database_id"],
  },
  work_events: {
    schema: "workspace",
    table: "work_events",
    columns: ["id", "record_id", "workflow_run_id", "event_kind", "actor", "durable_role", "summary", "created_at"],
    filterColumns: ["record_id", "workflow_run_id", "event_kind", "actor"],
  },
  signals: {
    schema: "intel",
    table: "signals",
    columns: ["id", "title", "url", "source", "status", "published_at", "source_reliability", "info_credibility", "created_at"],
    filterColumns: ["id", "status", "source"],
  },
  entities: {
    schema: "intel",
    table: "entities",
    columns: ["id", "entity_type", "name", "aliases", "summary", "confidence", "first_case_id", "updated_at"],
    filterColumns: ["id", "entity_type", "first_case_id"],
  },
  claims: {
    schema: "intel",
    table: "claims",
    columns: ["id", "case_id", "claim", "entity_ids", "source_reliability", "info_credibility", "claim_origin", "event_date", "created_at"],
    filterColumns: ["id", "case_id", "claim_origin"],
  },
};

export interface SandboxQueryInput {
  table: string;
  filters?: Array<{ column: string; op: "eq" | "in"; value: unknown }>;
  orderBy?: { column: string; ascending?: boolean };
  limit?: number;
}

export async function runSandboxQuery(input: SandboxQueryInput): Promise<Array<Record<string, unknown>>> {
  const spec = SANDBOX_QUERY_ALLOWLIST[input.table];
  if (!spec) throw new Error(`Table not available to sandboxed UI: ${input.table}`);

  let query = supabase
    .schema(spec.schema)
    .from(spec.table)
    .select(spec.columns.join(", "))
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 200));

  for (const filter of input.filters ?? []) {
    if (!spec.filterColumns.includes(filter.column)) {
      throw new Error(`Filter column not allowed: ${filter.column}`);
    }
    if (filter.op === "eq") {
      query = query.eq(filter.column, filter.value as string);
    } else if (filter.op === "in" && Array.isArray(filter.value)) {
      query = query.in(filter.column, (filter.value as unknown[]).slice(0, 50) as string[]);
    }
  }
  if (input.orderBy && spec.columns.includes(input.orderBy.column)) {
    query = query.order(input.orderBy.column, { ascending: input.orderBy.ascending ?? false });
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as Array<Record<string, unknown>>;
}
