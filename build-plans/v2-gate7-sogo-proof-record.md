# What IntelliZen Proved for Sogo

**Date:** 2026-07-27  
**Status:** Final Gate 7 evidence record  
**Scope:** IntelliZen V2 Wave 1, exact implementation on `v2-integration`

## Claim

IntelliZen is a credible operational testbed for one bounded Sogo trust path.
It proved the properties below inside IntelliZen's pragmatic architecture. It
did not prove the listed Sogo-foundation properties, and this record must not
be cited as though it did.

The claim is supported by three consecutive clean executions after one
truthfully recovered interrupted run, the complete forced-failure suite,
pinned real-provider probes, transactional database readback, and the final
clean V2 bundle.

## Proven properties

| Property | What the evidence establishes |
|---|---|
| Role-first routing | Work targeted `operations_director`, `chief_engineer`, and `verifier`; each dispatch snapshotted role, current occupant, approved binding, runtime session, and runner-created assignment. Missing occupants block rather than fall through. |
| Runtime/identity separation | Fiona ran through Hermes and Keel through the pinned Codex adapter. The verifier used a distinct runner-created assignment from the producing assignment. Runtime completion did not itself earn verification. |
| Codex worker isolation | Codex CLI `0.145.0` ran under isolated `CODEX_HOME`, a dedicated assignment directory, sanitized environment, provider sandbox, and exactly the worker MCP plane. The live probe found no admin MCP or admin credential. |
| Claude worker isolation | Claude Code `2.1.220` ran under isolated `CLAUDE_CONFIG_DIR`, strict explicit MCP configuration, `dontAsk`, no session persistence, and exactly the 11 reviewed worker tools. Its live `system/init` readback found no admin MCP. |
| Transactional lifecycle | Version CAS, legal state edges, mandatory receipts, lease fencing, per-attempt idempotency, stale-dispatcher rejection, and approval invalidation execute through the reviewed RPC contract. A state mutation without its canonical receipt rolls back. |
| Context evidence | Dispatches carry ordered bounded context with per-source evidence and a hash of the exact rendered bytes. Prompt text cannot grant tools or widen the mediated assignment. |
| Exact human approval | Each counted workflow paused at its own version-18 founder gate. Adam approved the exact verifier-payload SHA-256. The action guard re-read that hash before allowing the internal simulation. |
| Independent verification | Each producing and verifying assignment ID differed. `independent agent verification` was recorded only after the verifier returned structured evidence; the collision fixture refused that label. |
| Persistence redaction | The single durable-write guard rejected secret-shaped fixtures and the live canary before persistence. The interrupted Gate 7 run failed closed on this guard and was recorded as `Blocked`, not rewritten into success. |
| Truthful recovery | Timeout, cancellation, malformed output, auth loss, parent/app loss, orphan risk, stale lease, unsupported resume, ambiguous delivery, missing role, verifier collision, payload mutation, prompt injection, and secret output all produced named inspectable outcomes without silent ambiguity retry. |
| Consequential-action guard | The three proof workflows performed only `simulate-consequential-action`, after exact approval. Each recorded `externalAction: false`, `No external action performed.`, one completion transition, and a released lease. |
| Clean packaged boundary | The final V2 bundle loads the live workspace while exact scans find zero service-role, local-access, Hermes API, Hermes webhook, or Hermes dashboard-session values in both `dist/` and the app bundle. Local Supabase access is attached by a constrained native host, not the webview. |

## Counted clean executions

| Run | Producing assignment | Verifying assignment | Approval hash | Result |
|---|---|---|---|---|
| `43ffa752-ec72-4b24-a585-1f124b48e415` | `41df30f0-425c-4008-8f0f-fa25c8701df5` | `85fe7018-a96c-4d95-b7cb-de09ca615630` | `6e21747150e6cc7ec912ed17dfd834358b1d240063ffdcb1bb8df800b967c181` | Done, v24 |
| `cc888d72-477a-4431-aac0-d86907ab6e38` | `1808422b-77fd-4125-83f3-a61ceb1ef908` | `6a090939-ddfb-43b0-a7a7-488aab00de25` | `f61329de9ecf97146f5fb6fa4ff796a7794229eb67c522fe4ca009f1ce6047b8` | Done, v24 |
| `48830d19-55ea-45cc-8f3c-f5e0fa03aa5e` | `123277e4-75ca-45f3-b2ae-d9f175fdd27c` | `2aa391ce-d036-4464-a3d7-7cb37ac29e32` | `755b52749ccb252a2cca630e464ee940f3427ed8e5e9fb803fa6f87b61974660` | Done, v24 |

All three have the same complete ordered receipt shape from
`workflow_run_started` through `workflow_completed` and final
`dispatcher_lease_released`. No manual context copying occurred.

The earlier run `783bc6a3-ccea-43d5-a816-6fa2e60e7df6` is explicitly excluded.
Its first completion attempt hit a redaction false positive after approval.
Recovery recorded `persistence_rejected`, left no artifact or completion,
marked the run `Blocked` at version 25, disabled automatic retry, and released
the new fenced lease.

Evidence:

- `build-plans/evidence/v2-gate7-clean-runs.json`
- `build-plans/evidence/v2-gate7-forced-failures.json`
- `build-plans/evidence/v2-gate6-live-panel-proof.json`
- `build-plans/evidence/v2-gate6-live-claude-proof.json`
- `build-plans/v2-gate1-review.md`
- `build-plans/v2-gate3-review.md`
- `build-plans/v2-gate4-review.md`
- `build-plans/v2-gate5-review.md`
- `build-plans/v2-gate6-review.md`
- `build-plans/v2-gate7-review.md`

## Still unproven

The following remain Sogo work:

- `sogod`, launchd custody, supervisor restart, or local work surviving app
  closure;
- offline operation, a local SQLite single-writer core, or SQLite recovery and
  migration behavior;
- a full Sogo adapter conformance system, provider-wide compatibility, future
  CLI-version compatibility, or capability levels not exercised by a trace;
- Sogo's complete context trust taxonomy, authoritative provider token
  accounting, full stale-after semantics, or guaranteed source reconstruction;
- a hash-chained or signed ledger, cryptographic event ordering, actor
  signatures, or tamper evidence against database administrators;
- containment of Adam-equivalent admin-plane agents, OS-user isolation, or
  safety after a worker regains an interactive user's configuration;
- multi-user authentication/authorization, tenant isolation, cross-device
  revocation, or human non-repudiation;
- rooms, packs, plugin lifecycle, sync, public multi-tenant behavior, or full
  GenUI convergence;
- SSH remote-runtime security;
- durable multi-runtime transcript ownership;
- external-send safety outside IntelliZen's mediated approval path.

## Sogo usage rule

Sogo planning may cite a property only at the bounded grain above and with the
exact adapter/version, run, failure fixture, or transaction evidence attached.
The broad statement “IntelliZen proves the Sogo foundation” is false.

