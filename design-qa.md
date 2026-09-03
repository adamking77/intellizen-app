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
