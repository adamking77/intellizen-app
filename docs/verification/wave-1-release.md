# Wave 1 local release evidence

Collected 2026-09-03 for the Fable 5.1 Done list.

## Source

- Branch: `v3/phase-0`
- Roadmap base: `063de674171dddfb561a052308d9f4c9d981f8a3`
- Wave 1 completion commit: `23182215da9047ef133a54029dcb7a175fe30807`
- Phase 0.3 project-room repair: `1354a85`
- Pinned Hermes session-page repair found by the exact-app walk: `69625a9`
- Native Supabase bodyless-response repair found by the live Sogo project link:
  `a3c2dd9`
- Canonical MCP hierarchy read added after the live completion audit; the
  rebuilt server exposes 65 tools and `list_hierarchy` read back 29 live nodes
- App-finished gate: open after Adam rejected the earlier completion claim
- State: local on `v3/phase-0`; not pushed
- Distribution status: local-only; the build contains Adam's local access key
  and is not a publishable artifact

## Artifacts

| Artifact | Bytes | Built | SHA-256 |
| --- | ---: | --- | --- |
| `src-tauri/target/release/bundle/macos/IntelliZen.app/Contents/MacOS/intellizen` | 10,698,160 | 2026-09-03 17:04:08 +04 | `ec4699b7318d7d6f25feb39fe9831e708f641478c5f4d4d092de392b8a1fcf97` |
| `src-tauri/target/release/bundle/dmg/IntelliZen_0.1.1_aarch64.dmg` | 5,809,291 | 2026-09-03 17:04:29 +04 | `6241add3a91ef12c98091e4031f9f491337e78b45effb8a9223f5c57e73aa7e3` |

Exactly one IntelliZen process (`19132`) was running when this receipt was collected,
from the `.app` above.

The final completion audit also found and quit one stray process from the
retired donor `Hermes Workspace.app`. Readback then showed zero donor UI
processes, one IntelliZen release process, and the separate Fiona gateway still
running. The donor repository itself remains untouched in its reference path.

Native accessibility readback from that exact app showed the complete Wave 1
navigation and the engine status help text ending in `IntelliZen v0.1.1`.
This closes the stale sidebar label that previously claimed v0.4.0.

The same exact-app walk selected **Agama Yoga Rebrand Watch** in the tree and
proved the repaired center rule. Files rendered its document state; Board
rendered the project-folder linkage state; Data found **Spec Op: Shadow Lotus**
in Operations and opened that exact record; Sessions initially exposed a real
422 caused by the old 2,000-row request, then passed after `69625a9` rebuilt the
client around Hermes's 500-row page contract. The final Sessions state was the
correct folder-aware empty state because this project currently has no folder.

A later live project-room pass added the real `Gokart Studio / Sogo / Sogo V3`
hierarchy, linked its repository folder, and read back 53 Hermes board cards and
233 matching session histories. The folder link committed but initially showed
a false failure because the native Supabase adapter put a body on a successful
`204` response. `a3c2dd9` repaired all bodyless statuses and added a regression;
a rename/restore mutation then completed in the rebuilt app with no false error.
Adam chose to leave the current Sessions-history interaction unchanged until
post-completion workflow-led redesign.

## Gates

- `ALLOW_LOCAL_ACCESS_KEY_BUILD=1 pnpm smoke`: passed
- Frontend: 392 passed, one intentional skip
- Rust: 39 passed, two intentional live/manual ignores
- Pinned Hermes gateway parity: 26/26 passed
- D.13 installed fixture and broken-plugin isolation: passed
- Six agent capabilities: one recorded example each in
  `wave-1-capability-examples.md`
- Service-role JWT scan: passed against `dist/`, the `.app`, and the DMG
- Strict ad-hoc code-sign verification: passed for the `.app` and the copy
  mounted from the DMG; `hdiutil verify` passed for the DMG
- Gatekeeper assessment: expected unsigned rejection (`spctl` exit 3), with
  no resource-seal error
- Native Hermes REST transport regression: targeted test passed; the release
  app loaded cron jobs through Tauri's native HTTP bridge rather than a
  browser request blocked by Hermes's absent CORS preflight support
- Live hierarchy: 23 projects; all 16 legacy projects and all 9 investigations
  present; no duplicate legacy-project mapping
- Canonical MCP hierarchy contract: `list_hierarchy` is exposed in both the
  admin registry and reviewed read-only worker allowlist; a direct admin probe
  returned 29 total nodes and Sogo V3's exact linked folder; the worker registry
  exposed 12 reviewed tools including `list_hierarchy`
- Full `ALLOW_LOCAL_ACCESS_KEY_BUILD=1 pnpm smoke` rerun after `5ba8c21`:
  passed, including product contracts, TypeScript, production frontend build,
  strict Clippy, and all non-ignored native tests

## Completed local workflow evidence

- The four user-workflow repairs in `wave-1-walk.md` were approved,
  implemented, and verified. Adam confirmed live composer transcription; the
  native walk also proved panel room placement, direct plugin actions, and the
  Graph-to-Docs write/open path.
- `~/projects/hermes-app` remains exactly where it is as the retained reference
  donor and is not an active IntelliZen runtime path. The decision is recorded
  in `hermes-app-reference-retention.md`.
- The release app created Hermes cron job `9c1e6c93e398` for **V2 Gate 4
  role-directed proof** under profile `fiona`, daily at `07:00`. Direct REST
  readback returned it enabled with next run `2026-09-04T07:00:00+04:00` and
  the correct workflow id in its prompt.
- A manual `Run now` transport preflight completed Hermes session
  `cron_9c1e6c93e398_20260903_130823`, but exposed an execution-contract defect:
  the agent reconstructed the low-level dispatcher, wrote helper files, and ran
  tests even though this workflow forbids them. Workflow Run
  `2037e833-8b95-4514-847a-a7ad730271a8` is therefore recorded as **Blocked**;
  it is not acceptance evidence.
- The same cron job was corrected in place. Its saved prompt now explicitly
  requires the public workflow MCP path, forbids source inspection, dispatcher
  reconstruction, raw SQL, helper files, and unrequested tests, and ends the
  scheduled turn after requesting an approval instead of waiting in process.
- Adam rejected an overnight wait as the proof strategy, so the job was moved
  to an immediate scheduled occurrence. The 14:07 run exposed an unresolved
  `${env:SUPABASE_SERVICE_ROLE_KEY}` placeholder in Fiona's scheduled MCP
  environment and correctly created no Workflow Run. That failed proof does
  not count. Fiona's IntelliZen config now omits the unresolved override and
  lets the canonical wrapper/server load the repository credential; a real
  `list_workflows` call through that exact wrapper then returned the Gate 4
  workflow.
- The same job fired from the scheduler again at 14:13. Hermes execution
  `f3a77ae6af3d4ee3b062b9d348f75096` and session
  `cron_9c1e6c93e398_20260903_141318` completed cleanly. Ordinary Workflow Run
  `f33278cb-85aa-48e7-bdcc-a8ef054d357c` reached **Needs approval** after the
  independent verifier passed the draft-conformance check. Seven state-change
  receipts are present; no tests, application-file writes, external evidence,
  external action, or simulated action occurred.
- The cron job was restored to `0 7 * * *`. Final scheduler readback returned
  `scheduled` and enabled, next run `2026-09-04T07:00:00+04:00`, last status
  `ok`, with no in-flight claim or last error.
- Later state update, 2026-09-03: Adam directed that acceptance begin only
  after the app is functionally finished. Job `9c1e6c93e398` now reads
  `enabled: false`, `state: paused`; the proof evidence above remains valid.
- App-finished state update, 2026-09-03: after the final native gate and
  artifacts passed, the existing job was resumed without changing its schedule
  or prompt. Readback returned `enabled: true`, `state: scheduled`, next run
  `2026-09-04T07:00:00+04:00`, with no running claim or last error. This starts
  the post-completion observation track; it does not count an acceptance day.
- Correction, 2026-09-03: Adam rejected the claim that the full app was
  finished. The job and heartbeat were immediately paused again. Cron readback
  returned `enabled: false`, `state: paused`, no running claim and no last
  error. Acceptance remains 0 of 3 days.
- The Fiona gateway had one separate stale binding: its profile config pointed
  at Isla's wrapper, whose server path no longer exists. Fiona's config now
  points to her documented wrapper at
  `~/.hermes/profiles/fiona/mcp-servers/intellizen/run.sh`; that wrapper executes
  this repository's single `mcp-server/dist/index.js` build. After restarting
  only the idle Fiona gateway, `hermes --profile fiona mcp test intellizen`
  connected and discovered all 64 tools. A direct read-only `list_workflows`
  call through that exact wrapper returned 19 workflows and included
  `v2-gate4-role-directed-proof`, proving database access as well as schema
  discovery before the scheduled write-bearing run. Live process readback
  then showed the restarted Fiona gateway holding its own wrapper watchdog and
  this repository's MCP server as its child process, rather than Isla's stale
  server path. Fiona's profile exclusion policy leaves `start_workflow`,
  `update_workflow_run`, and `request_workflow_approval` exposed, so every tool
  named by the corrected scheduled prompt is available at turn time. The
  executed `mcp-server/dist/index.js` is newer than every file under
  `mcp-server/src`, the MCP tree has no unbuilt source change, and the compiled
  artifact contains all three workflow handlers.
- Scheduling does not depend on IntelliZen's window or its attached `hermes
  serve` process. `ai.hermes.gateway-fiona` is an active `KeepAlive` and
  `RunAtLoad` launch agent, and the app deliberately disables its second cron
  ticker to avoid duplicate firing. Hermes's built-in ticker selects past-due
  jobs on its next cycle, so a sleeping Mac catches the run after wake. Like
  every local scheduler, it cannot execute while macOS itself is suspended.
- The user-visible close/reopen lifecycle was exercised against the final
  release app: **Hide window** removed the main window while release PID
  `86743`, Fiona gateway PID `21442`, and enabled cron job `9c1e6c93e398`
  remained alive. Reopening returned that same app process to Home; no second
  IntelliZen instance was launched.

## Fable Done audit

| Requirement | Evidence | Status |
| --- | --- | --- |
| 1. Every stage used by Adam in a built app | Phase 0, Phase A, and Wave 1 walks are dated in `ROADMAP.md`; repaired interactions are in `wave-1-walk.md`. E.17 passed through the live scheduled run and approval receipt above. | Complete. |
| 2. Six agent capabilities have examples | `wave-1-capability-examples.md` plus the matching Tasks receipt. | Complete. |
| 3. Donor retired, old workers removed, Intel cases present | Seven obsolete Rust/TypeScript worker files and their imports are absent. The live hierarchy preserves 16 legacy projects and 9 investigations as project nodes. Adam confirmed the donor remains in place for reference and is not an active IntelliZen runtime path. | Complete. |
| 4. Smoke, parity, `.app`, DMG | Gates and exact artifact identities above. These artifacts were refreshed after the Phase 0.3 repair and do not wait on the three-day acceptance run. | Complete. |
| 5. Same scene on three days | Adam confirmed the script he wrote with Fable; readiness is in `wave-1-acceptance-readiness.md`. | Three days pending. |

## Remaining release boundaries

- The approved acceptance scene must pass unchanged on three separate days.
  Line-by-line readiness is recorded in `wave-1-acceptance-readiness.md`; only
  the three user-run days remain unproved.
