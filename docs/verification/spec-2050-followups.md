# SPEC-2050 follow-up verification

Status: user-reported controls gaps corrected, checked in the final packaged app and published to draft PR #24 on 2026-09-08. See [the controls correction report](spec-2050-controls.md) for current evidence and precise coverage. The earlier GitHub handoff below predates those corrections.

## Scope

Adam authorized completion of the review queue, then added bottom-navigation
sizing, Pulse conformance and the updated motion recipes. The accepted compact
attached/detached/HUD layouts, calmer headings, tinted database selection and
independent Accent Strength preference remain binding. GenZen Build is disabled;
all three delegated lanes use Ponytail full mode.

## Changes and review findings

- Agent drafts persist per agent, including touched-field metadata. Late detail
  hydration cannot overwrite edits or preserve stale blank settings. Save failures
  keep the draft; an explicit discard action resets it. No remote agent settings
  are written while typing.
- Quiet updates and failed actions are stored locally and reviewed on Home.
  Thinking and Not today hold notifications. Executing holds background updates.
  Main-window ownership prevents duplicate return summaries in detached windows.
  Separate version-specific acknowledgements prevent a stale summary from
  overwriting a newer update from another window. Live action callbacks remain
  local to their originating window and are never serialized or replayed.
- Thinking retains pending questions without presenting approval actions on Home.
  A pinned-view outage leaves the session, tasks and saved updates available.
- Plane and contrast settings reuse existing theme preferences and primitives.
  Reference typography shorthands and low-contrast colors are not imported.
- Activity preserves existing line/bar and ring/bar choices, exact textual values,
  sparse-data gaps and the distinction between completed and verified outcomes.
  The reference Trend implementation is not adopted, avoiding its empty-data and
  missing-observation defects.
- The full language inventory is in [spec-2050-followups-language.md](spec-2050-followups-language.md).

## Motion and navigation

- Shared controls use 0.98 pointer press feedback; keyboard actions remain immediate.
- Modal/popover entry and drawers use the existing CSS and motion dependency.
  Modal closure stays immediate because delaying it retained obsolete profile
  settings and blocked navigation. Existing approval actions are unchanged.
- Agent lists and saved-update lists preserve row continuity. Newly arriving
  saved updates use a 4px/200ms entrance. Project Set aside crossfades to its
  completed wording with a separate Restore action.
- Home and its dock render the solid Pulse at a 9-second linear period for
  actual working profiles and rooms. Pending approvals/questions produce static
  dots; paused profile and team turns cannot produce moving strands. Idle,
  Not today and OS reduced motion stop movement. Active-state checks use fixtures;
  native inspection observed an idle state with pending questions.
- Activity's optional chart arrival plays once, including across line/bar/ring
  switches, and never bridges missing observations. Reduced motion and keyboard
  changes do not move the chart.
- Home, Graph and Canvas pills retain compact controls. Docs and Workflows retain
  their existing footers and now wrap their controls without clipping. No new
  navigation bars were added to pages that do not have one.
- Independent motion review passed after fixing paused-team Pulse, keyboard
  transition gating and chart arrival replay. Native review additionally caught
  and corrected Graph's container-query width collapse at high zoom.

## Verification

- Final publishing-checkout frontend suite: 904 passed, one intentionally skipped.
  Focused checks cover the final chart modality, list timing, Home scope memory
  and typography corrections.
- Product contracts, file limits, design-system audit and TypeScript passed.
- 145,110 foreground/state contrast combinations passed across seven themes,
  fourteen accents, thirty-three Accent Strength values and three contrast
  settings; minimum meaningful-text contrast was 4.50:1.
- Production frontend build with synthetic environment values passed. The
  artifact credential scan passed. The native review wrapper was rebuilt and
  launched; the installed production app was not replaced.
- Native 1272 × 768 review covered the final Home and Workflows wording, dark and
  light contrast, Connected/Segmented planes, and restored Macchiato/Calm/Connected
  with Accent Strength 0.14. The shared inner rail was corrected after visual review.
- Home, Graph (Insight and Construct), Canvas and document/workflow controls were
  inspected at 200% zoom. Tauri's local zoom-hotkey implementation confirms five
  0.2 increments from Command-0 equals 200%; the earlier two-increment language
  pass was enlarged text, not a 200% check.
- Agent draft recovered after close/reopen and a full native-app restart. The
  synthetic local draft was removed afterwards, without creating an agent or
  saving provider settings. Regression checks also cover failed saves, edits
  during save, touched-field hydration, identity and blocked storage removal.
- Private native screenshots and the detailed review log stay in the local
  `design/features/app-architecture/evidence/2050-followups/` directory. Source,
  tests and this portable verification summary are suitable for the review branch.

## GitHub handoff

Final publishing verification passed: 904 frontend tests, TypeScript, product
contracts, source limits, 145,110 contrast pairs, production build and the final
artifact credential scan. Source files match the native-reviewed workspace.

This follow-up is published on `codex/spec-2050-implementation` and the existing
draft PR #24. Source, tests, the design contract and portable verification notes
are included. Private native evidence, local runtime configuration and generated
artifacts stay outside the publication. Nothing is merged or deployed.
