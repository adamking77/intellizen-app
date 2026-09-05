# Design QA — Hermes frontend parity

## Comparison target

- Source visual truth: `/Users/adamking/projects/hermes-app`, captured from `http://localhost:5180/settings`
- Implementation: IntelliZen v3, captured from `http://localhost:1420`
- State: dark theme; all six Settings sections; New Agent Sphere and Blob modes; agent panel expanded and collapsed
- CSS viewport: 1438 × 1440 capture frame
- Raw source pixels: 719 × 720
- Raw implementation pixels: 719 × 720
- Density normalization: source and implementation were captured by the same surface at the same scale, then each side was rendered at 2× in 2876 × 1440 comparison boards
- Full-view evidence: `design/features/hermes-settings-parity/evaluations/round-1/evidence/screenshots/settings-*-comparison.png`
- Focused evidence: agent editor and collapsed-panel captures in the same screenshot directory. Focused Settings crops were unnecessary because the 2× comparison boards keep labels, rows, dividers, and control geometry readable.

## Required fidelity surfaces

- Fonts and typography: passed. Family, scale, weight, tracking, line height, hierarchy, wrapping, and muted text treatment match the Hermes system.
- Spacing and layout rhythm: passed. Pane widths, seams, content columns, row padding, section gaps, radii, and elevation match the donor pattern.
- Colors and tokens: passed after round 2. Neutral hover/selection planes are consistent; provider identity uses runtime blue, connected/verified uses semantic green, unavailable/failure uses semantic pink, and enabled switches use the selected accent. Saved accent differences are expected.
- Image quality and asset fidelity: passed. The app mark is the transparent original vector and follows the selected accent. Agent spheres and Blobatars use the donor libraries and source assets.
- Copy and content: passed. Shared settings copy matches the donor where behavior is shared; IntelliZen-specific Hermes/ACP wording accurately describes the product.
- Interaction states: passed. One quiet keyboard outline, no persistent glow, complete panel collapse, one reopen action, and working Sphere/Blob/silhouette selection.

## Findings

Round 1 missed a P1 functional disparity: ACP provider rows were discovery-only, so Claude Code, Codex, Gemini and Qwen had no provider-level Connect/Disconnect lifecycle and a discovered Claude Code CLI did not create a default agent. Round 2 added the full lifecycle and corrected a P2 indicator-color drift in the shared Settings switches and provider identity badges.

No actionable P0, P1, or P2 differences remain in the implemented provider and Settings indicator scope.

Residual test gaps: the first real native connection through an on-demand npm ACP bridge remains a manual verification step because it can download and execute the provider's official bridge. The narrow in-app browser cannot capture the native provider rows and does not expose Tauri `invoke`; provider lifecycle is therefore verified through component, registry, Rust, and build tests rather than claimed from browser screenshots. The earlier 390px reflow and 200% zoom gaps also remain.

## Comparison history

- Earlier P1/P2 findings: Settings structure drift, duplicate Settings navigation, redundant Engine/Provider agent fields, missing avatar editing/motion parity, persistent double focus glow, selected accent rails, and duplicate collapsed-panel controls.
- Fixes: rebuilt all six Settings sections on the Hermes shell; removed duplicate navigation and provider fields; connected the donor avatar libraries and motion modes; centralized neutral hover/selection/focus tokens; restored complete panel collapse and logical header controls; restored the transparent accent-responsive IntelliZen mark.
- Post-fix evidence: all six normalized comparison boards plus `intellizen-agent-editor-blob-1438x1440.png` and `intellizen-agent-panel-collapsed-1438x1440.png`.
- User-discovered round-2 P1: CLI providers could be listed but not connected or disconnected, and Claude Code had no default agent.
- Round-2 lifecycle fix: discovery now distinguishes the provider CLI, global ACP adapter, and supported on-demand bridge; Connect creates or repairs the default provider agent and starts it; Disconnect stops that provider's live agent sessions without deleting configuration; reconnect-on-launch and Disconnect Everything include ACP providers.
- Round-2 indicator fix: all Settings switches now share Hermes' track/knob treatment; provider identity uses runtime blue or the neutral self-running badge; connected, unavailable, destructive, selection, and metadata colors retain their separate semantic roles.
- User-discovered round-3 P2: the New Team action footer and error row forced the darker `--mantle` token against the modal's `--raised` body, creating a two-tone sheet.
- Round-3 modal fix: the action footer and error row now inherit the modal root surface; the team-name input remains a distinct editable plane using `--input`.
- User-discovered round-3 P2: the avatar-style and picture-action groups inherited the general pill's larger geometry, and `Replace picture` could wrap inside the identity column.
- Round-3 avatar-control fix: both groups now use the shared compact pill variant (11px labels, 20px controls, 2px group inset), the Sphere/Blob selected state uses the global pill contract, and picture-action labels stay on one line.
- Round-3 evidence: `design/features/hermes-settings-parity/evaluations/round-1/evidence/screenshots/intellizen-agent-editor-compact-avatar-controls.png`; the browser-accessible New Agent state verifies the shared compact selector, while the picture-action group is covered by the same primitive and a component regression test because profile pictures require the native host.
- User-discovered round-3 P1: Agent and Team sheets used an almost-full-viewport height cap, while shared application and confirmation dialogs still used a darker `--mantle` shell, heavier veil, borders, and smaller shadow instead of Hermes' modal plane.
- Round-3 modal-system fix: Agent is capped at Hermes' 86dvh and Team at 72dvh; Agent, Team, application, confirmation, command-palette, and accent dialogs now share one borderless `--raised` modal surface, a 42% crust veil with 7px blur, and the wide 0 40px 120px shadow. Shared dialog headers and footers remain on that single surface.
- Round-3 sizing evidence: `design/features/hermes-settings-parity/evaluations/round-1/evidence/screenshots/intellizen-agent-modal-hermes-height-719x870.png`. At a 719 × 870 viewport, the rendered Agent modal measures 588 × 748.2px (86dvh), centered with 60.9px top and bottom clearance, zero border, and the `--raised` surface.

final result: passed

---

# Design QA — Workflows source-locked reconstruction

**Historical and superseded.** Adam rejected this runs-first interaction and approved the card library with a visual composer on 2026-09-05. The findings below record an earlier pass against a conflicting reference; they are not current acceptance criteria. Use `design/features/app-refinement/PLAN.md` and its evidence for the current implementation.

## Comparison target

- Product authority: `docs/stages/design-system-v3.md`, Workflows K.6
- Exact local direction study: `/Users/adamking/.claude/file-history/c87195b3-a584-4ca5-89a5-c848127b6519/e40ec84b78137754@v5`, lines 600–710
- Native target: the running IntelliZen V3 Dev desktop app (`com.genzen.intellizen.v3dev`)
- Live data: 23 Registry records, five executable workflows, 18 SOP-only records, 38 Docs entries, and 20 runs for the selected workflow

## Findings and fixes

- The earlier workflow rail and persistent builder work plane contradicted the approved HTML and have been removed.
- The page now follows the source order: waiting decision, one executable-workflow ledger, then the selected workflow’s run history.
- The ledger columns and actions match the direction study: Workflow, Runs as, Last ran, Result, Next, and Run/Finish. SOP-only records no longer appear here.
- The selected workflow has exactly four outer views: Runs, Steps, Schedule, and Source. Runs is the default and exposes Started, By, Result, Receipts, and Took.
- Steps is a vertical definition list with the five-kind palette, input list, editable trigger and step cards, plus controls, and Yes/No condition outcomes.
- The builder is the source’s compact 640px three-part frame: 216px palette, centered card flow, and the existing agent panel. Its header has the three internal views and one user-owned Save action.
- Graph and Dry run are internal views over the same unsaved definition. The Graph view rendered the live seven-step topology; Dry run returned “Role, approval, and graph checks passed” without dispatching work.
- All 18 SOP-only records now appear in Docs as read-only documents. Their “Make runnable” action opens the existing Registry record in Steps with the SOP body seeded into a valid role-assignment definition; no duplicate record is created.
- The native app was inspected directly through bundle ID `com.genzen.intellizen.v3dev`. No browser and no production app were used.

## Related live verification

- Docs loaded the stored body of “Copywriting Harness Production Freeze” and the graph-embedded “Wave 1 graph proof 2026-09-03”. The graph now renders in its authored body position, after the document heading, rather than above the page title.
- Graph settled to “Bali Cult Connections” with 47/47 nodes and 57/57 edges; the initial unresolved state now shows Loading graph instead of a false empty-state message.
- The application sidebar contains Places only. The agent target dropdown contains Agents and Teams only.
- Verification passed: 523 tests, one skipped; file-size, product-contract, design-system, contrast, TypeScript, and diff checks all passed.

final result: passed

## App refinement — final independent native review, 2026-09-05

The current accepted implementation is the workflow card library and editable visual composer described in `design/features/app-refinement/PLAN.md`. Canvas controls use contextual menus and a normal-flow toolbar; measured expanded cards reflow neighbours without changing saved arrangements. Expanded surfaces use neutral theme planes, with no drop shadows or accent wash. Native Mocha/Latte, keyboard, drag/Undo and 200% checks pass. The scoped palette passes text contrast in all seven themes.

Integrated verification: 637 app tests passed (one existing environment-dependent parity skip), 30 MCP tests passed, 53 native tests passed (three opt-in integrations ignored), TypeScript/design checks, native lint/build, frontend build and secret scan passed. Full evidence, exact source fingerprint and limitations are in `design/features/app-refinement/evidence/VERIFICATION.md`; independent visual findings are in `NATIVE-REVIEW.md` alongside it. This supersedes earlier runs-first acceptance and is not deployment or Adam’s personal acceptance.

## Final panel polish and post-cleanup walkthrough — 2026-09-05

Latest bounded native acceptance: `design/features/app-refinement/evidence/final-polish/NATIVE-REVIEW.md`. This closes the earlier ejected-heading clipping and historical pending workflow-review notes. Docked/ejected/HUD composers use the shared control radius; floating surfaces have no exterior shadow, explicit transparent native backgrounds and monitor-bounded resizing. Docs folder/read/edit navigation and both workflow editors passed the fresh native walkthrough after the audit cleanup. Full evidence, test results and screenshot transparency limits are recorded in that folder’s `VERIFICATION.md`.

## Pane controls and theme assessment — 2026-09-05

Latest acceptance: `design/features/app-refinement/evidence/pane-controls/VERIFICATION.md`. Single Settings entry, compact picker/actions header, four internal resize edges with keyboard/persistence, and collapsed pill HUD pass independent native review. Full suite: 670 passed, one existing skip; final focused resize tests, checks, build and secret scan pass. The compact header supersedes the previous separate ejected title.

The bounded theme audit found gaps in primary-button and selected-control text contrast; see `pane-controls/THEME-AUDIT.md` under the same evidence directory. Earlier scoped contrast passes do not certify these combinations. The findings remain open, and the design contract now states this coverage limit.

## Accent states and HUD voice visibility — 2026-09-05

The preceding shared-token contrast findings are now repaired. All seven themes use the chosen accent in hover/selection; Appearance labels the slider Accent Strength. Detached panel/HUD leaves no placeholder strip, and HUD voice icons remain visible with disabled-state reasons. Final evidence: `design/features/app-refinement/evidence/accent-states/VERIFICATION.md`. The expanded source matrix passes 40,964 foreground/state checks; representative native visuals passed. The final direct-HUD target-continuity check was interrupted by active user input and is explicitly limited in the native report.

## Settings follow-up — 2026-09-05

The earlier Hermes Settings parity acceptance missed provider-wide CLI capabilities: the donor included plugins and commands, while IntelliZen's implementation only exposed Hermes skills/tools/connections and frontend extensions. The Activity delivery also incorrectly moved the user's Settings destination and introduced bespoke rail controls. These findings supersede the earlier acceptance for those behaviors. Repair and current coverage: `design/features/hermes-settings-parity/CLI-INVENTORY-VERIFICATION.md`.
