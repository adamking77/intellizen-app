import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { Client } from "../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StdioClientTransport } from "../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js";

const projectRoot = "/Users/adamking/projects/intellizen-app";
const workflowId = "v2-gate4-role-directed-proof";
const secretCanary = "api_key=AbCdEfGhIjKlMnOpQrStUvWxYz1234567890";

function parseEnv(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        return [
          line.slice(0, separator).trim(),
          line
            .slice(separator + 1)
            .trim()
            .replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function toolJson(response) {
  const text = response.content.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("MCP tool returned no text.");
  return JSON.parse(text);
}

async function startFixtureRun(caseName) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(projectRoot, "mcp-server/dist/index.js"), "--plane", "admin"],
    cwd: projectRoot,
    stderr: "pipe",
  });
  const client = new Client({
    name: "intellizen-gate5-database-proof",
    version: "1.0.0",
  });
  await client.connect(transport);
  try {
    const request = {
      workflow_id: workflowId,
      trigger_source: "mcp",
      requested_by: "Gate 5 Harness",
      entity_scope: "IntelliZen",
      context: {
        gate5_case: caseName,
        fixture_only: true,
        external_action: false,
      },
      config: {
        external_actions_allowed: false,
        gate5_failure_fixture: true,
      },
    };
    const preview = toolJson(
      await client.callTool({
        name: "start_workflow",
        arguments: { ...request, confirm_write: false },
      }),
    );
    if (preview.dry_run !== true) {
      throw new Error(`Gate 5 ${caseName} preview did not remain a dry run.`);
    }
    const confirmed = toolJson(
      await client.callTool({
        name: "start_workflow",
        arguments: { ...request, confirm_write: true },
      }),
    );
    const run = confirmed.run;
    if (
      !run?.id ||
      run.schema_version !== "intellizen.workflow/1" ||
      run.run_version !== 0
    ) {
      throw new Error(`Gate 5 ${caseName} run was not seeded as schema v1.`);
    }
    return run;
  } finally {
    await client.close();
  }
}

async function rpc(supabase, name, args) {
  const { data, error } = await supabase.schema("workspace").rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

async function expectedRpcError(supabase, name, args, expected) {
  const { error } = await supabase.schema("workspace").rpc(name, args);
  if (!error || !error.message.includes(expected)) {
    throw new Error(
      `${name} expected "${expected}", received "${error?.message ?? "success"}".`,
    );
  }
  return error.message;
}

async function acquire(supabase, input) {
  const request = {
    runId: input.runId,
    expectedRunVersion: input.version,
    dispatcherSession: input.session,
    leaseTtlSeconds: input.ttl,
    idempotencyKey: input.idempotencyKey,
    actor: "Gate 5 Harness",
  };
  return rpc(supabase, "acquire_workflow_dispatch_lease", {
    p_workflow_run_id: input.runId,
    p_expected_run_version: input.version,
    p_dispatcher_session: input.session,
    p_lease_ttl_seconds: input.ttl,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: hash(request),
    p_actor: request.actor,
  });
}

async function transition(supabase, input) {
  const request = {
    runId: input.runId,
    expectedRunVersion: input.version,
    expectedStepId: input.expectedStepId,
    expectedStepState: input.expectedStepState,
    nextStepId: input.nextStepId,
    nextStepState: input.nextStepState,
    nextRunStatus: input.nextRunStatus,
    dispatcherSession: input.session,
    fencingToken: input.token,
    idempotencyKey: input.idempotencyKey,
    actor: input.actor ?? "Gate 5 Harness",
    eventKind: input.eventKind,
    eventSummary: input.eventSummary,
    eventPayload: input.eventPayload ?? {},
    approvalMutation: input.approvalMutation ?? null,
  };
  return rpc(supabase, "transition_workflow_step", {
    p_workflow_run_id: input.runId,
    p_expected_run_version: input.version,
    p_expected_step_id: input.expectedStepId,
    p_expected_step_state: input.expectedStepState,
    p_next_step_id: input.nextStepId,
    p_next_step_state: input.nextStepState,
    p_next_run_status: input.nextRunStatus,
    p_dispatcher_session: input.session,
    p_fencing_token: input.token,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: hash(request),
    p_actor: request.actor,
    p_event_kind: input.eventKind,
    p_event_summary: input.eventSummary,
    p_event_payload: input.eventPayload ?? {},
    p_approval_mutation: input.approvalMutation ?? null,
  });
}

async function release(supabase, input) {
  const request = {
    runId: input.runId,
    dispatcherSession: input.session,
    fencingToken: input.token,
    idempotencyKey: input.idempotencyKey,
    actor: "Gate 5 Harness",
  };
  return rpc(supabase, "release_workflow_dispatch_lease", {
    p_workflow_run_id: input.runId,
    p_dispatcher_session: input.session,
    p_fencing_token: input.token,
    p_actor: request.actor,
    p_idempotency_key: input.idempotencyKey,
    p_request_hash: hash(request),
  });
}

async function readback(supabase, runId) {
  const [{ data: run, error: runError }, { data: events, error: eventsError }] =
    await Promise.all([
      supabase
        .schema("workspace")
        .from("records")
        .select("id,fields")
        .eq("id", runId)
        .single(),
      supabase
        .schema("workspace")
        .from("work_events")
        .select(
          "id,event_kind,run_version,step_id,idempotency_key,request_hash,payload,created_at",
        )
        .eq("workflow_run_id", runId)
        .order("created_at", { ascending: true }),
    ]);
  if (runError) throw new Error(runError.message);
  if (eventsError) throw new Error(eventsError.message);
  return { run, events };
}

const env = parseEnv(await readFile(join(projectRoot, ".env.local"), "utf8"));
const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error("Gate 5 proof requires local Supabase URL and service-role key.");
}
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const activeRun = await startFixtureRun("active-lease-and-duplicate-start");
const activeSession = randomUUID();
const activeLeaseKey = `run:${activeRun.id}:gate5:active-lease`;
const activeLease = await acquire(supabase, {
  runId: activeRun.id,
  version: 0,
  session: activeSession,
  ttl: 60,
  idempotencyKey: activeLeaseKey,
});
const duplicateLease = await acquire(supabase, {
  runId: activeRun.id,
  version: 0,
  session: activeSession,
  ttl: 60,
  idempotencyKey: activeLeaseKey,
});
if (
  duplicateLease.duplicate !== true ||
  duplicateLease.run_version !== activeLease.run_version ||
  duplicateLease.event?.id !== activeLease.event?.id
) {
  throw new Error("Duplicate start did not return the original committed lease.");
}
const activeTakeoverError = await expectedRpcError(
  supabase,
  "acquire_workflow_dispatch_lease",
  {
    p_workflow_run_id: activeRun.id,
    p_expected_run_version: activeLease.run_version,
    p_dispatcher_session: randomUUID(),
    p_lease_ttl_seconds: 60,
    p_idempotency_key: `run:${activeRun.id}:gate5:illegal-takeover`,
    p_request_hash: hash({ case: "active-takeover", runId: activeRun.id }),
    p_actor: "Gate 5 Harness",
  },
  "active dispatcher lease",
);
const activeReleased = await release(supabase, {
  runId: activeRun.id,
  session: activeSession,
  token: activeLease.fencing_token,
  idempotencyKey: `run:${activeRun.id}:gate5:active-release`,
});
const activeReadback = await readback(supabase, activeRun.id);

const abandonedRun = await startFixtureRun("app-termination-and-stale-fence");
const oldSession = randomUUID();
const oldLease = await acquire(supabase, {
  runId: abandonedRun.id,
  version: 0,
  session: oldSession,
  ttl: 15,
  idempotencyKey: `run:${abandonedRun.id}:gate5:old-lease`,
});
let abandonedVersion = oldLease.run_version;
for (const stepTransition of [
  {
    expectedStepId: "coordinate",
    expectedStepState: "queued",
    nextStepId: "coordinate",
    nextStepState: "running",
    eventKind: "assignment_created",
    eventSummary: "Gate 5 fixture entered the durable step",
  },
  {
    expectedStepId: "coordinate",
    expectedStepState: "running",
    nextStepId: "coordinate",
    nextStepState: "completed",
    eventKind: "agent_completed",
    eventSummary: "Gate 5 fixture advanced without external execution",
  },
  {
    expectedStepId: "coordinate",
    expectedStepState: "completed",
    nextStepId: "draft",
    nextStepState: "queued",
    eventKind: "workflow_step_advanced",
    eventSummary: "Gate 5 fixture reached the local step",
  },
  {
    expectedStepId: "draft",
    expectedStepState: "queued",
    nextStepId: "draft",
    nextStepState: "running",
    eventKind: "assignment_created",
    eventSummary: "Gate 5 fixture simulated app termination during local work",
  },
]) {
  const committed = await transition(supabase, {
    runId: abandonedRun.id,
    version: abandonedVersion,
    session: oldSession,
    token: oldLease.fencing_token,
    nextRunStatus: "In progress",
    idempotencyKey: `run:${abandonedRun.id}:gate5:${stepTransition.eventKind}:${abandonedVersion}`,
    eventPayload: { fixtureOnly: true, externalAction: false },
    ...stepTransition,
  });
  abandonedVersion = committed.run_version;
}
const waitMs = Math.max(
  0,
  Date.parse(oldLease.lease_expires_at) - Date.now() + 750,
);
await new Promise((resolve) => setTimeout(resolve, waitMs));

const recoverySession = randomUUID();
const recoveryLease = await acquire(supabase, {
  runId: abandonedRun.id,
  version: abandonedVersion,
  session: recoverySession,
  ttl: 60,
  idempotencyKey: `run:${abandonedRun.id}:gate5:recovery-lease`,
});
const abandonedTransition = await transition(supabase, {
  runId: abandonedRun.id,
  version: recoveryLease.run_version,
  session: recoverySession,
  token: recoveryLease.fencing_token,
  expectedStepId: "draft",
  expectedStepState: "running",
  nextStepId: "draft",
  nextStepState: "abandoned",
  nextRunStatus: "Blocked",
  idempotencyKey: `run:${abandonedRun.id}:gate5:abandoned`,
  eventKind: "runtime_abandoned",
  eventSummary: "App exited during local run; result unknown",
  eventPayload: {
    reason: "app_process_terminated",
    resultKnown: false,
    automaticRetry: false,
    execution: "ephemeral",
    externalAction: false,
  },
});
const recoveryReleased = await release(supabase, {
  runId: abandonedRun.id,
  session: recoverySession,
  token: recoveryLease.fencing_token,
  idempotencyKey: `run:${abandonedRun.id}:gate5:recovery-release`,
});
const staleTransition = {
  runId: abandonedRun.id,
  expectedRunVersion: recoveryReleased.run_version,
  expectedStepId: "draft",
  expectedStepState: "abandoned",
  nextStepId: "draft",
  nextStepState: "cancelled",
  nextRunStatus: "Blocked",
  dispatcherSession: oldSession,
  fencingToken: oldLease.fencing_token,
  idempotencyKey: `run:${abandonedRun.id}:gate5:stale-transition`,
  actor: "Gate 5 Harness",
  eventKind: "stale_dispatch_attempt",
  eventSummary: "This stale transition must not commit",
  eventPayload: {},
};
const staleTransitionError = await expectedRpcError(
  supabase,
  "transition_workflow_step",
  {
    p_workflow_run_id: abandonedRun.id,
    p_expected_run_version: staleTransition.expectedRunVersion,
    p_expected_step_id: staleTransition.expectedStepId,
    p_expected_step_state: staleTransition.expectedStepState,
    p_next_step_id: staleTransition.nextStepId,
    p_next_step_state: staleTransition.nextStepState,
    p_next_run_status: staleTransition.nextRunStatus,
    p_dispatcher_session: staleTransition.dispatcherSession,
    p_fencing_token: staleTransition.fencingToken,
    p_idempotency_key: staleTransition.idempotencyKey,
    p_request_hash: hash(staleTransition),
    p_actor: staleTransition.actor,
    p_event_kind: staleTransition.eventKind,
    p_event_summary: staleTransition.eventSummary,
    p_event_payload: staleTransition.eventPayload,
    p_approval_mutation: null,
  },
  "Stale dispatcher lease",
);
const abandonedReadback = await readback(supabase, abandonedRun.id);
if (
  abandonedReadback.run.fields.run_status !== "Blocked" ||
  abandonedReadback.run.fields.run_step_states?.draft !== "abandoned" ||
  "run_dispatcher_session" in abandonedReadback.run.fields ||
  abandonedReadback.events.some(
    (event) => event.event_kind === "stale_dispatch_attempt",
  )
) {
  throw new Error("Abandoned-run readback did not preserve the recovery contract.");
}

const approvalRun = await startFixtureRun("approval-payload-invalidation");
const approvalSession = randomUUID();
const approvalLease = await acquire(supabase, {
  runId: approvalRun.id,
  version: 0,
  session: approvalSession,
  ttl: 60,
  idempotencyKey: `run:${approvalRun.id}:gate5:approval-lease`,
});
const approvalId = randomUUID();
const originalPayloadHash = hash({ fixture: "approved-payload-v1" });
const changedPayloadHash = hash({ fixture: "changed-payload-v2" });
const approvalObject = {
  approvalId,
  runId: approvalRun.id,
  stepId: "coordinate",
  approvalType: "workflow-payload",
  requiredRole: "gate5_test_only",
  payloadRef: "fixture.payload",
  payloadHash: originalPayloadHash,
  payloadSnapshot: { fixture: "approved-payload-v1" },
  requester: "Gate 5 Harness",
  requestedAt: new Date().toISOString(),
  decision: null,
  decisionMaker: null,
};
const requested = await transition(supabase, {
  runId: approvalRun.id,
  version: approvalLease.run_version,
  session: approvalSession,
  token: approvalLease.fencing_token,
  expectedStepId: "coordinate",
  expectedStepState: "queued",
  nextStepId: "coordinate",
  nextStepState: "running",
  nextRunStatus: "Needs approval",
  idempotencyKey: `run:${approvalRun.id}:gate5:approval-requested`,
  eventKind: "approval_requested",
  eventSummary: "Gate 5 test-only approval requested",
  eventPayload: { approvalId, payloadHash: originalPayloadHash, fixtureOnly: true },
  approvalMutation: {
    operation: "request",
    approvalId,
    approval: approvalObject,
  },
});
const approved = await transition(supabase, {
  runId: approvalRun.id,
  version: requested.run_version,
  session: approvalSession,
  token: approvalLease.fencing_token,
  expectedStepId: "coordinate",
  expectedStepState: "running",
  nextStepId: "coordinate",
  nextStepState: "completed",
  nextRunStatus: "In progress",
  idempotencyKey: `run:${approvalRun.id}:gate5:approval-decided`,
  eventKind: "approval_granted",
  eventSummary: "Gate 5 fixture decision recorded; not human approval",
  eventPayload: {
    approvalId,
    payloadHash: originalPayloadHash,
    fixtureOnly: true,
    humanApproval: false,
  },
  approvalMutation: {
    operation: "decide",
    approvalId,
    payloadHash: originalPayloadHash,
    decision: "approved",
    decisionMaker: "Gate 5 test fixture (not human approval)",
  },
});
const invalidated = await transition(supabase, {
  runId: approvalRun.id,
  version: approved.run_version,
  session: approvalSession,
  token: approvalLease.fencing_token,
  expectedStepId: "coordinate",
  expectedStepState: "completed",
  nextStepId: "draft",
  nextStepState: "queued",
  nextRunStatus: "Blocked",
  idempotencyKey: `run:${approvalRun.id}:gate5:approval-invalidated`,
  eventKind: "approval_invalidated",
  eventSummary: "Changed test payload invalidated the historical fixture decision",
  eventPayload: {
    approvalId,
    priorPayloadHash: originalPayloadHash,
    changedPayloadHash,
    fixtureOnly: true,
  },
  approvalMutation: {
    operation: "payload_changed",
    approvalId,
    payloadHash: changedPayloadHash,
    invalidationReason: "Gate 5 fixture changed after the recorded test decision",
  },
});
const approvalReleased = await release(supabase, {
  runId: approvalRun.id,
  session: approvalSession,
  token: approvalLease.fencing_token,
  idempotencyKey: `run:${approvalRun.id}:gate5:approval-release`,
});
const approvalReadback = await readback(supabase, approvalRun.id);
const storedApproval = approvalReadback.run.fields.run_approvals?.[approvalId];
const actionGuardAllows =
  storedApproval?.decision === "approved" &&
  storedApproval?.payloadHash === changedPayloadHash &&
  !storedApproval?.invalidatedAt;
if (
  invalidated.run_version >= approvalReleased.run_version ||
  storedApproval?.decision !== "approved" ||
  storedApproval?.payloadHash !== changedPayloadHash ||
  !storedApproval?.invalidatedAt ||
  actionGuardAllows
) {
  throw new Error("Approval payload mutation did not invalidate transactionally.");
}

const allReadbacks = [activeReadback, abandonedReadback, approvalReadback];
const canaryPersisted = allReadbacks.some(
  ({ run, events }) =>
    JSON.stringify(run).includes(secretCanary) ||
    JSON.stringify(events).includes(secretCanary),
);
if (canaryPersisted) {
  throw new Error("The Gate 5 secret canary appeared in a proof record.");
}

console.log(
  JSON.stringify(
    {
      result: "passed",
      external_action: false,
      active_lease_and_duplicate_start: {
        run_id: activeRun.id,
        duplicate_returned_original_event: true,
        active_takeover_rejected: activeTakeoverError,
        final_run_version: activeReleased.run_version,
        event_kinds: activeReadback.events.map((event) => event.event_kind),
      },
      app_termination_and_stale_fence: {
        run_id: abandonedRun.id,
        abandoned_transition_version: abandonedTransition.run_version,
        final_run_version: recoveryReleased.run_version,
        final_status: abandonedReadback.run.fields.run_status,
        final_step_state: abandonedReadback.run.fields.run_step_states?.draft,
        lease_released:
          !("run_dispatcher_session" in abandonedReadback.run.fields),
        stale_transition_rejected: staleTransitionError,
        event_kinds: abandonedReadback.events.map((event) => event.event_kind),
      },
      approval_payload_invalidation: {
        run_id: approvalRun.id,
        approval_id: approvalId,
        historical_decision: storedApproval.decision,
        invalidated: Boolean(storedApproval.invalidatedAt),
        action_guard_allows: actionGuardAllows,
        final_run_version: approvalReleased.run_version,
        event_kinds: approvalReadback.events.map((event) => event.event_kind),
      },
      secret_canary_persisted: canaryPersisted,
    },
    null,
    2,
  ),
);
