# Stage 6 — Integrated exact-app acceptance

Date: 2026-07-28

Exact artifact:

- `/Users/adamking/projects/intellizen-app/src-tauri/target/debug/bundle/macos/IntelliZen V2 Dev.app`
- bundle identifier `com.genzen.intellizen.v2dev`
- branch `v2-integration`

## Twelve task results

1. **Settings/runtime truth — passed.** Codex and Claude show installed, supported, authenticated, bound, assigned, and usable as separate facts. Codex is usable and assigned to Chief Engineer. Claude is bound and authenticated but unassigned. Supabase and local MCP are ready; Hermes API is ready and its gateway is unavailable. Screenshot: `01-settings-runtimes.png`.
2. **Team truth — passed.** Team identifies Fiona, Keel, Adam, the unstaffed Verifier role, and Claude's unassigned binding. Screenshot: `02-team-role-map.png`.
3. **Reviewed agent creation — passed without write.** `Local Preview Agent` reached the exact review payload and was cancelled with `Cancel without write`.
4. **Role reassignment propagation — passed without production write.** The local review overlay assigned Verifier to Keel and `codex-local-primary`; Team and the mounted Agent Panel updated without reload. The overlay was then cleared. Screenshot: `02-team-local-overlay.png`.
5. **Fiona route-context evidence — passed using the existing exact-app receipt.** The Fiona/Keel conversation timeline retains immutable `/home` context on the sent turn. A new Fiona send was intentionally not performed because the live Hermes gateway was unavailable and queueing it would mutate production Supabase, which this completion run forbids.
6. **Keel runtime label — passed.** Chief Engineer shows `Keel · codex-cli · ephemeral`.
7. **Verifier blocker — passed.** Verifier shows `Unavailable · No eligible occupant and runtime binding`; its composer is disabled.
8. **Seven-step topology and dry-run — passed.** The proof graph exposes action, handoff, decision/branch, verification, approval, artifact, blocked, and complete structures. Dry-run reports `dispatches nothing` and passes role, approval, and graph checks. Screenshots: `05-workflow-designer.png`, `05-workflow-dry-run.png`.
9. **Proof run active-work link — passed using the existing canonical proof run.** The current-work link opens run `783bc6a3-ccea-43d5-a816-6fa2e60e7df6`. A duplicate run was intentionally not created because that would violate the no-production-mutation boundary.
10. **Run state separation — passed.** The live topology shows execution blocked, receipt pending, approval approved, verification completed, and overall completion not recorded as distinct states. Screenshot: `05-workflow-live-run.png`.
11. **Eject/re-dock continuity — passed.** The standalone `tauri://localhost/agent-panel` window and reattached panel preserve role, conversation, route context, and canonical active work after query resolution. Screenshots: `03-panel-active-work.png`, `03-panel-standalone.png`.
12. **SOP-only exclusion — passed.** The live registry splits 5 executable from 13 SOP-only records. `GenZen Daily Newsfeed` exposes no Design or run control, and the Agent Panel picker lists only the sole runnable proof workflow. Screenshot: `04-workflow-sop-only.png`.

## Automated acceptance

- Historical integrated-acceptance snapshot at `4807c0b`: `pnpm test` — 213 passed, 1 skipped.
- `pnpm --dir mcp-server build` — passed.
- `pnpm --dir mcp-server test` — 12 passed.
- `VITE_INTELLIZEN_LOCAL_ACCESS_KEY= pnpm smoke` — passed.
- Rust — 19 passed.
- `./scripts/check-bundle-secrets.sh dist` — no Supabase service-role JWT found.

## Mutation and release audit

Final read-only Supabase counts:

- Workflow Registry: 18.
- Workflow Runs: 30.
- Agents: 3.
- Role Assignments: 3.
- Records created on 2026-07-28 in those four databases: 0.

No roster, workflow, run, approval, receipt, or runtime-binding record was added or updated. No push, PR, merge, deploy, publish, DMG build, or production app replacement occurred. `/Applications/IntelliZen.app` was not touched.

The three production-backed Gate 7 runs remain valid operational evidence.
They are not an automated regression gate: the generated `dist/` artifact was
ephemeral and no current test recreates those exact production-backed runs.
