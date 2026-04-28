# Claude Code Panel + Workflow Engine — Plan

Reference doc for embedding Claude Code as a persistent panel inside InteliZen with a workflow button interface and ad-hoc chat capability. Not yet scheduled.

## Goal

Run the actual `claude` CLI — with full MCP, skills, and plugin support — inside InteliZen as a persistent right-side or bottom panel. Two interaction modes:

1. **Workflow buttons** — pre-defined skill invocations that run structured, repeatable operations (intake processing, scoping runs, situation reports, asset generation). One click, no prompt authoring, deterministic output shape.
2. **Chat window** — ad-hoc conversation for refinement, clarification, and exploratory work on whatever's currently in the app.

The workflow button mode is the primary interface. The chat window is always available alongside it. This is not a terminal embed — the user is not writing prompts from scratch. The skills do the work.

## Why not a terminal embed

The original plan (xterm.js + portable-pty) gives a full Claude Code terminal inside InteliZen. It works but positions the interface as a developer tool rather than an analyst tool. The workflow button model is more appropriate for the actual use cases: structured intelligence operations where the same sequence of steps runs on every case, with consistent output assets per stage.

The PTY approach is preserved as an advanced/debug mode behind a toggle. The default panel shows the workflow engine.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  InteliZen (Tauri webview)                                    │
│                                                               │
│  ┌──────────────────────────┐  ┌──────────────────────────┐  │
│  │  Investigation / Main     │  │  Claude Code Panel        │  │
│  │  content area             │  │                           │  │
│  │                           │  │  [Workflow Buttons]        │  │
│  │                           │  │  [Chat Window]            │  │
│  │                           │  │  [Document Upload]        │  │
│  └──────────────────────────┘  └──────────────────────────┘  │
│                                                               │
│  ┌───────────────────────────────────────────────────────┐   │
│  │  Main process (Tauri / Rust)                           │   │
│  │  ClaudeRunner: tokio::process::Command                 │   │
│  │  PermissionServer: Axum HTTP on 127.0.0.1              │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
                          │
                  spawns `claude -p`
                  with cwd + inherited env
                  + --append-system-prompt INTELIZEN_HINT
```

## Subprocess layer (Rust)

`claude -p --input-format stream-json --output-format stream-json` spawned via `tokio::process::Command`. The Rust layer handles:

- Spawn with proper `HOME`, `PATH`, env inheritance (so all MCPs, skills, and commands load)
- NDJSON line reader on stdout → Tauri events to frontend
- Stdin writer for follow-up messages
- Session resume via `--resume <session-id>`
- `SIGINT` cancel → `SIGKILL` fallback after 5s
- PermissionServer: small Axum HTTP server on localhost handling `PreToolUse` hook callbacks

InteliZen context hint appended to every session via `--append-system-prompt`:

```
You are running inside InteliZen, GenZen's intelligence operations platform.
You have MCP access to the active investigation, signals, entity graph, and vault.
The active case context (investigation ID, entities, phase) is available via MCP tools.
Prefer operating directly on InteliZen data rather than asking the user to provide it.
When running workflow invocations, write output artifacts to vault and update the
investigation record via MCP. Do not summarize what you did — produce the artifact.
```

**Critical pre-build check:** spawn `claude` from a Tauri command with proper env, run `/mcp` and check all MCPs load, confirm skills are available. 10-minute spike before any build commitment. If env inheritance is broken, the panel is just a stripped-down terminal.

## Workflow buttons

The primary interface. Each button maps to a skill stack + a context shape + an expected output.

### Button catalog

| Button | Phase | Skill stack | Context injected | Output |
|---|---|---|---|---|
| Run Intake Processor | Pre-Brief | intake-processor (custom) | form payload + transcript path | IntakeSummary → decision gate |
| Run Scoping Run | Brief | intelligence-research + analytical-rigor | investigation record, entities | scoping-brief.md in vault |
| Generate Situation Report | Analyse | intelligence-research + analytical-rigor + output-skill | full case, vault files, evidence | situation-report.md in vault |
| Generate Client Brief | Reports | copywriting-department → deliverables | situation report, case meta | Report JSON → PDF + web URL |
| Generate Public Article | Reports | intelligence-research + copywriting-department | case themes (anonymized) | article-draft.md in vault |
| Generate Spec Proposal | Reports | copywriting-department | intake summary, domain flags | spec-proposal.md → PDF |
| Run ACH Matrix | Analyse | analytical-rigor + structured-analysis | evidence registry (EV-IDs) | ach.md in vault |
| Capture Evidence | Collect | evidence.ts pipeline | vault_files URLs for case | EV-IDs + snapshot status |

### Button rendering rules

- Buttons are contextual: only buttons appropriate to the current investigation phase are active. Intake Processor is only enabled if an intake record exists without a linked investigation. Situation Report is only enabled after Scoping is complete.
- Running state: button shows a spinner + streaming activity label. All other buttons are disabled while one is running.
- Completed state: button shows a checkmark + "last run" timestamp. Can be re-run.
- Each button opens an inline output stream so the analyst can watch progress.

### Button invocation pattern

```typescript
// Each button calls a Tauri command that constructs the prompt
async function runWorkflow(workflow: WorkflowId, context: WorkflowContext) {
  const prompt = buildWorkflowPrompt(workflow, context)
  // e.g. "Run /intelligence-research for investigation <id>. 
  //       The intake summary is at vault/intelligence/investigations/<id>/intake-summary.md.
  //       Write findings to scoping-brief.md in the same folder and update the 
  //       investigation via MCP."
  
  await window.intelizen.startClaudeRun({
    prompt,
    sessionId: context.sessionId ?? null,  // resume if continuing
    projectPath: '~',
    appendSystemPrompt: INTELIZEN_CONTEXT_HINT,
  })
}
```

Context is injected from whatever is currently open in the app — no manual copy-paste.

## Chat window

Always visible below or alongside the workflow buttons. Standard conversation interface:

- Message history with assistant/user/tool-group rendering
- Input bar with file attachment support
- Tool use timeline (collapsible — same pattern as clui-cc's ToolGroup)
- Permission approval cards for dangerous tool calls (Bash, Edit, Write)
- Session continuity — same session persists while the panel is open; resumes on reopen via `--resume`

The chat window runs in the same Claude session as the most recent workflow run, so the analyst can ask follow-up questions with full context of what was just produced.

## Document upload

Upload primitive (defined in intake-workflow-plan.md) is available in the panel input bar. Drag-and-drop or file picker. Accepted types: `.txt`, `.md`, `.docx`, `.pdf`, `.png`, `.jpg`.

Uploaded files are written to the current case's vault folder and referenced as file paths in the prompt. Claude reads them via the Read tool via MCP file access — files never inline-embedded in prompts.

For the intake flow specifically, the transcript upload is surfaced on the Intake button's configuration modal before running.

## Phase-aware context injection

The panel reads the currently open investigation from InteliZen's app state and automatically prepends case context to every workflow run and chat session:

```
Active investigation: <title> (<case-id>)
Phase: <Brief | Collect | Analyse | Reports>
Vault path: ~/vault/intelligence/investigations/<case-id>/
Evidence count: <n> vault files (<m> with EV-IDs)
```

This means Claude doesn't need to be told what case is active — the panel handles it.

## PTY / terminal mode (advanced)

Behind a toggle in the panel header: "Advanced mode." Opens an xterm.js terminal running `claude` in a PTY via `portable-pty` (Rust crate). Full interactive Claude Code, identical to VS Code. Useful for:

- Running arbitrary commands outside the workflow catalog
- Debugging skill behavior
- Running `/mcp` or `/tools` to inspect state

This mode shares the same env setup as the primary mode. Sessions are independent — PTY mode doesn't resume the workflow chat session.

**PTY dependencies if/when built:**
- Terminal frontend: `@xterm/xterm` + `@xterm/addon-fit` (production-grade, what VS Code uses)
- PTY backend: `portable-pty` Rust crate (used by WezTerm)
- Custom Tauri command (~50–100 LOC Rust) for spawn/write/resize/kill
- Rejected: `tauri-plugin-pty` (community, unverified on Tauri v2), `node-pty` (requires Node sidecar)

## Output tracking

Every workflow run that produces a vault artifact creates a `vault_files` row. The panel shows a small "Outputs" section below the buttons listing the artifacts produced in the current session with click-to-open links.

This means the analyst can always find what was produced, even if they've scrolled past the streaming output.

## Open design decisions

1. **Panel position.** Right-side resizable panel (VS Code style) vs. bottom panel vs. user-configurable? Lean: right-side panel, resizable, collapsible. Bottom panel is an option if the main content area needs full width.
2. **Session scope.** One persistent session per investigation, or one per app session? Lean: one per investigation — resumes when that investigation is opened, giving continuity across working sessions on the same case.
3. **Workflow configuration modal.** Some workflows need a quick config before running (e.g., Situation Report: which report type? which audience?). Light modal overlay on the button click vs. inline form in the panel. Lean: light modal, only when needed.
4. **Parallel runs.** Can two workflow buttons run simultaneously? Default: no. One active run at a time per panel. If a second is triggered while one runs, queue it.
5. **In-flight permission approval.** If a tool approval is pending and the panel is collapsed, surface a notification badge on the panel toggle button. Auto-expand the panel.
6. **Chat vs workflow session sharing.** Does ad-hoc chat run in the same `claude -p` session as the most recent workflow? Lean: yes — preserves context. Risk: session gets very long. Mitigation: offer "New session" button when session age > X hours.

## Build sequence

**Block 1 — Subprocess layer (Rust)**
- `ClaudeRunner` struct: spawn, stdin write, stdout NDJSON stream, cancel
- `PermissionServer`: Axum HTTP server, PreToolUse hook handling
- Tauri commands: `start_claude_run`, `send_message`, `cancel_run`, `approve_tool`, `deny_tool`
- Tauri events: `claude:event` (normalized from NDJSON stream)
- Env inheritance verification spike (10 min): confirm MCP + skills load

**Block 2 — Chat window (frontend)**
- `ClaudePanel` component: message list, input bar, tool timeline, permission cards
- Zustand store: session state, message history, active run status
- Wire to Tauri events from Block 1
- Smoke-test: open panel, type a prompt, confirm response renders with tool use visible

**Block 3 — Workflow buttons**
- `buildWorkflowPrompt` for each workflow in the catalog
- Button components with running/completed/disabled states
- Phase-aware context injection from app state
- Outputs section (vault_files produced this session)
- Test: Scoping Run button on a real investigation

**Block 4 — Document upload**
- Wire upload primitive (from intake-workflow-plan Block 1) into panel input bar
- Drag-and-drop target on the panel
- File reference injection into prompts

**Block 5 — PTY terminal mode (optional, deferred)**
- xterm.js terminal component
- portable-pty Tauri command
- Toggle in panel header

## Relationship to other plans

| Plan | Relationship |
|---|---|
| intake-workflow-plan | Intake Processor button + transcript upload are this plan's first workflow |
| client-deliverables-architecture | Client Brief + article + spec buttons feed into the deliverables pipeline |
| huntkit-integration-plan | Evidence Capture button wraps evidence.ts; ACH Matrix button wraps structured-analysis prompts |
| home-dashboard-plan | No direct dependency; Steve's messages widget is the other Claude output surface |

## Status

Updated 2026-04-28. Original plan (terminal embed, xterm + PTY) preserved as optional/advanced mode. Primary interface revised to workflow buttons + chat hybrid based on actual case workflow requirements. Not scheduled. Intake-workflow-plan Block 1 is a precondition for the Intake Processor workflow button.
