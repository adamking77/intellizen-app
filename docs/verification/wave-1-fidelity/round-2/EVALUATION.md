# Artifact Evaluation — IntelliZen Wave 1 donor fidelity, round 2

## Gate summary

- Verdict: BLOCKED on native evidence, not on another known code defect
- Review mode: diagnostic donor-fidelity rerun
- Artifact/version: `063de67+working-tree-round-2`
- Task/spec: Fable 5.1 `ROADMAP.md` remaining item 4
- EVAL/policy version: no project `EVAL.md`; evaluator fallback only
- Page/task shape: native desktop workspace shell with persistent agent interaction
- Score/threshold: not scored
- Active blockers: macOS is locked; required native states cannot be captured
- Evidence sufficiency: partial
- Previous/best round: round 1 / round 2

## Scope and limitations

Round two re-captured every Settings section and the main shell after the two
round-one fixes. It also exercised sidebar, focus, and panel visibility from the
new toolbar. Native eject/HUD and populated data-backed states remain outside the
available evidence because macOS locked.

## Evidence manifest

See [`evidence/manifest.md`](evidence/manifest.md) and
[`evidence/interaction-smoke.md`](evidence/interaction-smoke.md).

## Dimension ledger

### Information architecture and interaction

| Subcheck ID | Verdict | Evidence | Result | Return destination |
| --- | --- | --- | --- | --- |
| D2.1 | Fixed | R2-SHELL-01, R2-SMOKE-01 | Main strip exposes the donor control cluster; sidebar, focus, and panel visibility paths pass | Native verification for eject/HUD |

### System craft and visual fidelity

| Subcheck ID | Verdict | Evidence | Result | Return destination |
| --- | --- | --- | --- | --- |
| D3.1 | Fixed | R2-SET-01, R1-DONOR | Settings titles now match donor anatomy; Voice remains intentionally title-free | None |
| D3.2 | Not proven | R1-DONOR | Current native floating modes still lack executable screenshots | Native verification |

## Blocking findings

| ID | Condition | Evidence | Impact | Required return action |
| --- | --- | --- | --- | --- |
| B1 | macOS locked before current native matrix | R1-DONOR, R2-SHELL-01 | Full roadmap fidelity claim unavailable | Unlock macOS; run round 3 |

## Prioritized return plan

1. Once macOS is unlocked, capture populated Agents, row menu, team sheet, live
   panel messages, ejected panel, and HUD; smoke the two native toolbar actions.
2. If those renders reveal a concrete mismatch, fix only that mismatch and
   re-capture it.

## Round comparison and stop state

- Fixed: D2.1 shell control discoverability; D3.1 Settings title anatomy.
- Unchanged: native evidence gap for data-backed and floating modes.
- Regressed: none observed.
- New: none.
- Best valid version: `063de67+working-tree-round-2`.
- Stop/continue reason: code work is ready to continue, but the required native
  fidelity gate needs the Mac unlocked.
