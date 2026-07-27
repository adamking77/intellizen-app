import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const proofPath = join(
  projectRoot,
  "build-plans/evidence/v2-gate3-live-codex-proof.json",
);
const proofKey = "v2-gate3-live-codex-native";
const workflowRunsDatabaseId = "c1000000-0000-0000-0000-000000000002";

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
  return createHash("sha256").update(value).digest("hex");
}

function requireRpcResult(name, response) {
  if (response.error) {
    throw new Error(`${name} failed: ${response.error.message}`);
  }
  return response.data;
}

const [localEnvText, proofText] = await Promise.all([
  readFile(join(projectRoot, ".env.local"), "utf8"),
  readFile(proofPath, "utf8"),
]);
const localEnv = parseEnv(localEnvText);
const supabaseUrl =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  localEnv.SUPABASE_URL ??
  localEnv.VITE_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? localEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  throw new Error(
    "Gate 3 persistence requires the local Supabase URL and service-role key.",
  );
}

const proof = JSON.parse(proofText);
if (
  proof.result !== "passed" ||
  proof.version !== "codex-cli 0.145.0" ||
  proof.worker_capability_calls?.length !== 1 ||
  proof.worker_capability_calls[0]?.tool !== "list_roles" ||
  proof.assignment_modified !== false ||
  proof.admin_mcp_servers_visible?.length !== 0
) {
  throw new Error("Gate 3 proof artifact does not satisfy the persistence gate.");
}

const client = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const existingResponse = await client
  .schema("workspace")
  .from("records")
  .select("id,fields")
  .eq("database_id", workflowRunsDatabaseId)
  .eq("fields->>run_proof_key", proofKey);
if (existingResponse.error) {
  throw new Error(`Gate 3 proof preflight failed: ${existingResponse.error.message}`);
}
if ((existingResponse.data ?? []).length > 1) {
  throw new Error("Gate 3 proof key is not unique.");
}

let runId = existingResponse.data?.[0]?.id;
let assignmentId;
if (!runId) {
  runId = randomUUID();
  assignmentId = randomUUID();
  const dispatcherSession = randomUUID();
  const { error: insertError } = await client
    .schema("workspace")
    .from("records")
    .insert({
      id: runId,
      database_id: workflowRunsDatabaseId,
      fields: {
        run_name: "V2 Gate 3 live Codex native worker proof",
        run_status: "Queued",
        run_entity_scope: "IntelliZen",
        run_owner_role: "Runtime Steward",
        run_actor: "Keel",
        run_trigger_source: "agent",
        run_current_step: "Codex live probe",
        run_schema_version: "intellizen.workflow/1",
        run_definition_snapshot: {
          schemaVersion: "intellizen.workflow/1",
          workflowKey: proofKey,
          steps: [
            {
              id: "codex_live_probe",
              type: "agent",
              roleKey: "chief_engineer",
              runtimeBindingRef: "codex-local-primary",
            },
          ],
        },
        run_current_step_id: "codex_live_probe",
        run_step_states: { codex_live_probe: "queued" },
        run_approvals: {},
        run_version: 0,
        run_fencing_token: 0,
        run_context:
          "Gate 3 proof: isolated Codex worker through the native runner and a single scoped loopback capability broker.",
        run_receipt: "Durable events are recorded in workspace.work_events.",
        run_proof_key: proofKey,
        run_started_at: new Date().toISOString(),
      },
      body:
        "# V2 Gate 3 live Codex native worker proof\n\nInternal build-verification record. No external action was performed.",
      taxonomy: {
        entity: "intellizen",
        area: "engineering",
        object_type: "workflow_run",
        proof_gate: "3",
      },
      entity: "genzen",
    });
  if (insertError) {
    throw new Error(`Gate 3 proof record insert failed: ${insertError.message}`);
  }

  const lease = requireRpcResult(
    "acquire_workflow_dispatch_lease",
    await client
      .schema("workspace")
      .rpc("acquire_workflow_dispatch_lease", {
        p_workflow_run_id: runId,
        p_expected_run_version: 0,
        p_dispatcher_session: dispatcherSession,
        p_lease_ttl_seconds: 300,
        p_idempotency_key: `${proofKey}:lease:v1`,
        p_request_hash: requestHash(`${proofKey}:lease:v1`),
        p_actor: "Keel",
      }),
  );
  const running = requireRpcResult(
    "transition_workflow_step(running)",
    await client.schema("workspace").rpc("transition_workflow_step", {
      p_workflow_run_id: runId,
      p_expected_run_version: lease.run_version,
      p_expected_step_id: "codex_live_probe",
      p_expected_step_state: "queued",
      p_next_step_id: "codex_live_probe",
      p_next_step_state: "running",
      p_next_run_status: "In progress",
      p_dispatcher_session: dispatcherSession,
      p_fencing_token: lease.fencing_token,
      p_idempotency_key: `${proofKey}:running:v1`,
      p_request_hash: requestHash(`${proofKey}:running:v1`),
      p_actor: "Keel",
      p_event_kind: "runtime_assignment_started",
      p_event_summary:
        "Codex live worker assignment started through the native runner",
      p_event_payload: {
        assignmentId,
        runtimeSessionId: proof.provider_session_id,
        runtimeRunId: proof.runtime_run_id,
        adapterId: "codex-local-primary",
        providerVersion: proof.version,
      },
      p_approval_mutation: null,
    }),
  );
  const completed = requireRpcResult(
    "transition_workflow_step(completed)",
    await client.schema("workspace").rpc("transition_workflow_step", {
      p_workflow_run_id: runId,
      p_expected_run_version: running.run_version,
      p_expected_step_id: "codex_live_probe",
      p_expected_step_state: "running",
      p_next_step_id: "codex_live_probe",
      p_next_step_state: "completed",
      p_next_run_status: "Done",
      p_dispatcher_session: dispatcherSession,
      p_fencing_token: running.fencing_token,
      p_idempotency_key: `${proofKey}:completed:v1`,
      p_request_hash: requestHash(`${proofKey}:completed:v1`),
      p_actor: "Keel",
      p_event_kind: "runtime_assignment_completed",
      p_event_summary:
        "Codex live worker proof passed with one bounded capability call",
      p_event_payload: {
        assignmentId,
        runtimeSessionId: proof.provider_session_id,
        runtimeRunId: proof.runtime_run_id,
        result: proof.result,
        dispatchBoundary: proof.dispatch_boundary,
        workerMcpServers: proof.worker_mcp_servers,
        adminMcpServersVisible: proof.admin_mcp_servers_visible,
        capabilityCalls: proof.worker_capability_calls,
        assignmentModified: proof.assignment_modified,
        terminalMessage: proof.terminal_message,
        usage: proof.measured_usage,
      },
      p_approval_mutation: null,
    }),
  );
  requireRpcResult(
    "release_workflow_dispatch_lease",
    await client
      .schema("workspace")
      .rpc("release_workflow_dispatch_lease", {
        p_workflow_run_id: runId,
        p_dispatcher_session: dispatcherSession,
        p_fencing_token: completed.fencing_token,
        p_actor: "Keel",
        p_idempotency_key: `${proofKey}:release:v1`,
        p_request_hash: requestHash(`${proofKey}:release:v1`),
      }),
  );
}

const [{ data: run, error: runError }, { data: events, error: eventsError }] =
  await Promise.all([
    client
      .schema("workspace")
      .from("records")
      .select("id,fields,body,updated_at")
      .eq("id", runId)
      .single(),
    client
      .schema("workspace")
      .from("work_events")
      .select(
        "id,event_kind,actor,summary,run_version,step_id,assignment_id,runtime_session_id,payload,created_at",
      )
      .eq("workflow_run_id", runId)
      .order("created_at", { ascending: true }),
  ]);
if (runError) throw new Error(`Gate 3 run readback failed: ${runError.message}`);
if (eventsError) {
  throw new Error(`Gate 3 event readback failed: ${eventsError.message}`);
}

const expectedKinds = [
  "dispatcher_lease_acquired",
  "runtime_assignment_started",
  "runtime_assignment_completed",
  "dispatcher_lease_released",
];
const actualKinds = (events ?? []).map((event) => event.event_kind);
if (
  run.fields.run_status !== "Done" ||
  run.fields.run_version !== 4 ||
  run.fields.run_step_states?.codex_live_probe !== "completed" ||
  "run_dispatcher_session" in run.fields ||
  JSON.stringify(actualKinds) !== JSON.stringify(expectedKinds)
) {
  throw new Error("Gate 3 durable proof readback did not match the expected state.");
}

console.log(
  JSON.stringify(
    {
      result: "passed",
      run_id: run.id,
      status: run.fields.run_status,
      run_version: run.fields.run_version,
      step_state: run.fields.run_step_states.codex_live_probe,
      dispatcher_lease_released: !("run_dispatcher_session" in run.fields),
      event_kinds: actualKinds,
      assignment_id:
        assignmentId ??
        events?.find((event) => event.assignment_id)?.assignment_id ??
        null,
      runtime_session_id:
        events?.find((event) => event.runtime_session_id)?.runtime_session_id ??
        null,
      measured_usage:
        events?.find(
          (event) => event.event_kind === "runtime_assignment_completed",
        )?.payload?.usage ?? null,
    },
    null,
    2,
  ),
);
