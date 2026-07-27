# IntelliZen V2 Wave 1 Completion Audit

**Date:** 2026-07-27  
**Status:** Passed  
**Branch:** `v2-integration`  
**Spec authority:** `~/projects/intellizen-app-v2/spec/01` through `06`, as
closed by `09-audit-closure.md`

## Verdict

Gates 0 through 7 satisfy their locked exit criteria. The vertical trust path
is implemented, the complete forced-failure suite is green, three consecutive
post-interruption workflow executions are clean, the final V2 bundle is
functional and secret-free, and the bounded Sogo proof record is complete.
Wave 1 is done. Wave 2 has not begun.

## Gate-by-gate audit

| Gate | Required exit | Evidence | Result |
|---|---|---|---|
| 0 | Scope, Sogo proof boundary, admin inventory, runtime contracts, Gate 1 proposal reviewed | `v2-gate0-scope.md`, `v2-gate0-sogo-proof-record.md`, `v2-gate0-admin-plane-inventory.md`, `v2-gate0-runtime-contracts.md`, `v2-gate1-contract-proposal.md`; Adam explicitly approved Gate 0 | Passed |
| 1 | CAS/fencing/idempotency, approval invalidation, context hashes, redaction, protected MCP writes | `v2-gate1-review.md`; reviewed additive migration and production rollback-only contract checks; remote migration/readback verified | Passed |
| 2 | Deterministic mock traces and native process boundary | `v2-gate2-review.md`; golden traces plus native stdin, streaming, timeout, cancellation, environment, and process-group tests | Passed |
| 3 | Pinned Codex adapter and live worker isolation | `v2-gate3-review.md`; Codex `0.145.0`, isolated login/profile, exactly worker MCP, bounded live dispatch and receipt | Passed |
| 4 | One role-directed end-to-end workflow | `v2-gate4-review.md`; Hermes → Codex → distinct verifier → exact founder approval → safe simulation, inspectable without manual context copying | Passed |
| 5 | Complete truthful forced-failure suite | `v2-gate5-review.md` and `evidence/v2-gate7-forced-failures.json`; every named injection covered, no silent ambiguity retry | Passed |
| 6 | Product surfaces, behavior preservation, second real adapter | `v2-gate6-review.md`; role-first panel, designer, inspector, four truthful patterns, Claude `2.1.220` strict worker isolation, latest-binary visual pass | Passed |
| 7 | Three clean runs, full failures, no secrets/duplicates/false verification, final Sogo record | `v2-gate7-review.md`, `evidence/v2-gate7-clean-runs.json`, `v2-gate7-sogo-proof-record.md` | Passed |

## Non-negotiable invariant audit

| Invariant | Verification | Result |
|---|---|---|
| Record bodies append only through `workspace.append_record_section` | Existing app/MCP write paths preserved; Gate 1 protected-field changes use transactional control RPCs rather than client read-modify-write | Passed |
| Consequential writes require an unmistakable preview and separate `confirm_write` | Generic MCP write contract remains; roster proposal and save-to-document flows preview first; unconfirmed document/record workflow artifacts are rejected before lease acquisition | Passed |
| R11 external sends remain human-only | Wave 1 performs no external send; three terminal artifacts are internal simulations with `externalAction: false`; no deploy/publish occurred | Passed |
| Runtime completion is not verification | Distinct runner-created verifier assignments are required; identity collision downgrades/refuses independent verification | Passed |
| Untrusted content cannot grant authority | Context wrapping and prompt-injection fixture preserve the mediated assignment and tool grant | Passed |
| No secret in bundle or Supabase | Exact scan: five reviewed credential values appear in zero `dist/` files and zero V2 app-bundle files; worker profiles contain no direct DB credential; canary persisted nowhere | Passed |
| Provider/API credentials stay outside webview and workers | Hermes credentials and the IntelliZen local-access header are native-host-only; Supabase service role remains admin-plane-only; provider login stays provider-managed | Passed |
| `pnpm smoke` green | Final clean invocation: TypeScript, clippy `-D warnings`, Vite production build, and 17 Rust tests passed | Passed |
| UI slices pass `DESIGN.md` | Gates 3 and 6 latest-binary reviews cover role panel, Settings runtime discovery/bindings, inspector, `/workflows`, graph/designer, keyboard, dock/eject, and responsive width | Passed |
| Run ledger remains Workflow Runs + `workspace.work_events` | Schema-v1 runner persists canonical state and ordered transactional receipts there; no parallel task/session ledger introduced | Passed |
| One canonical MCP build | Filesystem readback found only `/Users/adamking/projects/intellizen-app/mcp-server/dist/index.js`; admin and worker planes share that source/build with different registries | Passed |
| Migration discipline | Gate 1 review named affected tables/objects and expected counts, recorded read-only preflight, exact approval, application, rollback-only write verification, advisor results, and migration-history readback | Passed |

## Final regression

```text
app: 39 test files passed, 190 assertions passed
intentional live Gate 4 skip: 1
MCP build: passed
MCP tests: 12 passed
Rust: 17 passed
TypeScript: passed
clippy -D warnings: passed
Vite production build: passed
pnpm smoke: passed
```

The clean build was produced with `VITE_INTELLIZEN_LOCAL_ACCESS_KEY` explicitly
absent. The final V2 app is:

```text
/Users/adamking/projects/intellizen-app/src-tauri/target/debug/bundle/macos/IntelliZen V2 Dev.app
CFBundleIdentifier: com.genzen.intellizen.v2dev
```

Live readback from that exact bundle showed Home loaded, 16 workspace
databases, Operations Director selected, and Fiona's existing thread visible.
`/Applications/IntelliZen.app` was not launched and is not running.

## Final secret scan

| Exact value | `dist/` files | V2 app-bundle files |
|---|---:|---:|
| `SUPABASE_SERVICE_ROLE_KEY` | 0 | 0 |
| `VITE_INTELLIZEN_LOCAL_ACCESS_KEY` | 0 | 0 |
| `VITE_HERMES_API_KEY` | 0 | 0 |
| `VITE_HERMES_WEBHOOK_SECRET` | 0 | 0 |
| `HERMES_DASHBOARD_SESSION_TOKEN` | 0 | 0 |

The local-access value is now read only by the native host, attached only to
allowlisted requests for the configured Supabase origin, and never returned to
the webview (`eab5596`).

## Data and external-state conclusion

- One reviewed additive migration was applied and verified during Gate 1.
- Gate 4/7 proof writes are limited to Workflow Run state and transactional
  receipts.
- The three counted consequential steps are simulations only.
- No external human-visible message, deploy, publish, production app launch,
  or application-file write occurred.
- The interrupted proof run remains visibly `Blocked` and excluded.
- No Gate 1–7 requirement is silently deferred into Wave 2.
