# Fable 5.1 completion audit

Audited 2026-09-03 against `ROADMAP.md`, the committed Wave 1 tree, the
assembled native release, and current local runtime state. This document is an
evidence index, not a substitute for Adam's three acceptance days.

## Verdict

**Not complete.** The rebuilt `.app` passed the repaired project-room walk
after `1354a85` and the pinned Hermes session-page fix in `69625a9`. Final
artifacts and automated gates are green, but Adam rejected the resulting claim
that the full app was finished. The app-finished gate is therefore open while
the user-visible completion audit continues. The unchanged ten-line scene on
three separate calendar days remains later; readiness and completion walks do
not count as Day 1.

## Stage-by-stage evidence

| Stage | User-visible outcome | Authoritative evidence | Status |
| --- | --- | --- | --- |
| 0.1 | Flavors, accents, and appearance | `ROADMAP.md` Phase 0 walk, 2026-09-02 | Used in built app |
| 0.2 | Hierarchy tree and row operations | `ROADMAP.md` Phase 0 walk, 2026-09-02 | Used in built app |
| 0.3 | Selection controls the center surface | Native walk in the rebuilt `.app`: Files, Board, Data and Sessions rendered; Data opened its linked Operations record. Sessions' discovered 422 was repaired at `69625a9` and the rebuilt surface passed. | Used in built app |
| 0.4 | Three-panel shell, collapse, focus, shortcuts | `ROADMAP.md` Phase 0 walk, 2026-09-02 | Used in built app |
| A.1 | App attaches to Hermes and names the engine | `ROADMAP.md` Phase A walk, 2026-09-02 | Used in built app |
| A.2 | Streaming Hermes turn in the panel | `ROADMAP.md` Phase A walk, 2026-09-02 | Used in built app |
| A.3 | Inline approval with real choices | `ROADMAP.md` Phase A walk, 2026-09-02 | Used in built app |
| A.4 | Pinned Hermes parity boundary | `docs/verification/wave-1-release.md` | Proved at pinned source |
| B.5 | Hermes and ACP agents in one roster/panel | `docs/verification/wave-1-walk.md` | Used in built app |
| B.6 | Agent editor and team sheet | `docs/verification/wave-1-walk.md` | Used in built app |
| B.7 | Mixed Hermes/ACP room in the right panel | `docs/verification/wave-1-walk.md` repair verification | Used after repair |
| B.8 | Attention remains ordinary database/kanban data | `docs/verification/wave-1-walk.md` | Confirmed by Adam |
| C.9 | Eject, HUD, redock, collapse/expand | `docs/verification/wave-1-walk.md` | Used in built app |
| C.10 | Voice into the composer | `docs/verification/wave-1-walk.md` repair verification | Adam confirmed real-time behavior |
| C.11 | Direct message and plugin actions | `docs/verification/wave-1-walk.md` repair verification | Used after repair |
| D.12 | Generic local plugin contract | `docs/verification/wave-1-walk.md` and D.13 fixture proof | Used in built app |
| D.13 | Route, sidebar, widget, command, panel action, isolated failure | `docs/verification/wave-1-walk.md`; `docs/verification/wave-1-release.md` | Used and verified |
| D.14 | Approval before an agent-authored plugin loads | `docs/verification/wave-1-capability-examples.md` | Recorded example |
| D.15 | Shared chart kit on live database data | `docs/verification/wave-1-walk.md` | Used in built app |
| E.16 | Accept/reject proposal hunks | `docs/verification/wave-1-walk.md`; exact-file preflight retained after Adam declined a redundant repeat | Roadmap-accepted |
| E.17 | Schedule through Hermes; ordinary workflow records | Cron job `9c1e6c93e398`; Workflow Run `f33278cb-85aa-48e7-bdcc-a8ef054d357c`; `docs/verification/wave-1-release.md` | Scheduler-fired proof passed |
| E.18 | Add a linked Graph snapshot directly to Docs | `docs/verification/wave-1-walk.md` repair verification | Used after repair |

## Definition-of-done audit

| Requirement | Proof | Result |
| --- | --- | --- |
| 1. Every stage used in a built `.app` and dated | Phase 0.3 exact-app repair walk completed 2026-09-03; the other dated stage evidence is listed above. | Complete |
| 2. Six agent capability examples | `docs/verification/wave-1-capability-examples.md` names the corresponding native action, record, delegation, approval, room, or plugin proof. | Complete |
| 3. Donor retired; old workers removed; Intel cases retained | `docs/verification/hermes-app-reference-retention.md`; current tree has no `runtimes.rs`, `runtime_bindings.rs`, or `runtime_auth.rs`; release evidence records 16 legacy projects and 9 investigations in 23 project nodes. | Complete |
| 4. Smoke, parity, `.app`, and DMG | The local smoke and parity gates are green after the Phase 0.3 repair. The `.app` and DMG were rebuilt, signed ad hoc, verified, scanned, and recorded below. | Complete |
| 5. Unchanged scene on three separate days | The approved script and line-by-line readiness are in `ROADMAP.md` and `docs/verification/wave-1-acceptance-readiness.md`. | **0 of 3 days recorded** |

## Current assembled state

- Source completion commit: `69625a9`
- Evidence reconciliation commit: `4d7d9b3`
- Final executable SHA-256:
  `954a92b602e65c6994c52e9a033543be9798110caaf9e88dc015dc9987263b53`
- Final DMG SHA-256:
  `d7f0a6e3194c0c9f4fdc6fdd6e14d41f7871717a7e380b50c67a480964f7e4f6`
- Current runtime readback: one exact release IntelliZen process (`13144`);
  zero retired donor UI processes; Fiona's independent launch agent is running.
- Scheduled proof readback: job `9c1e6c93e398` is paused with no running claim
  or last error after Adam rejected the app-finished classification.
- Continuation: thread heartbeat `intellizen-fable-5-1-acceptance` is paused.

## Acceptance-day ledger

| Day | Calendar date | Ten-line scene | Evidence | Result |
| --- | --- | --- | --- | --- |
| 1 | — | Not yet recorded | — | Pending |
| 2 | — | Not yet recorded | — | Pending |
| 3 | — | Not yet recorded | — | Pending |

Do not pre-count readiness checks, automated tests, individual stage walks, or
the 2026-09-03 scheduler proof as one of these three full-scene days.
