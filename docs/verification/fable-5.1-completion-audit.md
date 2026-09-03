# Fable 5.1 completion audit

Audited 2026-09-03 against `ROADMAP.md`, the committed Wave 1 tree, the
assembled native release, and current local runtime state. This document is an
evidence index for the Fable 5.1 completion definition.

## Verdict

**Complete. All four Fable 5.1 Done requirements are verified.**
The rebuilt `.app` passed the repaired project-room walk
after `1354a85`, the pinned Hermes session-page fix in `69625a9`, and the
bodyless Supabase response fix in `a3c2dd9`. The `.app` and DMG have now been
refreshed and verified from that source. The remaining user-visible audit is
complete: every top-level route rendered once without a page-level failure,
the live Sogo project room read its real Board and Sessions data, and the D.13
proof fixtures were retired from the active product without deleting the
evidence.

## Stage-by-stage evidence

| Stage | User-visible outcome | Authoritative evidence | Status |
| --- | --- | --- | --- |
| 0.1 | Flavors, accents, and appearance | `ROADMAP.md` Phase 0 walk, 2026-09-02 | Used in built app |
| 0.2 | Hierarchy tree and row operations | `ROADMAP.md` Phase 0 walk plus canonical MCP readback: `list_hierarchy` returned 29 live nodes and Sogo V3's exact linked folder. | Used in built app and visible to MCP agents |
| 0.3 | Selection controls the center surface | Native walk in the rebuilt `.app`: a live `Sogo V3` project read 53 Hermes cards and 233 matching sessions. Sessions' discovered 422 was repaired at `69625a9`; the false failure after a successful folder-link `204` was repaired at `a3c2dd9`. Adam left the current Sessions-history interaction unchanged until post-completion workflow-led redesign. | Used in built app |
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
| 4. Smoke, parity, `.app`, and DMG | The local checks are green after `a3c2dd9`. The `.app` and DMG were refreshed; strict verification passed for the app on disk and the app mounted from the DMG, and the DMG checksum is valid. | Complete |

## Current assembled state

- Latest verified native-app source commit: `a3c2dd9`
- Evidence reconciliation commit: `4d7d9b3`
- Current rebuilt executable SHA-256:
  `ec4699b7318d7d6f25feb39fe9831e708f641478c5f4d4d092de392b8a1fcf97`
- Current rebuilt DMG SHA-256:
  `6241add3a91ef12c98091e4031f9f491337e78b45effb8a9223f5c57e73aa7e3`
- Current runtime readback: one exact release IntelliZen app (`21219`); zero retired donor
  UI processes; Hermes is attached and Fiona's independent launch agent is
  running.
- Canonical MCP: rebuilt from the same repository; 65 tools exposed, including
  read-only `list_hierarchy`; live readback returned 29 nodes and the exact
  Sogo V3 folder. The reviewed worker registry exposes 12 tools and includes
  the same read-only hierarchy surface.
- Post-repair `ALLOW_LOCAL_ACCESS_KEY_BUILD=1 pnpm smoke`: passed after
  `5ba8c21` (product contracts, TypeScript, production frontend build, strict
  Clippy, 39 native tests passed, two intentional live/manual ignores).
- D.13 cleanup: the saved proof widget was removed and both installed fixtures
  were moved intact to `~/.hermes/plugins/.retired-wave1-proof/`. A full
  exact-app restart showed no proof widget, route, or deliberate failure entry;
  the four archived file hashes match the original D.13 evidence.
- Scheduled proof readback: job `9c1e6c93e398` is paused with no running claim
  or last error after its successful E.17 proof.
