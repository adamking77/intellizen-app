import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { workflowDefinitionHash } from "../../shared/workflow-schema.mjs";
import { dryRunPreview } from "./write-contract.js";

// Execute the actual start function with isolated dependencies. Importing the
// monolithic entrypoint would boot a real MCP server and require credentials.
const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("index.ts", source, ts.ScriptTarget.ES2022, true);
const declaration = parsed.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === "startWorkflow");
assert.ok(declaration);
const compiled = ts.transpileModule(declaration.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

const definition = {
  schema: "intellizen.workflow/1", id: "example.workflow", name: "Example", version: 1,
  trigger: { kind: "manual" }, inputs: [],
  steps: [{ id: "step_1", title: "Review", kind: "role-assign" }],
};

function harness(status: unknown, schemaV1 = false) {
  const writes: unknown[] = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const record = { id: "workflow-record", fields: {} };
  const names = new Proxy({}, { get: (_target, key) => ({
    name: "run_name",
    startedAt: "run_started_at",
  }[String(key)] ?? key) });
  const dependencies = {
    getWorkflowByWorkflowId: async () => record,
    toWorkflowTemplateItem: () => ({
      status, name: "Example", workflow_id: "example.workflow",
      definition: schemaV1 ? definition : null, definition_version: schemaV1 ? 1 : null,
      entity: "genzen", owner_role: "operator", default_actor: "Keel",
    }),
    validateWorkflowDefinition: () => ({ valid: true, errors: [] }),
    validatedWorkflowDefinitionHash: async () => "a".repeat(64),
    workflowDefinitionHash,
    dryRunWorkflowDefinition: () => ({ sequence: [] }),
    randomUUID: () => "attempt-id",
    formatAgentWorkTimestamp: () => "fixture-time",
    WORKFLOW_RUN_FIELDS: names,
    WORKFLOW_REGISTRY_FIELDS: names,
    GENZEN_WORKSPACE_DATABASE_IDS: { workflowRuns: "runs" },
    markdownList: () => "none",
    dryRunPreview,
    supabase: { schema: () => ({
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return { data: { workflow_run_id: "run-1", execution_version: 1, definition_hash: "a".repeat(64), run: {} }, error: null };
      },
      from: () => ({ insert: (value: unknown) => { writes.push(value); throw new Error("Fixture stopped at first write"); } }),
    }) },
  };
  const start = new Function(...Object.keys(dependencies), `${compiled}; return startWorkflow;`)(...Object.values(dependencies)) as (input: Record<string, unknown>) => Promise<Record<string, any>>;
  return { rpcCalls, writes, start };
}

test("MCP rejects Draft and unknown activation states before every write", async () => {
  for (const status of ["Draft", "Paused", "Retired", "Unknown", null, undefined]) {
    const { rpcCalls, writes, start } = harness(status);
    await assert.rejects(start({ workflow_id: "example", requested_by: "fixture", trigger_source: "mcp", confirm_write: true }), /Activate this workflow/);
    assert.deepEqual(rpcCalls, []);
    assert.deepEqual(writes, []);
  }
});

test("legacy workflows retain the existing preview and insert path", async () => {
  const { rpcCalls, writes, start } = harness("Active");
  const preview = await start({ workflow_id: "example", requested_by: "fixture", trigger_source: "schedule" });
  assert.equal(preview.dry_run, true);
  assert.deepEqual(rpcCalls, []);
  assert.deepEqual(writes, []);
  await assert.rejects(start({ workflow_id: "example", requested_by: "fixture", trigger_source: "schedule", confirm_write: true }), /Fixture stopped at first write/);
  assert.equal(writes.length, 1);
});

test("schema-v1 preview freezes a confirmable attempt and confirmed retries use only the atomic RPC", async () => {
  const { rpcCalls, writes, start } = harness("Active", true);
  const input = { workflow_id: "example.workflow", requested_by: "Adam", trigger_source: "mcp", context: { case: "2050" } };
  const preview = await start(input);
  const attempt = preview.schema_v1.confirmation.start_attempt;
  assert.equal(preview.dry_run, true);
  assert.equal(attempt.idempotency_key, "attempt-id");
  assert.match(attempt.request_hash, /^[a-f0-9]{64}$/);
  assert.equal(typeof attempt.run_started_at, "string");

  const first = await start({ ...input, start_attempt: attempt, confirm_write: true });
  const retry = await start({ ...input, start_attempt: attempt, confirm_write: true });
  assert.equal(first.workflow_run_id, "run-1");
  assert.equal(retry.execution_version, 1);
  assert.deepEqual(writes, []);
  assert.equal(rpcCalls.length, 2);
  for (const call of rpcCalls) {
    assert.equal(call.name, "start_workflow_run_v1");
    assert.equal(call.args.p_idempotency_key, "attempt-id");
    assert.equal(call.args.p_request_hash, attempt.request_hash);
    assert.equal((call.args.p_fields as Record<string, unknown>).run_name, attempt.run_name);
    assert.equal((call.args.p_fields as Record<string, unknown>).run_started_at, attempt.run_started_at);
    assert.equal(call.args.p_confirm_write, true);
  }

  await assert.rejects(
    start({ ...input, context: { case: "changed" }, start_attempt: attempt, confirm_write: true }),
    /changed after preview/,
  );
  assert.equal(rpcCalls.length, 2);
});

test("schema-v1 confirmation requires a preview attempt and rejects unsupported trigger sources", async () => {
  const { rpcCalls, start } = harness("Active", true);
  await assert.rejects(
    start({ workflow_id: "example.workflow", requested_by: "Adam", trigger_source: "mcp", confirm_write: true }),
    /start_attempt returned by preview/,
  );
  for (const trigger_source of ["monitor", "schedule"]) {
    await assert.rejects(
      start({ workflow_id: "example.workflow", requested_by: "Adam", trigger_source }),
      /do not support trigger source/,
    );
  }
  assert.deepEqual(rpcCalls, []);
});
