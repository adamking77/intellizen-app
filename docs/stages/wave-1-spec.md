# Wave 1 spec — the remaining stages, for Opus builders (2026-09-02, late)

Read with `docs/stages/wave-1.md` (ownership) and the builder preamble at the
top of this file. Base for every builder: `v3/phase-0` at the commit that
carries this file. Already merged on that base: voice (C.10), plugins (D.12),
proposals (E.16). Running on other builders: acp (B.5 Rust), agents-page
(B.5 UI + B.6).

## Preamble, binding for every builder

1. Read in this order: `ROADMAP.md` (the rule, the center rule, "Design
   fidelity and feedback", "What we borrow", your stage), `docs/stages/wave-1.md`,
   `docs/stages/phase-a.md`, `DESIGN.md`, `CLAUDE.md`, this file. Then the
   code your stage touches: `src/engine/*`, `src/components/agent/*`,
   `src/components/layout/*`, `src/voice/*`, `src/plugins/*`, `src/proposals/*`.
2. Design donor: `~/projects/hermes-app` (`src/`, `src/pages/`, `tokens.css`,
   `SPEC-*.md`, `visual-references/`). Where the donor designed your surface,
   match it screen for screen. Tokens only. No icons in page menus. Selected
   state is the faded accent fill (`--selected`) with the donor's hover, never
   a bar or ring. No default agent counterpart: never wire a profile by name.
3. Hermes is the engine, reached only through structured doors: the gateway
   (`src/engine/gateway.ts`, `session.ts`), REST (`src/engine/rest.ts`, header
   `x-hermes-session-token`), ACP, our MCP server. Never scrape CLI output.
   Never set `HERMES_DESKTOP=1`. Pinned checkout: `~/.hermes/hermes-agent` at
   `src/engine/HERMES_PIN`.
4. Ownership: only the files the table in `wave-1.md` gives you. In shared
   files, one small clearly separated hunk each. Never reformat. If you need
   someone else's file, define a small interface in your own file and leave
   `// wave-1: <builder> wires this`.
5. Lazy senior engineer: reuse what exists (grep first), stdlib, installed
   deps. No speculative abstractions. Fewest files. One small vitest per
   non-trivial piece. Mark real corner cuts `// ponytail: <ceiling>, <upgrade>`.
6. Setup: `pnpm install`; copy `../../.env.local` into your worktree root
   (gitignored; four test suites need it); `cd mcp-server && pnpm install &&
   pnpm build` only if your tests import it. Do not run `pnpm tauri dev` (one
   app and one `hermes serve` are running for the overseer). Verify with
   `pnpm check`, `pnpm test`, and clippy (`cargo clippy --manifest-path
   src-tauri/Cargo.toml --all-targets -- -D warnings`) if you touched Rust.
   Real engine for tests: port and token in
   `~/Library/Application Support/com.genzen.intellizen/engine.json`;
   `default` is the cheap profile. Never kill it.
7. Finish: commit on your worktree branch, files by name, message
   `wave-1 <builder>: <what>`, trailer `Co-Authored-By: Claude Fable 5.1
   <noreply@anthropic.com>`. Never push. Report: branch, worktree path, files,
   every shared-file hunk verbatim, what is verified and how, what the
   overseer must wire, what needs Adam.
8. A previous builder may have left untracked partial files in the path named
   in your section. Copy in what is good, rewrite what is not. You own them.

## Contracts already on the base

- Voice: `useVoice({ profile, messages, sending, onSend, onTranscript, bars })`
  from `src/voice/use-voice.ts`; `<VoiceButton mode="dictate"|"converse"
  onTranscript voice />`; `voice.readAloud(message)`, `voice.talking`,
  `voice.interrupt()`, `voice.note`. Rust: `voice_speak {text, voice?, model?}`,
  `voice_stop`, `voice_transcribe`, `voice_of_profile {profile}`. Prefs store
  `src/voice/voice-prefs.ts` (`dictation`, `speaking`: `{enabled, service,
  model, apiKey}`).
- Plugins: hooks `usePluginRoutes/SidebarEntries/Widgets/Commands/PanelActions`
  from `src/plugins/registry.ts`; `<PluginWidgetBoard />` from
  `src/plugins/home-widgets.tsx`.
- Proposals: `src/proposals/*`; Rust `proposals_list/create/accept_hunk/reject_hunk`.
- ACP registry (being written): `src/engine/acp-registry.ts` exports
  `AcpAgent { id, name, engine: "claude-code"|"codex"|"gemini"|"qwen", command,
  args, cwd?, model?, role?, avatar?, voice?: {service, voiceId}, identity?,
  context? }`, `listAcpAgents`, `saveAcpAgent`, `deleteAcpAgent`,
  `discoverAcpAgents`; `src/engine/acp-session.ts` mirrors `session.ts`. If
  absent in your worktree, stub it untracked and do not commit the stub.
- Rooms (this wave) keep mentions and blocking decisions inside the room where
  they can be answered in context. They do not export a global attention feed.
- Decisions: `src/engine/decisions.ts`, `session-store.ts`; the card is
  `src/components/agent/decision-card.tsx` and is reused as is.

## voice-providers (new; Adam's ask)

Owns `src-tauri/src/voice.rs`, `src/voice/voice-prefs.ts`, `src/voice/use-voice.ts`,
`src/components/settings/voice-settings.tsx`.

Adam must be able to choose his own speaking provider and key in Settings →
Voice, and each agent may carry its own voice. Extend `voice_speak` to
`{text, service?, voiceId?, model?, apiKey?}` with services `minimax` (as
now), `elevenlabs` (`POST /v1/text-to-speech/{voice_id}`, mp3), `openai`
(`POST /v1/audio/speech`, model `gpt-4o-mini-tts` or `tts-1`, mp3),
`macos-say` (`/usr/bin/say -v <voice>`, no key, always available). Resolution
order: explicit args, then the agent's own voice (`voice_of_profile`), then
Settings → Voice, then env/`~/.hermes/.env`, then `macos-say` with the system
default voice so speaking never silently fails. Key storage: Settings keys go
to the macOS keychain through the `security` CLI (`add-generic-password -s
intellizen-voice -a <service>`) not localStorage; the prefs store keeps only
`hasKey`. Settings → Voice: Service select (the four), Voice/Model field with
a "Preview" that speaks one sentence with the current choice, API key field
(masked, "Saved in Keychain" state), for both Dictation and Speaking halves,
donor layout kept. `voice_models` lists what each service offers where a
list endpoint exists (ElevenLabs `/v1/voices`, macOS `say -v ?`); otherwise a
free text field. Tests: a Rust unit test per request builder; a vitest for
resolution order.

## panel (C.9 + C.11)

Owns `src/components/agent/*`, `src/components/layout/agent-panel.tsx`,
`src-tauri/src/panel_window.rs`. May add one hunk to `lib.rs`, `app-shell.tsx`.
Partial files from the previous builder: `.claude/worktrees/agent-aff1e76721abec1f5/src/components/agent/{panel-window.ts,run-state.ts}`.

Eject: the panel leaves the shell and opens as a frameless always-on-top
window (`/agent-panel` route and `AgentPanelWindow` already exist; finish
them). Same session store in both webviews: the ejected window is the
source of truth while ejected; sync through Tauri events (`panel:state`),
smallest thing that works. HUD: the reduced bar with current agent, run
status, composer, per donor `Hud.tsx`. Re-dock returns it. Donor: `useEject.ts`,
`EjectedPanel.tsx`, `Hud.tsx`, the window code in hermes-app's `lib.rs`.

Message actions per donor `messageActions.ts` and `SPEC-message-actions.md`:
copy; read aloud (`voice.readAloud`); open as document (existing docs
create service in `src/services`, grep `createDocument`); edit and ask again.
Mount `<VoiceButton mode="dictate">` beside the composer controls and
`<VoiceButton mode="converse">` in the send slot when the draft is empty,
per the voice contract above. Show `voice.note` above the composer when set.
Tests: action reducers, eject state machine.

## attention data (B.8, superseded 2026-09-03)

Adam explicitly removed this app surface. Do not create `src/needs-me`, a
route, sidebar entry, built-in widget or plugin, counter, dock badge, native
notification, polling aggregator, or global approval queue. Work needing Adam
is an ordinary workspace database section or kanban row. A widget over that
data is user-designed through the generic plugin contract only when requested.

## rooms (B.7)

Owns `src/rooms/*`, `src/views/Room.tsx`. Hunks: `App.tsx` route `/room/:id`,
tree node type. Partial files: `.claude/worktrees/agent-a20e109d74bc05c83/src/rooms/`.

Vendor `group-rounds.ts`, `group-membership.ts`, `group-activity.ts`, the pure
half of `group-chat.ts` from
`~/.hermes/hermes-agent/apps/desktop/src/plugins/hermes-bots/` (MIT) into
`src/rooms/`, verbatim where pure. Adapter is two functions `request` /
`requestProfile`; `src/rooms/door.ts` defines `AgentDoor` with the gateway
door implemented (one session per member via `session.ts`) and
`registerAcpDoor()` left for acp. Persist `$APP_DATA/rooms/<id>.json`.
`Room.tsx`: the log large, members, receipts, the `$groupNeedsYou` flag,
matching Hermes Desktop's hermes-bots pane and the donor's `msg-turn`
bubbles. "New room" sheet: members from `profiles.list` plus
`listAcpAgents()` when present. Tests: rounds/membership/adapter with fixtures;
env-gated one real round with two profiles. Mentions stay visible in the room;
do not derive a separate global feed from them.

## charts (D.15)

Owns `src/components/charts/*`, database chart views. Hunk: `package.json`.
Partial work: `.claude/worktrees/agent-abe688d4d918ea167` (a registry install
touched 86 files; take only what is needed).

Install the ui.bklit.com registry components (visx) into
`src/components/charts/`; make the existing database chart views use them
(grep `chart` in `src/components/database*`, `src/lib/database*`). Do not
edit `agent-chart-adapter.tsx` (panel owns it); report what it should import.
Series colours from the accent scale via tokens; light and dark both read.
Tests: one render per chart kind with fixture rows.

## unattended (E.17)

Owns `src/services/hermes-cron.ts`, `src/services/hermes-kanban.ts`,
`src/components/workflows/schedule-sheet.tsx`. Hunk: `Workflows.tsx`.
Partial files: `.claude/worktrees/agent-a5a7d5d637129e6c2/src/services/`.

Cron: list, create, delete, run now, list runs. Kanban: boards, cards,
create card, move card. Schedule sheet: workflow definition, profile from
`profiles.list`, cron expression with five presets, kanban board for step
cards; on save create the cron job whose prompt is the workflow's payload
from `src/lib/shell.ts` builders and `src/services/workflow-dispatch.ts`.
Report (do not apply) the fix for `~/.hermes/mcp-servers/intellizen/run.sh`
if it points at `~/projects/intellizen-app-v2`. Tests: fixtures; env-gated
create-and-delete of one cron job and one card.

## graph-export (E.18)

Owns `src/components/graph/export.ts`, `src/components/docs/graph-embed.tsx`.
Hunks: `Graph.tsx` button, docs block registry. Partial file:
`.claude/worktrees/agent-ad971225d571c0737/src/components/graph/export.ts`.

PNG from the Insight canvas, SVG from Construct, saved via the dialog plugin
under `$HOME/vault/`. Docs embed block ```` ```graph {"id","mode"} ```` rendered
as a static snapshot linking to `/graph`. Export button with PNG, SVG, copy
embed block. Tests: block parse/render, SVG serialiser.
