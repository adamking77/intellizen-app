# Wave 1 walk

Fable 5.1 `ROADMAP.md`, remaining-work item 5. One sitting in the built app.

## Artifact

- App: `src-tauri/target/release/bundle/macos/IntelliZen.app`
- Build tree: roadmap base `063de67`, preserved in local completion commit
  `23182215da9047ef133a54029dcb7a175fe30807`
- Hermes: connected on `127.0.0.1:60780`
- Walk owner: Adam
- Date: 2026-09-03
- Result: **Feedback repairs and E.17 live scheduled run passed**

This local build contains the local access key for Adam's walk. It is a
local-only release artifact, not a publishable distribution build.

Preflight on 2026-09-03: an external-file Documents row was opened in the
rebuilt `.app`; Docs rendered its workspace copy and left the external file
unchanged. Evidence: `wave-1-fidelity/round-3/evidence/screenshots/current-release-docs-external-workspace-copy.png`.

The walk fixtures used were:

- **Wave 1 ACP** is a Codex ACP agent. On Agents, use its `…` menu and choose
  **Open in chat**. The panel should say `Ready — Wave 1 ACP can answer.`
- **Wave 1 mixed team** contains `fiona` (Hermes) and `Wave 1 ACP` (Codex).
  Use the team's `…` menu and choose **Open in chat**. Its existing room is
  empty and will be reused; ask the room question there.
- **Wave 1 proposal walk** is the disposable Docs proposal described below.

## Walk, in order

- [x] **Roster and editor — B.5–B.6.** On Agents, open a Hermes profile in
  chat (for example `fiona`), then use **Wave 1 ACP** in the same panel. Open
  one agent editor and the **Wave 1 mixed team** sheet; confirm the identity,
  engine/model, voice, and context fields are usable.
- [x] **Room — B.7.** Open a team containing one Hermes profile and one ACP
  agent. Use **Wave 1 mixed team**, ask one question, and see both answer in
  the room log.
- [x] **Attention remains data — B.8.** Open the database section or kanban
  row Adam uses for work requiring him. Confirm it is ordinary data and there
  is no first-party attention surface.
- [x] **Panel and voice — C.9–C.11.** From the same conversation, collapse and
  reopen the panel, eject it, reduce it to the HUD, redock it, dictate one
  prompt, and use one message action.
- [x] **Plugin contract — D.12–D.14.** Open the installed proof plugin's route
  and sidebar entry, add its Home widget, run its palette command, and invoke
  its panel action. Confirm the deliberately broken plugin shows its own
  failure without breaking the healthy plugin. If testing agent-authored
  installation, approve that local plugin explicitly before it first loads.
- [x] **Charts — D.15.** Open a database chart view and confirm the current
  data is legible in the selected flavor and accent.
- [x] **Document proposal — E.16.** Open an agent-authored proposal in Docs,
  accept one hunk and reject one, then confirm the file contains only the
  accepted change. A disposable fixture is ready: search for **Wave 1 proposal
  walk**, leave line 3 checked, uncheck line 9, and click **Accept 1**. The
  local file is `~/vault/intelligence/documents/wave-1-proposal-walk.md`.
- [x] **Unattended work — E.17.** Schedule one workflow through Hermes cron,
  optionally dispatch its step progress to a kanban board, and confirm the
  ordinary run records and any requested cards. The repaired release app
  created live job `9c1e6c93e398`; its immediate scheduled proof created
  ordinary Workflow Run `f33278cb-85aa-48e7-bdcc-a8ef054d357c`, recorded all
  seven receipts, and stopped at founder approval after verification passed.
- [x] **Graph in Docs — E.18.** Export a Graph image or embed block and place it
  in a document; confirm the rendered snapshot links back to Graph.

## Feedback

Record only what fails or feels wrong on these Wave 1 surfaces. Keel applies
that feedback before Fable remaining-work item 6 begins.

- **B.5–B.6 passed.** Fiona and Wave 1 ACP opened in the agent panel; the agent
  and mixed-team editors exposed the expected identity and engine fields.
- **B.7 failed.** `Open in chat` opened the room in the central app surface,
  not the chat window Adam expected. Fiona replied; Wave 1 ACP returned an
  internal error. Evidence:
  `wave-1-fidelity/round-3/evidence/screenshots/current-release-room-acp-failure.png`.
  Repair status: the obsolete `@zed-industries/codex-acp` package was replaced
  by `@agentclientprotocol/codex-acp`; an ignored live Rust contract test
  completed a real streamed turn with `ACP OK`.
- **B.8 passed.** Work requiring Adam remains an ordinary database/kanban row;
  no first-party Needs Me surface is permitted.
- **C.9–C.11 partially passed.** Collapse and expand worked. Microphone capture
  and transcription worked after voice was enabled, but transcription arrived
  only after recording rather than in real time. The panel-level plugin action
  was hidden in an Actions dropdown, which Adam rejected as unusable.
- **D.12–D.14 healthy-plugin path passed.** The proof route/sidebar entry,
  Home widget, palette command, and Fiona panel action all worked. The broken
  fixture remains automated proof rather than a completed human-walk step.
- **D.15 passed.** The Agent Workload chart was visible in the Tasks database.
- **E.16 was not repeated.** The disposable proposal had already passed the
  preflight and Adam declined a redundant walk.
- **E.17 failed.** Selecting `V2 Gate 4 role-directed proof` and pressing
  Schedule did not open the scheduling surface. Adam deferred redesign of the
  Workflows page to a later stage; only this functional defect is in Wave 1.
  Repair status: the local ACP target now uses the assigned `keel` identity;
  the rebuilt app classifies the workflow as Runnable, opens its Schedule
  dialog, and created verified Hermes cron job `9c1e6c93e398` for Fiona at
  `07:00`. A manual transport preflight exposed a scheduled-agent contract
  violation and was recorded Blocked rather than counted. Adam required the
  real proof immediately rather than overnight. A 14:07 scheduled occurrence
  exposed a stale credential override and created no run; after repairing that
  exact path, the same job fired again at 14:13. Hermes execution
  `f3a77ae6af3d4ee3b062b9d348f75096` completed cleanly and Workflow Run
  `f33278cb-85aa-48e7-bdcc-a8ef054d357c` reached **Needs approval** with passed
  verification and seven receipts. Adam later directed that the proved job
  remain paused.
- **E.18 failed.** Copying the Graph embed reported success only after a graph
  was selected, a prerequisite the UI did not make discoverable. Quick Note
  creation was slow enough to invite repeated clicks, and the pasted embed did
  not render in Docs. Adam rejected copy/paste as the eventual workflow; any
  replacement requires his approval before design or implementation.
  Repair status: Docs no longer runs a whole-vault sync after every list
  refresh, repeated creation clicks are disabled, and editor-normalized graph
  fences parse and render. The visual editor now keeps portable frontmatter
  out of editable content so an ordinary edit cannot duplicate metadata.

## Repair verification

- The successor Codex ACP adapter completed a real streamed turn with
  `ACP OK`; the old failed room remains preserved as failure evidence.
- **Open in chat** now reuses the real room inside the right panel while the
  Agents page remains in the center. Deduplicated room names are recognized on
  reopen so the action does not keep creating additional rooms.
- Plugin panel actions are direct one-click buttons above the composer. The
  proof action is visible for Fiona without an Actions dropdown; the installed
  broken fixture still fails alone.
- Adam confirmed on 2026-09-03 that microphone words appear in the chat
  composer essentially in real time. Stop still uses the selected local model
  for the final transcript.
- The `keel` execution target makes the selected Gate 4 workflow Runnable.
  Its **Schedule** control opens the dialog and the final release app created
  job `9c1e6c93e398`; the corrected job then passed a real scheduler-fired run
  through the founder-approval boundary without executing the gated action.
- Quick Note creation is immediate, duplicate clicks are gated while pending,
  portable frontmatter stays outside the visual editor, and conventional Graph
  embed fences render a linked snapshot.
- Graph's **Add to document…** action now offers an existing or new document,
  writes a linked snapshot, opens Docs directly, and never uses the clipboard.
  The native proof created **Wave 1 graph proof 2026-09-03** and rendered its
  linked snapshot with **Open graph**.
- The rebuilt project room exposes Files, Board, Data and Sessions. The final
  native walk rendered each surface, opened Data's linked Operations record,
  and caught a real Sessions 422. `69625a9` replaced the invalid 2,000-row
  request with pagination over Hermes's 500-row contract; the rebuilt Sessions
  surface then passed.
- `pnpm check`, 392 frontend tests (one intentional skip), `git diff --check`,
  and the local-only `pnpm smoke` gate passed on 2026-09-03.
- A read-only live hierarchy query returned 23 project nodes, including all 16
  legacy projects and all 9 investigations, with no duplicate legacy-project
  mapping.

Adam approved all four interaction repairs before implementation. They are now
implemented and verified. The Workflows page redesign remains deferred by
Adam; Wave 1 repaired only the broken Schedule control. E.17 is complete from
the live scheduled proof.
