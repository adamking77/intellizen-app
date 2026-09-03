# Artifact Evaluation — IntelliZen Wave 1 donor fidelity, round 3

## Gate summary

- Verdict: PASS for Fable 5.1 remaining-work item 4
- Review mode: diagnostic donor-fidelity rerun
- Artifact/version: `063de67+working-tree-round-3`
- Task/spec: Fable 5.1 `ROADMAP.md`, Wave 1 status, remaining item 4
- Page/task shape: native desktop workspace shell with persistent agent interaction
- Active blockers: none for the fidelity pass
- Evidence sufficiency: sufficient for the fidelity pass
- Previous/best round: round 2 / round 3

This evaluation alone did not accept Wave 1 or declare the app done. Adam completed the
one-sitting Wave 1 walk on 2026-09-03; its failures and the verified functional
repairs are recorded in `../../wave-1-walk.md`. Four interaction repairs were
then held behind Adam's binding design-approval gate. Those repairs and the
final Done audit are recorded in the linked walk and release evidence.

## Scope and limitations

Round three exercised the current built `.app`, not `tauri dev`: populated
Agents, row menu, agent editor, team sheet, the real Agents-to-panel handoff,
docked/collapsed/detached/HUD panel states, shell controls, Appearance, and
Voice. The earlier Phase A walk remains the recorded proof for streamed message
rows and approvals; no synthetic message was added merely to make a screenshot.

## Evidence manifest

See [`evidence/manifest.md`](evidence/manifest.md) and
[`evidence/interaction-smoke.md`](evidence/interaction-smoke.md).

## Dimension ledger

### Information architecture and interaction

| Subcheck ID | Verdict | Evidence | Result | Return destination |
| --- | --- | --- | --- | --- |
| D2.1 | Meets | R3-SHELL-01, R3-PANEL-01 | The donor control cluster exposes sidebar, focus, collapse, eject, and HUD modes in the native shell | None |
| D2.2 | Meets | R3-HOOK-01 | Agents **Open in chat** selects the real profile and opens the actual panel; no synthetic shortcut remains | None |
| D2.3 | Meets | R3-REFLOW-01 | At the 200%-equivalent viewport, the side panes collapse, controls stay reachable, and horizontal overflow is absent | None |

### System craft and visual fidelity

| Subcheck ID | Verdict | Evidence | Result | Return destination |
| --- | --- | --- | --- | --- |
| D3.1 | Meets | R3-SET-01, R1-DONOR | Appearance title anatomy and Voice layout match the donor pattern | None |
| D3.2 | Meets | R3-AGENT-01, R1-DONOR | Populated cards, menu, editor, and team sheet preserve donor anatomy, density, and copy hierarchy | None |
| D3.3 | Meets | R3-PANEL-01, R1-DONOR | Docked, compact, detached, and HUD states are all executable native states with coherent transitions | None |

## Blocking findings

None for item 4. Round two's locked-screen blocker is closed by the native
release captures in R3-SHELL-01 through R3-PANEL-01.

## Round comparison and stop state

- Fixed: native proof for populated Agents, row menu, agent editor, team sheet,
  Agents-to-panel handoff, panel collapse, ejected panel, HUD, and redock.
- Unchanged: donor-aligned tokens, pane geometry, settings subnavigation, and
  editor anatomy.
- Regressed: none observed.
- New: 200%-equivalent reflow evidence with zero horizontal overflow.
- Best valid version: `063de67+working-tree-round-3`.
- Stop/continue reason: fidelity item 4 passes; item 5 is active after Adam's
  walk and awaits the four approved interaction repairs recorded in the walk.
