# InteliZen — Build Context

macOS-only Tauri v2 desktop intelligence platform for GenZen. Original V1 spec in `intellizen-tauri-spec.md`; the current build has promoted several V2 capabilities into the app. Read the rest of this file before the spec.

## Current scope (actual build, not frozen spec)

**14 routes**, grouped as 6 operational layers:

| Layer | Routes |
|---|---|
| Command | `/home`, `/agent-work`, `/workflows`, `/roles` |
| Monitoring | `/inbox`, `/monitors` |
| Search | `/search` |
| Organize | `/projects`, `/databases`, `/databases/:id`, `/graph`, `/canvas` |
| Analyse | `/investigate`, `/reports` |
| Diagnostics / deep links | Inbox and Monitors remain routable but are no longer primary sidebar surfaces |

Investigation (3-phase flow: Brief → Collect → Analyse, with Scoping / Post / Sit Rep use-case selectors), Reports, Home dashboard pins, Agent Work, Workflows, Roles, Databases, and Canvas were promoted beyond the V1 freeze. `intellizen-tauri-spec.md` and `AGENT.md` describe the original V1 intent — kept for product context, not implementation contracts.

## Build commands

- `pnpm tauri dev` — dev mode
- `pnpm tauri build` — production DMG
- `pnpm icon` — regenerate all `src-tauri/icons/` sizes from `app-icon.svg`. **Always use this after updating the icon — never use `sips` or `qlmanage` manually.**

## macOS DMG release rule

InteliZen DMGs are shipped as **unsigned Apple Silicon builds**. Do not assume Developer ID signing or App Store notarization unless Adam explicitly changes the release model.

**Credential gate (audit F-01, mandatory before any publish):** Vite inlines every `VITE_*` value into `dist/` — a build made with `VITE_SUPABASE_SERVICE_ROLE_KEY` in `.env.local` embeds a full RLS-bypassing production credential in the artifact. `vite.config.ts` refuses production builds when that key is present unless `ALLOW_SERVICE_KEY_BUILD=1` (personal, never-published builds only). It also refuses to inline `VITE_INTELLIZEN_LOCAL_ACCESS_KEY` unless `ALLOW_LOCAL_ACCESS_KEY_BUILD=1`; that key is for Adam's local app only. Publishable builds must use the anon key and must not point at the live GenZen OS database unless a non-bundled trust boundary exists. After every build, run `scripts/check-bundle-secrets.sh dist` — **the dist/ scan is the authoritative check** (Tauri compresses embedded assets, so string-scanning the .app/.dmg can false-negative). Never upload an artifact whose dist/ scan fails.

The correct unsigned release flow is:

0. Verify no service-role key will be embedded: build must pass the vite guard, then `scripts/check-bundle-secrets.sh dist` must print ✅.
1. Build the `.app` with signing disabled: `pnpm tauri build --bundles app --no-sign`.
2. Re-sign the finished app bundle ad-hoc so its resources are sealed correctly:
   `codesign --force --deep --sign - src-tauri/target/release/bundle/macos/IntelliZen.app`.
3. Verify the app bundle before packaging:
   `codesign --verify --deep --strict --verbose=4 src-tauri/target/release/bundle/macos/IntelliZen.app`.
4. Package the verified app into the DMG, then run `hdiutil verify` on the DMG.
5. Mount the DMG and verify the app inside it again with `codesign --verify --deep --strict --verbose=4`.
6. `spctl --assess` will reject the app because it is unsigned; that is expected. The failure must be the unsigned/Gatekeeper rejection, **not** `code has no resources but signature indicates they must be present`.
7. GitHub release notes must say: first launch requires right-click `IntelliZen.app` -> `Open` to bypass Gatekeeper.

Never upload a DMG unless the app bundle inside the mounted DMG passes `codesign --verify --deep --strict`.

## Credentials

```
VITE_SUPABASE_URL=https://jicrdrwtwubveyvzyyrh.supabase.co
VITE_SUPABASE_ANON_KEY=<in .env.local>          # app client key
VITE_INTELLIZEN_LOCAL_ACCESS_KEY=<in .env.local># local-only header secret; never publish
SUPABASE_SERVICE_ROLE_KEY=<in .env.local>       # scripts/MCP only — never VITE_-prefixed
VITE_EXA_API_KEY=<in .env.local>
VITE_ANTHROPIC_API_KEY=<in .env.local>
```

The app connects with the **anon key** (since 2026-07-03, audit F-01) and sends `x-intellizen-local-access` from `VITE_INTELLIZEN_LOCAL_ACCESS_KEY`. The live RLS policy `personal_app_local_access` requires `system.intellizen_local_access_ok()` on the 22 app tables the desktop app touches; the anon key alone reads zero rows. `agent.*` and most `system.*` remain service-role-only. Do not reintroduce a `VITE_`-prefixed service-role key — the vite build guard will refuse, by design.

These are also in `.env.local`. The Supabase project is the existing GenZen Brain project — do not create a new project.

Brain-table contract (updated for GenZen OS): the app legitimately **writes additive rows** to `knowledge.documents`/`knowledge.chunks` — vault docs, operating briefs (`document_type = operations`), reflection digests, and investigation artifacts live there by design. Still off-limits: schema changes or bulk destructive operations on Brain tables, and any writes to `cases`, `decisions`, `config`, or `taste_preferences`.

Agent coordination state lives in `workspace.records` (Tasks, Biz Ops, Workflow Registry, Workflow Runs) plus the append-only audit log `workspace.work_events`. Body-section appends must go through the `workspace.append_record_section` RPC — never read-modify-write a record body client-side; concurrent agents will clobber each other's receipts.

Fiona is GenZen's Operations Director, not just a Hermes profile or chat endpoint. She has full operational access to InteliZen workflows and future GenZen workflows, can execute or delegate them per directives, and must leave durable execution/delegation/approval receipts in Supabase.

## Stack

Tauri v2 · React 18 + TypeScript + Vite · Tailwind CSS v4 · hand-rolled UI primitives in `src/components/ui/` (follow the shadcn/ui API but are not CLI-initialized) · Zustand · TanStack Query · Supabase JS v2 · Exa JS SDK (`exa-js`) · `react-force-graph-2d` + `d3-force` for the Insight graph view; custom SVG/DOM canvas for Construct mode · pnpm

Tauri plugins: `opener`, `fs` (scoped to `$HOME/vault/**`), `http` for the local Hermes dashboard bridge. The old shell execution path is not the current workflow runtime.

## Database

The shared GenZen Brain Supabase project has grown far beyond this app's original five migrations: **86+ applied migrations across 9 namespaced schemas** (`agent`, `knowledge`, `workspace`, `intel`, `ingest`, `anchors`, `system`, `comms`, plus `public` bridge views). The IntelliZen tables live mainly in `intel`, `workspace`, and `ingest` (post-Phase-9 namespacing; e.g. `intel_signals` → `intel.signals`).

`supabase/migrations/` in this repo holds only the app-local subset (~30 files) — it can NOT rebuild the full database. The authoritative record is the remote migration table; a synced inventory lives in [supabase/MIGRATIONS.md](supabase/MIGRATIONS.md) (regenerate via the Supabase MCP `list_migrations` tool after applying new migrations).

RLS is enabled on the app schemas. The desktop app uses anon-key access plus the local access header for the 22 app tables; direct service-role access is reserved for scripts, MCP, and maintenance. `workspace.record_revisions`, `workspace.work_events`, and `intel.claims` are append-only from the app side, and public memory bridge views are read-only to anon.

## Investigation + Reports integration

- **Fiona/Hermes execution**: [src/services/agent.ts](src/services/agent.ts) dispatches workflow runs through the local Hermes run queue, then webhook, then durable `comms.fiona_inbox` fallback. [src/lib/shell.ts](src/lib/shell.ts) is now prompt builders for Fiona/Hermes workflow payloads, not a shell runner.
- **Vault I/O**: [src/lib/vault.ts](src/lib/vault.ts) wraps the Tauri fs plugin. Reads/writes under `$HOME/vault/intelligence/investigations/<case-id>/`.
- **Artifact tracking**: workflow outputs and vault files are tracked in Supabase, with investigation artifacts keyed to `case_id` and agent receipts written to `workspace.records` / `workspace.work_events`.

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

- **UI changes are gated by [DESIGN.md](DESIGN.md)** — tokens only, required states, density/anatomy match, and the review gate at the end of that file. No new routes, sidebar items, or default surfaces without Adam's approval: agents propose views, Adam pins.

- Keep Exa access behind `src/lib/exa.ts`. Keep Tauri shell/fs behind `src/lib/shell.ts` and `src/lib/vault.ts`.
- Preserve `raw_payload` on signals so Exa response evolution doesn't force schema churn.
- Build for resilience around partial data, null publish dates, sparse Deep Research output.
- TanStack Query for server state; Zustand only for UI state that doesn't belong in query cache.
- Migrations are additive and reviewable — no destructive edits to live contracts.
- Never commit `.env.local`.

## Out of scope (still not built)

Vercel webhook receivers · Exa Monitor API push delivery · auto-graph generation · multi-user auth · cross-platform targets · vault-sync to the Brain Supabase project (manual export only).
