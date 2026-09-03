import assert from "node:assert/strict";
import test from "node:test";
import {
  ROSTER_DATABASE_IDS,
  WORKER_TOOL_NAMES,
  assertGenericRecordMutationAllowed,
  assertRosterProposalPatch,
  assertWorkerPlaneEnvironment,
  buildRosterChangeProposalPreview,
  filterToolsForPlane,
  parseMcpPlane,
  readWorkerBrokerConfig,
} from "./control-plane.js";

test("MCP plane parsing defaults to admin and rejects unknown planes", () => {
  assert.equal(parseMcpPlane([]), "admin");
  assert.equal(parseMcpPlane(["--plane", "worker"]), "worker");
  assert.equal(parseMcpPlane(["--plane=worker"]), "worker");
  assert.throws(() => parseMcpPlane(["--plane", "other"]), /Unsupported MCP plane/);
});

test("worker plane exposes only the reviewed tool allowlist", () => {
  const tools = [
    { name: "list_hierarchy" },
    { name: "query_records" },
    { name: "create_record" },
    { name: "update_record" },
    { name: "link_records" },
    { name: "pin_view_to_home" },
    { name: "propose_roster_change" },
    { name: "append_agent_work_note" },
    { name: "advance_workflow_step" },
    { name: "report_verification" },
  ];
  const filtered = filterToolsForPlane(tools, "worker").map((tool) => tool.name);

  assert.deepEqual(filtered, [
    "list_hierarchy",
    "query_records",
    "append_agent_work_note",
    "advance_workflow_step",
    "report_verification",
  ]);
  assert.equal([...WORKER_TOOL_NAMES].some((name) => /create|update|link|pin|roster/.test(name)), false);
});

test("worker plane rejects admin credentials but permits isolated profile homes", () => {
  assert.doesNotThrow(() =>
    assertWorkerPlaneEnvironment({
      PATH: "/usr/bin",
      CODEX_HOME: "/tmp/worker/codex",
      CLAUDE_CONFIG_DIR: "/tmp/worker/claude",
      CLAUDE_CODE_ENTRYPOINT: "sdk-cli",
      CLAUDE_CODE_SESSION_ID: "00000000-0000-4000-8000-000000000000",
      CLAUDE_PROJECT_DIR: "/tmp/assignment",
      INTELLIZEN_WORKER_CAPABILITY_TOKEN: "x".repeat(32),
    }),
  );
  assert.throws(
    () => assertWorkerPlaneEnvironment({ SUPABASE_SERVICE_ROLE_KEY: "not-printed" }),
    /SUPABASE_SERVICE_ROLE_KEY/,
  );
  assert.throws(
    () => assertWorkerPlaneEnvironment({ VITE_INTELLIZEN_LOCAL_ACCESS_KEY: "not-printed" }),
    /VITE_INTELLIZEN_LOCAL_ACCESS_KEY/,
  );
  assert.throws(
    () => assertWorkerPlaneEnvironment({ CLAUDE_UNREVIEWED_CREDENTIAL: "not-printed" }),
    /CLAUDE_UNREVIEWED_CREDENTIAL/,
  );
});

test("worker capability broker is loopback-only and requires a scoped token", () => {
  assert.deepEqual(
    readWorkerBrokerConfig({
      INTELLIZEN_WORKER_CAPABILITY_URL: "http://127.0.0.1:49152/capability",
      INTELLIZEN_WORKER_CAPABILITY_TOKEN: "x".repeat(32),
    }),
    {
      url: "http://127.0.0.1:49152/capability",
      token: "x".repeat(32),
    },
  );
  assert.throws(
    () =>
      readWorkerBrokerConfig({
        INTELLIZEN_WORKER_CAPABILITY_URL: "https://example.com/capability",
        INTELLIZEN_WORKER_CAPABILITY_TOKEN: "x".repeat(32),
      }),
    /loopback/,
  );
});

test("generic create and update reject protected roster and workflow fields", () => {
  for (const [databaseId, fieldId] of [
    [ROSTER_DATABASE_IDS.roles, "role_authority_ceiling"],
    [ROSTER_DATABASE_IDS.roles, "role_owner_gate"],
    [ROSTER_DATABASE_IDS.roles, "role_delegation_policy"],
    [ROSTER_DATABASE_IDS.roles, "role_verification_eligible"],
    [ROSTER_DATABASE_IDS.roles, "role_status"],
    [ROSTER_DATABASE_IDS.agents, "agent_key"],
    [ROSTER_DATABASE_IDS.agents, "agent_status"],
    [ROSTER_DATABASE_IDS.roleAssignments, "role_assignment_binding_ref"],
    [ROSTER_DATABASE_IDS.workflowRuns, "run_approvals"],
    [ROSTER_DATABASE_IDS.workflowRuns, "run_fencing_token"],
  ] as const) {
    assert.throws(
      () =>
        assertGenericRecordMutationAllowed({
          databaseId,
          operation: "update",
          fieldIds: [fieldId],
        }),
      new RegExp(fieldId),
    );
  }
});

test("generic relation mutation rejects role occupancy changes", () => {
  assert.throws(
    () =>
      assertGenericRecordMutationAllowed({
        databaseId: ROSTER_DATABASE_IDS.roleAssignments,
        operation: "relation",
        relationFieldId: "role_assignment_agent",
      }),
    /role_assignment_agent/,
  );
});

test("ordinary workspace updates remain allowed", () => {
  assert.doesNotThrow(() =>
    assertGenericRecordMutationAllowed({
      databaseId: ROSTER_DATABASE_IDS.roles,
      operation: "update",
      fieldIds: ["role_name", "role_mandate"],
    }),
  );
  assert.doesNotThrow(() =>
    assertGenericRecordMutationAllowed({
      databaseId: "654acc9c-0270-49e2-86f7-788e25c59a76",
      operation: "update",
      fieldIds: ["task_status"],
    }),
  );
});

test("roster proposal accepts protected fields only and previews without applying", () => {
  assert.doesNotThrow(() =>
    assertRosterProposalPatch({
      databaseId: ROSTER_DATABASE_IDS.roleAssignments,
      fieldPatch: { role_assignment_binding_ref: "codex-local-primary" },
    }),
  );
  assert.throws(
    () =>
      assertRosterProposalPatch({
        databaseId: ROSTER_DATABASE_IDS.roleAssignments,
        fieldPatch: { role_assignment_scope: "too broad" },
      }),
    /protected roster fields only/,
  );

  const preview = buildRosterChangeProposalPreview({
    databaseId: ROSTER_DATABASE_IDS.roleAssignments,
    recordId: "91a33773-e310-4fa0-a69e-15ef6fdbecb0",
    before: { role_assignment_binding_ref: "old-binding" },
    after: { role_assignment_binding_ref: "codex-local-primary" },
    reason: "Bind the approved local runtime.",
  });
  assert.equal(preview.dry_run, true);
  assert.match(preview.message, /DRY RUN — NOTHING WRITTEN/);
  assert.equal((preview as Record<string, unknown>).applies_change, false);
});
