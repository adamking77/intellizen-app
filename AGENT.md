# IntelliZen Agent Guide (historical V1 freeze)

> **Status:** This document describes the original V1 freeze. The current build has promoted Investigation and Reports out of V2 with approval (2026-04-07) and now ships seven screens, spawns `claude -p` via the Tauri shell plugin, reads/writes the vault via the Tauri fs plugin, and uses `react-force-graph-2d` for the graph canvas instead of React Flow. Read [CLAUDE.md](CLAUDE.md) for the current build contract. The sections below stay here as product-intent context for the V1 loop.

## Mission

Build IntelliZen V1 as a **macOS-only personal desktop intelligence platform** with exactly five screens:

1. Inbox
2. Search
3. Projects
4. Monitors
5. Graph

V1 exists to:

- collect signals from Exa
- persist them in the existing GenZen Brain Supabase project
- let Adam triage and organize signals into Projects
- support manual graph mapping inside a Project

Claude analysis, scheduled processing, report generation, webhook delivery, and the 6-phase investigation workflow are **V2** and must not be pulled into V1.

## Source of Truth

Use these docs as the product contract:

- `IntelliZen-Revival-Strategy.md`
- `intellizen-tauri-spec.md`
- `osint-workflow-analysis.md`

When docs conflict, precedence is:

1. `intellizen-tauri-spec.md` for V1 implementation details
2. `IntelliZen-Revival-Strategy.md` for product intent and boundaries
3. `osint-workflow-analysis.md` for V2 continuity only

## Locked V1 Decisions

- Platform: macOS only
- Runtime: Tauri v2
- Frontend: React 18 + TypeScript + Vite
- Styling: Tailwind CSS v4
- Components: shadcn/ui + Radix UI
- State: Zustand
- Server/cache/data fetching: TanStack Query
- Database: existing Supabase project
- Search provider: Exa only
- Package manager: pnpm
- Graph: React Flow
- Auth: none
- Supabase RLS on IntelliZen tables: disabled
- Claude integration: none inside the app in V1
- Signal collection model: pull-based on Refresh, not webhook-based
- Exa category rules must follow context:
  - Tauri SDK/Search UI: `category: 'news'` for News, `category: 'personal site'` for People
  - MCP/Claude Code context: `category: "people"` is valid there; do not copy MCP category rules into the app

## V1 Non-Goals

Do not build these in V1:

- Reports page
- Triggers or scheduling
- `claude -p` subprocess execution
- Anthropic API integration
- Vercel functions or webhook receivers
- Vault sync
- Auto graph generation
- Investigation phase stepper
- Exa Monitor API push delivery
- Cross-platform support
- Multi-user auth

If a change leans toward V2, stop and keep the implementation minimal unless the user explicitly changes scope.

## Core Product Model

### Monitors

Saved Exa search templates with:

- `name`
- `query`
- `watch_domain`
- `frequency`
- `status`
- `last_run`
- `signal_count`

Monitors power Inbox refreshes. They are not background jobs in V1.

### Signals

`intel_signals` stores the canonical saved result from Exa, whether it came from:

- Inbox refresh via a Monitor
- manual Search
- Deep Research saved output

Preserve `raw_payload` so Exa response evolution does not force early schema churn.

### Projects

Projects are the main organizational unit in V1. Every saved signal should be attachable to a Project. Project types:

- `report`
- `scoping`
- `research`
- `client_case`

### Graph

Graph is scoped to a single selected Project and is manual-only in V1. Support four node types:

- Person
- Organisation
- Location
- Event

## Implementation Order

Build in this order unless a local dependency forces a small adjustment:

1. Supabase migrations for `intel_signals`, `projects`, `project_signals`, `monitors`
2. Tauri v2 scaffold with React + TypeScript + Vite
3. Dependency install and baseline tooling
4. App shell: sidebar, routing, shared clients, env wiring
5. Monitors screen
6. Inbox screen
7. Projects screen
8. Search screen
9. Graph migrations: `graph_nodes`, `graph_edges`
10. Graph screen
11. End-to-end QA

Do not start Graph before the core signal flow works.

## UX Direction

This is an intelligence workstation, not a generic SaaS dashboard. The UI should feel deliberate, quiet, and operational.

- Avoid bright default component-library aesthetics
- Prefer dense but readable information layouts
- Make scanability a first-order concern
- Prioritize keyboard-friendly flows where practical
- Keep domain badges, statuses, and triage affordances visually distinct

Match the established product language from the docs:

- Watch domains
- signals
- Projects
- triage
- Graph

Do not introduce new naming unless required by code clarity.

## Engineering Rules

- Keep Exa access behind a small client layer in `src/lib/exa.ts`
- Keep Tauri SDK behavior separate from MCP assumptions; the app must implement the SDK categories defined in `intellizen-tauri-spec.md`
- Keep Supabase access behind typed helpers or focused query modules where practical
- Prefer simple, explicit state over premature abstraction
- Use TanStack Query for server state and cache invalidation
- Use Zustand only for app-level UI state that does not belong in query cache
- Preserve raw backend data; transform near the view layer
- Build for resilience around partial data, missing snippets, null publish dates, and sparse Deep Research output
- Deduplicate Inbox inserts against existing stored signals by URL before insert
- Keep migrations additive and reviewable

## Data and Security Constraints

- Never commit `.env.local`
- Use `VITE_SUPABASE_URL`, `VITE_SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `VITE_EXA_API_KEY`
- Do not use the Supabase anon key for IntelliZen writes. The local desktop app and MCP server are trusted single-user operators and must use the service-role key from `.env.local`.
- Treat the Supabase Brain project as shared infrastructure: do not alter unrelated tables
- Avoid destructive migration edits once a table contract is in use; prefer follow-up migrations

## Definition of Done for V1

V1 is done when this flow works end to end:

1. Create or edit Monitors
2. Refresh Inbox and pull signals from Exa
3. Deduplicate and persist new signals
4. Save a signal to a Project or dismiss it
5. Create and manage Projects
6. Run manual Search across all 7 Exa modes
7. Add Search results to Projects
8. Open Graph for a Project and manually create nodes and edges
9. Persist graph state in Supabase

## Working Assumptions

- Existing Supabase project access and API keys are available before implementation starts
- Exa SDK supports all V1 search modes required by the spec
- Single-user local desktop usage means no auth layer is needed
- Any V2 material in the docs is context only unless explicitly promoted

## When Unsure

- Choose the simpler implementation that preserves the locked V1 flow
- Prefer shipping the full five-screen loop over polishing any one screen too early
- Ask before expanding scope into automation, analysis, or publishing
