# Team panel repair — 2026-09-05

Implemented after GitHub checkpoint 34adf6b. Teams retain the shared agent/team picker and can eject directly to HUD or through the full detached panel. Main-window room snapshots and explicit room actions keep execution in one owner. Per-room drafts survive transitions and only clear after an accepted send if their revision is unchanged. Suffixed room names resolve the selected team by the same name/roster contract used when opening a team room.

Validation: TypeScript and product/design checks passed. Baseline repair suite: 676 passed, one existing skip; subsequent room snapshot, selected-team matching and picker regression checks passed. Independent native review passed team ↔ agent switching, direct HUD, expanded chat, full panel → HUD and redock with draft preservation. Voice controls were visible with appropriate disabled reasons. No messages, agent runs or recordings were started.

Native report and local screenshots: `design/features/app-refinement/evidence/team-panel-check/NATIVE-REVIEW.md` (captures remain outside Git). Native review was interrupted during final cleanup by user activity; a marked unsent QA draft remained. The selected-team matching correction followed the review and has executable coverage; native selected highlight remains for final review.
