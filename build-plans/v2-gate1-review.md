# IntelliZen V2 Gate 1 Review

**Date:** 2026-07-27  
**Status:** Passed — production application and readback verified
**Build branch:** `v2-integration`  
**Migration:** `20260727080103_intellizen_v2_gate1_control_contracts.sql`

## Gate 1 outcome

The Gate 1 contracts are implemented, applied, and verified:

- centralized persistence redaction and context-pack evidence hashing;
- admin/worker MCP planes from the single canonical build;
- protected roster and schema-v1 Workflow Run fields rejected in every current generic MCP write path;
- roster changes proposed for approval rather than applied by an agent;
- worker tools mediated through a loopback, per-run capability broker with no direct database credential;
- local, versioned runtime bindings with canonical paths and opaque Keychain references only;
- additive Roles, Agents, Role Assignments, proof-receipt, lease, fencing, idempotency, transition, and approval contracts;
- transactional schema and RPC verification against an ephemeral PostgreSQL 17 database.

The reviewed additive migration is recorded remotely as
`20260727092636_intellizen_v2_gate1_control_contracts`. No existing row was
deleted or rewritten, no credential was stored, and no deployment, publish, or
external human-visible action occurred.

## Commits

```text
0a05433 feat: add Gate 1 context and redaction kernel
31a6af4 feat: enforce Gate 1 MCP authority planes
322a397 feat: add local runtime binding control store
244ca3c feat: author Gate 1 workflow control migration
```

## Production preflight

`node scripts/v2-gate1-preflight.mjs` performed service-role readback only. It issued no mutation.

```json
{
  "inspection_mode": "read-only",
  "database_count": 13,
  "proposed_database_id_collisions": [],
  "role_key_conflicts": [],
  "agent_key_conflicts": [],
  "active_role_occupant_conflicts": [],
  "active_role_agent_pair_conflicts": [],
  "assignment_relation_problems": 0,
  "workflow_runs_with_reserved_gate1_keys": 0,
  "work_event_workflow_run_orphans": 0,
  "proof_columns_present": false,
  "idempotency_collisions": []
}
```

Interpretation:

- the three proposed database IDs are unused;
- no existing Gate 1 organization records conflict;
- no Workflow Run already uses a reserved schema-v1 key;
- every existing non-null `work_events.workflow_run_id` resolves to a Workflow Run record;
- proof columns are absent, as expected before application.

## Migration review

### Expected row effects

| Object | Expected effect |
|---|---|
| `workspace.databases` | Insert 3 system databases; update the 2 existing workflow schemas in place |
| `workspace.records` | Insert 4 roles, 3 agents, and 3 active assignments |
| `workspace.work_events` | Add nullable proof columns; change 0 existing rows |

The fixed proof fence is:

```text
operations_director -> Fiona -> no binding yet
chief_engineer -> Keel -> codex-local-primary
founder_approval_authority -> Adam -> no runtime binding
verifier -> no standing assignment
```

No credential, command, binary path, environment value, or Keychain path is stored in Supabase.

### Expected schema effects

- add `workflow_definition` and `workflow_definition_version` to the Workflow Registry schema;
- add `run_schema_version`, `run_definition_snapshot`, and `run_current_step_id` to the Workflow Runs schema;
- add six nullable proof columns to `workspace.work_events`;
- add JSON shape constraints for the three organization databases and request hashes;
- add unique partial indexes for role keys, agent keys, active role occupancy, active role/agent pairs, and run idempotency;
- add assignment/runtime receipt lookup indexes;
- add four `SECURITY INVOKER` RPCs:
  - `workspace.acquire_workflow_dispatch_lease`
  - `workspace.heartbeat_workflow_dispatch_lease`
  - `workspace.release_workflow_dispatch_lease`
  - `workspace.transition_workflow_step`

The functions execute only for `anon` and `service_role`; `PUBLIC` and `authenticated` execute are revoked. `transition_workflow_step` owns schema-v1 control mutation, appends the human-readable body receipt, inserts the canonical event, and returns the committed run/event in one transaction.

### Local database verification

The migration was applied to a temporary socket-only PostgreSQL 17 cluster, never to Supabase production. The test database was destroyed after the run.

Passed assertions:

- fixed database and seed IDs;
- all expected proof columns and uniqueness indexes;
- every RPC remains `SECURITY INVOKER`;
- exact allowed and denied execute grants;
- lease acquire/replay/takeover;
- compare-and-set version and step checks;
- legal and illegal state edges;
- expired leases and stale fencing tokens;
- mandatory receipt fields and rollback;
- non-run and legacy-run rejection;
- safe replay with the same request hash;
- rejection of idempotency-key reuse with a different hash;
- approval request, decision, and transactional invalidation after payload change;
- final receipt count and lease release.

Result:

```text
Gate 1 ephemeral schema, security, migration, and RPC suites passed; transactions rolled back
```

### Supabase advisor baseline

Before application:

- security advisor: zero findings;
- performance advisor: existing informational notices only, unrelated to the unapplied Gate 1 objects.

The same advisor checks were rerun after application:

- security advisor: zero findings;
- performance advisor: the same existing informational notices, plus expected
  unused-index notices for the two newly created receipt lookup indexes before
  production traffic has exercised them.

## Production application verification

Adam approved this exact migration on 2026-07-27 at 12:38 +04 and later
corrected the stale project-level overnight-delay rule. Immediately before
application, a second production preflight confirmed:

```json
{
  "workspace_databases_total": 13,
  "workspace_records_total": 289,
  "workspace_work_events_total": 128,
  "target_database_id_conflicts": 0,
  "target_record_id_conflicts": 0,
  "existing_gate1_functions": [],
  "existing_gate1_constraints": [],
  "existing_gate1_indexes": []
}
```

The migration then applied successfully through the Supabase migration API.
Post-application readback proved:

- 3 control databases, 4 roles, 3 agents, and 3 active assignments;
- 6 proof columns and 4 validated check constraints;
- all 4 RPC signatures with the reviewed `SECURITY INVOKER` and grant contract;
- `chief_engineer -> Keel -> codex-local-primary`;
- zero disposable test records or test events left behind after rollback;
- the full schema and transactional RPC suites passed against production inside
  rollback-only transactions;
- remote migration history contains
  `20260727092636_intellizen_v2_gate1_control_contracts`;
- `supabase/MIGRATIONS.md` now matches the 89-row remote inventory.

## Integrated verification

```text
pnpm test
  28 files passed
  127 tests passed

cd mcp-server && pnpm build && pnpm test
  build passed
  12 tests passed

ALLOW_LOCAL_ACCESS_KEY_BUILD=1 pnpm smoke
  TypeScript check passed
  cargo clippy -D warnings passed
  Vite build passed
  Rust tests: 4 passed

scripts/check-bundle-secrets.sh dist
  no Supabase service-role JWT found
```

The smoke build intentionally used the existing local-only access-key override. A value-only scan confirmed that key was present exactly once in the generated bundle, so `dist/` was moved to Trash immediately and is not a release artifact.

## Approval record

**Decision:** Approved by Adam on 2026-07-27 at 12:38 +04 and applied after his
explicit correction removing the stale overnight-delay instruction:

```text
supabase/migrations/20260727080103_intellizen_v2_gate1_control_contracts.sql
```

The application and readback passed. Adam's standing whole-build instruction
authorizes automatic continuation through Gates 2–7 after each gate's exit
checks pass. Only an explicit locked human-approval boundary stops that
continuation.
