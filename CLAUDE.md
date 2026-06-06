# InteliZen — Build Context

macOS-only Tauri v2 desktop intelligence platform for GenZen. Original V1 spec in `intellizen-tauri-spec.md`; the current build has promoted several V2 capabilities into the app. Read the rest of this file before the spec.

## Current scope (actual build, not frozen spec)

**7 screens**, grouped as 4 operational layers:

| Layer | Routes |
|---|---|
| Monitoring | `/inbox`, `/monitors` |
| Search | `/search` |
| Organize | `/projects`, `/graph` |
| Analyse | `/investigate`, `/reports` |

Investigation (3-phase flow: Brief → Collect → Analyse, with Scoping / Post / Sit Rep use-case selectors) and Reports were promoted from V2. `intellizen-tauri-spec.md` and `AGENT.md` describe the original V1 freeze — kept for product-intent context, not implementation contracts.

## Build commands

- `pnpm tauri dev` — dev mode
- `pnpm tauri build` — production DMG
- `pnpm icon` — regenerate all `src-tauri/icons/` sizes from `app-icon.svg`. **Always use this after updating the icon — never use `sips` or `qlmanage` manually.**

## Credentials

```
VITE_SUPABASE_URL=https://jicrdrwtwubveyvzyyrh.supabase.co
VITE_SUPABASE_SERVICE_ROLE_KEY=<in .env.local>
SUPABASE_SERVICE_ROLE_KEY=<in .env.local>
VITE_EXA_API_KEY=<in .env.local>
VITE_ANTHROPIC_API_KEY=<in .env.local>
```

These are also in `.env.local`. The Supabase project is the existing GenZen Brain project — do not create a new project and do not alter Brain tables (`documents`, `chunks`, `cases`, `decisions`, `config`, `taste_preferences`).

## Stack

Tauri v2 · React 18 + TypeScript + Vite · Tailwind CSS v4 · hand-rolled UI primitives in `src/components/ui/` (follow the shadcn/ui API but are not CLI-initialized) · Zustand · TanStack Query · Supabase JS v2 · Exa JS SDK (`exa-js`) · `react-force-graph-2d` + `d3-force` for the Insight graph view; custom SVG/DOM canvas for Construct mode · pnpm

Tauri plugins: `opener`, `fs` (scoped to `$HOME/vault/**`), `shell` (whitelisted to `claude -p`).

## Database

Five additive migrations in `supabase/migrations/`:

1. `init_intellizen_v1_schema` — `intel_signals`, `projects`, `project_signals`, `monitors` + `update_updated_at()` trigger fn.
2. `add_graph_tables` — `graph_nodes`, `graph_edges`.
3. `dedupe_intel_signals_and_enforce_unique_urls` — collapses duplicate URLs and adds `intel_signals_url_uidx`.
4. `add_standalone_graph_mode` — nullable `project_id` on graph tables so graphs can exist outside a project.
5. `add_investigations_schema` — `investigations`, `investigation_signals`, `vault_files`.

RLS is disabled on InteliZen tables (single user, local desktop).

## Investigation + Reports integration

- **Claude execution**: [src/lib/shell.ts](src/lib/shell.ts) wraps `Command.create("claude", ...)` via the Tauri shell plugin. Prompts per phase are built in `buildPhasePrompt` / `buildReportPrompt`.
- **Vault I/O**: [src/lib/vault.ts](src/lib/vault.ts) wraps the Tauri fs plugin. Reads/writes under `$HOME/vault/intelligence/investigations/<case-id>/`.
- **Artifact tracking**: every `claude -p` run that produces a file also inserts a row into `vault_files` keyed to `case_id`.

## Graph implementation

Uses **`react-force-graph-2d`** (not React Flow). Two modes inside `src/views/Graph.tsx`:

- **Insight mode** — force-directed Obsidian-style canvas ([src/components/graph/obsidian-graph.tsx](src/components/graph/obsidian-graph.tsx)).
- **Construct mode** — custom SVG/DOM canvas with drag, pan, zoom, connector handles, edge drag, multi-select, undo/redo, shortest-path, ego network, minimap.

Graphs can be project-linked or standalone (`project_id = null`).

## Exa Integration Reference

Install: `pnpm add exa-js`

### Client setup ([src/lib/exa.ts](src/lib/exa.ts))

```typescript
import Exa from "exa-js"
export const exa = new Exa(import.meta.env.VITE_EXA_API_KEY)
```

### Search mode implementations

**Web** (semantic, autoprompt):
```typescript
await exa.searchAndContents(query, {
  type: 'auto',
  useAutoprompt: true,
  numResults: 10,
  highlights: { numSentences: 3, highlightsPerUrl: 1 }
})
```

**News** (date-filterable):
```typescript
await exa.searchAndContents(query, {
  type: 'auto',
  category: 'news',
  numResults: 10,
  highlights: { numSentences: 3, highlightsPerUrl: 1 },
  startPublishedDate: startDate
})
```

**Research Papers:** `category: 'research paper'` with highlights.

**Company:** `exa.search(query, { category: 'company', numResults: 10 })`.

**People:** `category: 'personal site'`.

**Financial Reports:** `category: 'financial report'`.

**Deep Research** (async — REST API, not in SDK):
```typescript
const res = await fetch('https://api.exa.ai/research/v1', {
  method: 'POST',
  headers: {
    'x-api-key': import.meta.env.VITE_EXA_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ instructions: query, model: 'exa-research' })
})
const { id } = await res.json()
// Poll GET /research/v1/:id every 2s until status === 'completed'
```

Deep Research returns a markdown string, not a results array.

### Exa category rules

The **Tauri SDK** uses `category: 'news'` for News and `category: 'personal site'` for People. The MCP server uses `category: 'people'`. Do not copy MCP categories into the app.

### Inbox Refresh logic

`listMonitors()` → for each `active` monitor, call Exa, upsert results into `intel_signals` with `onConflict: "url", ignoreDuplicates: true`, update `last_run` and `signal_count`. The unique index on `url` does the dedup.

## MCP server

Source: `mcp-server/src/index.ts`. Build: `cd mcp-server && pnpm build`. The `dist/` directory is gitignored — always build after pulling. The server exposes tools for projects, investigations, signals, vault files, and graph nodes/edges.

**Known limitation:** `list_project_signals` returns full `raw_payload` per signal — can exceed 1M characters on large projects. When reading project signals via MCP, use `run_exa_search` results (which return only IDs and titles) or query Supabase directly for slim fields rather than calling `list_project_signals` on a well-seeded project.

## Key engineering rules

- Keep Exa access behind `src/lib/exa.ts`. Keep Tauri shell/fs behind `src/lib/shell.ts` and `src/lib/vault.ts`.
- Preserve `raw_payload` on signals so Exa response evolution doesn't force schema churn.
- Build for resilience around partial data, null publish dates, sparse Deep Research output.
- TanStack Query for server state; Zustand only for UI state that doesn't belong in query cache.
- Migrations are additive and reviewable — no destructive edits to live contracts.
- Never commit `.env.local`.

## Out of scope (still not built)

Vercel webhook receivers · Exa Monitor API push delivery · auto-graph generation · multi-user auth · cross-platform targets · vault-sync to the Brain Supabase project (manual export only).
