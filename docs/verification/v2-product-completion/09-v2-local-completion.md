# IntelliZen V2 local completion

Date: 2026-07-28

Branch: `v2-integration`

Scope: local implementation and verification only

## Outcome

The local V2 completion contract is satisfied. The audit remediation baseline,
structural seams, workflow definition identity and drift model, isolated SQL
contracts, safe Gate 4 proof, portable runtime-binding setup, production web
bundle, and unsigned debug `.app` were completed and verified.

No production migration, shared-database schema mutation, credential rotation,
push, PR, merge, DMG, signing, deployment, publication, release, external send,
or replacement of `/Applications/IntelliZen.app` occurred.

## Checkpoints and commits

- `b781884` — harden V2 runtime authority and migrations
- `715a34a` — close V2 workflow and runtime audit findings
- `3ddda1b` — establish V2 structural ratchets
- `115c124` — record the audit-remediation baseline
- `32e4a13` — complete the Agent Panel, data, and graph structural seams
- `e28d243` — complete workflow definition identity, snapshots, and drift
- `3d2e540` — close isolated verification and runtime portability gaps

The working tree was inspected before preservation; all pre-existing V2 work
was retained and checkpointed rather than overwritten.

## Automated verification

All commands below were run from
`/Users/adamking/projects/intellizen-app` against the final implementation.

| Command | Result |
| --- | --- |
| `pnpm check` | Passed; TypeScript clean and 321-file size inventory accepted with 15 lowered legacy ratchets |
| `pnpm test` | Passed; 277 tests, 1 intentionally skipped opt-in live harness |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Passed; 25 tests |
| `pnpm --dir mcp-server test` | Passed; 12 tests |
| `pnpm --dir mcp-server build` | Passed |
| `pnpm verify:gate4-safe` | Passed; 20 hermetic runner tests, no network, database, subprocess, or external action |
| `pnpm verify:sql-contracts` | Passed; all migrations replayed into a disposable loopback PostgreSQL cluster and 3/3 rollback-only authority contracts passed |
| `VITE_INTELLIZEN_LOCAL_ACCESS_KEY= pnpm smoke` | Passed; file-size gate, TypeScript, clippy with warnings denied, production Vite build, and 25 Rust tests |
| `./scripts/check-bundle-secrets.sh dist` | Passed; no service-role JWT found |
| `VITE_INTELLIZEN_LOCAL_ACCESS_KEY= pnpm tauri build --debug --bundles app --no-sign` | Passed |
| `./scripts/check-bundle-secrets.sh src-tauri/target/debug/bundle/macos/IntelliZen.app` | Passed; no service-role JWT found |
| `git diff --check` | Passed |

The SQL runner creates its own `mktemp` cluster, uses an explicit Unix socket
and random local port, supplies no shared-project URL or credential, stops the
server on exit, and guards its recursive cleanup target.

The safe Gate 4 command exercises the real runner contract through in-memory
ports. The separate live-provider harness remains opt-in behind
`RUN_GATE4_LIVE=1`.

## Native acceptance

Artifact:

`/Users/adamking/projects/intellizen-app/src-tauri/target/debug/bundle/macos/IntelliZen.app`

- Mach-O: arm64, ad-hoc linker signature, no Team identifier
- executable size: 49,137,336 bytes
- executable SHA-256:
  `df5726298085ce69997dce4b4cc4dd7c2029eb30294c1e61688c9360a6e13791`

The exact bundle above was launched directly. `/Applications/IntelliZen.app`
was not touched.

Observed in the rebuilt native app:

- Home loaded with the integrated Agent Panel and route context.
- Settings reported Codex as installed, supported, authenticated, bound, and
  assigned; Claude remained visibly unassigned rather than falling through.
- Team loaded the canonical four-role authority map, runtime availability,
  current work, and the unstaffed Verifier state.
- Workflows loaded 5 executable definitions and 13 SOP-only records.
- The designer rendered one seven-step definition model shared by the outline
  and topology.
- `Validate / dry-run` rendered every step ready and the explicit
  `DRY-RUN · DISPATCHES NOTHING` result.
- A blocked live run rendered execution, receipt, approval, verification,
  artifact, blocked terminal, and incomplete terminal as separate states.
- Existing historical run `624a68c7-8110-439c-a8b8-cca1ffeb8647` rendered real
  definition drift from v1 to v2 with `Preserve snapshot`, `Clone as v3`,
  `Review migration`, and `Reject upgrade`.
- `Preserve snapshot` produced the local response that the run remains pinned
  to its immutable snapshot. No Registry or run record changed.

Reference screenshots from the prior exact-binary acceptance baseline remain:

- `01-settings-runtimes.png`
- `02-team-role-map.png`
- `03-panel-active-work.png`
- `05-workflow-designer.png`
- `05-workflow-dry-run.png`
- `05-workflow-live-run.png`
- `v2-audit-native-receipt-integrity.png`

The final acceptance surface was observed through native accessibility
readback. The Computer Use runtime did not expose a persistable screenshot for
this final bundle, so no new image is claimed.

## Structural inventory

| File | Final lines | Ratchet |
| --- | ---: | ---: |
| `src/components/layout/agent-panel.tsx` | 1,618 | 1,618 |
| `src/components/agent/use-agent-panel-conversation.ts` | 991 | below general exception threshold |
| `src/lib/data.ts` | 5,427 | 5,427 |
| `src/views/Graph.tsx` | 3,561 | 3,561 |
| `mcp-server/src/index.ts` | 5,377 | 5,377 |

The Agent Panel now has independently tested conversation, cancellation,
resize cleanup, clipboard fallback, persistence, and mounted-state behavior.
Graph model calculations and control rendering moved behind direct modules;
the remaining legacy modules are ratcheted and were not cosmetically split.

## Runtime portability

New bindings start with no implicit workspace grant. Settings requires the
operator to review an absolute working-directory grant before creation.

Worker-profile preparation:

- validates the configured Node executable and MCP build;
- otherwise discovers Node from `PATH` or standard install locations;
- discovers the one canonical MCP build only at an exact reviewed grant,
  current directory, or executable parent;
- rejects an MCP build found above a reviewed grant;
- resolves dependencies before either the binding store or profile is written;
- retains the worker-only MCP allowlist and provider-owned profile boundary;
- fails with actionable `INTELLIZEN_WORKER_NODE_BINARY` or
  `INTELLIZEN_MCP_BUILD` guidance when discovery cannot succeed.

Historical one-shot Gate 3/5/6 proof scripts still contain host-specific paths.
They are not shipped code, are not package-script gates, and were left as
historical receipts rather than expanded into a second portability project.

## Adversarial consensus

Fresh read-only Claude Code session:
`5fc85890-1464-4c8c-8922-c513a7e821c5`

The same Opus 5 session reviewed the baseline seams, structural remediation,
definition/instance drift model, and verification/portability checkpoint. Its
Checkpoint 4 review reproduced the test gates and returned
`VERDICT: APPROVE` with no P1/P2 findings.

One P3 discovery concern was repaired: MCP discovery no longer walks ancestors
above a reviewed grant. A matched positive/negative Rust test proves that the
same fixture is accepted at the exact grant and rejected one directory above
it. Opus re-reviewed the correction and returned `VERDICT: APPROVE`.

The final complete-diff review is recorded after this receipt is committed.

## Known boundaries and external gates

- The browser-level Agent Panel integration is covered through happy-dom
  mounted tests. Native dictation and TTS playback were not triggered; doing so
  would add microphone/audio-provider behavior outside this completion scope.
- The opt-in live Gate 4 harness is retained for separately authorized provider
  proof; the safe default is the hermetic 20-test command.
- The historical Gate proof scripts remain machine-specific P3 evidence debt.
- Production application of the pending migrations remains a separately
  reviewed operation.
- Credential rotation remains required before publishing repository history or
  a full-history artifact.
- Push, PR, merge, DMG, signing, deployment, publication, release, and any
  external human-visible action remain separate gates requiring Adam's explicit
  approval.
