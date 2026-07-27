# IntelliZen V2 Gate 1 Contract Proposal

**Date:** 2026-07-27  
**Status:** Proposal for review only  
**Authorization:** No schema, production data, MCP, or feature changes are authorized

## Gate 1 outcome

Gate 1 should create the smallest data and control layer that can support the vertical proof:

- human-visible Roles, Agents, and Role Assignments records;
- executable binding references that remain opaque and local;
- one transaction boundary for schema-v1 workflow transitions and receipts;
- payload-bound approvals stored with the run control state;
- protected-field rejection in every generic MCP record-write path;
- a worker-plane tool registry with no direct credential or generic roster mutation path.

The visual designer, panel decomposition, real runtime adapter, and production migration application remain later gates.

## Evidence from current state

Live read-only inspection on 2026-07-27 confirmed:

- `workspace.databases`: 13 rows;
- `workspace.records`: 289 rows;
- `workspace.work_events`: 128 rows;
- Workflow Registry is database `c1000000-0000-0000-0000-000000000001`;
- Workflow Runs is database `c1000000-0000-0000-0000-000000000002`;
- `workspace.work_events` has only its primary key plus record, run, and kind/time indexes;
- no transition idempotency key, request hash, run version, or step identity column exists;
- `workspace.append_record_section(uuid, text, jsonb)` atomically updates one record but does not insert a receipt;
- app and MCP `recordWorkEvent` functions insert after the record change and explicitly treat failure as best-effort.

Conclusion: current functions remain valid for legacy human-readable record updates, but they cannot implement the schema-v1 proof kernel.

## Affected tables

### `workspace.databases`

Add three fixed database records.

Proposed IDs:

```text
c1000000-0000-0000-0000-000000000003  Roles
c1000000-0000-0000-0000-000000000004  Agents
c1000000-0000-0000-0000-000000000005  Role Assignments
```

The IDs continue the existing Workflow Registry and Workflow Runs system range. They remain proposals until Gate 1 approval.

Roles fields:

```text
role_key
role_name
role_mandate
role_reports_to
role_authority_ceiling
role_delegation_policy
role_owner_gate
role_verification_eligible
role_status
```

Agents fields:

```text
agent_key
agent_display_name
agent_identity
agent_status
```

Role Assignments fields:

```text
role_assignment_role
role_assignment_agent
role_assignment_binding_ref
role_assignment_scope
role_assignment_status
```

No command, binary path, argument template, environment variable, provider credential, or Keychain reference enters these records.

### `workspace.records`

Seed only the locked proof fence:

```text
operations_director -> fiona
chief_engineer -> keel -> codex-local-primary
founder_approval_authority -> Adam -> no runtime binding
verifier -> no standing occupant until the proof workflow defines an eligible distinct assignment
```

Add Workflow Registry field definitions:

```text
workflow_definition          canonical serialized JSON
workflow_definition_version  integer
```

Add Workflow Runs user-visible field definitions:

```text
run_schema_version
run_definition_snapshot
run_current_step_id
```

Schema-v1 run control uses reserved JSON values inside `workspace.records.fields`:

```text
run_version
run_step_states
run_dispatcher_session
run_fencing_token
run_lease_expires_at
run_approvals
run_context_evidence
```

These reserved values are not generic database-editor properties. The run inspector and transition functions own them. TypeScript should model them as a dedicated `WorkflowRunControl` object rather than widening every editable workspace field to arbitrary JSON.

Legacy Workflow Runs without `run_schema_version = "intellizen.workflow/1"` continue to use the current record-update path. Schema-v1 runs must reject direct control-field mutation and use the transition RPC.

### `workspace.work_events`

Add nullable proof-kernel columns:

```text
idempotency_key  text
request_hash     text
run_version      bigint
step_id          text
assignment_id    uuid
runtime_session_id text
```

Add a partial unique index:

```sql
unique (workflow_run_id, idempotency_key)
where workflow_run_id is not null
  and idempotency_key is not null
```

Existing rows remain valid because the new columns are nullable.

`request_hash` distinguishes a safe replay from reuse of the same idempotency key with different content. The RPC returns the prior committed result only when both the key and request hash match. A mismatch is an error.

Do not make `workflow_run_id` a new validated foreign key in the first migration. Preflight should first print null/orphan counts and confirm every existing non-null value points to a Workflow Runs record. A later additive constraint may follow reviewed evidence.

## Database-level uniqueness guards

Because organization objects live in generic JSON records, add partial expression indexes:

- unique `role_key` within the Roles database;
- unique `agent_key` within the Agents database;
- one active Role Assignment per role relation;
- unique active `(role, agent)` assignment pair.

The one-active-occupant index is the proof fence. No backup occupant, availability range, or effective-date model lands in Gate 1.

Before proposing the migration, run read-only preflight queries that print:

- conflicting role keys;
- conflicting agent keys;
- roles with more than one active assignment;
- assignment rows with missing role or agent relations;
- existing `work_events` idempotency-key collisions, expected to be zero because the column is new;
- Workflow Run records already containing any reserved Gate 1 key.

## `workspace.transition_workflow_step` signature draft

```sql
workspace.transition_workflow_step(
  p_workflow_run_id       uuid,
  p_expected_run_version  bigint,
  p_expected_step_id      text,
  p_expected_step_state   text,
  p_next_step_id          text,
  p_next_step_state       text,
  p_next_run_status       text,
  p_dispatcher_session    uuid,
  p_fencing_token         bigint,
  p_idempotency_key       text,
  p_request_hash          text,
  p_actor                 text,
  p_event_kind            text,
  p_event_summary         text,
  p_event_payload         jsonb default '{}'::jsonb,
  p_approval_mutation     jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = workspace, public
```

Proposed return:

```json
{
  "applied": true,
  "duplicate": false,
  "run_version": 4,
  "fencing_token": 8,
  "run": {},
  "event": {}
}
```

### Required transaction behavior

In one transaction:

1. Load and lock the Workflow Run record with `FOR UPDATE`.
2. Verify its database ID is Workflow Runs.
3. Verify `run_schema_version` is `intellizen.workflow/1`.
4. Check for an existing `(workflow_run_id, idempotency_key)`.
5. If it exists and `request_hash` matches, return the prior committed run/event with `duplicate: true`.
6. If it exists and the hash differs, reject idempotency-key reuse.
7. Compare `run_version` to `p_expected_run_version`.
8. Compare current step ID and state to the expected values.
9. Verify dispatcher session, unexpired lease, and exact fencing token.
10. Verify the requested state edge is legal.
11. Apply any approval mutation and invalidate an existing approval when its payload hash changes.
12. Update the run's current step, step state, run status, control values, and incremented version.
13. Append the human-readable run section to the same record body.
14. Insert the canonical `workspace.work_events` row with idempotency key, request hash, committed version, step, assignment, and runtime session correlation.
15. Return the committed run and event.

Any failed check raises and rolls back both record and event.

### Legal state edges

Gate 1 should encode an explicit table or SQL predicate for:

```text
queued -> running | blocked | cancelled
running -> awaiting_input | suspended | completed | failed | cancelled | abandoned | blocked
awaiting_input -> running | cancelled | abandoned | blocked
suspended -> running | cancelled | abandoned | blocked
blocked -> queued | cancelled
```

`completed`, `failed`, `cancelled`, and `abandoned` are terminal for that assignment. A workflow may advance to the next step only through a separate legal transition from the completed step snapshot.

Unknown states or edges fail closed.

### Lease RPC family

Keep lease operations separate from step semantics but in the same reviewed function family:

```sql
workspace.acquire_workflow_dispatch_lease(
  p_workflow_run_id uuid,
  p_expected_run_version bigint,
  p_dispatcher_session uuid,
  p_lease_ttl_seconds integer,
  p_idempotency_key text,
  p_request_hash text,
  p_actor text
) returns jsonb

workspace.heartbeat_workflow_dispatch_lease(
  p_workflow_run_id uuid,
  p_dispatcher_session uuid,
  p_fencing_token bigint,
  p_lease_ttl_seconds integer
) returns jsonb

workspace.release_workflow_dispatch_lease(
  p_workflow_run_id uuid,
  p_dispatcher_session uuid,
  p_fencing_token bigint,
  p_actor text,
  p_idempotency_key text,
  p_request_hash text
) returns jsonb
```

Acquire increments the fencing token. Heartbeat never changes it. A stale dispatcher can neither heartbeat, release, nor transition.

Lease TTL bounds are set server-side. The RPC rejects a caller request outside the approved range.

## Approval object

`run_approvals` stores objects keyed by approval ID:

```json
{
  "approvalId": "<uuid>",
  "runId": "<uuid>",
  "stepId": "s4",
  "approvalType": "external-action",
  "requiredRole": "founder_approval_authority",
  "payloadRef": "steps.s3.result",
  "payloadHash": "<sha256>",
  "requester": "fiona",
  "requestedAt": "<timestamp>",
  "decision": null,
  "decisionMaker": null,
  "decidedAt": null,
  "invalidatedAt": null,
  "invalidationReason": null
}
```

The transition RPC is the only schema-v1 writer for this object. A payload mutation and approval invalidation occur in the same locked-row transaction.

Approval does not execute an external action. It only records Adam's decision for the exact payload.

## MCP protected-field guard

### Protected databases and fields

Roles:

```text
role_authority_ceiling
role_owner_gate
role_delegation_policy
role_verification_eligible
role_status
```

Role Assignments:

```text
role_assignment_role
role_assignment_agent
role_assignment_binding_ref
role_assignment_status
```

Workflow Runs:

```text
run_schema_version
run_definition_snapshot
run_current_step_id
run_version
run_step_states
run_dispatcher_session
run_fencing_token
run_lease_expires_at
run_approvals
run_context_evidence
```

Agents have no authority-bearing field in Gate 1, but agent key and status changes still route through roster proposal once the record exists.

### Central guard

Add one pure guard in the MCP server:

```ts
assertGenericRecordMutationAllowed({
  databaseId,
  operation,
  fieldIds,
  relationFieldId,
})
```

Call it after resolving the database and before returning a dry-run preview or performing a confirmed write.

It must cover every generic path:

- `create_record`;
- `update_record`;
- `link_records` / relation replacement;
- any generic database import or batch mutation path added later;
- admin-plane and worker-plane registrations.

Reject with:

```text
Protected field mutation rejected. Use propose_roster_change or the workflow transition RPC.
```

The error names field IDs but does not echo values.

### `propose_roster_change`

This tool:

- validates the requested target and protected-field patch;
- creates a draft proposal record with exact before/after values;
- requests human approval;
- does not apply the roster change;
- follows `confirm_write` and begins its preview with `DRY RUN — NOTHING WRITTEN`.

Applying an approved proposal remains a Settings/human flow. No agent tool directly activates an occupant or binding in Gate 1.

### Worker plane

Tool registration is filtered from the same MCP source build by `--plane worker`.

The worker plane has no:

- `create_record`;
- `update_record`;
- generic relation mutation;
- roster proposal or application;
- Home pin/view writes;
- direct SQL;
- external send or publish.

The worker plane initially exposes only the reviewed read/query tools plus:

```text
advance_workflow_step
report_verification
append_agent_work_note
```

`advance_workflow_step` is a typed wrapper around the transition RPC and cannot choose arbitrary fields.

## Persistence redaction boundary

Before any transition payload, event summary, body section, approval object, context evidence, runtime result, or error reaches the RPC, pass it through one pure redaction/validation function.

The database RPC still rejects structurally invalid content. Secret-shape scanning stays in the app/MCP persistence boundary because SQL is not the right entropy scanner.

Gate 1 unit fixtures include:

- Supabase service-role-shaped strings;
- provider API-key-shaped strings;
- bearer and webhook secrets;
- high-entropy canaries;
- safe UUIDs, hashes, and ordinary prose to control false positives.

No fixture contains a real credential.

## Gate 1 tests

RPC tests:

- legal compare-and-set transition commits run plus event;
- wrong run version rejects;
- wrong current step rejects;
- illegal state edge rejects;
- expired lease rejects;
- stale fencing token rejects;
- duplicate key plus same request hash returns prior result without mutation;
- duplicate key plus different request hash rejects;
- missing receipt fields reject and roll back;
- approval payload change invalidates the approval in the same commit;
- non-Workflow-Run record rejects;
- legacy run without schema version rejects.

Guard tests:

- generic create rejects protected Role and Role Assignment fields;
- generic update rejects each protected field;
- generic relation mutation rejects role occupancy changes;
- ordinary non-protected workspace update still previews and confirms;
- `propose_roster_change` previews only by default;
- worker plane does not register generic mutation tools.

Redaction tests:

- every secret-shaped fixture fails before persistence;
- safe hashes and UUIDs pass;
- error messages never echo rejected secret-shaped input.

## Migration review and application protocol

Gate 1 authors migrations with `supabase migration new`; filenames are not invented in this proposal.

Review session:

1. create additive migration files;
2. print preflight counts and conflicts;
3. inspect affected tables and functions;
4. run local/test-database migration and RPC tests;
5. run advisors;
6. present SQL and affected-row expectations;
7. stop.

No production application occurs in that session.

Later application session, after Adam's explicit per-migration approval and the overnight minimum:

1. re-run preflight counts;
2. apply the reviewed migration;
3. verify database records, indexes, function signatures, grants, and zero unexpected row changes;
4. run RPC rejection and success probes against dedicated test records only;
5. regenerate `supabase/MIGRATIONS.md` from the remote migration inventory;
6. record the receipt.

Affected production objects proposed:

```text
workspace.databases
workspace.records
workspace.work_events
workspace.transition_workflow_step
workspace.acquire_workflow_dispatch_lease
workspace.heartbeat_workflow_dispatch_lease
workspace.release_workflow_dispatch_lease
```

## Gate 1 stop conditions

Do not proceed to Gate 2 if:

- one-active-occupant uniqueness cannot be enforced in the generic record model;
- transition plus receipt cannot commit atomically;
- stale fencing tokens can mutate a run;
- approval invalidation can race payload mutation;
- worker-plane tools require a direct service-role credential in the worker profile;
- generic MCP paths can touch protected fields;
- the redaction boundary has any durable-write bypass.

Any failure returns to a Gate 1 contract revision and Adam review.
