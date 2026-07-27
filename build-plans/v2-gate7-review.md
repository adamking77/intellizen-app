# IntelliZen V2 Gate 7 Review

**Date:** 2026-07-27
**Status:** Passed
**Branch:** `v2-integration`

Gate 7 is closed. Three consecutive executions after the interrupted run
completed the real Hermes → Codex → independent-verifier path, received Adam's
approval for their exact verifier-payload hashes, performed only the approved
internal simulation, committed complete ordered receipts, and released their
dispatcher leases.

## Clean executions

| Run | Approval | Exact payload hash | State |
|---|---|---|---|
| `783bc6a3-ccea-43d5-a816-6fa2e60e7df6` | `d2a92251-710a-4f5a-a26c-f34b4e4dacbb` | `4596e457a11bea881c297486d5a904e5f17414b5b67681fdebda17ea96b2a0ef` | Blocked, v25; excluded |
| `43ffa752-ec72-4b24-a585-1f124b48e415` | `15f75d9e-5129-4665-a8f9-7aee4dea52c7` | `6e21747150e6cc7ec912ed17dfd834358b1d240063ffdcb1bb8df800b967c181` | Done, v24 |
| `cc888d72-477a-4431-aac0-d86907ab6e38` | `46e8e7c4-e0b9-402a-9775-7b87c63080fa` | `f61329de9ecf97146f5fb6fa4ff796a7794229eb67c522fe4ca009f1ce6047b8` | Done, v24 |
| `48830d19-55ea-45cc-8f3c-f5e0fa03aa5e` | `b6dd118f-c675-4733-a34d-73c8c9db011d` | `755b52749ccb252a2cca630e464ee940f3427ed8e5e9fb803fa6f87b61974660` | Done, v24 |

Each counted clean run has:

- a separate producing and verifying assignment;
- `independent agent verification` with status `passed`;
- a verifier payload snapshot bound to the approved SHA-256 hash;
- no external action;
- no application-file write;
- an internal `simulate-consequential-action` terminal step only after
  approval.

Each completion preview led with `DRY RUN — NOTHING WRITTEN`, expected version
18, named `workspace.records` and `workspace.work_events`, and performed no
write until Adam approved that run's exact hash. Readback confirms `Done`,
version 24, the exact approval, the complete receipt sequence, and no active
dispatcher lease.

Evidence:

- `build-plans/evidence/v2-gate7-preapproval-runs.json`
- `build-plans/evidence/v2-gate7-clean-runs.json`

## Truthful interrupted-run recovery

The first approved run did not persist an artifact or completion. Its
UUID-bearing internal artifact reference was rejected as a high-entropy token.
After the original lease expired, the recovery path:

- acquired a newly fenced lease;
- recorded `persistence_rejected`;
- marked the simulation and run `Blocked`;
- preserved Adam's exact approval for inspection;
- recorded `external_action: false` and `automatic_retry: false`;
- released the recovery lease;
- excluded the run from the clean-run count.

The corrected completion path now uses a stable low-entropy simulation
reference and validates the whole artifact before its first write.

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

## Final verification

```text
app: 39 test files passed, 190 assertions passed
intentional live Gate 4 skip: 1
MCP: 12 tests passed
Rust: 17 tests passed
TypeScript: passed
clippy -D warnings: passed
Vite production build: passed
pnpm smoke: passed
persistence-redaction target: 10 tests passed
```

Exact-value scans against the final `dist/` and the V2 dev bundle found zero
files containing the Supabase service-role key, local-access key, Hermes API
key, Hermes webhook secret, or Hermes dashboard session token.

The final audit caught that the historical local-only smoke override embedded
the local-access value in `dist/`, contrary to the locked invariant. The
webview now routes its existing Supabase HTTP client through a constrained
native-host proxy. The host admits only the configured Supabase origin,
allowlisted API paths, methods, and headers, and adds the machine-local header
without returning it to the webview. The clean rebuilt bundle loaded Home, 16
workspace databases, the Operations Director role, and Fiona's existing thread.
The correction is commit `eab5596`.

The inspected application is exactly:

```text
/Users/adamking/projects/intellizen-app/src-tauri/target/debug/bundle/macos/IntelliZen V2 Dev.app
CFBundleIdentifier: com.genzen.intellizen.v2dev
```

The production `/Applications/IntelliZen.app` is not running. No external
human-visible action, production deploy, publish, or application-file write
occurred in the three proof workflows.

## Exit decision

Gate 7 passes. The three clean executions, complete forced-failure suite,
final Sogo proof record, and Gates 0–7 completion audit satisfy the Wave 1 exit
criteria.
