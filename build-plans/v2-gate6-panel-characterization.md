# Gate 6 Agent Panel behavior characterization

Date: 2026-07-27  
Branch: `v2-integration`  
Surface: `src/components/layout/agent-panel.tsx`

## Purpose

This is the behavior-frozen baseline required before Gate 6 decomposes the
Fiona-first Agent Panel into shell, thread, composer, and run-inspector seams.
It reconciles the cockpit checklist with the locked role-first/runtime work.
Existing behavior marked **green** must remain green for Fiona/Hermes and be
generalized to streaming-capable CLI adapters where the locked spec requires
it. A missing should-have is product work, not behavior to counterfeit during
the extraction.

The panel remains one conversation and one composer. Workflow actions and run
evidence stay inline and collapsed unless relevant; Gate 6 must not introduce
a permanent workflow dashboard, approval queue, or thread rail inside chat.

## Cockpit must-have six

| Behavior | Baseline | Evidence | Regression contract |
| --- | --- | --- | --- |
| Copy message as Markdown | **Green** | `copyMessageMarkdown` writes the raw assistant text to the clipboard, has a fallback path, and reports success/failure. The assistant message action calls it. | Preserve raw Markdown, keyboard focus visibility, and failure feedback. |
| Retry last answer | **Green** | The latest assistant turn exposes Retry and rebuilds request history up to the preceding user turn before calling `sendChatMessage`. | Retry must not duplicate later turns or silently mutate persisted receipts. Generalize only where the selected runtime supports conversation replay/resume. |
| Edit and resend own message | **Green** | A user-turn action restores that turn to the composer and removes the original turn plus following turns from the visible local thread before focus returns to the composer. | Preserve the explicit user edit step; never auto-send on edit. Keep per-role thread boundaries after role routing lands. |
| Stop response mid-stream | **Green** | A per-request `AbortController` is retained; Stop aborts it. The partial response is retained and the turn is marked `cancelled` with “Response stopped.” | The runtime adapter must own cancellation and report the truthful terminal state. No orphan child process. |
| Steer mid-response | **Green** | During a streaming reply the composer remains active. Submit stores one pending steer, aborts the current response, and sends the steering turn with visible history plus the partial reply. | Preserve one explicit queued steer and the partial response context; do not present steering for runtimes that cannot support it truthfully. |
| Unread badge | **Green** | Unread replies are derived from reply timestamps versus the last-read timestamp and shown in both collapsed and expanded panel states. Focus/pointer interaction marks replies read. | Preserve count across collapse/eject/re-dock and isolate unread state by selected role/thread. |

## Cockpit should-haves

| Behavior | Baseline | Evidence | Gate 6 disposition |
| --- | --- | --- | --- |
| Save to doc | **Missing** | No message action or service path saves an assistant turn as a document. | Add an explicit assistant-message action that opens a preview and uses the existing document write path. Do not write from hover alone. |
| Past conversations browse/search | **Green, local/flat** | Local history is persisted and `Search past messages` filters the combined routed and local receipt list. New chat clears only the visible session after confirmation. | Preserve search. Per-role threads must not merge role histories. A new permanent thread rail is out of scope. |
| Draft survives navigation | **Green** | Draft state loads from and writes to local storage; storage failures surface once instead of silently discarding work. | Change the key to a per-role key and migrate the existing Fiona draft to `operations_director` once. |
| Keyboard shortcut focuses panel input anywhere | **Green** | `Meta+Shift+A` / `Control+Shift+A` focuses the composer and expands the docked panel when needed. | Preserve in docked and detached windows. |
| Paste image / drop file | **Partial** | Paste/drop/file picker accepts bounded text files and injects fenced contents. Images are explicitly rejected as unsupported by the current Hermes text transport. | Preserve text-file behavior. Add image support only through an adapter capability with a real payload contract; never imply an image was sent when it was not. |

## Existing non-checklist behavior that is frozen

- One full-height conversation thread and one bottom composer.
- Fiona is the agent identity; Hermes is the runtime/connection label.
- Direct Hermes streaming first, then durable inbox fallback.
- Stateless visible-history replay for the direct Hermes stream.
- Inline workflow/action events with durable correlations; no fabricated tool
  stream.
- Route/context disclosure above the composer.
- Dictation panel-wide; turn-taking live voice is Fiona/Hermes-only.
- Text attachment limits and fenced attachment formatting.
- Collapse, resize, eject/detach, refresh, scroll-follow, “return to latest,”
  loading, empty, error, and new-session confirmation states.
- Speak-replies preference and explicit stop-speaking control.
- Workflow launch and task creation remain explicit composer actions.

## Extraction seams and tests-first rule

The existing component is stateful orchestration, but its deterministic
behavior already relies on pure libraries:

- `src/lib/agent-panel-chat.ts`: history search, unread derivation, steering
  history.
- `src/lib/agent-conversation.ts`: normalized conversation events and action
  state.
- `src/lib/chat-attachments.ts`: attachment capability and formatting.
- `src/lib/hermes-profiles.ts`: active profile/model display.

Gate 6 may extract presentation into:

1. `agent-panel-shell` — dock/collapse/eject/resize, role selection, header
   identity and runtime state.
2. `agent-panel-thread` — turns, inline action events, unread/scroll behavior,
   message actions.
3. `agent-panel-composer` — draft, attachments, dictation, send/stop/steer,
   explicit actions.
4. `agent-run-inspector` — child-run tree, receipts, authority sources, and
   verification states.

Before moving behavior, add pure tests for per-role persistence/migration,
runtime capabilities, message actions, and event-v2 normalization. Extraction
is accepted only if the checklist above remains green in unit tests and dev-app
verification.

## Gate 6 verification matrix

- Unit: all pure-lib tests plus new role/thread/event/runtime capability tests.
- Integration: Fiona direct-stream and durable-inbox paths; real isolated
  Claude CLI `system/init` acceptance; Codex adapter regression.
- Window state: select a non-default role, eject, confirm the same role/thread,
  re-dock, confirm unchanged; repeat with `panel_start_role`.
- Interaction: copy, retry, edit/resend, stop, steer, unread, history search,
  draft navigation, global focus, text paste/drop.
- Designer: authored schema validates as v1 and is passed byte-for-byte as the
  runner definition snapshot for execution.
- Visual: V2 dev app only, including 390 px width, keyboard focus, empty,
  loading, error, running, blocked/approval, and completed evidence states.

The production app at `/Applications/IntelliZen.app` is excluded from Gate 6
verification. The only permitted desktop surface is the V2 dev build with
identifier `com.genzen.intellizen.v2dev`.
