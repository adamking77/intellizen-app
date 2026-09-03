# Wave 1 acceptance readiness

Readiness audit captured 2026-09-03 against the sole running local release
`.app`. Adam confirmed that he wrote the script with Fable and it does not need
a second approval. This is readiness, not acceptance day 1; the scene must pass
unchanged on three days.

| Draft step | Current evidence | Readiness |
| --- | --- | --- |
| 1. Open at midday; Home shows chosen pins | The release app opens Home with saved workspace views and the explicitly installed Wave 1 proof widget. | Ready. |
| 2. Work requiring Adam is ordinary data | Adam confirmed it remains a database section or kanban row and rejected a first-party Needs Me surface. | Ready. |
| 3. Answer where the decision lives | Workflow Run `48830d19-55ea-45cc-8f3c-f5e0fa03aa5e` preserves its inline founder-approval decision and payload. | Ready. |
| 4. Open a project; use Files, Board, Data, Sessions | Adam passed the Phase 0.2 project/tree walk on 2026-09-02. | Ready. |
| 5. Accept and reject proposal hunks | The disposable **Wave 1 proposal walk** passed the exact-file preflight; Adam declined a redundant repeat. | Ready. |
| 6. Open a live database view | Adam confirmed the Agent Workload chart in Database. | Ready. |
| 7. Home contains only chosen/agent-added items | Saved views and the explicitly installed proof widget use the same pin/widget contract. | Ready; evaluated with step 1. |
| 8. Ask any agent from the panel | Fiona answered **Agents** from `/agents` in the release app; Wave 1 ACP also passed a streamed native contract turn. | Ready. |
| 9. Eject, HUD, and voice | Adam confirmed panel collapse/expand, microphone capture, and essentially real-time composer transcription; the Wave 1 walk covers eject/HUD/redock. | Ready. |
| 10. Close; inspect scheduled records tomorrow | The release app created Hermes cron job `9c1e6c93e398` for **V2 Gate 4 role-directed proof** under profile `fiona`. Adam required the proof to run immediately rather than delay the build overnight. After a first scheduled occurrence exposed and isolated an unresolved credential override, the repaired job fired again from the scheduler at 14:13. Hermes execution `f3a77ae6af3d4ee3b062b9d348f75096` completed cleanly and ordinary Workflow Run `f33278cb-85aa-48e7-bdcc-a8ef054d357c` reached **Needs approval** with passed independent verification and seven receipts. No tests, files, external evidence, external action, or simulated action occurred. The job is restored to daily `07:00`. Fiona's separate `KeepAlive` gateway and the native hide/reopen check prove that closing IntelliZen does not stop scheduling or launch a duplicate app. | Ready. Scheduled execution, workflow records, approval boundary, and close/reopen lifecycle passed; repeat this same line in the three-day scene. |

## Day 1 boundary

Day 1 uses the exact approved text in `ROADMAP.md`. Any product or script
change resets the consecutive three-day count, as required by the Done
definition.

The three-day record is a parallel acceptance track. It blocks only the final
Fable 5.1 completion claim; it does not block continued app work Adam directs.
