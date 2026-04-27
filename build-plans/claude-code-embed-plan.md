# Claude Code Embed — Plan

Reference doc for embedding a real Claude Code session inside InteliZen as a sidebar pane (VS Code-style). Not yet scheduled. Discussion artifact, not a build brief.

## Goal

Run the actual `claude` CLI — with full MCP, skills, and plugin support — inside InteliZen, the same way Claude Code runs alongside the vault in VS Code. The job is collaborative work on whatever's currently in the app, not a chat-with-API experience.

## Architecture

```
┌─────────────────────────────────┐
│  InteliZen (Tauri webview)      │
│  ┌───────────────────────────┐  │
│  │ Sidebar pane              │  │
│  │ ┌───────────────────────┐ │  │
│  │ │ xterm.js terminal     │ │  │   frontend
│  │ └──────────┬────────────┘ │  │
│  └────────────┼──────────────┘  │
│               │ Tauri IPC       │
│  ┌────────────▼──────────────┐  │
│  │ Custom Tauri command      │  │   Rust
│  │ wrapping portable-pty     │  │
│  └────────────┬──────────────┘  │
└───────────────┼─────────────────┘
                │
        spawns `claude` in PTY
        with cwd + inherited env
```

## Components

| Layer | Choice | Maturity | Notes |
|---|---|---|---|
| Terminal frontend | `@xterm/xterm` + `@xterm/addon-fit` | Production-grade | What VS Code's integrated terminal uses. No realistic alternative. |
| PTY backend | `portable-pty` (Rust crate) | Production-grade | Used by WezTerm. Cross-platform. |
| Tauri integration | Custom command (~50–100 LOC Rust) | Owned code | Wraps spawn / write / resize / kill. No plugin dependency. |
| Process | `claude` CLI binary | Already installed | Same binary used in VS Code workflow. |

**Rejected alternatives:**
- `tauri-plugin-pty` — community plugin, thinly maintained, unverified on Tauri v2 / macOS.
- `node-pty` (Microsoft) — would require bundling a Node sidecar in Tauri. Heavier, more fragile.
- Tauri shell plugin alone (no PTY) — won't render Claude Code's TUI correctly. Already used for `claude -p` headless calls; not the same use case.
- Claude Agent SDK — gives chat + tools but loses the full agent loop, MCPs, skills, plugins. Wrong tool for this job.

## Open design decisions

These shape the UX more than the code. Resolve before building.

1. **Session scope.** One persistent Claude session for the whole app, or one per project/investigation? Switching screens — does the session follow you, or does each context get its own?
2. **Working directory.** Spawn `claude` with `cwd = $HOME/projects/intelizen-app`? Or with `cwd` set to the active project's vault dir? Determines what files Claude can read/edit by default.
3. **Sidebar lifecycle.** When sidebar closes: keep PTY alive (session resumes on reopen) or kill (clean restart). Probably keep alive, but defines the implementation.
4. **In-flight tool approvals.** If a tool-approval prompt is pending and the sidebar is closed, what's the surface? Notification? Auto-reopen? Block close?
5. **Awareness layer.** Does the embedded Claude *know* what InteliZen screen / project / investigation is active? If not, it's just a fancier window for the same Terminal.app experience. The awareness is the actual value-add over running Claude in a separate window.
6. **Multiple sessions.** Tabs in the sidebar, or strictly single session at a time?

## Critical pre-build verification

**MCP and skills environment inheritance.** Global Claude Code config lives in `~/.claude/`. The spawned `claude` process needs the right `HOME`, `PATH`, and any other env vars for:
- intelizen MCP server
- genzen-brain MCP
- supabase, perplexity, gmail, etc. MCPs
- All skills in `~/.claude/skills/`
- All commands in `~/.claude/commands/`

If these don't load, the embedded Claude Code is a stripped-down version that defeats the entire point. **10-minute spike before any build commitment:** spawn `claude` from a Tauri command with proper env, run `/mcp` and check for skills, confirm parity with VS Code experience.

## Cheap validation step (before committing the build)

Pin a Terminal.app window next to InteliZen for 3–4 working sessions. Use it the way you'd use the embedded sidebar. If after that you keep wishing it were inside the app, the embed is worth building. If a windowed terminal does 90% of the job, save the Build week capacity for higher-leverage work.

## Status

Discussed 2026-04-26. Plan validated as viable with mature dependencies. Not scheduled. Revisit during a future Build week or when terminal-alongside workflow proves the demand.
