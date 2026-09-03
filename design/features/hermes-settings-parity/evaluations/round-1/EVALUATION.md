# Artifact Evaluation — Hermes Settings and interaction parity

## Gate summary

- Verdict: PASS
- Review mode: prototype
- Artifact/version: `v3/phase-0` working tree at base `28876881df96b55cec7ee3b5c9ececd35c8cf5f4`
- Task/spec: `design/features/hermes-settings-parity/SPEC.md`
- EVAL/policy version: diagnostic fallback; no project `EVAL.md`
- Score/threshold: not calculated; no approved weights or threshold
- Active blockers: none for the requested desktop parity scope
- Evidence sufficiency: sufficient for Settings, avatar-editor, and panel-collapse parity; partial for native-only data integrations, 390px, and 200% zoom

## Findings

No actionable P0, P1, or P2 disparity remains in the reviewed scope.

The Settings shell, typography, layout rhythm, surface hierarchy, neutral selection, hover language, control density, and section anatomy track Hermes. Product-specific copy differences correctly preserve IntelliZen's Hermes-plus-ACP model. The New Agent dialog exposes Sphere/Blob selection, Blobatar silhouettes, color selection, voice, model, identity, and context without the redundant Engine or Provider dropdowns. Collapsing the agent panel removes the complete right panel and leaves one logical reopen control.

## Fidelity surfaces

- Fonts and typography: Geist/Geist Mono hierarchy, light tracked capitals, body sizing, and truncation follow the donor system.
- Spacing and layout rhythm: Settings navigation width, content width, dividers, row height, padding, and pane seams match the donor composition.
- Colors and tokens: ordinary selection and hover use neutral raised/wash planes; accent is reserved for action, focus, status, and swatches. Appearance palette differences reflect each app's saved accent.
- Image and asset fidelity: the original IntelliZen mark is used from a transparent SVG source and tinted through the active accent token. Procedural avatars use the same sphere and Blobatar packages, not drawn substitutes.
- Copy and content: donor text is retained where behavior matches; IntelliZen-specific provider and reconnect language explains the actual Hermes/ACP runtime.
- States and behavior: active, hover, disabled, focus, modal, Blob/Sphere, and collapsed-panel behavior use the shared state contract. No persistent double selection glow remains.

## Scope limitation

Browser visual evidence cannot exercise Tauri `invoke` calls. The installed production app and v3 development process currently resolve to the same visible IntelliZen accessibility identity, so native automation selected production; it was not manipulated. This prevents a release-level native verdict but does not invalidate the requested visual parity comparison.

## Stop state

Stop. The desktop parity scope passes with no P0/P1/P2 return work. Release authorization remains outside this diagnostic review.
