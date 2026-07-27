# What IntelliZen Can Prove for Sogo

**Date:** 2026-07-27
**Status:** Final Gate 0 proof boundary
**Source:** `~/projects/intellizen-app-v2/spec/01-integration-strategy.md` section 4

## Judgment

IntelliZen can produce credible evidence for a bounded trust-path slice: role resolution, worker-profile isolation, deterministic adapter behavior, transactional workflow transitions, payload-bound approval, context evidence, redaction, and assignment-correlated verification.

It cannot validate Sogo's supervisor, local-first store, multi-user authority, cryptographic identity, full adapter conformance, or administrative-agent containment. Those remain Sogo work.

No Wave 1 success claim exists yet. Gate 0 establishes what may be claimed after Gate 7 and what must remain explicitly unproven.

## Competing hypotheses

### H1: IntelliZen is a valid operational testbed

Supporting evidence:

- The real app already uses Workflow Registry, Workflow Runs, atomic record-section appends, and an append-only work-event table.
- Live read-only inspection confirmed `workspace.records`, `workspace.work_events`, RLS, and the deployed `workspace.append_record_section` RPC.
- Codex 0.145.0 proved that a clean `CODEX_HOME` sees no global MCP servers and no interactive-profile login.
- The current app already supplies real GenZen workflows, approvals, context, Hermes durability, and operator review surfaces.

Contradicting evidence:

- Current workflow updates and work-event inserts are separate operations.
- `recordWorkEvent` is explicitly best-effort in both app and MCP code.
- `workspace.work_events` has no transition idempotency key or request hash.
- No runtime adapter registry, deterministic trace suite, transition RPC, redaction chokepoint, or role-assignment resolver exists yet.

Confidence: high that IntelliZen is a valid bounded testbed; zero confidence that the proposed properties are already proven.

### H2: IntelliZen evidence could be mistaken for Sogo foundation proof

Supporting evidence:

- IntelliZen uses a networked Supabase store and an app-process dispatcher.
- Admin-plane agents can reach service-role or direct database paths.
- The app runs under one macOS user and relies on provider-native sandboxes rather than an OS-separated worker account.
- The planned context evidence is intentionally smaller than Sogo's full context manifest.

Contradicting evidence:

- The V2 spec explicitly records each divergence.
- Gate 7 requires forced failures and carries an explicit unproven-properties record back to Sogo.
- Capability labels are derived from tests and shown individually, avoiding a broad conformance claim.

Confidence: high. The primary Gate 7 risk is overclaim, not lack of useful evidence.

## Source reliability

| Source | Reliability | Use |
|---|---|---|
| Live read-only Supabase schema and function inspection, 2026-07-27 | High | Current table, index, RLS, and RPC state |
| Installed CLI probes, 2026-07-27 | High | Exact local isolation and stream behavior |
| Current `v2-integration` source at `904a456` | High | Current workflow and receipt behavior |
| Locked V2 spec and closure | High for intended design | Claims allowed after implementation, not proof of implementation |
| Historical runtime and cockpit plans | Medium | Product continuity and superseded assumptions |

## Accepted divergence record

The seven divergences in `01-integration-strategy.md` section 4 are accepted, with the proof wording below.

### 1. No supervisor

Accepted.

IntelliZen may prove:

- truthful `ephemeral` disclosure;
- process-group cancellation;
- abandoned-state recovery after app loss;
- fenced rejection of a stale dispatcher;
- durable routing to Hermes when the workflow selects a durable adapter.

IntelliZen cannot prove:

- local execution surviving app closure;
- supervisor restart behavior;
- crash-resilient local process custody;
- Sogo's launchd or `sogod` lifecycle.

### 2. Supabase instead of a local SQLite single-writer core

Accepted.

IntelliZen may prove:

- one RPC transaction performs compare-and-set state change plus canonical receipt;
- fencing tokens reject stale dispatchers;
- idempotency rejects or returns a prior transition without a second mutation;
- ambiguous delivery becomes a visible blocked state;
- payload mutation invalidates approval in the same transaction.

IntelliZen cannot prove:

- offline operation;
- local single-writer behavior;
- Sogo SQLite recovery or migration behavior;
- availability when Supabase or the network is unavailable.

### 3. No full Sogo adapter conformance system

Accepted.

IntelliZen may prove, for exact pinned versions:

- golden trace normalization;
- cancellation, timeout, malformed output, duplicate result, auth loss, and orphan handling;
- which individual capabilities passed;
- parse failure degrading to display-only.

IntelliZen cannot prove:

- provider-wide compatibility;
- future CLI version compatibility;
- Sogo's conformance level;
- capabilities not exercised by a recorded trace.

### 4. Evidence-lite context packs

Accepted.

IntelliZen may prove:

- which sources were selected;
- each source version or revision when available;
- retrieval time and content hash;
- the hash of the exact rendered bytes passed to the adapter;
- declared omissions, redactions, and budget failures.

IntelliZen cannot prove:

- Sogo's complete trust taxonomy;
- authoritative token accounting across providers;
- full stale-after behavior;
- reconstruction when an authoritative source cannot be recovered from its recorded version.

### 5. No hash-chained event ledger

Accepted.

IntelliZen may prove:

- a transition and its receipt committed together;
- normal callers cannot update or delete `workspace.work_events`;
- a known run can be inspected as an ordered event history.

IntelliZen cannot prove:

- tamper evidence against database administrators;
- cryptographic event ordering;
- agent signatures;
- ledger integrity after privileged out-of-band database action.

### 6. Admin-plane agents hold broad database access

Accepted and strengthened by Gate 0 inventory.

IntelliZen may prove:

- runner-created Codex sessions do not inherit global Codex MCP servers or auth;
- worker configs expose only the generated worker-plane MCP;
- forbidden environment variable names and admin config paths are absent;
- an in-session probe cannot discover or call admin tools.

IntelliZen cannot prove:

- roster enforcement against Adam-equivalent admin-plane agents;
- containment of a process that regains the interactive user's config or credentials;
- safety of broad Claude, Codex, or Hermes interactive profiles;
- OS-user separation.

### 7. Single operator, no multi-user authorization

Accepted.

IntelliZen may prove:

- role, occupant, binding, and assignment correlation inside one operator's system;
- owner-gate and delegation policy behavior within the runner;
- human approval attributed to the local operator contract.

IntelliZen cannot prove:

- authentication or authorization between humans;
- tenant isolation;
- revocation across users or devices;
- non-repudiation of human identity.

## Additional properties IntelliZen may prove after Gate 7

- Missing role occupant blocks without fall-through.
- Runtime completion never renders as verification.
- Independent-agent verification is granted only to distinct runner-created assignments.
- A prompt-injection string in a selected source does not widen mediated authority.
- A secret canary is rejected before a durable write.
- A consequential transition cannot occur twice under duplicate dispatch.
- Approval applies only to the exact payload hash reviewed by Adam.
- Three consecutive clean executions can complete without manual context copying.

## Properties that remain outside the claim

- Sogo rooms, packs, plugin lifecycle, sync, or public multi-tenant product behavior.
- Full GenUI convergence.
- Remote SSH runtime security.
- Long-lived local execution after IntelliZen exits.
- Durable multi-runtime transcript ownership.
- Cryptographic actor identity.
- Protection from an administratively privileged interactive agent.
- Any external-send safety beyond IntelliZen's mediated path.

## Gate 7 claim rule

Sogo may cite a property only when:

1. the property names a Gate 4 or Gate 5 assertion;
2. the assertion has an inspectable transition receipt and test artifact;
3. the exact adapter and CLI version are recorded;
4. three consecutive clean Gate 4 runs pass;
5. the complete Gate 5 forced-failure suite passes.

If any condition is absent, the result is an implementation observation, not Sogo evidence.

## Next most valuable evidence

The first decisive evidence is not a UI screenshot. It is a Gate 1 RPC test showing that a legal transition and its receipt commit together while a stale fencing token, wrong expected version, duplicate idempotency key, and changed approved payload all fail in the intended direction.
