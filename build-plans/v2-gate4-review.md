# IntelliZen V2 Gate 4 Review

**Date:** 2026-07-27
**Status:** Awaiting exact founder approval
**Branch:** `v2-integration`

## Implemented

- canonical `intellizen.workflow/1` JSON Schema and shared validator;
- structural validation for supported role, condition, approval, artifact, and
  decision steps;
- connected, terminal-reachable, cycle-free graph validation;
- tiny step-state condition language; arbitrary code expressions are rejected;
- verification-path validation;
- dry-run sequence with resolved role, agent, binding, adapter, execution class,
  approval locations, and `dispatches: false`;
- schema-v1 definition and version fields on Workflow Registry records;
- exact definition snapshot, current step, step-state map, approval map, version,
  fencing token, and context-evidence seed on Workflow Runs;
- admin-plane `get_workflow_definition` and `validate_workflow` MCP tools;
- worker-plane tool inventory remains the reviewed Gate 3 set of 11;
- role-directed runner over the Gate 1 lease and transition contracts;
- per-dispatch role, occupant, binding, override, timestamp, assignment, runtime
  session, envelope, authority, and context-evidence snapshots;
- exact payload-hash approval objects;
- internal consequential-action simulation guarded by an approved matching
  payload hash;
- independent-verification label only for distinct producing and verifying
  runner-created assignment IDs;
- failed or inconclusive verification blocks before approval;
- persistence redaction checks on context, runtime result, approval payload, and
  artifact result;
- panel and MCP launch paths snapshot schema-v1 runs without replacing legacy
  Workflow Registry or Workflow Runs storage.

No designer UI ships in Gate 4.

## Registry definition

Production project: `jicrdrwtwubveyvzyyrh`

```text
workflow record:
  ad98b792-b31b-4f69-8cba-8b44893f134e

workflow id:
  v2-gate4-role-directed-proof

definition version:
  2

status:
  Active
```

The record was created and then versioned through the canonical admin MCP with
`confirm_write` previews. Each confirmed change has a `workspace.work_events`
receipt. No schema migration was required by Gate 4.

## Live workflow proof

The version-2 run used:

```text
Adam manual start
-> operations_director
   Fiona through a real Hermes 0.19.0 durable API run
-> chief_engineer
   Keel through isolated codex-cli 0.145.0
-> verifier
   explicit reasoned Keel override through a distinct isolated Codex assignment
-> verification_recorded
-> founder approval
```

The two Codex assignments used clean temporary Git repositories, the isolated
`codex-local-primary` worker profile, the native Rust runner, the exact Gate 3
CLI contract, and no granted worker capability. Neither assignment changed its
fixture or called a tool.

Current valid run:

```text
run:
  bee0f52b-e77c-4ec1-b19a-b23f7c5f8ee8

definition:
  version 2

status:
  Needs approval

approval step:
  running

producing assignment:
  7bd876f8-4405-44d3-91d5-72b5dd43e6bc

verifying assignment:
  47517b4b-8537-4496-87ff-73a9e628e8f9

verification:
  independent agent verification
  passed

approval:
  0148018c-a487-4f19-8bf2-9f60d86d84d6

payload hash:
  6a6e1cf38a22c773c9b7c4ae2d8ae9c3131994483541d7d4ce3fda3238187893

external action:
  false

terminal action if approved:
  internal simulation only
```

The run is intentionally paused. The payload must not be approved, simulated,
or closed until Adam explicitly approves that exact hash.

## Truthful correction

The first live run exposed a real runner defect: result existence was
incorrectly treated as a verification pass even when the verifier payload said
`inconclusive`.

The runner now reads only the verifier's explicit `passed`, `failed`, or
`inconclusive` value. Failed or inconclusive verification blocks before an
approval request. A regression test covers that edge.

The discarded production run was corrected through the fenced transition RPC:

```text
run:
  624a68c7-8110-439c-a8b8-cca1ffeb8647

status:
  Blocked

approval step:
  blocked

event:
  verification_corrected

corrected:
  passed -> inconclusive

dispatcher lease:
  released

external action:
  false
```

The incorrect historical receipt remains append-only; the correction receipt
and final blocked state make the ledger truthful without rewriting history.

## Verification

- app tests: 31 files passed, 1 live test skipped by default;
- app assertions: 147 passed, 1 live test skipped by default;
- Gate 4 live test: passed when explicitly enabled;
- MCP build: passed;
- MCP tests: 12 passed;
- worker MCP negotiation: exactly 11 reviewed tools, no generic mutation tools;
- TypeScript: passed;
- Rust clippy `-D warnings`: passed;
- Vite production build: passed;
- Rust tests: 9 passed;
- bundle service-role scan: passed;
- local access key appeared in exactly one intended compiled asset;
- verified `dist/` moved to Trash after scanning;
- production desktop `/Applications/IntelliZen.app` is excluded from V2
  verification and was not launched.

## Exit work remaining

1. Adam explicitly approves or rejects payload hash
   `6a6e1cf38a22c773c9b7c4ae2d8ae9c3131994483541d7d4ce3fda3238187893`.
2. On exact approval only, execute the reviewed no-write preview in
   `scripts/v2-gate4-resume-approval.mjs`.
3. Independently read back the approval object, simulation receipt, final
   `Done` state, released lease, ordered events, and secret-free payloads.
4. Change this review to `Passed`, rerun the final regression if the committed
   state changes, and only then begin Gate 5.
