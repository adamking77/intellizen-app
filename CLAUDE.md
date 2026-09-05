# InteliZen — Build Context

macOS-only Tauri v2 desktop intelligence platform for GenZen. This file is
the current v3 build contract; older product specs are historical context.

## Current v3 contract

The sidebar is the shared hierarchy tree: department → workspace → project →
session. Its Places group contains Home, Databases, Docs, Graph, Canvas,
Workflows, Agents, and Settings. Those are the only permanent app places.

The center follows the selected material:

| Selection | Center surface |
|---|---|
| Department | Unit page with its workspaces and projects |
| Workspace | Unit page with Projects and an always-available Dashboard |
| Project | Project room with Brief, Table, Board, Graph, Timeline, and Session views as applicable |
| Session | The owning project room's transcript |
| Document | Docs page |
| Database | Database editor |
| Workflow | Workflows page |

`/agent-panel` is the standalone Tauri panel surface. Retired standalone pages
redirect to their surviving place. Compatibility routes may remain mounted
while their approved migration stage is pending, but they are not Places.
`ROADMAP.md` is the product contract; `docs/stages/round-2.md` and
`docs/stages/design-system-v3.md` extend it.

## Execution doors

- Hermes sessions, profiles, tools, approvals, memory, skills, and config use
  the pinned JSON-RPC gateway in `src/engine/`.
- Cron, kanban, and plugin routes use Hermes REST; kanban events use its
  WebSocket.
- Installed CLI agents use ACP over stdio. Saved model, identity, permission,
  context, and the IntelliZen MCP server are passed when a session starts.
- Hermes-only rooms use the pinned gateway's durable `groups.*` log. The
  vendored round engine remains only for rooms that include ACP because the
  pinned Hermes roster contract has no ACP target kind.
- Agents mutate workspace state only through `mcp-server/`, with explicit
  confirmation for writes and `workspace.work_events` receipts.
- Never edit Hermes profile/session files directly or scrape a dashboard token.

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
4. Package with an explicit ad-hoc identity so Tauri does not recreate an
   unsealed app inside the DMG:
   `pnpm tauri bundle --bundles app dmg --config '{"bundle":{"macOS":{"signingIdentity":"-"}}}' --ci`.
   Then run `hdiutil verify` on the DMG.
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
VITE_OPENSANCTIONS_API_KEY=<in .env.local>  # optional; sensors fall back to keyless endpoint
VITE_COMPANIES_HOUSE_API_KEY=<in .env.local># optional; Corporate sensor skips CH without it
```

The app connects with the **anon key** (since 2026-07-03, audit F-01) and sends `x-intellizen-local-access` from `VITE_INTELLIZEN_LOCAL_ACCESS_KEY`. The live RLS policy `personal_app_local_access` requires `system.intellizen_local_access_ok()` on the 22 app tables the desktop app touches; the anon key alone reads zero rows. `agent.*` and most `system.*` remain service-role-only. Do not reintroduce a `VITE_`-prefixed service-role key — the vite build guard will refuse, by design.

These are also in `.env.local`. The Supabase project is the existing GenZen Brain project — do not create a new project.

Brain-table contract (updated for GenZen OS): the app legitimately **writes additive rows** to `knowledge.documents`/`knowledge.chunks` — vault docs, operating briefs (`document_type = operations`), reflection digests, and investigation artifacts live there by design. Still off-limits: schema changes or bulk destructive operations on Brain tables, and any writes to `cases`, `decisions`, `config`, or `taste_preferences`.

Agent coordination state lives in `workspace.records` (Tasks, Biz Ops, Workflow Registry, Workflow Runs) plus the append-only audit log `workspace.work_events`. Body-section appends must go through the `workspace.append_record_section` RPC — never read-modify-write a record body client-side; concurrent agents will clobber each other's receipts.

Fiona is GenZen's Operations Director, not just a Hermes profile or chat endpoint. She has full operational access to InteliZen workflows and future GenZen workflows, can execute or delegate them per directives, and must leave durable execution/delegation/approval receipts in Supabase.

## Stack

Tauri v2 · React 18 + TypeScript + Vite · Tailwind CSS v4 · hand-rolled UI primitives in `src/components/ui/` (follow the shadcn/ui API but are not CLI-initialized) · Zustand · TanStack Query · Supabase JS v2 · Exa via Rust-side `run_exa_search` Tauri command · `react-force-graph-2d` + `d3-force` for the Insight graph view; custom SVG/DOM canvas for Construct mode · pnpm

Tauri plugins: `opener`, `fs` (scoped to `$HOME/vault/**`), `http` for the local Hermes dashboard bridge. The old shell execution path is not the current workflow runtime.

## Database

The shared GenZen Brain Supabase project has grown far beyond this app's original five migrations: **86+ applied migrations across 9 namespaced schemas** (`agent`, `knowledge`, `workspace`, `intel`, `ingest`, `anchors`, `system`, `comms`, plus `public` bridge views). The IntelliZen tables live mainly in `intel`, `workspace`, and `ingest` (post-Phase-9 namespacing; e.g. `intel_signals` → `intel.signals`).

`supabase/migrations/` in this repo holds only the app-local subset (~30 files) — it can NOT rebuild the full database. The authoritative record is the remote migration table; a synced inventory lives in [supabase/MIGRATIONS.md](supabase/MIGRATIONS.md) (regenerate via the Supabase MCP `list_migrations` tool after applying new migrations).

RLS is enabled on the app schemas. The desktop app uses anon-key access plus the local access header for the 22 app tables; direct service-role access is reserved for scripts, MCP, and maintenance. `workspace.record_revisions`, `workspace.work_events`, and `intel.claims` are append-only from the app side, and public memory bridge views are read-only to anon.

## Project rooms and Docs

- Project rooms combine linked workspace records, project files, Hermes
  sessions, board state, graph data, and timeline events behind one view
  switcher. Cards and sessions open in the shared drawer.
- `src/lib/vault.ts` is the Tauri filesystem boundary for allowed vault files.
- Workflow outputs and file actions leave durable workspace receipts.
- Docs is backed by the workspace Documents database and vault markdown bodies;
  `knowledge.documents` remains the embedded corpus, not the editing surface.

## Graph implementation

Uses **`react-force-graph-2d`** (not React Flow). Two modes inside `src/views/Graph.tsx`:

- **Insight mode** — force-directed Obsidian-style canvas ([src/components/graph/obsidian-graph.tsx](src/components/graph/obsidian-graph.tsx)).
- **Construct mode** — custom SVG/DOM canvas with drag, pan, zoom, connector handles, edge drag, multi-select, undo/redo, shortest-path, ego network, minimap.

Graphs can be project-linked or standalone (`project_id = null`).

Workflow topology is a separate surface and intentionally uses `@xyflow/react`
for definition design, dry-run, and live-run views. The “not React Flow”
statement above applies only to the Insight/Construct Graph surface.

## Exa Integration Reference

Exa is called from the Rust side, not JS. The `exa-js` dependency was removed: [src/lib/exa.ts](src/lib/exa.ts) exposes `runExaSearch(input)`, which calls `invoke("run_exa_search", { input })`. The Tauri command owns the API key (no `VITE_EXA_API_KEY` in the frontend bundle) and makes the HTTP calls to Exa, returning `SearchResultItem[]` or a `DeepResearchResult`.

### Client setup ([src/lib/exa.ts](src/lib/exa.ts))

```typescript
import { invoke } from "@tauri-apps/api/core"

// input: { mode: SearchMode; query: string; startDate?: string | null }
export async function runExaSearch(input) {
  return invoke("run_exa_search", { input })
}
```

### Search mode implementations

The parameter blocks below document the payload the Rust `run_exa_search` command sends to Exa per mode — they are no longer JS SDK calls, but the fields still describe what each mode requests.

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

**Deep Research** (async — `POST /research/v1`, handled by the Rust command's `deep_research` mode):
```jsonc
// payload sent by run_exa_search mode "deep_research"
{ "instructions": query, "model": "exa-research" }
// Rust then polls GET /research/v1/:id until status === "completed"
```

Deep Research returns a markdown string, not a results array.

### Exa category rules

The **Tauri SDK** uses `category: 'news'` for News and `category: 'personal site'` for People. The MCP server uses `category: 'people'`. Do not copy MCP categories into the app.

### Inbox Refresh logic

`listMonitors()` → for each `active` monitor, call Exa, upsert results into `intel_signals` with `onConflict: "url", ignoreDuplicates: true`, update `last_run` and `signal_count`. The unique index on `url` does the dedup.

## MCP server

Source: `mcp-server/src/index.ts`. Build: `cd mcp-server && pnpm build`. The `dist/` directory is gitignored — always build after pulling. The server exposes tools for projects, signals, vault files, graph nodes/edges, shared hierarchy, workspace database views (`list_database_views`, `create_database_view`, `update_database_view` — incl. chart views), and Home dashboard pins (`pin_view_to_home`, `pin_plugin_widget`, `unpin_view_from_home`). The twelve legacy monitor/investigation tools were retired when the shared tree became the navigation door. Home pins live in the hidden "Home Pins" workspace database (`icon: intel-system:home-pins`); a persistent app-shell observer polls remote pins every 15s across routes, refreshes on window focus, and treats remote state as authoritative, so agent-created views/pins appear without an app rebuild. `pin_view_to_home` accepts either a database `view_id` or a Settings Activity `instrument_id` such as `attention.waiting`. Pin tools accept integer `x`/`y` coordinates for the same 12-column bento grid used by the frontend and automatically choose the first open slot when coordinates are omitted. View/pin writes follow the `confirm_write` preview pattern, lead every preview with `DRY RUN — NOTHING WRITTEN`, and emit `workspace.work_events` receipts only on confirmed writes.

**Single-build rule (fleet audit #9, consolidated 2026-07-09):** every consumer runs the repo build at `mcp-server/dist/index.js` — Claude via `~/.claude.json`, Fiona via `~/.hermes/profiles/fiona/mcp-servers/intellizen/run.sh` (env wrapper only, no vendored copy), Codex via `~/.codex/config.toml`. Never vendor another compiled copy; after `pnpm build`, all three pick up the new build on their next MCP (re)start. (The old `list_project_signals` raw_payload bloat was fixed in this build — signal read tools all return slim fields.)

## Key engineering rules

- **UI changes are gated by [DESIGN.md](DESIGN.md)** — tokens only, required states, density/anatomy match, and the review gate at the end of that file. No new routes, sidebar items, or default surfaces without Adam's approval: agents propose views, Adam pins.

- Intel schema names are not UI labels: `anchors.operations`, `anchors.projects`, `intel.*`, MCP tool names, and TypeScript `Operation`/`Project` names remain stable. The UI presents operations as work items and projects as evidence piles. New work items use one of four types (`client_case`, `venture_research`, `publication_research`, `relationship_research`); only client cases expose a case stage, and legacy operations may remain unclassified.
- Workspace databases own the business vocabulary. Business "Operations" and "Projects" belong in workspace databases, not as renames of the intel schema bridge.
- Keep Exa access behind `src/lib/exa.ts` and vault filesystem access behind `src/lib/vault.ts`.
- Preserve `raw_payload` on signals so Exa response evolution doesn't force schema churn.
- Build for resilience around partial data, null publish dates, sparse Deep Research output.
- TanStack Query for server state; Zustand only for UI state that doesn't belong in query cache.
- Migrations are additive and reviewable — no destructive edits to live contracts.
- Never commit `.env.local`.

## Out of scope (still not built)

Vercel webhook receivers · Exa Monitor API push delivery · unattended background graph generation · multi-user auth · cross-platform targets.

Vault content sync is active through `~/vault/session/scripts/vault-watch.mjs`: eligible text documents reconcile with `knowledge.documents` and derived chunks in both directions. It preserves conflicts and does not propagate deletions. Docs folder creation writes to the local vault; workspace records, relations, binaries and published artifacts retain separate storage contracts. Repair evidence: `~/knowledge-inventory-2026-09-05/repair/REPAIR-REPORT.md`.
