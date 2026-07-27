import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { assertPersistenceSafe } from "../shared/persistence-redaction.mjs";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const runId = "624a68c7-8110-439c-a8b8-cca1ffeb8647";
const confirmWrite = process.argv.includes("--confirm-write");

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

function requireResult(name, response) {
  if (response.error) throw new Error(`${name} failed: ${response.error.message}`);
  return response.data;
}

const env = parseEnv(await readFile(join(projectRoot, ".env.local"), "utf8"));
const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase configuration is incomplete.");
const client = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const [{ data: run, error: runError }, { data: events, error: eventsError }] =
  await Promise.all([
    client
      .schema("workspace")
      .from("records")
      .select("id,database_id,fields")
      .eq("id", runId)
      .single(),
    client
      .schema("workspace")
      .from("work_events")
      .select("event_kind,payload,run_version,created_at")
      .eq("workflow_run_id", runId)
      .order("created_at", { ascending: true }),
  ]);
if (runError) throw new Error(runError.message);
if (eventsError) throw new Error(eventsError.message);
const approval = Object.values(run.fields.run_approvals ?? {}).find(
  (candidate) => candidate?.stepId === "approve",
);
const incorrectVerification = events.find(
  (event) =>
    event.event_kind === "verification_recorded" &&
    event.payload?.verification?.status === "passed",
);
if (
  run.database_id !== "c1000000-0000-0000-0000-000000000002" ||
  run.fields.run_status !== "Needs approval" ||
  run.fields.run_current_step_id !== "approve" ||
  run.fields.run_step_states?.approve !== "running" ||
  "run_dispatcher_session" in run.fields ||
  approval?.payloadSnapshot?.status !== "inconclusive" ||
  !incorrectVerification
) {
  throw new Error("Discarded Gate 4 run is not in the expected incorrect state.");
}

const preview = {
  banner: "⛔ DRY RUN — NOTHING WRITTEN ⛔",
  dry_run: true,
  write_performed: false,
  run_id: runId,
  current_status: run.fields.run_status,
  current_step_state: run.fields.run_step_states.approve,
  incorrect_recorded_status: "passed",
  authoritative_verifier_status: approval.payloadSnapshot.status,
  next_status: "Blocked",
  next_step_state: "blocked",
  affected_tables: ["workspace.records", "workspace.work_events"],
};
if (!confirmWrite) {
  console.log(JSON.stringify(preview, null, 2));
  process.exit(0);
}

const correction = {
  correctedFrom: "passed",
  correctedTo: "inconclusive",
  reason:
    "Runner version 1 treated result existence as a pass instead of reading the verifier status.",
  approvalId: approval.approvalId,
  approvalPayloadHash: approval.payloadHash,
  externalActionPerformed: false,
};
assertPersistenceSafe({ correction });
const dispatcherSession = randomUUID();
const leaseKey = `run:${runId}:inconclusive-correction:lease`;
const lease = requireResult(
  "acquire_workflow_dispatch_lease",
  await client.schema("workspace").rpc("acquire_workflow_dispatch_lease", {
    p_workflow_run_id: runId,
    p_expected_run_version: run.fields.run_version,
    p_dispatcher_session: dispatcherSession,
    p_lease_ttl_seconds: 300,
    p_idempotency_key: leaseKey,
    p_request_hash: hash({ runId, operation: "correction-lease" }),
    p_actor: "Keel",
  }),
);
const corrected = requireResult(
  "transition_workflow_step",
  await client.schema("workspace").rpc("transition_workflow_step", {
    p_workflow_run_id: runId,
    p_expected_run_version: lease.run_version,
    p_expected_step_id: "approve",
    p_expected_step_state: "running",
    p_next_step_id: "approve",
    p_next_step_state: "blocked",
    p_next_run_status: "Blocked",
    p_dispatcher_session: dispatcherSession,
    p_fencing_token: lease.fencing_token,
    p_idempotency_key: `run:${runId}:inconclusive-correction:block`,
    p_request_hash: hash({ runId, operation: "correct-verification", correction }),
    p_actor: "Keel",
    p_event_kind: "verification_corrected",
    p_event_summary:
      "Corrected the Gate 4 verifier status from passed to inconclusive and blocked the discarded run",
    p_event_payload: correction,
    p_approval_mutation: null,
  }),
);
const released = requireResult(
  "release_workflow_dispatch_lease",
  await client.schema("workspace").rpc("release_workflow_dispatch_lease", {
    p_workflow_run_id: runId,
    p_dispatcher_session: dispatcherSession,
    p_fencing_token: lease.fencing_token,
    p_actor: "Keel",
    p_idempotency_key: `run:${runId}:inconclusive-correction:release`,
    p_request_hash: hash({ runId, operation: "correction-release" }),
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
  readback.fields.run_step_states?.approve !== "blocked" ||
  readback.fields.run_version !== released.run_version ||
  "run_dispatcher_session" in readback.fields
) {
  throw new Error("Inconclusive verification correction did not read back.");
}
console.log(
  JSON.stringify(
    {
      result: "passed",
      run_id: runId,
      status: readback.fields.run_status,
      step_state: readback.fields.run_step_states.approve,
      run_version: readback.fields.run_version,
      correction_event_version: corrected.run_version,
      dispatcher_lease_released: true,
      external_action_performed: false,
    },
    null,
    2,
  ),
);
