# Phase A — the engine door

Written 2026-09-02, the morning it starts. One page. `ROADMAP.md` says why;
this says what, exactly, for the four stages.

## Facts (verified against the Hermes checkout at `src/engine/HERMES_PIN`)

- `hermes serve --host 127.0.0.1 --port 0 --skip-build` starts the headless
  gateway. It prints `HERMES_BACKEND_READY port=<n>` on fd 1 when bound, then
  `Hermes backend listening on 127.0.0.1:<n>`.
- Auth: the spawner sets `HERMES_DASHBOARD_SESSION_TOKEN=<secret>` in the
  child's env. The WebSocket connects to `ws://127.0.0.1:<n>/api/ws?token=<secret>`.
  `GET /api/health` needs no auth and returns `{ok, version, auth_required}`.
- Do **not** set `HERMES_DESKTOP=1`. It makes the backend run the cron tick
  loop; Adam's `hermes gateway run` daemons (pids for default and fiona) already
  do, and jobs would fire twice.
- Event frame: `{"jsonrpc":"2.0","method":"event","params":{"type","session_id","payload"}}`.
- Methods this phase uses: `session.create {cols:96, source:"desktop", profile, cwd?}`
  → `{session_id, stored_session_id}`; `prompt.submit {session_id, text}`;
  `session.interrupt`; `profiles.list`; `approval.respond {request_id, choice:
  once|session|always|deny, all?}`; `clarify.respond` (params in
  `tui_gateway/methods_prompt.py:1718`); `session.events.since` (used by the
  copied client for replay); `gateway.capabilities`.
- Events this phase renders: `message.start`, `message.delta {text}`,
  `message.complete`, `thinking.delta`, `reasoning.delta`, `tool.start
  {tool_id, name, context, args?}`, `tool.complete {result_text, summary,
  duration_s, inline_diff?}`, `status.update` (at this pin a prompt turn ends
  with `message.complete` carrying `status: complete|error|interrupted`; the
  `turn.*` events are not emitted on this path),
  `approval.request {request_id, command, description, choices, pattern_key}`,
  `clarify.request {request_id, question, choices, multi_select?}` or
  `{request_id, questions:[{qid, question, choices, multi_select}]}`,
  `session.usage`, `gateway.ready`.
- Hermes profiles on this Mac: default (deepseek-v4-flash), fiona, isla, plus
  stopped ones. Use `default` for builder tests; it is cheap.
- The gateway client is copied verbatim: `src/engine/json-rpc-gateway.ts`,
  `src/engine/websocket-url.ts`. `tsconfig` lib went to ES2022 for it.

## A.1 Spawn and attach

The app owns one `hermes serve`. On boot: read `$APP_DATA/engine.json`
(`{pid, port, token, version, startedAt}`); if the pid is alive and
`/api/health` answers, attach. Otherwise spawn with a fresh token, wait for the
ready line (up to 90 s), write engine.json, connect. On app exit, kill a child
we spawned; never kill one we attached to. The sidebar footer shows the
donor's tag (`connected` / `starting…` / `offline`, `.tag.ok` when connected)
followed by `<version> · :<port>` in mono (the word Hermes lives in the
tooltip; the row is 184 px wide). Tooltip: full URL, pid, spawned or attached,
app version. **Open it:** the footer names the Hermes it is talking to. A normal
quit takes a spawned engine down with it; a force-quit or crash leaves it
running, and the relaunch attaches to the same port.

## A.2 One turn through the gateway

`src/engine/session.ts` creates a session for a profile and submits prompts;
`src/engine/transcript.ts` is a pure reducer from events to turns. The panel is
rebuilt on the donor's design (`hermes-app/src/AgentPanel.tsx`,
`TargetPicker.tsx`, `tokens.css` classes `msg-turn`, `turn-bar`, `turn-fact`,
`turn-icon`, `run-status`): the target picker on the name lists Hermes profiles
from `profiles.list`; replies stream; tool rows appear as they run and settle
with a duration; run status sits directly above the composer. `hermes.rs`,
`hermes-host.ts`, `agent-panel-chat.ts` and the webhook/runs functions in
`services/agent.ts` are deleted; workflow dispatch's Hermes adapter uses the
gateway one-shot helper. Voice waits for C.10. **Open it:** pick `default`,
ask it to run `date`, see the tool row and the reply.

## A.3 Approvals

`approval.request` and `clarify.request` render as the donor's decision card
(design.html "06 · Approval gate": who asks, the exact payload, the real
choices as buttons, nothing else). Answering calls `approval.respond` /
`clarify.respond` with the request id; the card settles into a fact line.
**Open it:** ask `default` to delete a temp file, approve once, see it run.

## A.4 Parity test and pin

`src/engine/gateway-parity.test.ts` reads `HERMES_PIN`, reads the pinned
`tui_gateway/*.py` via `git show <pin>:<path>` from `~/.hermes/hermes-agent`,
and asserts every method in `src/engine/contract.ts` is registered with
`@method("…")` and every event is emitted. Skips with a message when the
checkout is absent.

## Accepted when

Adam has done the three **Open it** lines in the running app.
