import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { dryRunPreview } from "./write-contract.js";

// Execute the actual start function with isolated dependencies. Importing the
// monolithic entrypoint would boot a real MCP server and require credentials.
const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("index.ts", source, ts.ScriptTarget.ES2022, true);
const declaration = parsed.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "startWorkflow");
assert.ok(declaration);
const compiled = ts.transpileModule(declaration.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function harness(status: unknown) {
  const writes: unknown[] = [];
  const record = { id: "workflow-record", fields: {} };
  const names = new Proxy({}, { get: (_target, key) => key });
  const dependencies = {
    getWorkflowByWorkflowId: async () => record,
    toWorkflowTemplateItem: () => ({ status, name: "Example", workflow_id: "example", definition: null }),
    formatAgentWorkTimestamp: () => "fixture-time",
    WORKFLOW_RUN_FIELDS: names,
    GENZEN_WORKSPACE_DATABASE_IDS: { workflowRuns: "runs" },
    markdownList: () => "none",
    dryRunPreview,
    supabase: { schema: () => ({ from: () => ({ insert: (value: unknown) => { writes.push(value); throw new Error("Fixture stopped at first write"); } }) }) },
  };
  const start = new Function(...Object.keys(dependencies), `${compiled}; return startWorkflow;`)(...Object.values(dependencies)) as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  return { writes, start };
}

test("MCP rejects Draft and unknown activation states before every write", async () => {
  for (const status of ["Draft", "Paused", "Retired", "Unknown", null, undefined]) {
    const { writes, start } = harness(status);
    await assert.rejects(start({ workflow_id: "example", requested_by: "fixture", trigger_source: "mcp", confirm_write: true }), /Activate this workflow/);
    assert.deepEqual(writes, []);
  }
});

test("MCP permits Active preview and only then reaches a confirmed insert", async () => {
  const { writes, start } = harness("Active");
  const preview = await start({ workflow_id: "example", requested_by: "fixture", trigger_source: "mcp" });
  assert.equal(preview.dry_run, true);
  assert.deepEqual(writes, []);
  await assert.rejects(start({ workflow_id: "example", requested_by: "fixture", trigger_source: "mcp", confirm_write: true }), /Fixture stopped at first write/);
  assert.equal(writes.length, 1);
});
