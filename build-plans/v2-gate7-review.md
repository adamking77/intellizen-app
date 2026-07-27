# IntelliZen V2 Gate 7 Review

**Date:** 2026-07-27
**Status:** Awaiting three exact payload approvals
**Branch:** `v2-integration`

Gate 7 is not closed. Three fresh post-Gate-6 executions have completed the
real Hermes → Codex → independent-verifier path and are transactionally paused
at distinct version-18 founder approvals. Their completion previews are dry
runs; no approval has been inferred and no simulation has run.

## Pending clean executions

| Run | Approval | Exact payload hash | State |
|---|---|---|---|
| `783bc6a3-ccea-43d5-a816-6fa2e60e7df6` | `d2a92251-710a-4f5a-a26c-f34b4e4dacbb` | `4596e457a11bea881c297486d5a904e5f17414b5b67681fdebda17ea96b2a0ef` | Needs approval, v18 |
| `43ffa752-ec72-4b24-a585-1f124b48e415` | `15f75d9e-5129-4665-a8f9-7aee4dea52c7` | `6e21747150e6cc7ec912ed17dfd834358b1d240063ffdcb1bb8df800b967c181` | Needs approval, v18 |
| `cc888d72-477a-4431-aac0-d86907ab6e38` | `46e8e7c4-e0b9-402a-9775-7b87c63080fa` | `f61329de9ecf97146f5fb6fa4ff796a7794229eb67c522fe4ca009f1ce6047b8` | Needs approval, v18 |

Each run has:

- a separate producing and verifying assignment;
- `independent agent verification` with status `passed`;
- a payload snapshot that is absent from the approval prompt by hash;
- no external action;
- no application-file write;
- an internal `simulate-consequential-action` terminal step only after
  approval.

Each completion preview leads with `DRY RUN — NOTHING WRITTEN`, expects version
18, names `workspace.records` and `workspace.work_events`, and ends by releasing
the dispatcher lease.

Evidence:

- `build-plans/evidence/v2-gate7-preapproval-runs.json`

## Forced-failure suite

The post-Gate-6 forced-failure suite is complete and passed.

Live/runtime evidence:

- real pinned Codex timeout produced one truthful `timed_out` terminal event;
- no result persisted;
- no orphan process remained;
- the assignment was unchanged;
- the production desktop was not launched.

Live database evidence:

- duplicate lease delivery returned the original event;
- active takeover was rejected;
- app-loss recovery recorded `Blocked / abandoned`;
- a stale dispatcher was rejected and committed no stale transition;
- the recovery lease was released;
- payload mutation invalidated a historically approved fixture;
- the action guard refused the invalidated approval;
- the exact secret canary was absent from the run and event records.

Deterministic evidence:

- 42 focused adapter/runner assertions passed;
- malformed output, auth loss, timeout, prompt injection, secret rejection,
  missing occupant, verifier collision, parent loss, orphan child, unsupported
  resume, and ambiguous delivery all recovered truthfully;
- the native process-tree cancellation test passed.

Evidence:

- `build-plans/evidence/v2-gate7-forced-failures.json`

## Remaining closure actions

1. Adam explicitly approves each of the three exact hashes.
2. Resume each run with its own hash and verify `Done`, exact approval readback,
   internal simulation only, released lease, and complete ordered receipts.
3. Run the final full app, MCP, native, smoke, bundle, and exact secret scans.
4. Finalize the Sogo proof record from
   `build-plans/v2-gate0-sogo-proof-record.md`.
5. Perform the requirement-by-requirement Gates 0–7 completion audit and close
   Wave 1 only if all evidence remains green.
