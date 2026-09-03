# Wave 1 acceptance readiness

Readiness audit captured 2026-09-03 against the sole running local release
`.app`. Adam confirmed that he wrote the script with Fable and it does not need
a second approval. This is readiness, not acceptance day 1. The acceptance
run begins only after the app is functionally finished and its final artifacts
exist; it may not block construction.

| Draft step | Current evidence | Readiness |
| --- | --- | --- |
| 1. Open at midday; Home shows chosen pins | The release app opens Home with saved workspace views and the explicitly installed Wave 1 proof widget. | Ready. |
| 2. Work requiring Adam is ordinary data | Adam confirmed it remains a database section or kanban row and rejected a first-party Needs Me surface. | Ready. |
| 3. Answer where the decision lives | Workflow Run `48830d19-55ea-45cc-8f3c-f5e0fa03aa5e` preserves its inline founder-approval decision and payload. | Ready. |
| 4. Open a project; use Files, Board, Data, Sessions | Native readback on 2026-09-03 exposed only Files and Case. The missing project-room tabs are implemented in source and await final native verification. | **Not ready until native verification passes.** |
| 5. Accept and reject proposal hunks | The disposable **Wave 1 proposal walk** passed the exact-file preflight; Adam declined a redundant repeat. | Ready. |
| 6. Open a live database view | Adam confirmed the Agent Workload chart in Database. | Ready. |
| 7. Home contains only chosen/agent-added items | Saved views and the explicitly installed proof widget use the same pin/widget contract. | Ready; evaluated with step 1. |
| 8. Ask any agent from the panel | Fiona answered **Agents** from `/agents` in the release app; Wave 1 ACP also passed a streamed native contract turn. | Ready. |
| 9. Eject, HUD, and voice | Adam confirmed panel collapse/expand, microphone capture, and essentially real-time composer transcription; the Wave 1 walk covers eject/HUD/redock. | Ready. |
| 10. Close; inspect scheduled records tomorrow | The release app created Hermes cron job `9c1e6c93e398` for **V2 Gate 4 role-directed proof** under profile `fiona`. Its scheduler-fired proof completed cleanly and ordinary Workflow Run `f33278cb-85aa-48e7-bdcc-a8ef054d357c` reached **Needs approval** with passed verification and seven receipts. At Adam's direction the job was paused on 2026-09-03 so acceptance cannot run before construction is complete. | Technically proved; intentionally paused until the app-finished gate. |

## Day 1 boundary

Day 1 cannot begin before the app is functionally finished and the final
artifacts are built. It then uses the exact approved text in `ROADMAP.md`.
Readiness checks and stage proofs do not count as Day 1.
