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
if (
  typeof runId !== "string" ||
  !/^[0-9a-f-]{36}$/.test(runId) ||
  typeof payloadHash !== "string" ||
  !/^[a-f0-9]{64}$/.test(payloadHash)
) {
  throw new Error("A UUID --run-id and SHA-256 --payload-hash are required.");
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
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function requireResult(name, response) {
  if (response.error) throw new Error(`${name} failed: ${response.error.message}`);
  return response.data;
}

const env = parseEnv(await readFile(join(projectRoot, ".env.local"), "utf8"));
const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error("Gate 7 recovery requires local Supabase configuration.");
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
if (runError) throw new Error(`Gate 7 recovery preflight failed: ${runError.message}`);

const approval = Object.values(run.fields.run_approvals ?? {}).find(
  (entry) => entry?.stepId === "approve" && entry?.payloadHash === payloadHash,
);
if (
  run.database_id !== "c1000000-0000-0000-0000-000000000002" ||
  run.fields.run_schema_version !== "intellizen.workflow/1" ||
  run.fields.run_status !== "In progress" ||
  run.fields.run_current_step_id !== "simulate" ||
  run.fields.run_step_states?.simulate !== "running" ||
  !approval ||
  approval.decision !== "approved" ||
  approval.decisionMaker !== "Adam" ||
  approval.payloadHash !== payloadHash
) {
  throw new Error("Run is not the exact approved, interrupted simulation.");
}

const preview = {
  banner: "⛔ DRY RUN — NOTHING WRITTEN ⛔",
  dry_run: true,
  write_performed: false,
  run_id: runId,
  expected_run_version: run.fields.run_version,
  payload_hash: payloadHash,
  recovery: "mark the interrupted simulation Blocked",
  reason: "persistence redaction rejected the internal artifact reference",
  external_action: false,
  affected_tables: ["workspace.records", "workspace.work_events"],
  transitions: [
    "acquire a newly fenced lease after the old lease expires",
    "record persistence_rejected and mark the simulation blocked",
    "release the recovery lease",
  ],
};
if (!confirmWrite) {
  console.log(JSON.stringify(preview, null, 2));
  process.exit(0);
}

assertPersistenceSafe({ runId, payloadHash, recovery: preview.recovery });
const dispatcherSession = crypto.randomUUID();
const lease = requireResult(
  "acquire_workflow_dispatch_lease",
  await client.schema("workspace").rpc("acquire_workflow_dispatch_lease", {
    p_workflow_run_id: runId,
    p_expected_run_version: run.fields.run_version,
    p_dispatcher_session: dispatcherSession,
    p_lease_ttl_seconds: 60,
    p_idempotency_key: `run:${runId}:gate7:redaction-recovery:lease`,
    p_request_hash: requestHash({
      runId,
      payloadHash,
      operation: "redaction-recovery-lease",
    }),
    p_actor: "IntelliZen Gate 7 recovery",
  }),
);

const blocked = requireResult(
  "transition_workflow_step",
  await client.schema("workspace").rpc("transition_workflow_step", {
    p_workflow_run_id: runId,
    p_expected_run_version: lease.run_version,
    p_expected_step_id: "simulate",
    p_expected_step_state: "running",
    p_next_step_id: "simulate",
    p_next_step_state: "blocked",
    p_next_run_status: "Blocked",
    p_dispatcher_session: dispatcherSession,
    p_fencing_token: lease.fencing_token,
    p_idempotency_key: `run:${runId}:step:simulate:redaction-blocked`,
    p_request_hash: requestHash({
      runId,
      payloadHash,
      operation: "redaction-recovery-blocked",
    }),
    p_actor: "IntelliZen Gate 7 recovery",
    p_event_kind: "persistence_rejected",
    p_event_summary:
      "Gate 7 simulation completion blocked by persistence redaction",
    p_event_payload: {
      reason: "artifact_reference_rejected",
      resultKnown: false,
      externalAction: false,
      automaticRetry: false,
      approvedPayloadHash: payloadHash,
    },
    p_approval_mutation: null,
  }),
);

const released = requireResult(
  "release_workflow_dispatch_lease",
  await client.schema("workspace").rpc("release_workflow_dispatch_lease", {
    p_workflow_run_id: runId,
    p_dispatcher_session: dispatcherSession,
    p_fencing_token: lease.fencing_token,
    p_actor: "IntelliZen Gate 7 recovery",
    p_idempotency_key: `run:${runId}:gate7:redaction-recovery:release`,
    p_request_hash: requestHash({
      runId,
      payloadHash,
      operation: "redaction-recovery-release",
    }),
  }),
);

const { data: readback, error: readbackError } = await client
  .schema("workspace")
  .from("records")
  .select("id,fields")
  .eq("id", runId)
  .single();
if (readbackError) throw new Error(readbackError.message);
if (
  readback.fields.run_status !== "Blocked" ||
  readback.fields.run_step_states?.simulate !== "blocked" ||
  readback.fields.run_version !== released.run_version ||
  "run_dispatcher_session" in readback.fields ||
  readback.fields.run_approvals?.[approval.approvalId]?.payloadHash !==
    payloadHash
) {
  throw new Error("Gate 7 recovery readback failed.");
}

console.log(
  JSON.stringify(
    {
      result: "passed",
      run_id: runId,
      status: readback.fields.run_status,
      simulation_state: readback.fields.run_step_states.simulate,
      run_version: readback.fields.run_version,
      dispatcher_lease_released:
        !("run_dispatcher_session" in readback.fields),
      approved_payload_preserved: true,
      external_action: false,
      automatic_retry: false,
      transition_version: blocked.run_version,
    },
    null,
    2,
  ),
);
