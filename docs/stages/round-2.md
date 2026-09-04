# Round 2 — closing the gap between the roadmap and the build

Written 2026-09-04 from a six-reviewer audit of `v3/phase-0` at `52b6c8c`
against `ROADMAP.md`, the hermes-app donor, and the Hermes source at the pin.
Plain language. Read `ROADMAP.md` first; its rules still bind. This file
adds stages, it does not replace any.

## What the audit found, in one paragraph

The plan was mostly built. Tokens, flavors, fonts, the gateway client, the
ACP registry, the agent editor, proposals, plugin isolation, and charts are
faithful. Three things are not: the center panel is half of what the roadmap
table says, the Intel desk never became case tabs, and the app rebuilt or
ignored several things Hermes already does (hosted rooms, project sessions,
kanban events, plugin listing). Two stages were marked done without proof
(D.13 fixture retired, D.14 never exercised). Four donor behaviours were
ported wrong. The Hermes pin is 353 commits behind the engine actually running.

## Rules for this round

- Same working style: one builder per stage, disjoint files, screenshots,
  overseer runs `pnpm check`, `pnpm test`, clippy on the combined tree.
- Stages marked **[approval]** touch a user workflow and stop at a shown
  flow until Adam says yes, per the 2026-09-03 gate. Everything else is a
  defect repair or an engineering call and proceeds without asking.
- Commit per green stage. No pushes. No migrations without Adam's word.
- Do not start a **[approval]** stage until its flow is approved; do the
  repair stages meanwhile.

## Phase F — repairs (about 1 day, no approvals needed)

F.1 **One ACP session per place.** Today the panel and every room share a
    single Claude Code conversation (`src-tauri/src/acp.rs:604`). Key live
    sessions by agent plus caller plus working directory. Rooms and the
    panel get their own. *Open it: ask Claude Code something in the panel and
    something else in a room; neither sees the other.*
F.2 **Edit and ask again rewinds.** Port the donor's drop-from behaviour
    so later turns leave the screen before the resend
    (`src/components/layout/agent-panel.tsx:292`). *Open it: edit an
    earlier message, the replies after it disappear.*
F.3 **HUD behaviour.** Fix the inverted drag guard (`hud.tsx:178`), make
    HUD dictation fill the draft instead of sending (`ejected-panel.tsx:196`),
    keep the composer typeable while Hermes starts, restore "Open Settings"
    on a failed turn, persist HUD mode across a panel reload, add a visible
    Stop on the collapsed bar. *Open it: drag the HUD by its empty ground,
    dictate into it, correct a word, then send.*
F.4 **Remove what breaks the rules.** Delete the dashboard-token scraping
    in `src/services/voice.ts`, the empty `src/services/runtimes/`, the
    unused `voice_speak` command, the two no-op palette commands, and the
    `fiona_inbox` webhook fallback in `src/services/agent.ts`. Remove the
    "Fiona is the only counterpart" rule from `intellizen-cockpit-spec.md`.
F.5 **Approval cards show every choice.** Hermes's `session` choice and
    the adapter's `reject_always` currently collapse to fewer options
    (`acp-session.ts:170`, `acp_wire.rs:138`). Show what the agent offered.
F.6 **D.13 proof lives again.** Point `scripts/verify-plugin-fixture.mjs`
    at a fixture that stays installed under a loader-ignored proof folder,
    and add it to `pnpm smoke`.

## Phase G — the engine seam, second pass (about 2 days)

G.1 **Bump the pin.** Move `HERMES_PIN` to the revision the running engine
    executes, run the parity test, fix what turns red. Add every REST path
    the app calls (cron, kanban, sessions, skills, toolsets, config,
    profiles, audio) to the parity test so the seam is guarded on both
    doors. Add a runtime check through `gateway.capabilities` so the status
    bar can say when the engine and the pin disagree.
G.2 **Attach to any running Hermes.** Discover an engine started outside
    the app, not only one recorded in our own `engine.json`, so Fiona and
    the dashboard share it. *Open it: start `hermes serve` in a terminal,
    open the app, the footer names that one.*
G.3 **Sessions survive.** Rehydrate panel threads from `session.history`
    and `session.events.since` after a restart or relaunch. Handle the six
    unhandled events (`tool.generating`, `tool.output_risk`,
    `reasoning.available`, `message.interim`, `todo.updated`,
    `notification.clear`). Render the usage receipt already reduced from
    `session.usage`. *Open it: quit, relaunch, the thread is still there.*
G.4 **Use Hermes's project sessions.** Replace the page-all-sessions loop
    in `hermes-project-sessions.ts` with `projects.project_sessions` and the
    sidebar endpoint. Removes the shell-wide fetch in `workspace-tree.tsx`.
G.5 **The cron and kanban door, whole.** Add move card, list runs, pause,
    resume, and the kanban events WebSocket. Read cron run outcomes back
    instead of trusting the prompt. Board tab goes live. Use Hermes's cron
    blueprints instead of the five hard-coded presets.
G.6 **ACP agents get what the editor saves.** Pass model, identity and
    context into `session/new`; read `availableModels` and `permissionMode`
    from the adapter instead of the hard-coded list in `agent_models.rs`;
    pass the IntelliZen MCP server so Claude Code and Codex get the
    workspace door. *Open it: change Claude Code's model in the editor, the
    next turn uses it.*
G.7 **Write the decisions back.** The two "Still to decide" rows and open
    questions 1 and 3 were decided in code (our approval cards; events not
    polling). Record them in `ROADMAP.md`.

## Phase H — the MCP door, whole (about 1 day)

H.1 **Tree writes.** `create_hierarchy_node`, `rename`, `move`, `delete`,
    with the `confirm_write` preview pattern and a `work_events` receipt.
H.2 **The promised tools.** `move_card` (kanban), `pin_plugin_widget`
    (Home Pins database, replacing the per-Mac localStorage placement in
    `home-widgets.tsx`), `author_plugin` (writes a plugin folder into a
    staging area and opens a workspace record for approval; see I.4).
H.3 **Retire the legacy tools.** The twelve monitor and investigation
    tools the tree replaced. Fix `~/.codex/AGENTS.md:49`.

## Phase I — the center rule, finished **[approval]** (about 3 days)

Each stage begins with a one-page flow shown to Adam. Nothing is built
until he approves it.

I.1 **The unit page.** Department or workspace shows its projects as rows:
    who holds each, what is blocked, what waits on you, from the project's
    board and records. Its own empty widget board, pinnable like Home.
    *Open it: click a workspace, see the rows and pin a widget to it.*
I.2 **The session page.** Selecting a session in the tree opens the large
    read-only transcript with receipts (files written, cards moved) derived
    from tool events and `work_events`, not the project room with a side
    list. *Open it: click a session, read it, see what it touched.*
I.3 **Intel becomes case tabs.** Case, Evidence and Entities tabs on a case
    project, drawing on the existing `Investigation.tsx` and `Projects.tsx`
    parts. Then `/intel`, `/investigate` and `/search` stop being
    destinations: palette entries, Graph links and the Case tab hand-off
    all point at the project. Search stays reachable from the palette.
    *Open it: open a client case from the tree, work the case without
    leaving the project room.*
I.4 **D.14 for real.** An agent asks to install a plugin; the request is a
    workspace record; approving the record installs it; the plugin loads
    with attribution ("written by …"). Add enable/disable and per-plugin
    capability grants from the donor's SPEC-v9. *Open it: ask an agent for
    a widget, approve the record, see the widget.*
I.5 **Home without fixtures.** Remove the rotation banner and the presets
    named after retired surfaces (Daily Brief, Agent Work, Roles), or move
    the banner to a plugin. Adam decides which.
I.6 **Rooms on Hermes.** Hermes-only rooms ride the gateway's `groups.*`
    with durable logs; the vendored engine stays only for rooms that seat
    ACP members. Rooms and teams appear in the tree and the target picker.
    Decide with the code open whether `groups.*` can seat ACP members; if
    it can, the vendored engine goes. *Open it: a room of two Hermes
    profiles answers one question and its log survives a relaunch.*

## Phase J — donor pieces the plan never listed (about 2 days)

J.1 **Peek.** The donor's card drawer on the Board tab, with a move
    affordance. Uses `move_card` from H.2.
J.2 **Files tab reads the folder.** The donor's folder-backed document
    listing and `FileView` with highlighting, so a project's real files
    show beside its workspace Documents.
J.3 **Graph export is an image.** E.18 as written: a PNG snapshot the doc
    embeds, alongside the live block that exists today.
J.4 **Small ports.** `blockKind` wording for the Waiting column, the
    runs-as alias, attachments in the composer, streaming thinking shown
    while it streams, focus return after the target picker closes,
    dictation language from the voice settings.
J.5 **Design record.** Port `--user-bubble`, `--hud-bg`, `--hud-shadow`,
    `--r-sm`; fix the Catppuccin hexes and the easing and focus recipes in
    `DESIGN.md` and `.impeccable/design.json` to the shipped tokens; record
    the blue default accent as a deliberate deviation; audit the accent
    borders on buttons and checkboxes against the two-meaning rule. Take
    real donor side-by-sides for the tree row menu, the panel bubbles and
    composer, and the ejected panel and HUD; the round-1 HUD captures are
    blank.

## Docs

- `CLAUDE.md` is rewritten for v3: the tree, the center rule, the gateway
  and ACP doors, the MCP server, the release rule. The V2 sidebar, the
  three-phase Investigation flow, the Fiona inbox fallback and
  `src/lib/shell.ts` descriptions go.
- `HANDOFF.md` is refreshed or deleted; it is frozen at 2026-09-02.
- `intellizen-refinement-prd-2026-07.md` and `intellizen-cockpit-spec.md`
  get a superseded banner or move to `docs/archive/`.

## Tests this round must add

Room rounds (holds, caps, stranded harvest), the tree component, the
ejected frame channel, edit-and-ask-again, the HUD drag guard, the voice
state machine, transcript replay across `session.events.since`, one
env-gated live test each for cron create-and-delete and card create.

## Done for this round

1. Every stage above used by Adam in a built `.app` and recorded with the
   date, as before.
2. Parity test green at the new pin on both doors; `pnpm smoke` includes
   the plugin fixture proof.
3. The center table in `ROADMAP.md` is true for every row.
4. `/intel`, `/investigate` and `/search` are not sidebar or palette
   destinations.
5. The MCP server has tree writes, `move_card`, `pin_plugin_widget` and
   `author_plugin`, and has lost the twelve legacy tools.
6. D.14 recorded with a real agent-written plugin.

About two weeks in all. Phases F, G and H can run in parallel from day one.
Phase I waits on Adam's approvals; Phase J waits on H.2 and I.3.
