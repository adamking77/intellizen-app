# Wave 1 — stages 5 to 18 in parallel (2026-09-02 evening)

Adam: "go as far as you can until you need my approval, delegate in parallel,
no dependencies." So every stage that does not depend on another is built at
once, each builder in its own git worktree off `v3/phase-0` at the commit
that carries this file. The overseer merges, wires the one-line mounts, runs
every check on the combined tree, takes the screenshots, and Adam walks it
all in one sitting.

## Builders and ownership

| Builder | Stages | Owns (creates or edits) | May add one hunk to |
|---|---|---|---|
| acp | B.5 Rust half | `src-tauri/src/acp.rs`, `src/engine/acp-registry.ts`, `src/engine/acp-session.ts`, deletes `runtimes.rs`, `runtime_bindings.rs`, `runtime_auth.rs` and their TS callers in `src/services/` | `lib.rs` handler list, `Cargo.toml` |
| agents-page | B.5 UI, B.6 | `src/views/Agents.tsx`, `src/components/agents/*` | `App.tsx` route, `sidebar.tsx` entry (Agents replaces Team) |
| rooms | B.7 | `src/rooms/*`, `src/views/Room.tsx` | `App.tsx` route, tree node type |
| attention-data | B.8 | No app surface. Work requiring Adam remains an ordinary database section or kanban row. | None |
| panel | C.9, C.11 | `src/components/agent/*`, `src/components/layout/agent-panel.tsx`, `src-tauri/src/panel_window.rs` | `lib.rs`, `app-shell.tsx` |
| voice | C.10 | `src-tauri/src/voice.rs`, `src/voice/*`, `src/components/settings/voice-settings.tsx` | `lib.rs`, `Cargo.toml`, `Settings.tsx` mount |
| plugins | D.12 | `src/plugins/*`, fs scope in capabilities | `App.tsx`, `sidebar.tsx`, `Home.tsx`, `command-palette.tsx`, `agent-panel.tsx` one mount each |
| charts | D.15 | `src/components/charts/*`, database chart views | `package.json` |
| proposals | E.16 | `src-tauri/src/proposals.rs`, `src/proposals/*`, docs editor proposal strip, MCP `propose_document_edit` | `lib.rs`, `Cargo.toml`, `mcp-server/src/index.ts` |
| unattended | E.17 | `src/services/hermes-cron.ts`, `src/services/hermes-kanban.ts`, Workflows page schedule sheet | `Workflows.tsx` |
| graph-export | E.18 | `src/components/graph/export.ts`, `src/components/docs/graph-embed.tsx` | `Graph.tsx` button, docs block registry |

Shared, written by the overseer before the wave: `src/engine/rest.ts`.

## Post-merge batch (completed 2026-09-03)

D.13 proved the generic plugin contract with a deliberate local fixture. The
screenshots, fidelity pass against the donor, and Adam's walk are complete.
D.14 is not another required wave: it occurs only when Adam asks an agent to
author a widget; its work and approval remain ordinary database or kanban data.

## Approval still needed from Adam

Migrations (none planned in this wave), pushing, and any new sidebar entry
that the roadmap does not already name. Agents is named; no attention page is.
