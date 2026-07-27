# IntelliZen V2 Gate 1 Review

**Date:** 2026-07-27  
**Status:** Approved for a later production application; not yet performed
**Build branch:** `v2-integration`  
**Migration:** `20260727080103_intellizen_v2_gate1_control_contracts.sql`

## Gate 1 outcome

The Gate 1 contracts are implemented and locally verified:

- centralized persistence redaction and context-pack evidence hashing;
- admin/worker MCP planes from the single canonical build;
- protected roster and schema-v1 Workflow Run fields rejected in every current generic MCP write path;
- roster changes proposed for approval rather than applied by an agent;
- worker tools mediated through a loopback, per-run capability broker with no direct database credential;
- local, versioned runtime bindings with canonical paths and opaque Keychain references only;
- additive Roles, Agents, Role Assignments, proof-receipt, lease, fencing, idempotency, transition, and approval contracts;
- transactional schema and RPC verification against an ephemeral PostgreSQL 17 database.

No production data, schema, deployment, publish, or external action changed during this session. Gate 2 has not begun.

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

Advisors must be rerun after the later production application.

## Application verification contract

Adam approved this exact migration on 2026-07-27 at 12:38 +04. Production
application remains a separate session after the overnight minimum has elapsed,
no earlier than 2026-07-28.

That session must:

1. rerun the read-only preflight and stop if its output differs materially;
2. apply only `20260727080103_intellizen_v2_gate1_control_contracts.sql`;
3. read back the 3 database rows, 10 seed records, 6 proof columns, constraints, indexes, function signatures, `SECURITY INVOKER` state, and grants;
4. confirm that existing `workspace.work_events` rows were not rewritten;
5. run rejection and success probes only against dedicated disposable Workflow Run fixtures;
6. rerun security and performance advisors;
7. regenerate `supabase/MIGRATIONS.md` from the remote inventory;
8. write the application receipt.

Gate 1 exits only after those checks pass. Gate 2 remains blocked until then.

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

**Decision:** Approved by Adam on 2026-07-27 at 12:38 +04 for later production
application of:

```text
supabase/migrations/20260727080103_intellizen_v2_gate1_control_contracts.sql
```

This approval authorizes the application-and-readback session described above.
Adam's standing whole-build instruction separately authorizes automatic continuation
through Gates 2–7 after each gate's exit checks pass. Only an explicit locked
human-approval boundary stops that continuation.
