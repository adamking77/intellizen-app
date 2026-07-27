# IntelliZen V2 Gate 5 Review

**Date:** 2026-07-27
**Status:** Passed
**Branch:** `v2-integration`

## Implemented

- five deferred mock-runtime traces:
  - auth loss;
  - parent loss;
  - orphaned child;
  - resume unsupported;
  - ambiguous delivery;
- typed runtime failure reasons with truthful blocked, cancelled, or abandoned
  transitions;
- unknown dispatch failure defaults to ambiguous delivery and is never retried;
- exactly one automatic retry only when the adapter explicitly reports that the
  request is retryable and no result is known;
- receipt-backed retry suspension and restart;
- persistence rejection becomes a blocked transition without copying the unsafe
  runtime value into the receipt;
- per-dispatcher-attempt lease idempotency keys;
- app-process runtime-start deduplication for identical immutable run input;
- relaunch recovery for expired local assignments:
  - acquires a newly fenced lease;
  - marks the step `abandoned`;
  - records `app_process_terminated`, `resultKnown: false`, and
    `automaticRetry: false`;
  - releases the recovery lease;
- active leases are left untouched;
- durable Hermes assignments remain reconciliation work rather than being
  mislabeled abandoned;
- main-window startup invokes the recovery scan in the Tauri dev app;
- invalidated approvals are refused even though their historical decision
  remains inspectably `approved`;
- manual cancellation and timeout both prove process-group cleanup.

No schema migration was required. The Gate 1 RPC already supports the necessary
state edges, lease fencing, idempotent replay, and transactional approval
invalidation marker.

## Forced-failure matrix

| Injection | Expected recovery | Evidence |
|---|---|---|
| Duplicate runtime start | Same immutable input dispatches once; changed input rejects | `WorkflowDispatchCoordinator` test |
| Duplicate lease delivery | Original committed event returned; no second version increment | production fixture `feaa1da5-8496-45aa-b1db-336549fae52f` |
| App termination during local step | `Blocked / abandoned`, result unknown, no retry, released recovery lease | production fixture `fda1612f-549d-4cd4-979a-2b4bcd20a440` |
| Active lease takeover | Second dispatcher rejected visibly | production fixture `feaa1da5-8496-45aa-b1db-336549fae52f` |
| Stale dispatcher after relaunch | Old session/token rejected; no stale event commits | production fixture `fda1612f-549d-4cd4-979a-2b4bcd20a440` |
| Malformed runtime output | Protocol error emitted; later valid terminal event survives | `malformed.jsonl` golden trace |
| Auth loss mid-session | Named `auth_lost`, blocked, no retry | deferred trace + runner test |
| Timeout | Named `timed_out`, blocked, no result persisted | runner test + real Codex proof |
| Process-tree cancellation | Parent and child reaped; truthful cancelled terminal | Rust native test |
| Prompt injection in selected source | Remains delimited layer-4 data; mediated authority unchanged | runner/context-pack test |
| Secret canary in runtime output | Rejected before transition persistence; canary absent from receipts | runner/redaction test |
| Approval payload changes after decision | Transactional invalidation marker; action guard refuses | production fixture `72e60b11-5f64-4890-8ef8-7a3c5fb68c46` |
| Missing or ineligible role occupant | `blocked: role unavailable`, no fall-through | runner test |
| Verifier assignment collision | Label degrades to `verification claim` | runner test |
| Parent loss | Named `parent_lost`, abandoned, no retry | deferred trace + runner test |
| Orphaned child | Named `orphaned_child`, abandoned, no retry | deferred trace + runner test |
| Resume unsupported | Named `resume_unsupported`, blocked, no retry | deferred trace + runner test |
| Ambiguous delivery | Named `ambiguous_delivery`, human review required, no retry | deferred trace + runner test |

## Live database proof

Production project: `jicrdrwtwubveyvzyyrh`

All three runs were created through admin MCP `start_workflow`, including the
no-write preview before confirmation. They are explicitly labeled Gate 5
fixtures and perform no runtime or external action.

### Duplicate and active lease

```text
run:
  feaa1da5-8496-45aa-b1db-336549fae52f

duplicate:
  returned original lease event

second active dispatcher:
  rejected: Workflow Run already has an active dispatcher lease

final version:
  2

lease:
  released
```

### Relaunch abandonment and stale fencing

```text
run:
  fda1612f-549d-4cd4-979a-2b4bcd20a440

final status:
  Blocked

local step:
  draft = abandoned

final version:
  8

old dispatcher:
  rejected: Stale dispatcher lease

stale event committed:
  false

lease:
  released
```

The ordered receipt path is:

```text
workflow_run_started
-> dispatcher_lease_acquired
-> assignment_created
-> agent_completed
-> workflow_step_advanced
-> assignment_created
-> dispatcher_lease_acquired
-> runtime_abandoned
-> dispatcher_lease_released
```

### Approval invalidation

```text
run:
  72e60b11-5f64-4890-8ef8-7a3c5fb68c46

approval:
  e17482ab-04e6-4e7c-bd77-7f7b5b60cc4e

decision identity:
  Gate 5 test fixture (not human approval)

historical decision:
  approved

invalidated:
  true

action guard allows:
  false

final version:
  5
```

Independent Supabase connector readback confirmed the final states, event
ordering, released leases, absence of a committed stale-transition event, and
zero exact secret-canary matches across all three run records and event sets.

## Real adapter proof

`scripts/v2-gate5-real-runtime-proof.mjs` ran the installed
`codex-cli 0.145.0` through `src-tauri/src/runtimes.rs` using the isolated
`codex-local-primary` profile and a clean temporary assignment.

```text
runtime run:
  gate5-6925ec34-6f31-40e6-82a3-fe5c2289bd77

terminal:
  timed_out

result persisted:
  false

orphan processes:
  0

assignment modified:
  false
```

The production desktop app was not launched.

## Verification

- `ALLOW_LOCAL_ACCESS_KEY_BUILD=1 pnpm smoke`: passed;
- TypeScript: passed;
- Vite production build: passed;
- Rust clippy `-D warnings`: passed;
- Rust tests: 9 passed;
- app tests: 31 files passed, 1 live Gate 4 test skipped by default;
- app assertions: 168 passed, 1 skipped;
- MCP build: passed;
- MCP tests: 12 passed;
- worker MCP negotiation: exactly 11 reviewed tools, no generic mutation tools;
- deferred Gate 5 runtime traces: passed;
- live database failure proof: passed;
- real Codex timeout proof: passed;
- bundle service-role scan: passed;
- local access key appeared in exactly one intended compiled asset;
- verified `dist/` moved to
  `/Users/adamking/.Trash/intellizen-dist-gate5-20260727-1524`.

The first unflagged smoke attempt stopped at the intentional local-key build
guard. The local-only rerun used the repository-required
`ALLOW_LOCAL_ACCESS_KEY_BUILD=1` flag and passed.

## Decision record

`spec/decisions.md` records that lease idempotency is scoped to one dispatcher
attempt. This distinguishes a duplicate delivery from a legitimate relaunch
while preserving active-lease rejection, CAS, and stale-token fencing.

Gate 5 is closed. Gate 6 may begin.
