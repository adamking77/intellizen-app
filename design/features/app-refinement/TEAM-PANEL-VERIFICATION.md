# Team panel repair — 2026-09-05

Implemented after GitHub checkpoint 34adf6b. Teams retain the shared agent/team picker and can eject directly to HUD or through the full detached panel. Main-window room snapshots and explicit room actions keep execution in one owner. Per-room drafts survive transitions and only clear after an accepted send if their revision is unchanged. Suffixed room names resolve the selected team by the same name/roster contract used when opening a team room.

Validation: TypeScript and product/design checks passed. Baseline repair suite: 676 passed, one existing skip; subsequent room snapshot, selected-team matching and picker regression checks passed. Independent native review passed team ↔ agent switching, direct HUD, expanded chat, full panel → HUD and redock with draft preservation. Voice controls were visible with appropriate disabled reasons. No messages, agent runs or recordings were started.

Native report and local screenshots: `design/features/app-refinement/evidence/team-panel-check/NATIVE-REVIEW.md` (captures remain outside Git). Native review was interrupted during final cleanup by user activity; a marked unsent QA draft remained. The selected-team matching correction followed the review and has executable coverage; native selected highlight remains for final review.

## Final native follow-up

Independent fresh-app review subsequently reproduced an individual direct-HUD initialization failure: main retained the selected agent but the detached view missed the initial frame. Corrected by storing a native in-memory snapshot before opening, reading it after listener registration and ordering live/read responses by revision. A viewport-bounded HUD keeps long rosters scrollable with pill controls visible.

The final rebuilt-app review passed direct ACP HUD, roster scrolling, chat/full/redock, team HUD and selected-team highlight for a suffixed room name. Original agent, empty drafts and preferences were restored; prior QA draft cleared. No sends, recordings or runs. Source suite: 689 frontend tests passed/one existing skip; native 56 passed/three opt-in ignored. Superseding local native evidence: `design/features/activity-dashboard/evidence/NATIVE-REVIEW.md`.

## Team design reconciliation

Adam identified a remaining design mismatch when selecting a team. Scope is
docked, full detached and expanded HUD conversations, using the existing panel
design as authority. Team chat now reuses Composer, inherits the panel surface,
and uses matching insets, empty guidance, shared user bubbles and run status
above the input. Members remain available through a compact disclosure. The
shared input retains team mention completion and obeys the app send preference;
unavailable team voice conversation remains visible with its reason.

Acceptance requires native mode switching, correct disclosure/mention behavior,
no clipped composer controls and retained unsent drafts. The HUD pill remains
independent of the expanded conversation surface. No new room runtime or data
model was introduced. Focused composer/panel suite: 41 passed. TypeScript,
product/design/contrast checks and the production build/credential scan passed.

Native review found duplicate voice controls and a remaining legacy single-line
individual HUD input. Both corrections reuse the existing design: voice actions
live once in the pill, and individual/team expanded HUD chat uses the same inset
Composer and bottom guidance. The recording discard action remains in the pill.
The corrected individual HUD passed native visual comparison with the verified
team HUD (local captures 26 and 30). Docked/full team layout, 380px composer fit,
member disclosure and unsent mention/draft continuity passed earlier in this
same review. Final fresh team selection/redock was interrupted by automatic
approval review detecting user activity; no further native interactions were
attempted. A subsequent read showed a loading/no-profile state during that
user-change interval, so its cause and final restoration were not verified.
No messages or recordings were sent. Exact QA text had already been cleared;
the final comparison did not edit any drafts or preferences.

## Composer whitespace regression

Adam reported that Space did not work in chat. The panel rendered its controlled
draft through `joinVoiceText` even with no interim speech; that helper trimmed
trailing whitespace on every render. A regression first reproduced the loss of
`Hello ` to `Hello`. With no speech to append, the helper now returns the exact
draft. Active speech joining retains its existing behavior.

The controlled Composer test types repeated spaces and newlines character by
character, checks persisted drafts and remounts the input. All 58 focused
voice/panel/team tests, product/design/type checks and build/credential scan
passed. Independent native typing confirmed trailing Space, repeated spaces and
Shift+Enter in the docked panel. Exact unsent QA text was cleared; no sends,
recordings, mode or preference changes. Local captures 31–32 support the native
review in `design/features/activity-dashboard/evidence/NATIVE-REVIEW.md`.
