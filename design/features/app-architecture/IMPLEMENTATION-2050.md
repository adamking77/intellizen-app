# IntelliZen 2050 implementation plan

2026-09-07 · Keel owns delivery · Ponytail full for every participant.

**Delivery complete · 2026-09-07 18:21 UTC.** All eight milestones are implemented,
verified in the native review app and recorded Done. The dated checkpoints below
retain the implementation history; the final acceptance section is authoritative.

Refine the existing app so Adam can understand the current situation, answer a question, work with material and set his availability without having to reconstruct context. Preserve the existing Places, data ownership, database capabilities and agent execution boundaries.

This is an ordinary engineering plan. **GenZen Build is disabled in this project.** No harness, lifecycle framework or replacement planning system is part of this work.

## Authority and current state

**Latest typography correction:** Adam rejected the oversized new Home heading
and eyebrow. Home's heading/sentence/eyebrow scale is reduced; later
redesigned pages inherit the calmer scale (about 24–28px headings, 20–26px
sentences, 10px eyebrows). No global token change may disturb the restored panel.

**Latest correction from Adam's native review:** M1 retains the original
attached/detached/HUD layout. Restore the previous agent-name size, compact
header and combined composer/controls; the expanded 2050 layout is rejected.
Keep new colors and functional fixes. Sol restores shared/docked composition;
Terra restores HUD/ejected composition; independent Sol reviews against
pre-change HEAD `9272d1ea88e4bcc60d13a04403d836985cb547ff`. Earlier M1 spatial
instructions and acceptance language below are superseded by this correction.

- Visual target: Fable's [SPEC-2050](/Users/adamking/projects/genzen-solutions/intellizen-app/design/features/app-architecture/SPEC-2050.md) and local Turn 8 frames. The spec records Adam's approval of the direction.
- Engineering corrections: [REVIEW-2050](/Users/adamking/projects/genzen-solutions/intellizen-app/design/features/app-architecture/REVIEW-2050.md). Six supported findings; the baseline ran 59 tests across nine files, all passing. That is baseline evidence, not implementation completion.
- Current product behavior and approved exceptions: [CLAUDE.md](/Users/adamking/projects/genzen-solutions/intellizen-app/CLAUDE.md), [DESIGN.md](/Users/adamking/projects/genzen-solutions/intellizen-app/DESIGN.md) and [v3 design stage](/Users/adamking/projects/genzen-solutions/intellizen-app/docs/stages/design-system-v3.md).
- Adam authorized this plan and delegation to Sol, Terra and Luna. He reaffirmed the project exclusion of GenZen Build and assigned Keel the executive engineer, manager, chief-of-staff and project-manager role. Those standing instructions are now in CLAUDE.md.
- Adam subsequently instructed the team to run this through completion without stopping. M1 implementation is active: Sol owns context and panel behavior, Terra owns tokens/primitives, Luna performs bounded independent checks. Existing unrelated work is preserved. Keel maintains the active goal and this delivery record.

## Responsibility and model allocation

| Participant | Owns | Model use |
| --- | --- | --- |
| Keel | Scope, priorities, task briefs, ownership, integration order, disagreement resolution, verification review and concise reporting to Adam | Root remains accountable. Does not become the default implementation worker. |
| Sol | Panel/context/decision integration, document write safety, workflow continuation, difficult cross-window or persistence defects | `gpt-5.6-sol`, high reasoning for consequential behavior; medium for a bounded follow-up. |
| Terra | Most UI implementation, theme application, Home projections, avatars, database/graph/canvas integration and dashboard behavior | `gpt-5.6-terra`, medium by default; high for state/persistence boundaries. |
| Luna | Individual token/label edits, small stateless components, targeted regression additions and coverage checks after contracts stabilize | `gpt-5.6-luna`, medium. Large interactive files and permission/state logic remain with Sol/Terra. |
| Independent reviewer | Inspect the assembled candidate and changed behavior against the frame and required checks | A fresh Sol context that did not implement that candidate; Keel adjudicates and sends failures back to the responsible worker. |

All briefs require reading Ponytail at `/Users/adamking/.codex/plugins/cache/ponytail/ponytail/4.9.0/skills/ponytail/SKILL.md`, acknowledging full mode, reading the relevant source and tracing callers before editing. Reuse first; no new dependency or generic abstraction without a demonstrated gap. Simplicity never removes requested behavior, accessibility, validation or data-loss protection.

Adam added Emil Kowalski's animation skills on 2026-09-07. All 12 are installed
in `/Users/adamking/.codex/skills/` and `.agents/skills/`, pinned to upstream
`d23d7f88a2e21c9e4b1418c7abe420f5c1052ba7`. For each stage that changes surface
motion, its owner reads `emil-design-eng/SKILL.md` and `animate/SKILL.md`;
the independent reviewer uses `review-animations/SKILL.md`. Start by deciding
whether motion helps the interaction, reuse the existing token system, and
verify reduced motion, keyboard immediacy and interruption in the native app.
Installation does not authorize replacing components or adding dependencies.

## How I will keep delivery on track

One main implementation stage is active at a time. At most two workers implement
disjoint packages; the third slot handles a bounded check or review. Once a
package is integrated and its shared contracts are verified, unrelated next-stage
files may advance while user-requested follow-ups remain in review. Do not
block disjoint Home work on a panel color or label correction. Ownership remains
exclusive; no worker edits a dependency still being changed by another worker.
When review needs a free slot, finish preparation rather than expanding the team.

Each dispatch names the user-visible result, exact writable paths, read-only dependencies, existing behavior to preserve, one relevant frame, tests/native checks and exclusions. Each file family has one writer. Shared files such as `src/index.css`, `app-shell.tsx`, `Home.tsx`, `panel-window.ts` and the session store change owners explicitly between packages; they are not concurrently edited. Keel manages that transfer; the assigned Sol/Terra worker makes the integration edits.

A worker returns changed paths, the behavior delivered, commands/results, remaining limitations and the next dependency. Keel checks the diff and integrated behavior before marking the package finished. Conflicting assumptions are sent to both affected workers and resolved against Adam's decisions and source evidence. A passing local test or worker's “done” message is not sufficient.

Run one check process at a time per worker and await or terminate it before
starting a replacement. Keel owns the single integrated full check; workers
run focused checks. Duplicate compiler processes caused native/test contention
during M1 and were stopped explicitly by their owners.

If work stalls, the worker reports the exact obstacle and evidence. Keel first narrows or repairs the same package, then escalates Luna → Terra → Sol if the problem warrants it. No repeated blind retries, speculative cleanup or extra agents to conceal a dependency. Adam gets meaningful progress and actual decisions, not worker coordination chores.

## Preparation: reconcile the existing documents

**Owner: Keel; technical challenge: Sol; bounded consistency check: Luna.**

Correct the engineering mappings in SPEC-2050 without opening another visual exploration:

1. Meaningful metadata and quiet controls use readable tokens; faint colours are decorative only. Extend the existing all-theme contrast checker rather than creating another theme audit tool.
2. Trace is `avatarStyle: "trace"`; preserve the existing silhouette `avatarKind`. Define the seed serialization through every adapter and consumer.
3. Home/dock use the current Activity sources and full source-specific decision identity, not the older snapshot.
4. Document review keeps hunk diffs, save flushing and conflict protection. Accepted edits do not count as verified claims. Missing evidence stays unavailable.
5. Recommendation labels require an actual recommendation; first position is not one. Keyboard choices preserve text entry and all existing decision kinds.
6. Same-run `meanwhile` continuation is explicitly implementation work in M6, not a field-only restyle. It stays on the delivery list until resolved or explicitly removed by Adam.

Amend superseded typography, surface, decision and shadow rules in DESIGN.md and the v3 stage together with the relevant implementation. Mark conflicting old passages in DIRECTION.md superseded. Preserve database-specific rules until their explicit open design choice is resolved. Never weaken checks simply to make new code pass: change the stated rule and its check together.

## Delivery stages

| Stage | User-visible result and coverage | Implementation owner | Done when |
| --- | --- | --- | --- |
| **M1 · Panel first** | One real question and its context in docked, ejected and HUD forms. Frames **8r, 8s, 8t**. Introduce only the shared Surface/type/Choices needed here. | Sol owns behavior and panel integration. Terra owns the agreed token/primitive package. Luna checks bounded labels/keyboard regressions. | Answering reaches the correct owning session/room once, failures remain actionable, and history retains the actual decision. Removing context changes the next-turn payload. Attach, voice, ask-first, stop, picker and docking controls remain usable. Native views match the accepted composition. |
| **M2 · Home and availability** | Thinking, Deciding, Executing and Not today; dock, pulse, real return deltas and unchanged dashboard access. Frames **8a–8e**. | Terra owns Home/projection/dock. Sol owns the lifecycle/quiet-mode boundary where native behavior requires it. | Profile and team questions agree across surfaces; resolution clears the right question everywhere. Quiet mode affects both windows without stopping agents. Reload preserves mode; genuine app restart resets active mode. Missing/stale sources are visible. Existing pins survive. Executing uses verified fields and correct scope; tasks without metadata remain accessible. |
| **M3 · Agent identity and inventory** | Trace avatars, cards/list, editor and teams. Frames **8o, 8p, 8q, 8y**. | Terra owns the model and adapter round trip. Luna receives individual renderer/visual edits after the interface is fixed. | Saved trace seed/style survives reopening and restart and matches cards, pickers, rooms, panel and HUD. Blob/sphere and uploaded pictures remain correct. Profile and ACP saves retain their own existing paths. Rest for today has a defined effect before appearing as a working control. |
| **M4 · Docs** | Reading/editing, collapsible rail, contextual proposal review and truthful metadata. Frame **8f**. | Sol owns proposal/write integration; Terra owns layout. | A real edit can be inspected and accepted/rejected by hunk without losing a dirty draft or overwriting an external change. The panel preserves access to the diff. Metadata resolves the correct document/path/revision and never fabricates verification. |
| **M5 · Databases** | Way-in rows, editor/view controls, scoped pins and record peek. Frames **8g, 8h, 8i**. | Terra; Sol reviews persistence-sensitive changes. Luna limited to named labels/styles/tests. | All existing view types, filters/sorts/groups/properties and record edits work. Pinning retains destination scope/config. Peek resizes and opens full-page. Selection follows the resolved design choice and saved accent preference. |
| **M6 · Workflows** | Library, composer, step inspector, full-page run and real continuation behavior. Frames **8l, 8m, 8n**. | Terra owns visual integration; Sol owns schema/runner changes and source-specific workflow decisions. | Draft/save/test/run/replay remain coherent; fields no longer overlap neighboring steps. A pending approval allows only the declared independent work, dependent actions remain held, denial/restart behave correctly and consequential work is not duplicated. Complete the runtime subpackage before claiming all M6 behavior finished. |
| **M7 · Remaining material surfaces** | Graph and Canvas tools in dock, Activity restyle, Unit/workspace rows and dashboard bands. Frames **8j, 8k, 8u, 8v, 8w**. | Terra in sequential small packages; Luna takes named visual edits. | Graph/Canvas interactions and document/export paths survive tool relocation. Activity retains counts, reported/estimated/unknown distinctions and scope. Every pin kind has defined band behavior without losing placement/config. Arrange controls appear only in Arrange mode. |
| **M8 · Ask and whole-app consistency** | Ask through the existing panel owner, plus shared framing in Project rooms and remaining Settings. Frame **8x** and existing room/settings behavior. | Sol or Terra owns Ask routing; Terra owns composition; Luna performs a bounded consistency sweep. | Ask displays the correct turn and sources without starting a second conversation. Closing/reopening does not misattribute responses. Project view functions and Settings ownership remain intact. Every Place composes with sidebar, dock, aside and panel at supported sizes. |

The stage order is also the dependency order. M1 stabilizes shared primitives and decision/context behavior before M2 consumes them. M2's dock and lifecycle precede the later surfaces. M3 identity precedes final pulse/avatar consistency. M4 establishes the real document-review path before later workflows and Ask point into it.

## Important shared contracts

- **Actions:** adapt existing session/room/workflow dispatch paths. Carry source identity and revalidate pending state. A shared visual component does not imply a universal approval API. Home and Ask must not own independent conversations.
- **Context:** the main-owned next-turn snapshot determines what is sent. Remove only the chip's represented reference and redundant route metadata that identifies that material; preserve other selections and shared context. Whole-snapshot suppression is allowed only for a chip representing the whole snapshot. Prove the serialized outbound prompt, including preservation of remaining references. Hiding a chip without updating that payload is a failed implementation. Removal does not erase prior messages or revoke filesystem access.
- **Session mode:** distinguish native app launch from webview reload and agent-session start. Prove the boundary in Tauri; do not assume `sessionStorage` proves it. Reuse native lifecycle state, or add the smallest process-lifetime identifier if required. Mirror mode through existing panel communication. Check both toast hosts and direct notification sources.
- **Tasks:** read the actual live database field definitions before preparing an additive change. Source inventory is not live-schema proof. Resolve the relationship between Tasks/Biz Ops and hierarchy workspace scope. No guessed cross-workspace fallback.
- **Pins:** reuse the existing `config` and persistence path if it can express explicit band assignment. Define a deterministic fallback for legacy/custom/plugin pins without interpreting their titles as business meaning. Preserve original placement reversibly.
- **Workflow continuation:** specify independent-step eligibility and dependency meaning before code. Extend the existing runner; do not create a second scheduler platform. Preserve schema validation, exact-payload approvals, lease/version handling and restart reconciliation.

## Decisions kept visible, without stopping independent work

| Decision | Recommended direction | Needed before |
| --- | --- | --- |
| Database selected-row rail | **Adam confirmed 2026-09-07: use the tinted row.** Preserve the Accent Strength preference; the old coloured rail exception is superseded. | Implement in M5 |
| Set aside / Rest for today | **Adam confirmed 2026-09-07: quiet local presentation; work continues, with Restore.** Set-aside material remains addressable and can be restored; agent quiet mode never falsifies its underlying runtime state. No archive, cancellation, permission revocation or engine shutdown. | Implement in M2/M3 |
| Tasks workspace relationship | Live readback found no canonical mapping. Use nullable `task_scope_node_id` containing a validated workspace/project UUID; keep `task_project` intact. Store keeping-out records on Tasks with `task_kind`. No name-based joins or automatic reassignment of existing tasks. | Scoped Executing menu in M2 |
| Same-run continuation | Keep the requested capability as M6 runtime work. If its required semantics exceed the intended scope, present a bounded correction to Adam rather than shipping an inert `meanwhile` field. | M6 runtime implementation |

These are not repeated approvals for routine engineering choices. Four modes, panel-first sequencing, the corrected avatar discriminator, readable metadata and reuse of current Activity sources are the working plan. Technical details within those decisions belong to the assigned engineer and Keel.

## Verification and integration

Reuse the existing test runner and checks. A changed branch/parser/state transition gets the smallest meaningful regression in the existing suite; decorative one-line changes do not acquire a test framework.

- For each package: its relevant existing tests plus changed-behavior regressions. Panel uses decision, session/context, room and detached-frame tests; avatars use model/profile/registry round trips; Docs uses proposal and save/conflict tests; Home uses Activity, pins and layout tests; Workflows uses schema, runner, recovery and replay tests.
- For each integrated stage: `pnpm run check` and relevant tests. Its design check must model all seven flavours, fourteen accents and saved strengths, including the new metadata/surface pairs. Run Rust checks when native code changes. Inspect the freshly rebuilt native app rather than a stale bundle or browser substitute.
- Native proof: Mocha and Flat White, default and minimum 900×620 window, 100% and 200% scale, keyboard, reduced motion and realistic data. Exercise empty/error/pending states. Test reload/restart in the same stage as the persistence change. Old captures are references, not new verification.
- Review the full composition, including sidebar/panel/aside, dock and overlays. A beautiful isolated component does not establish a usable assembled app. Return failures to their owner before advancing.
- Integrate one finished stage at a time. No unrelated cleanup, force resets, speculative migrations, pushes or publication. External/destructive actions retain Adam's explicit approval boundary. Local preparation and checks continue within the authorized work.

## Delegation record and next assignment

Planning assignments were actually dispatched to **Sol** (`sol_panel_plan`), **Terra** (`terra_data_plan`) and **Luna** (`luna_coverage_plan`). Each was instructed to use Ponytail full and received the project exclusion of GenZen Build. Their findings feed this single plan; they are not separate implementation authorities.

Keel has already corrected two planning assumptions: a session-storage marker is not evidence of native launch identity, and a code-level Tasks inventory is not a live-schema readback. Luna's ownership has been narrowed from entire interactive surfaces to individual stable edits. Shared-file integration belongs to the assigned Sol/Terra engineer, with Keel coordinating and reviewing.

**First implementation dispatch: M1.** Sol receives the panel/context/decision package; Terra receives the agreed readable-token and primitive package after interfaces are aligned. Luna checks existing coverage and then receives a specific missing regression or small visual edit. Keel owns the reconciled source instructions, path ownership and assembled review. No later stage starts writing until M1 is integrated and verified.

| M1 package | Exclusive source ownership | Dependency |
| --- | --- | --- |
| Terra: panel primitives | `src/index.css`; `src/components/ui/control.tsx`, `decision-field.tsx` and panel-required Surface/Eyebrow/Choices files; `scripts/check-design-system.mjs` | Agree the minimal props/token roles first. Reuse existing focus/disabled handling. No Dock/Pulse library in this package. |
| Sol: editable context | `src/lib/conversation-context.ts`, `src/components/agent/material-context.tsx`, `src/engine/session-store.ts` | Can run beside primitives: disjoint files, outbound-prompt contract fixed. Room send paths must be traced too; add their exact files to ownership before editing if required. |
| Sol: docked panel | `src/components/layout/agent-panel.tsx`; `src/components/agent/agent-panel-shell.tsx`, `decision-card.tsx`, `agent-composer.tsx` | Consume integrated primitives and context; preserve all existing decision and composer behavior. |
| Sol or reassigned Terra: detached/HUD integration | `src/components/agent/ejected-panel.tsx`, `hud.tsx`, `panel-window.ts`, `use-eject.ts` | Docked behavior is working. Use the main window's existing action channel. No detached gateway owner. |

Corresponding tests stay with their source owner unless a specific test file is explicitly assigned to Luna. Two agents never edit the same test file. During M1, any question count scoped to the selected conversation must say so; M2 supplies the broader Home/dock projection. Sol's initial blanket context-suppression proposal was corrected before dispatch so individual chip removal preserves the rest of the shared material.

### Delivery checkpoint · 2026-09-07

- M1 compact layout is restored across attached/detached/HUD after Adam's review.
  Core context/decision integration and independent review passed. M1 is in
  Review for the latest user-requested color audit and clickable approval-mode
  control; it is not marked complete.
- M2 Tasks record: `9554ea6d-7ab6-4f14-8404-0c512926f0a8`. Terra is implementing
  Home/projection/Dock in disjoint files. Sol's lifecycle package follows the
  user-priority approval control. Remaining stages M3–M8 stay on the delivery list.

- M1 Tasks record: `274f2e03-9151-4411-a771-35fcb146d4c3`, linked both ways with IntelliZen Cockpit Completion. Created through IntelliZen MCP with a work-event receipt. State is In progress; native integration is not complete.
- Context package covers single-agent, local-room, hosted-room and detached send capture. Sol reports 24 focused tests passing. Keel's native checks verified chip removal and restoration on selecting another route. Serialized prompt and decision checks remain part of integrated review.
- Primitive controls: four targeted checks pass. Root review required modifier/repeat guards, readable Surface contrast, explicit agent identity colour and wrapping consequential decision text. Terra incorporated the corrections.
- Sol owns the docked panel plus `agent-turn.tsx`, `use-panel-session.ts` and decision-specific Room handlers. Terra owns HUD/ejected composition. Correlated decision results must preserve busy/error/retry without creating another session owner.
- Native debug wrapper is a fresh source build, separate from the installed app. During active HMR, a detached frame contained an empty profile directory; recheck after a clean restart of the stabilized candidate before treating this as a release defect.
- M2 preparation found Tasks has no canonical hierarchy link. Engineering direction: nullable trigger/done-when/effort text, canonical hierarchy scope UUID, and task kind including keeping_out. Scope must validate workspace/project membership, never infer it from names. Live schema has been read; no schema or task content migration has been performed.
- The native dev server now uses `TAURI_ENV_PLATFORM=macos`, honoring the existing WebKit HMR safeguard. Clean-start profile handoff passes. An unsent draft survived detached → HUD conversation → docked; the verification text was cleared without sending.

### M2 implementation checkpoint

- Canonical admin MCP `add_database_fields` now supports append-only text/select
  metadata with exact preview, revision CAS and a work-event receipt. Independent
  review found no supported defect; 14 MCP contract/plane checks passed.
- Tasks schema update is live and independently read back: all 13 previous
  definitions preserved, five agreed metadata fields appended, 18 total.
  Receipt: `bff55f8a-db14-45a3-b3b9-7de534bfd824`. No existing record content changed.
- Home source projections now distinguish loading/error/unknown from empty,
  preserve unscoped work, include descendant project scope and carry complete
  profile/session, room/member and workflow approval identities.
- Independent review found a workflow approval race in the existing shared
  resolver. Sol owns its bounded fix and existing callers; Terra owns Home's
  inspectable payload and exact expected revision arguments. Acceptance waits
  for that correction and native quiet-mode/reload/restart verification.

### Current delivery checkpoint · 2026-09-07

- M1 implementation is complete locally, including the final empty HUD bubble
  guard. Native compact geometry, colors, keyboard and approval read/cancel
  passed. Evidence remains in `evidence/2050-m1/VERIFICATION.md`.
- M2 lifecycle is verified in the rebuilt native app: reload retains mode,
  restart clears active mode, remembered Not today is hint-only, and a visible
  HUD hides/restores without stopping Hermes. Source-backed counts and smaller
  typography and final availability row spacing are verified. Task links and
  partial-source coverage passed focused checks; final integrated checks remain.
- M3 is complete locally and its task is Done. A real ACP trace save, reopen,
  restart and card/picker/panel identity match passed. Rest/Restore remains
  presentation-only. Tasks record: `5a535e2c-8598-4611-b1d3-0476f91498fc`.
- M4 is complete locally and its task is Done. Root corrected path
  alias matching in native proposal lookup (12 Rust checks passed), and moved
  review into the existing conversation scroll area to preserve Adam's compact
  layout (24 panel mount checks passed). Native hunk acceptance, detached review,
  reading focus, redock and complete document-rail collapse/restore passed.
- M5 way-in rows, tinted selection and scoped pin picker are implemented.
  Native review caught narrow-column overflow; rows now use available container
  width. Final native recheck remains. Task: `71e5c4b4-222e-4c3e-ab4c-1eda7b3c193d`.
- M6 visual/runtime packages are implemented; live integration review found a
  hosted execution-ledger contract absent from the local test baseline. Sol is
  adapting side-result persistence and checking existing start/resume callers;
  Terra independently reviews that contract. Approval questions bind
  to the current step; replay changes the displayed per-agent receipt history.
  Independent read-only work uses durable claims, isolated ACP sessions and
  atomic settlement after the main lease releases. SQL contracts pass 5/5;
  focused runtime/schema/approval/ACP checks pass 73 tests. The two-function
  additive migration remains local pending live-baseline review and Adam's
  concrete approval. Task: `3c9a8b86-4250-4bc0-98e7-63ba3f474cc8`.
- M7 Graph/Canvas, Activity, Unit and workspace dashboard bands are implemented.
  Independent scope/persistence review found no blockers. Focused checks cover
  explicit task/receipt ownership and band/config preservation. Native final
  verification remains. Task: `0ddebf4f-ed37-4044-909f-b26aaa35d349`.
- M8 Ask is implemented through existing profile/team owners with exact queued
  message/session or room-event receipts, stopped-turn handling and preserved
  drafts. Project tables scroll and duplicate document rows are removed.
  Shared headings and Settings labels use the calmer scale. Native review remains.
  Task: `b1ff1530-d1a9-45c7-9f0f-059985d9f801`.
- Current color validation covers 48,370 contrast pairs across seven flavors,
  fourteen accents and eleven strength settings. Native source build and
  TypeScript compilation pass. The responsive inspector divider exposed a
  false positive in the selection-rail check; its matcher now distinguishes
  2–4px rails from a responsive zero-width divider.
- The final frontend snapshot passed 839 tests across 170 files (one explicitly
  skipped test). Canonical MCP tests passed 33/33 and its single build completed.
  Native tests passed 75 with four opt-in tests ignored; Clippy passed. The
  production frontend built with private access credentials omitted, and its
  service-role credential scan passed. Nothing was published.
- Desktop access has resumed. The local verification wrapper was rebuilt,
  ad-hoc signed and restarted; independent assembled native review is active.
  Missing native checks remain explicit until they have actually passed.
- No commit, push or deployment has occurred. M4–M8 remain on the delivery list;
  this checkpoint does not mark the overall goal complete.

### Final integration checkpoint · 2026-09-07

- Final `pnpm run check` passes: source-size, product contracts, design validation
  (48,370 contrast pairs) and TypeScript. Full frontend: 851 passed, one skipped;
  final continuation/meanwhile type-contract correction: 10 focused checks pass.
  Canonical MCP: 40/40 and build pass. Native: 75 passed, four opt-in ignored;
  installed Codex read-only handshake separately passed; Clippy passed.
- Production frontend build and bundle credential scan pass with private access
  credentials omitted. No commit, push, publication or deployment occurred.
- M6 hosted-contract repair is complete locally: immutable continuation/results,
  exact-payload approval/resume and atomic schema-v1 start now match the hosted
  contract. The SQL harness uses actual hosted definitions and passes five suites.
  Exact additive migration: `evidence/2050-m6/MIGRATION-REVIEW.md`. Explicit live
  migration and isolated read-only verification approval has been requested.
- Independent native review has verified M5 pin/peek/full-record and M6 existing
  library/composer/run surfaces. M7/M8 review and 200% spotchecks are finishing;
  evidence and task completion will be recorded after reviewer acceptance.
- M1, M3 and M4 are Done. M2 final workflow approval integration and M6 live
  execution verification remain open. The overall goal remains active.

### Native acceptance checkpoint · 2026-09-07 17:25 UTC

- M5 and M7 independent native review passed; both Tasks are now Done with
  receipts. Final settled Settings/Activity evidence supersedes initial loading
  captures. Databases, Unit, Graph and Canvas retained their existing material.
- M8 native keyboard, close/reopen, calm type and 200% reflow passed. Actual Ask
  reply correlation/source traversal remains unverified in the native app; a
  single harmless prompt is prepared and explicit provider-send approval requested.
- M6 existing full-page replay loaded all eight receipts. This is read-only
  presentation evidence, not proof of the pending new live continuation path.
- M1/M3/M4/M5/M7 are Done. M2/M6 await the approved isolated workflow test;
  M8 awaits the approved harmless Ask test. No live migration or test prompt ran.

### Approved verification checkpoint · 2026-09-07 18:12 UTC

- Adam approved the migration and isolated native tests. Both the original
  side-transition migration and the protected-receipt correction are now live;
  the corrected SQL harness passes all five suites without widening ledger access.
- M8 is Done. The approved harmless Ask returned OK in the native panel and
  retained the correct reply after close/reopen. Native error metadata now
  prevents a provider failure from being shown as a completed answer.
- M1/M3/M4/M5/M7/M8 are Done. M2/M6 remain open for the native pending-approval,
  independent-work completion, restart, approval/resume and final-restart proof.
- The isolated workflow was saved natively at version 2. Its initial protected-
  ledger claim failure led to the SQL correction. Retrying the same run claimed
  the side assignment, but the agent session failed immediately. The durable
  record correctly shows the side step blocked and approval still pending.
  Runtime diagnosis is active; this checkpoint does not claim native acceptance.
- Native review also found stale current-step labels and a disappearing retry
  error. The drawer and Home now share the immutable step/state projection;
  fresh-state errors stay visible. Focused tests passed 22/22 and `pnpm check`
  passed. The unversioned startup receipt's replay ordering is being corrected.

### Final acceptance · 2026-09-07 18:21 UTC

- M1–M8 are Done with IntelliZen task receipts. The original compact attached,
  detached and HUD panel layouts are restored. Shared page headings and eyebrows
  are calmer; Ask First opens a working approval-settings dialog. Local quieting
  preserves running work, and database selection uses the approved tinted row.
- Native workflow run `0ff3d0bc-4a81-4d6a-97e9-4bc3344c6623` completed independent
  read-only work while approval was pending. Its exact result, assignment,
  execution version and definition hash matched the durable receipt. A full
  restart preserved the pending decision and completed side result. Approval
  through Home resumed the main path exactly once; a second restart retained
  Done, all four completed steps, 18 receipts and contiguous versions 1–16.
- Native verification exposed and corrected the protected-ledger claim access,
  valid Codex package symlink rejection, lost native startup error detail,
  stale step labels, disappearing retry errors and startup receipt ordering.
  The failed first synthetic run remains recorded as failure evidence.
- Final frontend: 859 passed, one explicitly skipped. `pnpm check` passed,
  including 48,370 contrast pairs, source limits, contracts and TypeScript.
  Production frontend build and credential scan passed. Canonical MCP: 40/40
  and build passed. Native suite: 76 passed/four opt-in ignored before the final
  launcher correction; its focused package-verifier and actual installed
  read-only handshake checks then passed, as did final Clippy and native build.
- Final native binary SHA-256:
  `72ed3482418de0542f6ccfa1a7b94d9edd13ddecf9058fcc2001492660ec9d5f`.
  Verification used the disposable native wrapper and existing Codex 0.153.4
  through its CODEX_PATH override. Saved model/provider configuration was kept.
- No commit, push or deployment was performed. The installed production app
  bundle was not replaced. The implementation and accepted native review build
  are ready; milestone evidence remains under `evidence/2050-m1`–`2050-m8`.

### GitHub handoff · 2026-09-07

Adam subsequently authorized commit and push. The source, tests, migrations,
design contracts, portable verification summary and licensed animation skills
are published on `codex/spec-2050-implementation` in two commits:
`e15e14e` (skills) and `5b377b4` (implementation).
[Draft PR #24](https://github.com/adamking77/intellizen-app/pull/24) targets the
existing `codex/refinement-and-activity` integration branch. Remote HEAD matches
`5b377b428ad70317b10731aadace11cf5d790496` exactly.

The separate publishing checkout passed 859 frontend tests with synthetic
environment values, 40 MCP tests, TypeScript, product/design checks and the
credential scan. Its 729 source/test/migration files matched the verified
implementation workspace. The publishing checkout is clean.

The original branch and working files remain intact. Ten older unpublished
design-reference commits, native screenshots, runtime logs, generated files and
internal delivery records remain local. The public verification summary is
`docs/verification/spec-2050.md` in the publishing branch. Nothing was merged or
deployed.

### Follow-up review queue · 2026-09-07

These follow-ups come from the updated design-system review and Adam's subsequent
direction. Adam reopened verification on 2026-09-08 after finding broken Home
controls. Earlier completion labels describe the earlier checks, not full acceptance.

- [x] Preserve unsaved Agent editor drafts across close/reopen and restart, with
  an explicit discard action.
- [x] Review quiet-mode notification retention and Thinking-mode gating; retain
  relevant failures for return without suppressing contextual error feedback.
- [x] Correct Connected/Segmented background role mappings using the existing
  pane preference, preserving the accepted compact panel geometry.
- [x] Reconcile Calm/Clear/Strong contrast steps with readable small text and
  semantic labels across all themes and backgrounds. Preserve the independent
  Accent Strength preference and the calmer heading sizes.
- [x] Review unnecessary surface outlines, Activity loading motion and chart
  colors; correct reference-token and chart defects before adopting that code.
- [x] **Audit language across every page and dashboard (Adam's explicit request).**
  Check headings, subheadings, descriptions, helper text and empty states for
  clear, practical, simple and obvious language. Headings should name what the
  person is looking at; descriptions should explain what is available and what
  they can do. Replace vague, poetic, abstract or technical wording where plain
  language communicates the same meaning. Preserve accurate state and approval
  semantics. Inventory each surface, record proposed before/after copy and check
  the wording in context at the existing compact sizes before marking complete.
- [x] Check bottom navigation pill sizing on every page at normal, narrow and
  200% layouts; preserve conversation space and readable controls.
- [x] Apply the updated motion recipes where they clarify state or movement:
  list changes, pointer-driven dock indicators, completion feedback and content
  arrival. Verify existing gesture surfaces and optional chart arrival without
  adding new gesture behavior or changing approval controls. Pulse follows real
  activity with solid slow-moving strands and stays still when idle, in Not today
  and under reduced motion. Keyboard actions remain immediate.

Controls correction verified in the final packaged app on 2026-09-08. See
`docs/verification/spec-2050-controls.md` for reproduced defects, corrections,
the exact native interactions checked and coverage limits.
See `docs/verification/spec-2050-followups.md` for checks, corrected defects and
publication status; local screenshots are under `evidence/2050-followups/`.

Follow-up GitHub handoff: commit `132b8c2` published to
`codex/spec-2050-implementation` and existing draft PR #24 on 2026-09-08.
Final publishing checks: 889 frontend tests passed, one intentionally skipped;
TypeScript/product/design gates, 145,110 contrast combinations, production build
and final artifact scan passed. Publishing source matched the native-reviewed
workspace; the checkout is clean. No merge or deployment was performed.
