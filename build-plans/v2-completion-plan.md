# IntelliZen V2 Completion Plan

**Date:** 2026-07-28
**Status:** Ready for a fresh implementation session
**Build repository:** `/Users/adamking/projects/intellizen-app`
**Branch:** `v2-integration`
**Controlling review:** `docs/verification/v2-product-completion/08-opus-adversarial-consensus.md`

## Fresh-session launcher

Start in `/Users/adamking/projects/intellizen-app` and read, in order:

1. `CLAUDE.md`
2. `build-plans/v2-completion-plan.md`
3. `build-plans/v2-completion-session-contract.md`
4. `docs/verification/v2-product-completion/07-backend-audit-remediation.md`
5. `docs/verification/v2-product-completion/08-opus-adversarial-consensus.md`
6. `/Users/adamking/projects/intellizen-app-v2/docs/audits/v2-backend-code-review-2026-07-28.md`

Then inspect the actual branch, worktree, tests, and local artifact before
acting. The worktree contains the completed audit remediation and has not been
staged, committed, pushed, migrated in production, packaged as a DMG, or
released.

When the fresh session is launched with the short prompt in
`v2-completion-session-contract.md`, that contract supplies approval for
ordinary reversible local work and scoped checkpoint commits. Its excluded
external and destructive actions remain separate gates.

## Starting position

Claude Code Opus 5 and Codex reached full consensus after three adversarial
review passes:

| Dimension | Complete |
|---|---:|
| Amended-audit backend execution correctness | 100% |
| Security hardening | 95% |
| Structural remediation | 60% |
| Test and verification | 95% |
| Full V2 product scope | 82% |

There is no outstanding P0, P1, or P2 defect from the amended backend/code
audit. The remaining work is structural and product completion plus separate
production/release gates.

## Rules that remain in force

- Preserve native-only local Supabase access and worker isolation.
- Preserve transactional workflow transitions, append-only receipts,
  idempotency, fencing, verifier separation, and payload-bound approvals.
- Empty model allowlists remain deny-all.
- `append_record_section`, `confirm_write`, and R11 human-only external sends
  remain acceptance contracts.
- Do not raise file-size ratchets to make a change pass.
- Do not apply production migrations, rotate credentials, rewrite git history,
  push, open a PR, build a DMG, sign, publish, deploy, or release without the
  specific approval required for that action.
- A green linter is not completion. Close the relevant rendered/native and
  behavioral verification loop for each pass.

## Pass 0 — Preserve the consensual baseline

### Work

1. Inspect the complete current diff, including untracked files and deletions.
2. Re-run the baseline verification commands.
3. Propose reviewable checkpoint groups:
   - security and migrations;
   - workflow/runtime correctness;
   - structural extraction and tests;
   - documentation and verification receipts.
4. Create commits only after the requested checkpoint scope is confirmed. The
   activated completion-session contract counts as that confirmation for its
   scoped local checkpoint groups.

### Exit

- The current remediated state is reproducible and reviewable.
- No unrelated user work is overwritten.
- The branch has a clear checkpoint before new structural/product work begins.

## Pass 1 — Finish structural remediation

### 1A. Agent Panel

- Reduce `src/components/layout/agent-panel.tsx` from 2,371 lines to
  approximately 1,800 or less by extracting coordination rather than moving
  markup cosmetically.
- Move orchestration state/effects, active-work coordination, runtime/session
  lifecycle, and remaining message-command logic behind focused modules.
- Keep persistence, chat transport, and voice seams independent.
- Add an integrated mount test of the real Agent Panel coordinator, including
  provider/query mocks and collapsed, docked, standalone, blocked, unavailable,
  error, and cancellation behavior.

### 1B. Data access

- Continue moving complete domains out of `src/lib/data.ts`.
- Preserve the existing public import surface while consumers migrate.
- Keep record mutation, receipt, workflow, OSINT, and query responsibilities
  separately testable.
- Ratchet the legacy file budget downward after every extraction.

### 1C. Graph

- Split `src/views/Graph.tsx` into data/query, layout, rendering, selection, and
  inspector modules.
- Preserve current behavior and the explicit distinction between the Graph
  surface and the xyflow-based workflow topology surface.

### Exit

- Agent Panel coordinator is at or below the new ratchet.
- A test imports and mounts the integrated panel.
- `data.ts` and `Graph.tsx` are materially smaller, with lower ratchets.
- Full tests, TypeScript, Clippy, production build, and native smoke pass.

## Pass 2 — Complete the workflow product model

### Work

- Move the workflow designer onto the shared topology model used by execution
  visualization.
- Establish an explicit definition-versus-instance boundary.
- Persist a definition version or hash on every run snapshot.
- Detect definition drift without mutating historical run truth.
- Specify and implement the allowed operator responses to drift:
  - preserve the running snapshot;
  - clone into a new definition version;
  - migrate only through an explicit reviewed operation;
  - reject unsafe implicit upgrades.
- Cover topology editing, snapshot preservation, drift detection, and each
  allowed response with unit and rendered tests.

### Exit

- Designer and execution topology use one canonical model.
- Historical runs remain reproducible after a definition changes.
- Definition drift is visible and requires an explicit safe resolution.
- No definition edit silently changes an existing run instance.

## Pass 3 — Close verification and portability gaps

### Work

- Create a disposable local/test Supabase runner for:
  - `supabase/tests/v2_gate1_schema_contract.sql`;
  - `supabase/tests/v2_gate1_workflow_contract.sql`;
  - `supabase/tests/v2_audit_receipt_contract.sql`.
- Wire that runner into a named local verification command; do not point it at
  production by default.
- Make Gate 4 repeatable without relying solely on
  `RUN_GATE4_LIVE=1`, while retaining a safe default that performs no external
  action.
- Replace machine-specific runtime binding paths with validated discovery or
  reviewed configuration. Missing paths must fail loudly and diagnostically.
- Rebuild the unsigned local `.app` and repeat rendered/native acceptance.
- Run another independent adversarial review against the final diff.

### Exit

- SQL authority contracts execute automatically against an isolated database.
- Gate 4 has a repeatable safe proof path.
- Runtime binding setup is portable across supported machines.
- Automated and native verification agree on the final behavior.

## Pass 4 — Security and production readiness

This pass contains actions with separate authority and must not be inferred from
approval of earlier passes.

### Release-history gate

- Rotate the historical local-access credential before publishing the
  repository or any full-history artifact.
- Decide separately whether git-history remediation is required.
- Treat history rewriting as destructive work with its own reviewed plan and
  approval.

### Production migration gate

- Review the two pending migrations:
  - `20260728114149_harden_append_only_receipt_permissions.sql`;
  - `20260728115305_transactional_consequential_work_receipts.sql`.
- Perform a read-only production preflight and print affected objects/counts.
- Apply only after explicit approval.
- Immediately run `supabase/tests/v2_audit_receipt_contract.sql` against the
  target database.
- Read back grants, function configuration, append-only permissions, and
  application behavior.

### Exit

- Historical access credential is rotated before publication.
- Pending migrations are either explicitly approved and verified or remain
  visibly pending.
- No production or release claim depends on an unexecuted contract.

## Pass 5 — Final acceptance and handoff

Run from `/Users/adamking/projects/intellizen-app`:

```bash
pnpm check
pnpm test
pnpm --dir mcp-server test
pnpm --dir mcp-server build
VITE_INTELLIZEN_LOCAL_ACCESS_KEY= pnpm smoke
./scripts/check-bundle-secrets.sh dist
VITE_INTELLIZEN_LOCAL_ACCESS_KEY= pnpm tauri build --debug --bundles app --no-sign
git diff --check
```

Also complete:

- native rendered acceptance of Home, Settings, Team, Workflows, Agent Panel,
  workflow designer, topology, drift handling, and diagnostics;
- secret scan of both `dist/` and the exact debug app;
- final file-size inventory and ratchet readback;
- final independent adversarial review;
- a durable completion receipt with exact commands, counts, artifact path,
  known limitations, and external gates.

## Definition of local implementation complete

Local V2 implementation is complete only when:

- the structural targets above are closed rather than merely documented;
- the workflow designer and execution topology share one model;
- definition/instance drift is implemented and tested;
- the integrated Agent Panel is mounted in tests;
- SQL authority contracts run against an isolated database;
- Gate 4 has a repeatable safe proof path;
- runtime bindings are portable;
- all automated, native, secret-safety, and adversarial checks pass.

Production application, push, PR, DMG, signing, deployment, publication, and
release remain separate actions after local implementation completion.

## Expected effort

Estimate: four to six focused engineering days before production/release
approval work. Structural remediation is the largest uncertainty and should be
completed before the final workflow model is built into the remaining legacy
coordinators.
