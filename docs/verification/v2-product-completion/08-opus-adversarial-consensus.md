# V2 Opus adversarial review consensus

Date: 2026-07-28
Reviewer: Claude Code `claude-opus-5`
Review session: `3bcdb16a-75cf-4839-a9e8-ac9e4e9c9666`
Scope: amended backend/code audit remediation on `v2-integration`

## Process

The reviewer ran read-only against the amended audit, current tracked and
untracked diff, implementation, migrations, tests, verification receipts, and
V2 spec. Three passes were completed:

1. Initial adversarial review: rejected the work on an app-breaking pending
   migration grant.
2. Re-review after corrections: approved with conditions and withdrew an
   incorrect receipt-loss scenario after inspecting transaction semantics.
3. Final consensus pass: verified every settleable condition, found no new
   P0-P2 defect, and issued `Approve`.

## Defects found and closed

- Both pending receipt migrations revoked `PUBLIC` execution without
  explicitly preserving the native `anon` caller. Both now grant
  `anon, service_role`.
- The migration regression test checked only revocation text. It now asserts
  both positive grants, and
  `supabase/tests/v2_audit_receipt_contract.sql` provides a post-apply
  database-level authority contract.
- Hermes still read the repository `.env.local`. It now reads only the native
  Application Support environment and has a Rust path regression test.
- Active-work identity compared a UUID with persisted string actor forms. It
  now matches the exact record ID, agent key, and display-name forms supplied
  by the canonical role model, with a negative fuzzy/case test.
- Unknown workflow statuses were treated as active. They are now rejected.
- `WorkflowRunStatus` contained `Failed` and `Cancelled`, which the applied RPC
  did not accept and no producer wrote. The type now matches the six persisted
  statuses exactly.
- Hermes poll abort listeners accumulated and workflow dispatch did not carry
  a signal. Listener cleanup now runs on both branches and the signal is
  propagated runner to dispatcher to Hermes.
- Agent Panel structural and render-test claims overstated completion. The
  verification documents now explicitly describe partial extraction and
  presentational state-contract tests rather than an integrated coordinator
  mount.
- The broad `Receipt integrity` label overstated a narrower check. The surface
  now reports `Workflow transition coverage` and states that it detects
  out-of-band or missing versioned transition history, not telemetry,
  consequential section/event writes, or receipt content.

## Consensus completeness

| Dimension | Complete | Denominator |
|---|---:|---|
| Backend execution correctness | 100% | 22 amended-audit actionable findings |
| Security hardening | 95% | 6 security items; historical key rotation remains external |
| Structural remediation | 60% | 5 spec-11 structural targets |
| Test and verification | 95% | 6 identified verification gaps |
| Full V2 product scope | 82% | spec-10 stages 1-5 plus spec-11 exit criteria |

## Agreed complete

- No outstanding P0, P1, or P2 code defect from the adversarial review.
- Receipt RPC caller grants and append-only authority contract are correct.
- Runtime secret loading, auth truth, abort propagation, identity matching,
  typed statuses, retry behavior, and transition-coverage wording are aligned.
- The amended audit's correctness and security findings are resolved in the
  local worktree.
- App, MCP, Rust, type, file-size, build, and secret-safety verification
  surfaces exist and are green.

## Agreed incomplete

- `agent-panel.tsx` remains 2,371 lines and lacks an integrated mount test.
- `data.ts` and `Graph.tsx` remain large ratcheted legacy modules.
- `workflow-designer.tsx` is not yet implemented on the topology model.
- Definition/instance drift is not implemented.
- Gate 4 live proof remains opt-in.
- Supabase SQL contracts are not wired to an automated local database runner.
- Native runtime binding paths remain machine-specific portability debt.

## External gates

1. Rotate the historical local-access credential before publishing the
   repository or any full-history artifact.
2. Obtain explicit approval before applying either pending 20260728 production
   migration.
3. Immediately after any approved application, run
   `supabase/tests/v2_audit_receipt_contract.sql` against the target database.
4. Preserve the existing separate push, PR, DMG, signing, and release gates.

## Final local verification

- `pnpm test`: 53 files passed, 1 skipped; 252 tests passed, 1 skipped.
- `pnpm check`: passed; 307 source files, 15 ratcheted exceptions.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 21 passed.
- `pnpm --dir mcp-server test`: 12 passed.
- `pnpm --dir mcp-server build`: passed.
- `VITE_INTELLIZEN_LOCAL_ACCESS_KEY= pnpm smoke`: passed.
- `scripts/check-bundle-secrets.sh dist`: no service-role JWT found.
- `git diff --check`: passed.
- Current unsigned local debug app:
  `/Users/adamking/projects/intellizen-app/src-tauri/target/debug/bundle/macos/IntelliZen.app`.

No production database write, deployment, publication, push, PR, DMG, signing,
or release was performed during this review.
