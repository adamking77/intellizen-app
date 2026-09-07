import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { workflowDefinitionHash } from "../../shared/workflow-schema.mjs";
import { dryRunPreview } from "./write-contract.js";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const parsed = ts.createSourceFile("index.ts", source, ts.ScriptTarget.ES2022, true);
const declarations = ["getWorkflowRunContinuation", "advanceWorkflowStep"].map((name) => {
  const declaration = parsed.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(declaration);
  return declaration.getText(parsed);
});
const compiled = ts.transpileModule(declarations.join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

const baseInput = {
  workflow_run_id: "run-1", expected_run_version: 2,
  expected_step_id: "draft", expected_step_state: "running",
  next_step_id: "draft", next_step_state: "completed", next_run_status: "In progress",
  dispatcher_session: "session-1", fencing_token: 3,
  idempotency_key: "transition-1", request_hash: "b".repeat(64), actor: "Keel",
  event_kind: "workflow_step_completed", event_summary: "Draft completed",
};

function harness(continuation: unknown) {
  const calls: Array<{ name: string; args: Record<string, any> }> = [];
  const dependencies = {
    supabase: { schema: () => ({ rpc: async (name: string, args: Record<string, any>) => {
      calls.push({ name, args });
      if (name === "get_workflow_run_continuation_v1") return { data: continuation, error: null };
      return { data: { applied: true }, error: null };
    } }) },
    assertPersistenceSafe: () => undefined,
    dryRunPreview,
    workflowDefinitionHash,
  };
  const advance = new Function(...Object.keys(dependencies), `${compiled}; return advanceWorkflowStep;`)(...Object.values(dependencies)) as (input: Record<string, unknown>) => Promise<Record<string, any>>;
  return { advance, calls };
}

const ready = {
  schema: "intellizen.workflow-run-continuation/1",
  continuationStatus: "ready",
  run: { workflowRunId: "run-1", runExecutionVersion: 4, runStepStates: {} },
  stepResults: {},
  execution: { workflowRunId: "run-1", executionVersion: 4, definitionHash: "a".repeat(64) },
};

test("advance derives exact continuation identity and completion result before preview", async () => {
  const { advance, calls } = harness(ready);
  const preview = await advance({ ...baseInput, event_payload: {
    result: { document_id: "doc-1" }, _continuation: { schema: "caller-controlled", extra: true },
  } });
  assert.equal(preview.dry_run, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "get_workflow_run_continuation_v1");
  assert.deepEqual(preview.p_event_payload._continuation, {
    schema: "intellizen.workflow-transition-continuation/1",
    executionVersion: 4,
    definitionHash: "a".repeat(64),
    stepResult: { document_id: "doc-1" },
  });
  assert.match(preview.p_request_hash, /^[a-f0-9]{64}$/);
});

test("advance hashes the final derived request, so retries are stable and changed results or identity differ", async () => {
  const first = await harness(ready).advance({ ...baseInput, event_payload: { result: { value: 1 } } });
  const retry = await harness(ready).advance({ ...baseInput, event_payload: { result: { value: 1 } } });
  const changedResult = await harness(ready).advance({ ...baseInput, event_payload: { result: { value: 2 } } });
  const changedIdentity = await harness({
    ...ready,
    run: { ...ready.run, runExecutionVersion: 5 },
    execution: { ...ready.execution, executionVersion: 5 },
  }).advance({ ...baseInput, event_payload: { result: { value: 1 } } });
  assert.equal(first.p_request_hash, retry.p_request_hash);
  assert.notEqual(first.p_request_hash, changedResult.p_request_hash);
  assert.notEqual(first.p_request_hash, changedIdentity.p_request_hash);
  assert.notEqual(first.p_request_hash, baseInput.request_hash);
});

test("non-completing transitions force JSON null and confirmed transitions use the derived payload", async () => {
  const { advance, calls } = harness(ready);
  const result = await advance({ ...baseInput, next_step_id: "approve", next_step_state: "queued",
    event_payload: { result: { must_not_persist: true } }, confirm_write: true });
  assert.equal(result.applied, true);
  assert.deepEqual(calls.map((call) => call.name), ["get_workflow_run_continuation_v1", "transition_workflow_step"]);
  assert.equal(calls[1].args.p_event_payload._continuation.stepResult, null);
});

test("legacy-partial or invalid continuation identity fails before transition", async () => {
  for (const continuation of [
    { ...ready, continuationStatus: "legacy_partial" },
    { ...ready, execution: { ...ready.execution, executionVersion: 0, definitionHash: "bad" } },
    { ...ready, schema: "wrong" },
    { ...ready, execution: { ...ready.execution, workflowRunId: "other-run" } },
    { ...ready, run: { ...ready.run, runStepStates: { previous: "completed" } } },
    { ...ready, stepResults: { previous: {
      workflowRunId: "run-1", stepId: "previous", executionVersion: 3,
      definitionHash: ready.execution.definitionHash, result: { stale: true },
    } } },
  ]) {
    const { advance, calls } = harness(continuation);
    await assert.rejects(advance(baseInput), /continuation/i);
    assert.deepEqual(calls.map((call) => call.name), ["get_workflow_run_continuation_v1"]);
  }
});
