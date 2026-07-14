# PRD: Agent-Native Conversation Surface

**Status:** Approved for implementation

**Owner:** Keel

**Date:** 2026-07-14

**Product decision:** Improve the existing IntelliZen Agent Panel without adding a second chat, task, workflow, approval, or persistence system.

## 1. Outcome

The Agent Panel becomes a trustworthy working conversation:

- direct chat remains fast and readable;
- streamed text, generated widgets, locally launched actions, workflow dispatches, approvals, receipts, cancellation, and errors have typed visual states;
- operational data appears only when it is part of the conversation, as a compact collapsible inline event;
- the expanded event links to the canonical Task, Workflow Run, database record, or receipt;
- current route context sent with a message is visible, bounded, and reproduced on the sent turn;
- native chart widgets use the same Bklit rendering system as database views.

The panel remains one conversation thread with one composer. It does not gain a fixed workflow dashboard, approval queue, task list, or permanent thread rail.

## 2. Decisions Already Made

1. Supabase remains the durable source of truth.
2. Hermes remains the local agent runtime.
3. IntelliZen remains the operating UI and command centre.
4. `workspace.records`, atomic record-section appends, Workflow Runs, and `workspace.work_events` remain the workflow and receipt contracts.
5. `comms.fiona_inbox` remains the durable chat/workflow fallback.
6. Agent-Native is reference material only. Do not install `@agent-native/core`, embed its app, or adopt Nitro, Drizzle, React 19, Dispatch, or A2A.
7. The existing docked/ejected panel anatomy is the visual baseline. This is a stabilization and capability project, not a redesign.
8. Workflow and approval information may appear inline only when triggered or referenced in the conversation. It must be collapsed by default and must never become a static part of the panel.
9. Canonical operational state and decisions remain in Databases-native records. Inline events summarize and link; they do not replace the record.
10. Durable transcript ownership is unresolved. V1 keeps one local working session plus New chat.

## 3. Current-State Findings

The original improvement plan was directionally sound but too broad and partly stale.

- The panel already has full-width turns, speaker labels, time dividers, streaming, cancellation, one bottom composer, profile selection, dictation, dock/eject behavior, and a session-local history buffer.
- Direct Hermes streaming currently exposes assistant text deltas. It does not provide a proven typed tool-event and durable receipt correlation stream.
- The panel still polls active runs and approvals despite the intended chat-first anatomy.
- The primary streaming path does not serialize structured context. The ejected panel also cannot infer the main window's active route or selection.
- `record-links` can generate `?record=<id>`, but the database editor does not yet open that record from the URL.
- GenUI parsing can silently erase malformed blocks, stores only the first widget in a response, and renders all chart types as a single-series bespoke bar list.
- Actor/runtime labels are blurred in places. Fiona is the agent; Hermes is the runtime.

## 4. User Stories

### Conversation

- As Adam, I can read a response without operational chrome competing with the conversation.
- As Adam, I can stop a streaming response and see that it stopped, rather than failed or completed.
- As Adam, I can retry a transport failure without retyping the message.

### Inline action evidence

- As Adam, when a chat-triggered action or workflow changes state, I see one compact inline row at the relevant turn.
- As Adam, I can expand that row to inspect the action, current durable state, exact decision requested, and receipt link.
- As Adam, I can open the canonical record to monitor or decide the work.
- As Adam, I never see “completed” unless a durable result proves completion.

### Context

- As Adam, I can see which current app route will be sent before I submit.
- As Adam, the sent turn records the exact route snapshot that was included.
- As Adam, opening the Agent Panel in a detached window does not lose or misstate the main app context.

### Native results

- As Adam, multiple valid widgets in one response all render.
- As Adam, malformed widget output remains readable and explains what failed.
- As Adam, chart widgets use the same visual and behavioral chart system as saved database views.

## 5. Conversation Contract

Create an IntelliZen-owned, versioned conversation model. V1 models only events with a truthful source.

```ts
type ConversationEvent =
  | UserMessageEvent
  | AssistantTextEvent
  | StreamingEvent
  | WidgetEvent
  | ActionEvent
  | RecordLinkEvent
  | CancelledEvent
  | ErrorEvent;
```

### Required shared fields

- `id`
- `version`
- `kind`
- `createdAt`
- `source`: `local-ui | hermes-stream | fiona-inbox | workspace-record | work-event`
- `correlationId` when one exists

### Action event

The action event is the narrow exception that permits operational information inside chat.

```ts
type ActionEvent = {
  kind: "action";
  actionKind: "tool" | "workflow" | "approval";
  state: "requested" | "running" | "queued" | "needs_approval" | "completed" | "failed";
  label: string;
  summary: string;
  canonicalRecord?: { databaseId: string; recordId: string };
  evidence?: {
    kind: "record_append" | "record_created" | "workflow_run" | "record_append_plus_work_event";
    id: string;
  };
};
```

Rules:

- Render as one compact row, collapsed by default.
- Expanded content may show structured inputs, result summary, decision request, actor, timestamps, and evidence link.
- The event may represent a local action result, a correlated Workflow Run/database record, or a correlated Fiona inbox fallback.
- Do not infer action state from assistant prose.
- Do not synthesize `completed` from a streamed sentence.
- Approval decisions must use the existing canonical approval path. Chat may link to that decision surface; V1 does not duplicate its controls.
- Do not poll all active workflows or approvals merely to populate the panel.

### Deferred event sources

Hermes tool-call deltas are excluded until a captured fixture proves the runtime emits them and a durable correlation contract connects them to IntelliZen evidence. The type may be extended later without reserving misleading UI now.

## 6. Context Contract

V1 defines one app-owned route snapshot. The `selections` field is reserved for
a later explicit-reference contract and remains empty until a view can publish a
real user selection with a stable id and label.

```ts
type ConversationContextSnapshot = {
  version: 1;
  source: "main-app";
  route: { kind: "route"; pathname: string; search: string; hash: string };
  selections: [];
  updatedAt: string;
};
```

Requirements:

- The main app publishes the current route through a small cross-window context bridge.
- The docked and ejected panels read the same context snapshot.
- Route context is ambient, read-only disclosure.
- The panel never infers broad workspace authority from the open screen.
- The streaming path serializes a bounded, visible context block into supported message content. Do not add unsupported OpenAI request fields.
- The inbox/webhook path adapts the same route snapshot into the existing structured `AgentContext` and persists it for durable readback.
- Sent turns retain the exact route snapshot, including after a durable inbox row replaces an optimistic turn.
- Explicit record, document, workflow-run, and investigation references and their removal controls are deferred until the corresponding views expose a reliable selection source. V1 does not infer them from incidental UI state.

## 7. Deep Links

Before record-link acceptance can pass:

- `/databases/:databaseId?record=:recordId` opens that record in the existing database peek panel;
- invalid or unavailable record ids show a bounded error state;
- action events and record widgets use this single route contract;
- links never copy record bodies into the conversation.

## 8. Widget and Chart Contract

### Parsing

- Version the GenUI envelope.
- Store `widgets: AgentChatWidget[]`, not a single optional widget.
- Preserve malformed fenced content as readable text plus a compact validation error.
- Validate type, required fields, numeric series values, palette tokens, row/series bounds, and link routes.
- A malformed widget cannot break the remaining turn.

### Charts

- Bklit is the only chart renderer.
- Add a compact adapter from validated agent chart specs to existing Bklit primitives.
- V1 supports `bar` and `line` with multiple series.
- Defer `area` until it has an explicit Bklit mapping; do not silently render it as bar.
- Support deterministic empty, malformed, and overflow states.
- Keep database chart views as the durable saved-analysis contract.

### Generated HTML

- Keep the opaque-origin iframe, no network access, no host DOM/storage access, and read-only host query bridge.
- Existing global table allowlisting is not sufficient for sensitive contextual widgets. Contextual queries must be scoped to explicit record/case ids before investigation context is exposed.

## 9. Panel Interaction Requirements

- Preserve one full-height thread and one composer frame at the bottom.
- Preserve full-width message blocks, speaker labels, and 15-minute dividers.
- Preserve docked, collapsed, resized, and detached behavior.
- No thread rail in V1.
- No fixed run list, approval queue, action dashboard, or receipt panel.
- Inline action rows are collapsed by default and expand in place.
- Do not force-scroll when Adam has scrolled up; show a return-to-latest control instead.
- After send, stop, retry, menu close, and response completion, focus returns predictably.
- Streaming completion, cancellation, queued fallback, and errors are announced to assistive technology without repeating the entire response.
- The action menu exposes correct expanded/menu semantics and keyboard behavior.
- Fiona is shown as the agent; Hermes is shown separately as runtime/connection status.

## 10. Non-Goals

- Installing or embedding Agent-Native.
- Replacing Hermes, Supabase, Workflow Runs, Tasks, approvals, or receipts.
- Building a second action executor or MCP client in the desktop app.
- Durable transcript persistence or a thread rail.
- A shared app/MCP action registry in this PRD.
- Generic scheduling or recurrence.
- Cited knowledge answers.
- Docs review/comment workflows.
- Durable agent-generated Home widget migration.
- New routes, sidebar items, or default surfaces.
- Giving generated HTML new authority.

## 11. Delivery Slices

### Slice A: Truthful conversation model

Files:

- new `src/lib/agent-conversation.ts`
- `src/services/agent.ts`
- `src/lib/agent-widgets.ts`
- pure fixture tests

Deliver:

- normalize direct stream, inbox reply, widgets, local action acknowledgement, queued fallback, cancellation, and errors;
- capture real Hermes fixtures before adding any runtime event kind;
- preserve readable fallback for malformed output;
- no visual redesign.

Acceptance:

- deterministic state transition tests;
- no false completion state;
- two widgets in one turn render in the contract;
- malformed GenUI remains readable.

### Slice B: Existing anatomy extraction and inline action evidence

Files:

- `src/components/layout/agent-panel.tsx`
- focused components under `src/components/agent/`

Deliver:

- extract the existing timeline, turn, composer, and action-event renderers where this improves testability;
- remove static active-run and approval polling/data from the panel;
- add collapsed inline action rows for locally launched/correlated work;
- preserve current dock/eject, voice, profile, streaming, stop, and fallback behavior;
- correct Fiona/Hermes labeling.

Acceptance:

- no fixed operational section exists;
- collapsed action row shows state without dominating the conversation;
- expanded row links to the canonical record;
- current chat history renders without data loss;
- focus, scroll, cancellation, retry, empty, loading, and error behavior pass.

### Slice C: Record deep links and route context

Files:

- a small context module/provider
- `src/components/layout/app-shell.tsx`
- `src/components/layout/agent-panel.tsx`
- `src/views/DatabaseEditor.tsx`
- `src/services/agent.ts`

Deliver:

- cross-window context snapshot;
- route disclosure;
- exact sent-turn route snapshot;
- supported streaming/inbox serialization;
- database record deep links.

Acceptance:

- docked and detached panels show the same context;
- a sent turn shows the exact route actually sent;
- a durable inbox reply preserves that route snapshot;
- `?record=` opens the correct record;
- invalid/deleted record links fail safely.

### Slice D: Native widget and Bklit consolidation

Files:

- `src/lib/agent-widgets.ts`
- `src/components/agent/agent-chat-widget.tsx`
- new compact chart adapter under `src/components/charts/`

Deliver:

- multi-widget turns;
- versioned validation;
- multi-series bar and line widgets through Bklit;
- explicit invalid/empty/unsupported states.

Acceptance:

- bar and line specs visibly differ;
- multiple series remain present;
- unsupported area specs explain the limitation;
- no bespoke chart renderer remains in Agent Panel code.

### Slice E: Verification and hardening

Deliver:

- add the smallest DOM/component test harness required for focus/menu/collapse behavior;
- run the full design review gate;
- verify one direct Hermes response and one forced Fiona inbox fallback when transport code changes;
- verify sandbox scope tests and bundle-secret checks where authority boundaries are touched.

## 12. Verification Matrix

Every slice:

1. `pnpm run check`
2. `pnpm test`
3. tokens-only audit on changed UI files
4. no unrelated routes/sidebar/default surfaces

Every visual slice:

1. current desktop width screenshot
2. 390px no-horizontal-overflow check
3. 300px, 336px, and 560px docked panel checks
4. detached panel check
5. loading, empty, error, streaming, cancelled, and collapsed/expanded action states
6. keyboard and focus pass
7. console-error pass

Transport/context slices:

1. captured direct Hermes fixture
2. captured queued fallback fixture
3. exact context payload assertion
4. no false-success assertion

Chart slice:

1. single and multiple series fixtures
2. bar and line fixtures
3. malformed, empty, oversized, and unsupported-area fixtures
4. side-by-side comparison with an existing compact database chart

## 13. Security and Release Gates

- No external publish or deploy is authorized by this PRD.
- Do not expose service-role credentials to the frontend.
- Treat current `VITE_HERMES_*` secret-bearing configuration as local-only; do not expand its distribution.
- Before any publishable build, move secret-bearing Hermes calls behind a non-bundled boundary or explicitly resolve the credential model.
- Continue to run the production bundle secret scan required by `CLAUDE.md`.
- Generated HTML remains read-only and sandboxed.
- Investigation context requires record/case-scoped query authority before use.

## 14. Deferred Validated Backlog

These findings remain valid but are separate products or architecture decisions:

1. shared action metadata registry across app and MCP, using a real shared JSON/schema boundary;
2. durable transcript ownership, retention, and thread navigation;
3. generic Workflow Registry recurrence;
4. cited knowledge answers with claim-level evidence;
5. Docs review comments and change comparison;
6. durable agent-generated Home widgets through the existing governed Home Pins model.
7. explicit removable conversation references for records, documents, workflow runs, and investigations, after each source view exposes a reliable user-selection contract.

Each requires its own approval and PRD. None may silently enter this delivery scope.

## 15. Definition of Done

- Conversation events are truthful, typed, and tested.
- Operational evidence is useful inline, collapsed by default, and never static panel chrome.
- Canonical actions, approvals, monitoring, and records remain in Databases.
- Route context is visible, bounded, durable across inbox readback, and consistent across docked/detached windows.
- Record links open the intended record.
- GenUI never silently erases malformed content and supports multiple widgets.
- Agent charts render through Bklit only.
- Existing direct chat, voice, dock/eject, cancellation, and fallback paths do not regress.
- The design review gate and verification matrix pass with saved evidence.

## 16. Reference Boundary

Agent-Native may be reviewed at a pinned commit for conversation and rendering patterns. Copy only narrowly useful client-side ideas, retain the MIT notice for substantial copied source, and keep IntelliZen's runtime, persistence, authority, and visual contracts intact.
