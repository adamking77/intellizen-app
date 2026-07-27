import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { assertPersistenceSafe } from "../shared/persistence-redaction.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith("--")) continue;
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(value, next);
    index += 1;
  } else {
    args.set(value, true);
  }
}

const runId = args.get("--run-id");
const payloadHash = args.get("--payload-hash");
const confirmWrite = args.get("--confirm-write") === true;
if (typeof runId !== "string" || typeof payloadHash !== "string") {
  throw new Error("--run-id and --payload-hash are required.");
}
if (!/^[a-f0-9]{64}$/.test(payloadHash)) {
  throw new Error("--payload-hash must be a SHA-256 hex digest.");
}

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

function requestHash(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function requireResult(name, response) {
  if (response.error) throw new Error(`${name} failed: ${response.error.message}`);
  return response.data;
}

const env = parseEnv(await readFile(join(projectRoot, ".env.local"), "utf8"));
const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error("Gate 4 approval resumption requires local Supabase configuration.");
}
const client = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: run, error: runError } = await client
  .schema("workspace")
  .from("records")
  .select("id,database_id,fields")
  .eq("id", runId)
  .single();
if (runError) throw new Error(`Gate 4 run preflight failed: ${runError.message}`);
if (
  run.database_id !== "c1000000-0000-0000-0000-000000000002" ||
  run.fields.run_schema_version !== "intellizen.workflow/1" ||
  run.fields.run_status !== "Needs approval" ||
  run.fields.run_current_step_id !== "approve" ||
  run.fields.run_step_states?.approve !== "running" ||
  "run_dispatcher_session" in run.fields
) {
  throw new Error("Gate 4 run is not safely paused at the approval step.");
}
const approvalEntry = Object.values(run.fields.run_approvals ?? {}).find(
  (approval) =>
    approval?.stepId === "approve" && approval?.payloadHash === payloadHash,
);
if (
  !approvalEntry ||
  approvalEntry.requiredRole !== "founder_approval_authority" ||
  approvalEntry.payloadSnapshot?.status !== "passed" ||
  approvalEntry.decision
) {
  throw new Error("Exact pending founder approval was not found or is not passed.");
}

const preview = {
  banner: "⛔ DRY RUN — NOTHING WRITTEN ⛔",
  dry_run: true,
  write_performed: false,
  run_id: runId,
  expected_run_version: run.fields.run_version,
  approval_id: approvalEntry.approvalId,
  payload_hash: payloadHash,
  decision: "approved",
  decision_maker: "Adam",
  terminal_action: {
    action: "simulate-consequential-action",
    simulated: true,
    external_action: false,
  },
  affected_tables: ["workspace.records", "workspace.work_events"],
  transitions: [
    "acquire dispatcher lease",
    "approve exact payload",
    "advance to simulation",
    "start safe simulation",
    "complete workflow",
    "release dispatcher lease",
  ],
};
if (!confirmWrite) {
  console.log(JSON.stringify(preview, null, 2));
  process.exit(0);
}

assertPersistenceSafe({
  approvalId: approvalEntry.approvalId,
  payloadHash,
  payloadSnapshot: approvalEntry.payloadSnapshot,
});
const artifact = {
  artifactRef: "simulation://intellizen/gate4/internal-proof",
  action: "simulate-consequential-action",
  simulated: true,
  externalAction: false,
  approvedPayloadHash: payloadHash,
  result: "No external action performed.",
};
// Validate every deterministic value before the first write. A redaction
// rejection must not leave an approved run or dispatcher lease half-applied.
assertPersistenceSafe({ artifact });
const dispatcherSession = crypto.randomUUID();
const leaseKey = `run:${runId}:gate4-approved:lease`;
const lease = requireResult(
  "acquire_workflow_dispatch_lease",
  await client.schema("workspace").rpc("acquire_workflow_dispatch_lease", {
    p_workflow_run_id: runId,
    p_expected_run_version: run.fields.run_version,
    p_dispatcher_session: dispatcherSession,
    p_lease_ttl_seconds: 300,
    p_idempotency_key: leaseKey,
    p_request_hash: requestHash({ runId, payloadHash, operation: "lease" }),
    p_actor: "Adam",
  }),
);

async function transition(input) {
  return requireResult(
    input.name,
    await client.schema("workspace").rpc("transition_workflow_step", {
      p_workflow_run_id: runId,
      p_expected_run_version: input.version,
      p_expected_step_id: input.expectedStepId,
      p_expected_step_state: input.expectedStepState,
      p_next_step_id: input.nextStepId,
      p_next_step_state: input.nextStepState,
      p_next_run_status: input.nextRunStatus,
      p_dispatcher_session: dispatcherSession,
      p_fencing_token: lease.fencing_token,
      p_idempotency_key: input.idempotencyKey,
      p_request_hash: requestHash({
        runId,
        payloadHash,
        operation: input.name,
      }),
      p_actor: input.actor,
      p_event_kind: input.eventKind,
      p_event_summary: input.eventSummary,
      p_event_payload: input.eventPayload,
      p_approval_mutation: input.approvalMutation ?? null,
    }),
  );
}

const approved = await transition({
  name: "approve_exact_payload",
  version: lease.run_version,
  expectedStepId: "approve",
  expectedStepState: "running",
  nextStepId: "approve",
  nextStepState: "completed",
  nextRunStatus: "In progress",
  idempotencyKey: `run:${runId}:step:approve:payload:${payloadHash}:approved`,
  actor: "Adam",
  eventKind: "approval_granted",
  eventSummary: "Adam approved the exact Gate 4 verifier payload",
  eventPayload: {
    approvalId: approvalEntry.approvalId,
    payloadRef: approvalEntry.payloadRef,
    payloadHash,
    decision: "approved",
    decisionMaker: "Adam",
  },
  approvalMutation: {
    operation: "decide",
    approvalId: approvalEntry.approvalId,
    payloadHash,
    decision: "approved",
    decisionMaker: "Adam",
  },
});
const advanced = await transition({
  name: "advance_to_simulation",
  version: approved.run_version,
  expectedStepId: "approve",
  expectedStepState: "completed",
  nextStepId: "simulate",
  nextStepState: "queued",
  nextRunStatus: "In progress",
  idempotencyKey: `run:${runId}:step:approve:advance:simulate`,
  actor: "IntelliZen Runner",
  eventKind: "workflow_step_advanced",
  eventSummary: "Approved payload advanced to the safe simulation",
  eventPayload: {
    fromStepId: "approve",
    toStepId: "simulate",
    approvedPayloadHash: payloadHash,
  },
});
const started = await transition({
  name: "start_safe_simulation",
  version: advanced.run_version,
  expectedStepId: "simulate",
  expectedStepState: "queued",
  nextStepId: "simulate",
  nextStepState: "running",
  nextRunStatus: "In progress",
  idempotencyKey: `run:${runId}:step:simulate:started`,
  actor: "IntelliZen Runner",
  eventKind: "artifact_simulation_started",
  eventSummary: "Started the approved internal consequential-action simulation",
  eventPayload: {
    action: "simulate-consequential-action",
    simulated: true,
    externalAction: false,
    approvedPayloadHash: payloadHash,
  },
});
const completed = await transition({
  name: "complete_safe_simulation",
  version: started.run_version,
  expectedStepId: "simulate",
  expectedStepState: "running",
  nextStepId: "simulate",
  nextStepState: "completed",
  nextRunStatus: "Done",
  idempotencyKey: `run:${runId}:step:simulate:completed`,
  actor: "IntelliZen Runner",
  eventKind: "workflow_completed",
  eventSummary: "Gate 4 workflow completed with an internal simulation only",
  eventPayload: { artifact },
});
const releaseKey = `run:${runId}:gate4-approved:release`;
const released = requireResult(
  "release_workflow_dispatch_lease",
  await client.schema("workspace").rpc("release_workflow_dispatch_lease", {
    p_workflow_run_id: runId,
    p_dispatcher_session: dispatcherSession,
    p_fencing_token: lease.fencing_token,
    p_actor: "IntelliZen Runner",
    p_idempotency_key: releaseKey,
    p_request_hash: requestHash({ runId, payloadHash, operation: "release" }),
  }),
);

const [{ data: readback, error: readbackError }, { data: events, error: eventsError }] =
  await Promise.all([
    client
      .schema("workspace")
      .from("records")
      .select("id,fields")
      .eq("id", runId)
      .single(),
    client
      .schema("workspace")
      .from("work_events")
      .select(
        "event_kind,actor,summary,run_version,step_id,assignment_id,runtime_session_id,payload,created_at",
      )
      .eq("workflow_run_id", runId)
      .order("created_at", { ascending: true }),
  ]);
if (readbackError) throw new Error(readbackError.message);
if (eventsError) throw new Error(eventsError.message);
const approvalReadback = readback.fields.run_approvals?.[approvalEntry.approvalId];
if (
  readback.fields.run_status !== "Done" ||
  readback.fields.run_step_states?.simulate !== "completed" ||
  readback.fields.run_version !== released.run_version ||
  "run_dispatcher_session" in readback.fields ||
  approvalReadback?.decision !== "approved" ||
  approvalReadback?.decisionMaker !== "Adam" ||
  approvalReadback?.payloadHash !== payloadHash
) {
  throw new Error("Gate 4 approval completion readback failed.");
}

console.log(
  JSON.stringify(
    {
      result: "passed",
      run_id: runId,
      status: readback.fields.run_status,
      run_version: readback.fields.run_version,
      approval: {
        approval_id: approvalEntry.approvalId,
        payload_hash: approvalReadback.payloadHash,
        decision: approvalReadback.decision,
        decision_maker: approvalReadback.decisionMaker,
      },
      simulated_action: artifact,
      dispatcher_lease_released: !("run_dispatcher_session" in readback.fields),
      event_kinds: events.map((event) => event.event_kind),
      assignment_ids: [
        ...new Set(
          events.map((event) => event.assignment_id).filter(Boolean),
        ),
      ],
    },
    null,
    2,
  ),
);
