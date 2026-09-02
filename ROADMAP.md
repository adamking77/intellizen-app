# Roadmap — IntelliZen v3: the cockpit on the Hermes engine

Written 2026-09-01 after a full audit of `hermes-app`, IntelliZen, and the
Hermes source. Plain language on purpose. Read this before `CLAUDE.md` when
deciding what to build next; read `CLAUDE.md` for how to build it.

## The rule

**Hermes is the engine. IntelliZen is the cockpit. Everything else is a
plug-in.**

- IntelliZen is the base. It already has the stack we want (Tailwind, Zustand,
  TanStack Query, visx charts, React Flow, BlockNote, Supabase) and the
  knowledge-work surfaces: Home widgets, Databases, Docs, Canvas, Graph,
  Workflows, an MCP server agents write through.
- `hermes-app` is the donor. It gives up its floating agent panel, HUD, voice,
  team rooms, ACP client and document-proposal flow, then stops.
- Hermes supplies agents, sessions, memory, approvals, cron, kanban, skills and
  plugins. We do not rebuild any of those. We show them and drive them.
- Claude Code, Codex, Gemini and Qwen join as extra agent engines on their own
  subscriptions, through ACP, the protocol all four already speak. This is the
  one thing Hermes cannot do cleanly for us, and the reason the cockpit exists.
- Supabase stays. It is where the business data lives. Read and write.

Opus's earlier rules (no Tailwind, no state library, no router, no cloud, hand
roll everything) are retired. They were never Adam's.

**The front end is hermes-app's, on IntelliZen's kit.** What carries over:
the seven flavors (flat, latte, frappé, macchiato, mocha, nitro, oled) with
fourteen accents each; Geist and Geist Mono in place of Switzer; the radius
roles and the two-meaning border rule; colour never alone; the sidebar tree;
the agent panel, the ejected panel and the HUD; the Agents page with its editor
modal; the team sheet. It arrives as tokens and behaviour on IntelliZen's
existing primitives (Tailwind, the `ui/` components), not as hand-written CSS.
`hermes-app/design/design.md` is the taste reference; IntelliZen's `DESIGN.md`
is amended to match, in place.

## The center panel

**The center shows what is selected in the tree. Nothing selected is Home.**

| Selected | Center shows |
|---|---|
| Nothing | Home: an empty widget board that Adam and his agents fill. Nothing is hard-coded on it. |
| Department or workspace | Its projects as rows saying who holds each, what is blocked, what waits on you; its own widget board, also empty to start. |
| Project | The project room. Tabs: Files (the writing surface), Board (its cards), Data (records linked to it), Sessions (history), Canvas and Graph when it has them. |
| Session | The transcript, large and read-only, with receipts: files written, cards moved. Live talk stays in the panel or HUD. |
| Databases, Canvas, Graph, Workflows, Agents, Settings | Their own pages, as today. |

## The tree

`department → workspace → project (recursive) → session`. Stored as a Database
in Supabase so every agent and the MCP tools see it and vault folders can sync to it.
It replaces `projects`, `investigations`, `operations` and `monitors` as the
way to navigate. Sessions file under a project by matching their working
directory to the project's folders, the rule both Hermes and Codex use.

**A client case becomes a project** with a Case record behind it. Stages,
evidence and the entity map stay, filed under that project. The Intel desk
stops being a destination; its parts become tabs of a case project.

## Done

**Done is the midday scene from `PRODUCT.md`, performed in the running app
on an ordinary day without anyone explaining it.** Adam opens the app around
midday. Needs Me tells him what needs him. He answers those decisions where they
live. He opens a project, reads a report an agent drafted, accepts or rejects
its edits, checks a database view, looks at progress, and asks an agent (any
engine) to take the next thing, from the panel or the HUD, by voice if he
likes. He closes the laptop. Work continues on schedule. Tomorrow it is waiting
in Needs Me.

That scene is done when all of these are true:

1. Every stage in this file has been used by Adam in a built `.app`, not
   `tauri dev`, and recorded as used with the date.
2. The six agent capabilities below each have one recorded example.
3. `hermes-app` is archived; IntelliZen's old Hermes door and subprocess
   workers are deleted; Intel's records are all present as case projects.
4. `pnpm smoke` is green, the gateway parity test is green at the pinned
   Hermes, and a DMG was built by the release rule in `CLAUDE.md`.
5. Adam has run the scene on three separate days and changed nothing.

Anything not on this list is a later version, not a reason this one is not
done.

### The acceptance script (draft for Adam to correct)

Written from `PRODUCT.md`. Adam edits this until it is what he actually does;
then it is the test. Each line is one thing to do and one thing to see.

1. Open the app at midday. Needs Me shows a count in the sidebar.
2. Open Needs Me. Each row says what is asked, which agent asked, where it
   came from, how long it has waited.
3. Answer one. It opens where the decision lives (the document, the card,
   the room) and the count drops by one.
4. Open a project in the tree. The center shows its Files, Board, Data and
   Sessions.
5. Open a report an agent drafted. Its proposed edits show as hunks. Accept
   one, reject one. The file on disk reflects only the accepted one.
6. Open a database view from the sidebar. The numbers are today's.
7. Look at Home. It shows only what Adam or an agent put there.
8. From the panel, ask any agent, on any engine, to take the next task. Its
   reply streams. If it needs permission, that appears in Needs Me.
9. Eject the panel, shrink it to the HUD, say the same request by voice.
10. Close the laptop. Tomorrow, the scheduled work shows in Needs Me.

## Still to decide

Decided with the code open, at the stage that needs it. Not before.

| Decision | Whose | When | Recommendation |
|---|---|---|---|
| The acceptance script: the exact steps of Adam's midday pass | Claude drafts, Adam corrects | Before Phase 0.3 | Drafted from `PRODUCT.md`; Adam edits it until it is what he actually does. |
| How an agent asks permission (its own prompt or the app's) | Claude | Phase B.5 | Every request, whichever engine raised it, appears in Needs Me the same way. Engineering call. |
| Gateway polling vs events for room members; plugin entry format | Claude | B.7, D.12 | Engineering calls. |

Settled by Adam, 2026-09-01: **no hard-coded Home widgets** (Home ships empty;
widgets are made after the app is done). **No default counterpart**: agents
are Hermes profiles and discovered CLIs, nothing is wired in by name. **Reports
differ per use case**: templates are made later, per case, like widgets.


## Design fidelity and feedback

**Where hermes-app already designed a surface, that design is the spec, screen
for screen.** Tokens alone do not count. The builder opens the donor (the
built app at `hermes-app/target/release/bundle/macos/`, its `src/pages/*`, and
`hermes-app/visual-references/`), matches structure, anatomy, copy and
density, and shows a side-by-side screenshot before reporting. Donor surfaces
and the stage that ports each:

| Donor surface | Stage |
|---|---|
| Appearance (flavors, accents) | 0.1, redone for fidelity 2026-09-02 |
| Sidebar tree, row menus | 0.2 |
| Agents page, agent editor modal, team sheet | B.6 |
| Providers / CLI connections, Capabilities, Context, General settings | B.5 |
| Agent panel, message bubbles, composer, target picker | A.2 and C |
| Ejected panel, HUD | C.9 |
| Voice settings | C.10 |

**When Adam gives feedback.** At the end of each phase, after his walk, on
that phase's surfaces only. A page that belongs to a later stage still wears
IntelliZen's old layout until its stage arrives; feedback on it then is early.
Feedback is given in the app's own words: what is on screen, what is missing,
what is in the wrong place. Adam does not need to name components.

## What we borrow, and through which door

| Capability | Door | Notes |
|---|---|---|
| Agent sessions, streaming replies, tool calls, approvals, profiles, memory, skills, config | **Hermes gateway**: JSON-RPC over WebSocket at `/api/ws` from `hermes serve` | Same door Hermes Desktop uses. Typed TypeScript client is MIT; we copy `json-rpc-gateway.ts` and `websocket-url.ts` into `src/engine/`. |
| Cron, kanban board and dispatch, plugin routes | **Hermes REST** under `/api/cron`, `/api/plugins/kanban`, `/api/plugins/<id>` | Kanban also pushes events on a WebSocket. |
| Rooms (many agents, one log, @mentions, passes, caps, needs-you) | **Bot mode's engine**, vendored | `group-rounds.ts`, `group-membership.ts`, `group-activity.ts` and the pure half of `group-chat.ts` are plain TypeScript, MIT. Adapter is two functions: `request` and `requestProfile`. Our adapter routes a member either to the gateway or to ACP. |
| Claude Code, Codex, Gemini, Qwen as agents | **ACP over stdio**, from `hermes-app/crates/agent/src/acp.rs` | Official adapters: `@zed-industries/claude-code-acp`, `@zed-industries/codex-acp`; `gemini --experimental-acp`; `qwen --acp`. Permission requests become real. |
| Agents writing into the workspace | **Our MCP server** (`mcp-server/`) | Already ~40 tools. Gains: move card, propose document edit, pin widget, author plugin. Fix the Hermes wrapper at `~/.hermes/mcp-servers/intellizen/run.sh`, which points at a folder that no longer exists. |
| Floating panel, HUD, eject window, voice, message actions | **hermes-app donor** | `AgentPanel`, `Hud`, `EjectedPanel`, `useEject`, `useVoice`, `dictation.ts`, the Rust `speak`/`transcribe` commands. Rewritten onto IntelliZen's primitives as they move; the behaviour is what transfers. |
| Document proposals (agent edit arrives as hunks you accept or reject) | **hermes-app donor** | `crates/store/src/proposals.rs`, `Proposal.tsx`. Swap the hand-written diff for the `similar` crate. |

## Keeping it updated safely

1. **Pin Hermes.** The app records the Hermes git revision it was built against
   in `src/engine/HERMES_PIN`. Hermes moves at roughly 200 commits a day.
2. **A parity test guards the seam.** `src/engine/gateway-parity.test.ts` lists
   every gateway method and event we use and checks them against the pinned
   Hermes source. Updating Hermes is: bump the pin, run the test, fix what
   turned red, then use the app. Never `hermes update` by reflex.
3. **We never write Hermes's files.** Profiles, sessions, kanban and cron are
   changed through the gateway or REST, never by editing `~/.hermes`.
4. **Secrets stay where they are.** Hermes holds its keys; Supabase keys follow
   the existing credential gate in `CLAUDE.md`; the gateway token is set by us
   when we spawn `hermes serve`, never scraped.
5. **Plugins load from local disk only,** and an agent-written one waits for
   Adam's approval before its first load. No marketplace, no remote code.

## What gets removed

- IntelliZen `src-tauri/src/hermes.rs` (the webhook door) and `runtimes.rs`
  plus `runtime_bindings.rs` (subprocess workers with capability tokens).
  Replaced by the gateway and ACP.
- hermes-app's discovery crate, `stream.rs`, `text.rs`, the Rust room driver,
  the board writer, the verify crate. Not moved.
- The "Fiona is the only counterpart" rule in `intellizen-cockpit-spec.md`.
  No default counterpart. Agents are Hermes profiles and discovered CLIs.

## Stages

About four weeks in all. Each stage is two to four hours and ends with something Adam opens and uses.
A stage is accepted when Adam has used it, not when tests pass. One page of
spec per stage, written the morning it starts, not before.

### Phase 0 — the look and the tree (about 4 days)

> **Built 2026-09-02, awaiting Adam's walk.** Branch `v3/phase-0`, nothing
> committed. Migration applied to the live project (1 department, 2
> workspaces, 23 projects, all 16 legacy projects and 9 investigations filed).
> Checks green: file sizes, tsc, 294 tests, clippy, tokens audit. Seen by the
> overseer in the running app: seven flavors and accents switching, focus
> mode, ⌘\ sidebar toggle, the tree loading with live data. Not yet seen by
> anyone: expanding the tree, the context menu on a node, the folder picker,
> `/unit/:id` and `/project/:id` with live data, the Case tab, New document.
> **Adam walked all five steps 2026-09-02 and they passed.** His feedback was
> applied the same morning: Settings in the sidebar, themed sidebar mark,
> Appearance page redone to the donor screen for screen including Panes
> (Connected and Segmented), no icons in page menus, selected state is a
> faded accent fill everywhere with the donor's hover, no accent bar.

0.1 **Tokens.** hermes-app's `tokens.css` flavors, accents, type scale and
    radius roles become IntelliZen's CSS variables under Tailwind. Geist in,
    Switzer out. *Open it: switch flavor and accent in Settings, every surface
    follows.*
0.2 **The tree.** The hierarchy Database in Supabase, the sidebar tree from
    hermes-app (`Tree.tsx`, `useHierarchy`, roving keyboard), create, rename,
    move, delete, folders on projects. *Open it: make a department, a
    workspace, a project with a folder.*
0.3 **The center rule.** Home, scoped Home, project room, session transcript,
    wired to selection. Intel's investigations migrate to case projects with a
    script that keeps every record. *Open it: click through the tree and see
    the center change.*
0.4 **The shell.** hermes-app's three-panel behaviour on IntelliZen's frameless
    window: sidebar collapse to pills, panel hide, focus mode, `⌘1`–`⌘4`.

### Phase A — the engine door (about 3 days)

1. **Spawn and attach.** The app starts `hermes serve` with a token it chose,
   or attaches to one already running, and shows engine status in the status
   bar. Copy the gateway client in. *Open it: the status bar says which Hermes
   it is talking to.*
2. **One turn through the gateway.** The existing agent panel sends to a
   Hermes profile via `session.create` and `prompt.submit`, renders
   `message.delta`, `tool.start`, `tool.complete`. Delete `hermes.rs`. *Open
   it: talk to any Hermes profile, see its tools run.*
3. **Approvals.** `approval.request` and `clarify.request` render as a decision
   card in the panel with the real choices. *Open it: ask a Hermes profile to run a
   command that needs approval, approve it.*
4. **The parity test and the pin.**

### Phase B — many agents (about 4 days)

5. **The roster.** Agents page lists Hermes profiles (from `profiles.list`) and
   ACP agents (from a local registry). Move `acp.rs` in. Delete `runtimes.rs`.
   *Open it: talk to Claude Code and to a Hermes profile from the same panel.*
6. **The agent editor.** hermes-app's Agents page and its editor modal: name,
   role, avatar, voice, engine, model, identity, context. Saves a Hermes
   profile or an ACP entry. Teams via the team sheet. Donor: `Agents.tsx`,
   `TeamSheet.tsx`, `Roster.tsx`.
7. **Rooms.** Vendor the bot-mode engine with the two-function adapter. A room
   holds Hermes profiles and ACP agents together. *Open it: a room of a Hermes profile
   and Claude Code answering one question.*
8. **Needs me.** One list: pending approvals, clarifications, rooms flagged
   `@user`, blocked kanban cards, failed cron runs. Sidebar count, dock badge,
   native notification. Donor: `SPEC-v8.md` sources, Hermes `$groupNeedsYou`.

### Phase C — the panel you designed (about 3 days)

9. **Eject and HUD.** The panel detaches to an always-on-top window and
   reduces to the HUD bar. Donor: `useEject`, `EjectedPanel`, `Hud`.
10. **Voice.** Dictation, read aloud, conversation mode, on the ejected panel
    and the HUD. Donor: `useVoice`, `dictation.ts`, Rust `speak`/`transcribe`.
11. **Message actions.** Copy, read aloud, open as document, edit and ask
    again.

### Phase D — the plugin SDK (about 4 days)

12. **The contract.** A plugin is a folder under `~/.hermes/plugins/<id>/`
    sharing Hermes's `plugin.yaml` and optional `dashboard/plugin_api.py`,
    plus our own entry `intellizen/plugin.js`. It may contribute: a route, a
    sidebar entry, a Home widget, a palette command, a panel action. Loaded
    at boot and on file change; a broken plugin fails alone.
13. **Needs me becomes the first plugin,** proving the contract on something
    real.
14. **An agent writes a plugin.** A tool in our MCP server authors a widget;
    it lands in Needs me for approval; approval loads it. *Open it: ask any agent
    for a widget showing this week's blocked cards, approve it, see it.*
15. **Charts.** Install the ui.bklit.com registry components on the existing
    visx layer so widgets and reports share one chart kit.

### Phase E — documents and unattended work (about 3 days)

16. **Proposals.** An agent's edit to a doc arrives as hunks to accept or
    reject. Donor: `proposals.rs`, `Proposal.tsx`.
17. **Unattended runs.** Workflows page can schedule a run through Hermes
    cron and dispatch cards through kanban; results appear in Needs me.
18. **Relationship graph in reports.** The Graph view exports to an image or
    block that Docs can embed.

## What agents can do here, when this is built

1. See what you see: the page and record in front of you.
2. Write into the workspace with a receipt, through the MCP server.
3. Ask before anything consequential, and wait for you in Needs me.
4. Keep working while you are away, on a schedule or a board.
5. Build a widget or plugin for you, approved before it loads.
6. Hand work to another agent, in a room or across a board.

## Not doing

- A second engine of any kind. If Hermes has it, we show it.
- Scraping CLI output. Structured doors only: gateway, REST, ACP, MCP.
- A sandbox, a marketplace, or remote plugin code.
- Porting anything for parity's sake. A surface moves when a stage needs it.
- Long specs. One page per stage. The audit found 45,000 words of spec
  against 33,000 lines of code; that ratio does not repeat.

## Open questions

1. Does the group engine's `session.resume` polling loop need replacing with
   gateway events for ACP members? Decide in stage 7 with the code open.
2. Which Home widgets survive the move to the plugin contract as-is, and which
   become plugins? Decide in stage 13.
3. Whether Claude Code as an ACP member should run with Claude's own
   permission prompts or ours. Decide in stage 5 by trying both.
