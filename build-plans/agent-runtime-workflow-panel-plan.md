# Agent Runtime + Workflow Panel Plan

Reference plan for making Hermes the primary GenZen workflow engine while preserving Claude access through MCP and local advanced mode. This is the canonical plan for the agent panel and workflow runtime. It keeps the intended product surface: workflow buttons, integrated chat, case-aware context injection, tool streams, artifact tracking, and permission cards.

Status: Drafted 2026-04-29. Not scheduled.

## Goal

Make InteliZen the control surface for GenZen's operating agent.

Hermes runs workflows on Railway. Kimi K2.6 is the default model for orchestration, drafting, coding/layout-heavy work, and general execution. Claude remains available as a specialist for analytical passes and as a local MCP-enabled advanced mode when Adam wants direct Claude control.

The target mental model:

```text
InteliZen desktop app
  -> Agent Gateway API
      -> Hermes runtime on Railway
          -> Kimi K2.6 by default
          -> GenZen MCP/tool layer
          -> optional Claude delegation
  -> Supabase as company state
  -> vault/artifact bridge for local and cloud-readable files
```

Hermes does not "drive the UI." Hermes runs tasks, emits events, writes structured results, and creates artifacts. InteliZen starts runs, displays streams, shows approvals, and renders state from Supabase.

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ InteliZen Tauri app                                           │
│                                                              │
│  Main routes                                                  │
│  - Inbox, Monitors, Search, Projects, Databases               │
│  - Graph, Canvas, Investigate, Reports                        │
│                                                              │
│  Agent Panel                                                  │
│  - Workflow buttons                                           │
│  - Chat window                                                │
│  - Tool/event stream                                          │
│  - Permission cards                                           │
│  - Artifact list                                              │
└───────────────────────────────┬──────────────────────────────┘
                                │ HTTPS/SSE/WebSocket
                                ▼
┌──────────────────────────────────────────────────────────────┐
│ Agent Gateway                                                 │
│                                                              │
│  Authenticates InteliZen                                      │
│  Starts/cancels workflow runs                                 │
│  Streams model/tool events                                    │
│  Records audit events                                         │
│  Mediates confirmation-required actions                       │
└───────────────────────────────┬──────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────┐
│ Hermes on Railway                                             │
│                                                              │
│  Default model: Kimi K2.6                                     │
│  Specialist: Claude via delegate_to_claude                    │
│  Tools: GenZen MCP/tool layer                                 │
│  Runtime storage: Railway volume plus Supabase state           │
└───────────────────────────────┬──────────────────────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
  Supabase project       Artifact/vault bridge   External MCPs
  app state              reports, notes, files   Exa, OSINT, etc.
```

## Core Principles

1. Hermes is the trusted backend operator. Kimi and Claude are reasoning engines inside that operator.
2. Supabase is the source of truth for company state: projects, operations, workspace databases, investigations, graph, reports, workflow runs, and messages.
3. Models do not get an unbounded SQL console by default. They operate through named GenZen tools with validation and audit logs.
4. Claude access is preserved in two forms: cloud delegation from Hermes and local direct Claude/MCP mode from InteliZen.
5. The UI never hardcodes model-specific behavior. It talks to `src/services/agent.ts`.
6. Destructive actions require explicit human confirmation.
7. Existing Brain tables remain protected by convention and tooling: `documents`, `chunks`, `cases`, `decisions`, `config`, `taste_preferences`.

## Relationship To Existing Plans

| Existing plan | What carries forward | What changes |
|---|---|---|
| `intake-workflow-plan.md` | Intake Processor is first workflow button | Processor runs through Hermes instead of direct Claude shell |
| `client-deliverables-architecture.md` | Kimi is valuable for templates/layouts, Claude for analytical fidelity | Hermes orchestrates both paths |
| `huntkit-integration-plan.md` | OSINT/evidence tools belong in InteliZen MCP/tool layer | Hermes calls them remotely |
| `home-dashboard-plan.md` | Dashboard messages can be written by agent workflows | Hermes gets a `write_dashboard_message` tool |

## Runtime Roles

### Hermes

Hermes owns workflow execution:

- Maintains agent sessions
- Selects Kimi or specialist tools
- Calls GenZen MCP tools
- Emits stream events
- Writes artifacts and structured results
- Requests human approval when needed
- Records workflow audit trails

### Kimi K2.6

Default model for:

- Workflow orchestration
- UI/template/component generation
- Report JSON normalization assistance
- Drafting and transformation
- Bulk reasoning over broad company context
- Tool-rich operational tasks

### Claude

Specialist model for:

- High-stakes analytical passes
- Competing hypotheses
- Intelligence protocol checks
- Final assessment review
- Local direct MCP sessions when Adam wants hands-on control

Claude should be reachable through:

```text
delegate_to_claude({
  task,
  context,
  allowed_tools,
  expected_output,
  case_id?
})
```

The delegation result returns to Hermes. Hermes validates and stores the output.

### InteliZen

InteliZen owns:

- Starting workflows
- Chat input/output
- Showing tool streams
- Permission approval UX
- Rendering Supabase state
- Opening local vault artifacts
- Optional local Claude advanced mode

## Agent Panel Product Surface

The panel lives as a right-side resizable app shell panel. It is available across routes and becomes case-aware when an investigation, project, database, note, graph, or report is active.

Required sections:

- Workflow buttons
- Chat thread
- Tool timeline
- Permission cards
- Outputs/artifacts
- Session controls

The UI should feel like an operations console, not a developer terminal.

## Workflow Buttons

Initial catalog:

| Button | Context | Primary model | Output |
|---|---|---|---|
| Run Intake Processor | Intake form + transcript | Kimi, Claude review optional | IntakeSummary JSON + decision gate |
| Run Scoping Run | Investigation + signals + entities | Kimi or Claude specialist | `scoping-brief.md` + phase state |
| Generate Situation Report | Full case + evidence | Claude specialist likely | `situation-report.md` |
| Run ACH Matrix | Evidence registry | Claude specialist likely | `ach.md` |
| Capture Evidence | URLs/files | Tools first, Kimi coordination | EV-ID artifacts + vault rows |
| Generate Client Brief | Situation report + case meta | Claude content, Kimi structure | Report JSON |
| Generate Public Article | Case themes, anonymized | Kimi draft, Claude risk review | Article JSON/draft |
| Generate Spec Proposal | Intake or brief | Kimi draft | Proposal JSON/PDF input |

Buttons are contextual. The panel should only enable workflows valid for the current route and object.

## Chat

Chat goes to Hermes sessions, not directly to model APIs.

Each message includes:

- Active route
- Active object type and ID
- Human-readable context summary
- Available tools for that context
- Session ID

Example context block:

```text
Active context:
- route: /investigate
- investigation_id: <uuid>
- case_id: <case-id>
- phase: Analyse
- vault_path: investigations/<case-id>/
- available tools: investigation, signals, graph, vault_artifacts, reports
```

Chat and workflow buttons share session context per active object. A user can ask follow-up questions after a workflow run without manually restating what happened.

## Supabase Access Model

Hermes may have privileged backend credentials, but the model loop should use named tools. This gives practical full access without unbounded database mutation.

Access tiers:

| Tier | Domains | Policy |
|---|---|---|
| Normal read/write | Projects, Operations, workspace databases, investigations, graph, notes, reports, OSINT signals | Allowed through validated tools |
| Validated write | Workflow state, graph mutations, report artifacts, database records | Schema validation and audit log required |
| Confirmation required | Bulk delete, destructive update, publish, schema migration, credential/config changes | Human approval card in InteliZen |
| Protected/read-mostly | Brain tables: documents, chunks, cases, decisions, config, taste_preferences | Read only unless an explicit workflow requires write access |

No generic `run_sql` tool in v1. If an admin SQL tool is added later, it must be disabled by default and require interactive approval.

## GenZen Tool/MCP Layer

Hermes needs tools across the whole company operating surface.

Core tools:

```text
get_active_context()
list_projects()
get_project(project_id)
update_project(project_id, patch)

list_operations()
get_operation(operation_id)
update_operation(operation_id, patch)

list_workspace_databases()
get_workspace_database(database_id)
query_workspace_records(database_id, filters, limit)
create_workspace_record(database_id, values)
update_workspace_record(record_id, patch)

search_signals(query, filters)
list_case_signals(case_id)
save_signal_to_project(signal_id, project_id)

list_investigations(filters)
get_investigation(case_id)
update_investigation(case_id, patch)
advance_investigation_phase(case_id, phase, gate_data)

list_graph_nodes(scope)
create_graph_nodes(scope, nodes)
create_graph_edges(scope, edges)
update_graph_node(node_id, patch)

read_note(path)
write_note(path, content)
list_notes(prefix)

write_case_artifact(case_id, path, content, metadata)
list_case_artifacts(case_id)
read_case_artifact(case_id, path)

write_workflow_event(run_id, event)
update_workflow_run(run_id, patch)
write_dashboard_message(message)
```

External tools:

```text
exa_search(...)
exa_deep_research_start(...)
exa_deep_research_check(...)
domain_whois(...)
domain_dns(...)
cert_transparency(...)
wayback_snapshots(...)
virustotal_lookup(...)
urlhaus_lookup(...)
threatfox_lookup(...)
```

Claude tool:

```text
delegate_to_claude(task, context, allowed_tools, expected_output)
```

Local-only tool:

```text
open_local_claude_session(context)
```

## Artifact And Vault Strategy

Current app assumes local vault paths under:

```text
~/vault/intelligence/
```

Hermes on Railway cannot read that filesystem directly. Before cloud workflows can replace local Claude workflows, add an artifact bridge.

Recommended v1:

1. Store workflow outputs as Supabase rows and optional Supabase Storage objects.
2. Keep `vault_files` as the artifact index.
3. Add `storage_path`, `local_path`, `content_type`, `checksum`, and `origin` fields if missing.
4. InteliZen can pull cloud artifacts down into local vault when needed.
5. Local-only notes remain readable by local Claude advanced mode until sync is implemented.

Artifact origins:

```text
local-vault
hermes-railway
manual-upload
deliverables-renderer
evidence-capture
```

Important rule: prompts should reference artifacts by tool-readable IDs, not only by local file path.

## App Changes

Add a single frontend service boundary:

```text
src/services/agent.ts
```

Initial API:

```typescript
startWorkflow(input: {
  workflowId: string
  context: AgentContext
  config?: Record<string, unknown>
}): Promise<{ runId: string; sessionId: string }>

sendChatMessage(input: {
  sessionId: string
  context: AgentContext
  message: string
  attachments?: string[]
}): Promise<void>

subscribeToRun(runId: string, onEvent: (event: AgentEvent) => void): () => void

cancelRun(runId: string): Promise<void>

approveAction(approvalId: string): Promise<void>
denyAction(approvalId: string, reason?: string): Promise<void>
```

Replace direct model calls:

- `src/views/Investigation.tsx` direct Anthropic call becomes `startWorkflow("run-analysis", ...)`
- `src/views/Graph.tsx` direct Anthropic graph extraction becomes `startWorkflow("extract-graph", ...)`
- Existing `src/lib/shell.ts` remains for local advanced Claude mode and transitional workflows

Add state:

```text
src/store/agent-panel-store.ts
```

State includes:

- panel open/collapsed
- active session by context object
- messages
- run status
- pending approvals
- output artifacts

## Backend/API Changes

Add an Agent Gateway service. It can live as a separate Railway service or inside the Hermes deployment if Hermes exposes clean HTTP endpoints.

Required endpoints:

```text
POST /sessions
POST /sessions/:id/messages
POST /workflows/:workflowId/runs
GET  /runs/:id/events
POST /runs/:id/cancel
POST /approvals/:id/approve
POST /approvals/:id/deny
GET  /contexts/:type/:id
```

Streaming can be SSE for v1. WebSocket is optional.

Minimum event shape:

```typescript
type AgentEvent =
  | { type: "run.started"; run_id: string; session_id: string }
  | { type: "message.delta"; role: "assistant"; text: string }
  | { type: "tool.started"; tool: string; input_summary: string }
  | { type: "tool.completed"; tool: string; output_summary: string }
  | { type: "approval.requested"; approval_id: string; action: string; risk: string }
  | { type: "artifact.created"; artifact_id: string; title: string; path?: string }
  | { type: "run.completed"; run_id: string; status: "success" | "failed" | "cancelled" }
  | { type: "error"; message: string }
```

## Schema Additions

Likely tables:

```sql
agent_sessions (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  context_type text,
  context_id text,
  title text,
  status text not null default 'active'
);

agent_messages (
  id uuid primary key,
  session_id uuid not null references agent_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  role text not null,
  content text not null,
  raw_payload jsonb
);

workflow_runs (
  id uuid primary key,
  session_id uuid references agent_sessions(id) on delete set null,
  workflow_id text not null,
  context_type text,
  context_id text,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  model_default text,
  raw_payload jsonb
);

workflow_events (
  id uuid primary key,
  run_id uuid not null references workflow_runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  event_type text not null,
  payload jsonb not null
);

agent_approvals (
  id uuid primary key,
  run_id uuid references workflow_runs(id) on delete cascade,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  action text not null,
  risk text,
  status text not null default 'pending',
  payload jsonb not null
);
```

Keep migrations additive and reviewable.

## Local Claude Advanced Mode

Local Claude remains useful and should not be removed.

Use cases:

- Adam wants direct Claude/MCP control
- Cloud Hermes is unavailable
- A workflow needs local-only vault files not synced to cloud
- Debugging MCP tools and prompts

Implementation:

- Keep `src/lib/shell.ts` for local `claude -p` transitional runs.
- Optional later: add a PTY/xterm advanced terminal if direct interactive Claude inside InteliZen becomes important.
- Provide context injection matching Hermes sessions.
- Do not make local Claude the default workflow engine once Hermes is stable.

## Build Sequence

### Current Priority Order

Before any Fiona/Hermes engineering begins, two things come first:

1. **Home page** — Codex builds this from `home-dashboard-plan.md`. No agent integration; Supabase reads only.
2. **Canvas workflow design** — Adam and Claude map the workflows Fiona will run (what triggers them, what tools they need, what they produce). This becomes the spec Codex uses to implement Block 3+.

Fiona integration begins at Block 0 after both of the above are complete.

### Block 0 - Validation Spike

Goal: prove Hermes on Railway can run a real workflow against the existing Supabase project.

Tasks:

- Deploy minimal Hermes service on Railway with a volume.
- Configure Kimi K2.6.
- Give Hermes a narrow test tool: `get_investigation(case_id)`.
- Add one write tool: `write_workflow_event(run_id, event)`.
- Run a test workflow from curl or a small script.
- Confirm events appear in Supabase.

Acceptance:

- Hermes starts reliably on Railway.
- Kimi responds through Hermes.
- Tool call can read a real InteliZen row.
- Tool call can write a workflow event.
- Secrets are not exposed to the frontend.

### Block 1 - Agent Gateway + Supabase Run Log

- Add `agent_sessions`, `agent_messages`, `workflow_runs`, `workflow_events`, `agent_approvals`.
- Build Agent Gateway endpoints.
- Implement SSE event stream.
- Store every run and event.
- Add basic auth/shared-secret from InteliZen to gateway.

Acceptance:

- InteliZen can start a dummy run and stream events.
- Runs survive page refresh.
- Failed runs record errors.

### Block 2 - Frontend Agent Panel

**Chat interface stack (decided):**

| Concern | Solution |
|---|---|
| Chat shell | `assistant-ui` (MIT, headless, Tailwind-styled to match app) |
| Runtime adapter | `useExternalStoreRuntime` — custom Hermes gateway, not Vercel AI SDK |
| STT | VoiceInk (system-wide macOS app, no in-app code needed) |
| TTS | Hermes returns audio; assistant message bubbles include `<audio>` element |
| File attachments | Tauri `dialog` plugin for native picker; `fs` plugin for reads; assistant-ui attachment primitives for UI |
| Dependency risk | assistant-ui uses Radix unstyled primitives + Zustand v5 (already in app); no CSS shipped; no Mantine conflict |

**Chat session model (decided):** Single persistent thread with Fiona (Option B). Fiona has her own persistent memory, context, and self-learning — she manages orientation herself. InteliZen passes the active route and object ID in every message payload so Fiona knows where the user is looking. No context injection, no per-object thread scoping needed from the app side. Schema: one `agent_messages` table keyed to a single session per user, with `active_route` and `active_object_id` columns on each message row.

**Tasks:**

- Add app shell panel (right-side, resizable, collapsible).
- Add chat thread UI via assistant-ui.
- Add workflow button area.
- Add tool timeline.
- Add approval cards.
- Add artifact list with audio playback for TTS responses.
- Add `src/services/agent.ts`.
- Add `src/store/agent-panel-store.ts`.

Acceptance:

- Panel works from every route.
- Chat message streams from gateway.
- Approval event renders and can resolve.
- Audio plays for assistant messages that include TTS output.
- File attachment chip appears and sends file reference to gateway.

### Block 3 - First Real Workflow: Scoping Run

- Implement Hermes workflow for Scoping Run.
- Tools: get investigation, list case signals, write case artifact, update investigation phase.
- Replace current Analyse/Scoping direct Anthropic path where appropriate.

Acceptance:

- User can run Scoping from InteliZen.
- Hermes reads case data.
- Output artifact appears in Reports/vault file list.
- Investigation phase/gate updates correctly.

### Block 4 - Graph Extraction Workflow

- Move graph auto-extraction behind Hermes.
- Tools: list project signals, create graph nodes, create graph edges.
- Keep extraction output JSON validated.

Acceptance:

- Graph extraction works without browser-side Anthropic key.
- Malformed model JSON fails safely.

### Block 5 - Claude Delegation

- Implement `delegate_to_claude`.
- Start with server-side API delegation if feasible.
- Keep local Claude fallback for direct MCP sessions.
- Add workflow-level model policy: Kimi default, Claude specialist.

Acceptance:

- A workflow can call Claude for a bounded analytical subtask.
- Claude receives only the intended context/tools.
- Result is recorded in workflow events.

### Block 6 - Artifact Bridge

- Add cloud-readable artifact storage.
- Extend `vault_files` if needed.
- Implement artifact read/write tools.
- Add local pull/sync behavior in InteliZen.

Acceptance:

- Hermes-created artifacts are visible in InteliZen.
- Local vault can open or mirror selected artifacts.
- Prompts can reference artifacts by ID.

### Block 7 - Expand Workflow Catalog

Add in order:

1. Intake Processor
2. Situation Report
3. ACH Matrix
4. Evidence Capture
5. Client Brief
6. Public Article
7. Spec Proposal

Each workflow gets:

- Tool allowlist
- Output schema
- Confirmation policy
- Artifact contract
- UI button state

## Security And Operations

Required before production use:

- Railway variables for Supabase service key, Kimi/Moonshot key, Claude key if used
- No service keys in Tauri frontend
- Gateway auth between InteliZen and Railway
- Audit logs for all writes
- Human confirmation for destructive actions
- Rate limit gateway endpoints
- Separate dev/prod Railway services if workflows become critical
- Backups for workflow tables and artifacts

Do not commit `.env.local`.

## Risks

| Risk | Mitigation |
|---|---|
| Hermes gets too much database power | Named tools, confirmation policies, audit logs |
| Local vault is invisible to Railway | Artifact bridge and local sync |
| Claude skills/MCPs do not port cleanly | Preserve local advanced mode, build server-side tool equivalents gradually |
| Agent runs mutate wrong object | Context IDs required on every tool call, validation checks before writes |
| Long sessions become confused | One session per active object, "new session" button, context summary refresh |
| Model output breaks schemas | Zod validation, repair pass, UI error surfacing |
| Railway container filesystem resets on redeploy | Mounted volume for Hermes runtime state, Supabase for durable run state |

## Decisions To Lock Before Build

1. Where Agent Gateway lives: inside Hermes service or separate Railway service.
2. Exact Kimi provider/API route and model name.
3. Claude delegation path: server-side API first, local Claude only, or both from day one.
4. Artifact bridge storage: Supabase Storage, local sync only, or hybrid.
5. Gateway auth method for local desktop to Railway.
6. Confirmation policy for high-risk tools.
7. Whether any Brain tables get write tools in v1.

## First Engineering Move When Scheduled

Do Block 0 only. Do not build the panel first.

The critical unknown is not UI. The critical unknown is whether Hermes on Railway can reliably run Kimi, call a GenZen tool, read/write the existing Supabase project, and stream events back without leaking credentials or losing state.

If Block 0 passes, the rest is straightforward product engineering.
