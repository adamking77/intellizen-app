# Artifact Evaluation — IntelliZen Wave 1 donor fidelity

## Gate summary

- Verdict: REVISE
- Review mode: diagnostic donor-fidelity pass
- Artifact/version: `063de67+working-tree`
- Task/spec: Fable 5.1 `ROADMAP.md` remaining item 4
- EVAL/policy version: no project `EVAL.md`; evaluator fallback only
- Page/task shape: native desktop workspace shell with persistent agent interaction
- Score/threshold: not scored; no approved project rubric exists
- Active blockers: native evidence missing for populated Agents, live messages, ejected panel, and HUD
- Evidence sufficiency: partial
- Previous/best round: first round / current working tree

## Scope and limitations

- Paths/states: every Settings section; shell; Agents empty and editor; target
  picker; donor populated Agents, editor, team sheet, row menu, and panel picker.
- Viewports/devices/themes/locales: macOS desktop; 1272×768 donor; 1440×900
  Chromium current; 1500×940 logical current native window; Mocha dark; English.
- Accounts/fixtures: Adam's local donor data; current native workspace; browser
  without Tauri data; installed D.13 healthy and broken fixtures.
- Evidence not collected: current populated native Agents/team states, live message
  bubbles, native ejected panel, usable native HUD.
- Prohibited side effects: no save, delete, send, database mutation, deploy, or
  publish action.

## Evidence manifest

See [`evidence/manifest.md`](evidence/manifest.md). The deterministic facts,
page profile, and interaction log are adjacent in the same directory.

## Browser/device facts

### DOM/layout/accessibility

The inspected current routes have coherent landmark, dialog, listbox, alert,
textbox, and button semantics and no observed horizontal viewport overflow. The
new-agent dialog correctly focuses the name field. Appearance lacks a page
heading. See [`evidence/dom-layout.md`](evidence/dom-layout.md).

### Page/content profile

The product model matches Fable 5.1: Hermes plus ACP agents, data-backed work,
generic plugins, and no hard-coded Needs Me surface. Architecture-specific copy
changes on Providers and General are treated as intentional product truth, not
visual drift. See [`evidence/page-profile.md`](evidence/page-profile.md).

### Interaction smoke

Appearance selection, agent editor, target picker, donor row menu, donor editor,
donor team sheet, and donor target picker all opened and recovered without a
durable side effect. See [`evidence/interaction-smoke.md`](evidence/interaction-smoke.md).

### Screenshot/visual evidence

The port is substantially closer than the first browser capture implied. Once
the same Connected-pane preference and viewport differences are accounted for,
Appearance cards, settings subnavigation, Agents editor, color system, selection
treatment, and three-pane proportions closely track the donor.

Two concrete visual deviations remain: Settings title anatomy and the missing
main-strip control cluster. The current HUD cannot yet be judged from executable
evidence.

### Runtime/data truth

The current native screenshot proves a connected Hermes engine, real workspace
and database widgets, and D.13 plugin success/failure isolation. Browser-native
API errors are not runtime failures.

## Dimension ledger

### Product intent

- Weight: diagnostic only
- Score: not scored
- Why not higher: native end-to-end interaction evidence is incomplete.

| Subcheck ID | Verdict/score | Evidence | Deduction | Recommendation | Return destination |
| --- | --- | --- | --- | --- | --- |
| D1.1 | Meets | CUR-NATIVE-01, SRC-01 | No unsupported product surface found | Preserve current model | None |

### Information architecture and interaction

- Weight: diagnostic only
- Score: not scored
- Why not higher: shell-level controls are not discoverable in the current main strip.

| Subcheck ID | Verdict/score | Evidence | Deduction | Recommendation | Return destination |
| --- | --- | --- | --- | --- | --- |
| D2.1 | Revise | CUR-NATIVE-01, DONOR-AGENT-01, SRC-01 | Donor view/panel controls are absent from the main strip | Reuse existing actions in a compact toolbar | `src/components/layout/app-shell.tsx` |

### System craft and visual fidelity

- Weight: diagnostic only
- Score: not scored
- Why not higher: title treatment drifts and floating-window proof is incomplete.

| Subcheck ID | Verdict/score | Evidence | Deduction | Recommendation | Return destination |
| --- | --- | --- | --- | --- | --- |
| D3.1 | Revise | CUR-SET-01, DONOR-SET-01 | Missing Appearance title; oversized title-case headings elsewhere | Normalize applicable titles | `src/components/settings` |
| D3.2 | Meets with recheck | CUR-AGENT-01, DONOR-AGENT-01 | Editor anatomy closely matches; native populated state missing | Native re-capture | Verification |
| D3.3 | Not proven | DONOR-HUD-REF-01, SRC-01 | Wrong browser window geometry and blank native capture | Native re-capture after unlock | Verification |

## Blocking findings

| ID | Condition | Evidence | Impact | Required return action |
| --- | --- | --- | --- | --- |
| B1 | Required native states were not available | CUR-NATIVE-01, DONOR-HUD-REF-01 | Cannot claim completion of roadmap fidelity item 4 | Unlock macOS and capture round two |

## Prioritized return plan

1. Correct Settings title anatomy, then re-capture all six sections.
2. Add the donor-style main control cluster by calling existing shell/panel
   actions only; no new state system.
3. After macOS is unlocked, capture and smoke-test the missing native states.

## Round comparison and stop state

- Fixed: not applicable; first round.
- Unchanged: core pane geometry, token palette, Settings subnavigation, editor anatomy.
- Regressed: not established.
- New: title drift and absent main-strip controls documented with stable IDs.
- Best valid version: `063de67+working-tree`.
- Stop/continue reason: continue into a separate fix-and-rerun phase; final donor
  fidelity remains unproven until the native capture set exists.

## Learning candidates

| Finding pattern | Candidate source update | Evidence across rounds/features | Governance owner |
| --- | --- | --- | --- |
| Component ports preserve anatomy but drift on page-title treatment | Add one project settings-title primitive | Four Settings sections plus Appearance | Project maintainer |
