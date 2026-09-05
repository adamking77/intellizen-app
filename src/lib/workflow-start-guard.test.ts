import { beforeEach, describe, expect, it, vi } from "vitest";

const backend = vi.hoisted(() => ({ status: "Draft" as unknown, writes: vi.fn(), runs: [] as Array<Record<string, unknown>>, filters: [] as Array<unknown>, range: [] as number[], workflowLookups: 0 }));
vi.mock("@/lib/supabase", () => ({
  supabase: { schema: () => ({ from: (table: string) => {
    let membership: Record<string, unknown> | null = null;
    let end = Number.POSITIVE_INFINITY;
    const query = {
      select: () => query, eq: () => query, order: () => query,
      range: (start: number, finish: number) => { backend.range = [start, finish]; end = finish; return query; },
      contains: (column: string, value: Record<string, unknown>) => { backend.filters.push([column, value]); membership = value; return query; },
      insert: (value: unknown) => { backend.writes(value); throw new Error("Fixture stopped at first write"); },
      update: (value: unknown) => { backend.writes(value); throw new Error("Unexpected update"); },
      single: async () => {
        if (table === "databases") return { data: { id: "runs", name: "Workflow Runs", schema: [], taxonomy: {} }, error: null };
        backend.workflowLookups += 1;
        return { data: { id: "c1000000-0000-0000-0000-000000000010", fields: { workflow_id: "example", workflow_name: "Example", workflow_status: backend.status }, taxonomy: {} }, error: null };
      },
      then: (resolve: (value: unknown) => unknown) => {
        // PostgREST evaluates filters before its range, regardless of chaining order.
        const scoped = membership ? backend.runs.filter((row) => Object.entries(membership!).every(([key, wanted]) => (wanted as string[]).every((id) => ((row.fields as Record<string, string[]>)[key] ?? []).includes(id)))) : backend.runs;
        return Promise.resolve({ data: scoped.slice(0, end + 1), error: null }).then(resolve);
      },
    };
    return query;
  } }) },
}));

import { GENZEN_WORKSPACE_DATABASE_IDS, listWorkflowRuns, startWorkflow } from "./data";

beforeEach(() => { backend.writes.mockClear(); backend.status = "Draft"; backend.runs = []; backend.filters = []; backend.range = []; backend.workflowLookups = 0; });

describe("workflow activation at the start boundary", () => {
  it.each(["Draft", "Paused", "Retired", "Unknown", null, undefined])("refuses %s even with confirmed write and creates no records", async (status) => {
    backend.status = status;
    await expect(startWorkflow({ workflowId: "example", requestedBy: "fixture", triggerSource: "ui", confirmWrite: true })).rejects.toThrow("Activate this workflow");
    expect(backend.writes).not.toHaveBeenCalled();
  });
  it("permits an explicitly Active workflow preview and reaches the write boundary only when confirmed", async () => {
    backend.status = "Active";
    expect(await startWorkflow({ workflowId: "example", requestedBy: "fixture", triggerSource: "ui" })).toMatchObject({ dry_run: true, next_run: { status: "Queued" } });
    expect(backend.writes).not.toHaveBeenCalled();
    await expect(startWorkflow({ workflowId: "example", requestedBy: "fixture", triggerSource: "ui", confirmWrite: true })).rejects.toThrow("Fixture stopped at first write");
    expect(backend.writes).toHaveBeenCalledTimes(1);
  });
});

it("filters a workflow's run history on the server before the bounded range", async () => {
  const selected = "c1000000-0000-0000-0000-000000000010";
  const row = (id: string, workflow: string) => ({ id, database_id: GENZEN_WORKSPACE_DATABASE_IDS.workflowRuns, fields: { run_workflow: [workflow], run_name: id, run_status: "Done" }, taxonomy: {} });
  backend.runs = [...Array.from({ length: 500 }, (_, index) => row(`unrelated-${index}`, "another-workflow")), row("older-selected-run", selected)];
  const result = await listWorkflowRuns({ workflowId: selected, includeCompleted: true, limit: 1 });
  expect(backend.filters).toEqual([["fields", { run_workflow: [selected] }]]);
  expect(backend.range).toEqual([0, 2]);
  expect(result.map((item) => item.id)).toEqual(["older-selected-run"]);
  expect(backend.workflowLookups).toBe(0);
});
