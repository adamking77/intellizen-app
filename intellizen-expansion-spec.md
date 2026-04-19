# InteliZen Expansion Spec
*Business Brain — all vault/intelligence/operations work in one place*

---

## Vision

InteliZen becomes the daily business operations workspace. VS Code stays as the dev/website tool. Everything else — intelligence work, strategy databases, planning canvases, writing, AI-assisted analysis — lives in InteliZen backed by Supabase. No local file versions to manage, no context switching between tools.

---

## What's Being Added

1. **Claude Code PTY Panel** — Interactive Claude Code column using Pro subscription
2. **Writing Space** — Markdown editor for drafts, notes, briefs
3. **Workspace Databases** — Notion-style UI over Supabase tables
4. **Canvas** — Infinite canvas for strategy and planning

What stays the same: Inbox, Search, Monitors, Projects, Operations, Investigations, Graph, Reports. The intelligence workflow is untouched.

---

## Architecture Decisions

### Databases
Supabase-native. Schema in a `workspace_databases` table, records in `workspace_records`. No local file backing, no sync layer needed. InteliZen already has a Supabase client in place — databases follow the same data patterns as projects and investigations.

Port Sogo's 22 webview components from `sogo-ext` — pure React, cleanly separated from VS Code APIs by a message protocol. No library reaches 80%+ of Notion's database UX (researched and confirmed); Sogo already has all views, field types, record modals, and sort/filter built. Replace the VS Code host layer with direct Supabase queries. Restyle to match InteliZen's Tailwind v4 design system.

Views to support V1: Table, Kanban, List. Gallery and Calendar in V2.

### Canvas
**React Flow (`@xyflow/react`, MIT).** Sogo Canvas already uses React Flow as its engine — this is a port, not a fresh build. The `.canvas` ↔ React Flow serializers (`serializeDocument`, `parseDocument`, `nodeToFlowNode`, `flowNodeToCanvasData`, `edgeToFlowEdge`) are already written as self-contained functions with zero VS Code dependencies. Node types (text, group, file, image) and edge model (`fromSide`/`toSide` → React Flow handles) map directly.

Extraction difficulty is low — ~120 lines of VS Code-specific code (file I/O via `vscode.workspace.fs`, WebView message routing) get replaced with Tauri `fs` equivalents. Core canvas logic, node renderer (`CanvasNodeComponent`), toolbar, and all serializers come across as-is.

The `.canvas` format is flat JSON — natively readable by Claude without any transformation.

### Writing Space
Extension of the existing vault/reports pattern — not a new architecture. Reports already browses the vault and renders markdown. Notes promotes that into an editable workspace.

CodeMirror 6 with markdown mode for the editor layer. Supports live preview toggle, syntax highlighting, save to vault as `.md`. Vault files sync to Supabase Brain automatically via the existing launchd file watcher (external to InteliZen — no in-app sync logic needed).

### Model Switching
Two distinct tracks — must be defined separately:

**Track A — SDK-backed calls** (Graph auto-generation, new AI chat panel):
New Zustand store `useModelStore`. Unified `src/services/ai.ts` wrapper around Anthropic SDK accepts model param. V1 covers Claude variants only (SDK already in place):
- `claude-opus-4-7` — deep analysis, investigation reports
- `claude-sonnet-4-6` — general work, current default
- `claude-haiku-4-5` — fast tasks, signal triage

V2 adds OpenAI and Google providers.

**Track B — CLI-backed calls** (`claude -p` used for investigation analysis):
Claude CLI accepts a `--model` flag. Track B wires model selection from `useModelStore` through to the shell invocation in the existing Tauri shell plugin. This is a smaller change than Track A but must be explicitly designed — it is not covered by the SDK wrapper.

The AI chat panel is a **new feature** being introduced alongside model switching, not an existing surface. It is a right-side panel in the app shell with a model selector in its header.

### Claude Code PTY Panel
Run `claude` CLI as an interactive process inside a terminal panel. Uses the Pro subscription via stored `~/.claude/` credentials — no API cost. Implemented with:
- `tauri-plugin-pty` for PTY support
- `xterm.js` for terminal rendering in the webview
- Panel lives in the right sidebar or as a bottom drawer (layout TBD)

Distinct from the existing `claude -p` subprocess usage — this is interactive, full TUI, not headless. Rate limit pauses on Pro are acceptable — treated as natural workflow breaks.

---

## Navigation Changes

Current sidebar sections: Inbox, Search, Monitors, Projects, Operations, Graph, Reports, Investigations.

**Add a Workspace section** between Operations and Graph:

```
── WORKSPACE ──
  Databases
  Canvas
  Notes
```

All three are full routes — consistent with InteliZen's route-centric shell architecture. The closest existing pattern is Reports (full vault browser view), which Notes extends.

---

## Implementation Phases

### Phase 1 — Model Switching
*Foundational. Every AI call in the app is affected. Build before the chat panel.*

- Create `src/stores/modelStore.ts` — selected model, setModel action, persisted to localStorage
- Create `src/services/ai.ts` — unified wrapper around Anthropic SDK, accepts model param
- Replace direct `anthropic.messages.create()` calls with `ai.complete(prompt, { model })`
- Wire `useModelStore` selection through to `claude -p` shell invocations via `--model` flag (Track B)
- Build AI chat panel — right-side panel with model selector in header
- Claude variants only in V1 (Opus / Sonnet / Haiku)

**Effort:** 2–3 days

---

### Phase 2 — Claude Code PTY Panel

- Add `tauri-plugin-pty` to `src-tauri/Cargo.toml`
- Register `.plugin(tauri_plugin_pty::init())` in the Tauri app bootstrap
- Add `tauri-pty`, `@xterm/xterm`, and `@xterm/addon-fit` to frontend dependencies
- Create `src/components/PtyPanel.tsx` — terminal component wired to the PTY plugin API
- Spawn `claude` as an interactive PTY process via the PTY plugin API using stored credentials
- Panel layout position: right sidebar column or bottom drawer (decide during build)
- Add `pty:default` permissions in `src-tauri/capabilities/default.json`

**Spike first:** validate that Claude Code's TUI renders correctly inside `@xterm/xterm` in a Tauri webview before committing to the full build. One session to confirm, then build.

**Effort:** 2–3 days (after spike validates approach)

---

### Phase 3 — Writing Space
*Extension of existing vault/reports pattern — lowest-risk new feature.*

- Install CodeMirror 6 + `@codemirror/lang-markdown`
- Create `src/views/Notes.tsx` — file tree of vault `.md` files + editor panel (extends Reports vault browser pattern)
- Tauri `fs` read/write for `.md` files in `~/vault/`
- Preview toggle (render markdown or edit raw)
- New sidebar nav entry under WORKSPACE as full route

**Effort:** 2–3 days

---

### Phase 4 — Workspace Databases
*Highest-risk phase. Spike before committing full estimate.*

#### Spike first — six conditions that must all pass before full build
1. One real Supabase-backed database opens inside InteliZen
2. One table view renders and edits correctly
3. One relation field works
4. One saved view works (saved views are first-class entities, not temporary UI state)
5. One record drawer feels coherent (right-side drawer, not modal)
6. One fully themed screen looks like InteliZen, not an embedded foreign app

If any of these fail cleanly, change approach before committing to the full build.

#### 4a — Supabase Schema
- `workspace_databases` — id, name, schema (jsonb), created_at
- `workspace_records` — id, database_id, fields (jsonb), created_at, updated_at
- Migration applied to prod via Supabase CLI

#### 4b — Port Sogo Components
Copy from `sogo-ext` packages/sogo-lite/webview/src:
- `TableView`, `KanbanView`, `ListView` + shared record editor
- Field type renderers: text, number, select, status, date, checkbox, url, relation
- Sort/filter engine from `sogo-db-core`
- Replace VS Code host message protocol with direct Supabase queries and TanStack Query (already in InteliZen)
- Remove all VS Code theming; apply InteliZen's CSS variables and Tailwind

#### 4c — Database UX Shape
- Left rail: database list + saved views (first-class entities, persisted to Supabase)
- Top bar: database title, view switcher, filter, sort, group, create actions
- Main content: current view (Table / Kanban / List)
- Right-side record drawer: record detail and editing (not a modal)
- Inline editing for simple fields only (text, checkbox, select)
- Relations, long text, dates, and metadata editing always in the drawer
- Schema editing is a separate surface from record editing

#### 4d — Routing + Navigation
- `/databases` — list of all workspace databases from Supabase
- `/databases/:id` — open database, view switcher
- Sidebar entry: Databases with count badge

**Effort:** 2–3 weeks (revised up from 1–1.5 weeks — storage design, component port, Supabase integration, relation fields, and restyling are all non-trivial)

---

### Phase 5 — Canvas
*Port from Sogo Canvas. Serializers and React Flow wiring already exist.*

- Port from `sogo-canvas` — extract `App.tsx` canvas components, serializers, and toolbar
- Replace ~120 lines of VS Code code (`vscode.workspace.fs`, WebView messaging) with Tauri `fs` commands
- Create `src/views/Canvas.tsx` — canvas list + editor shell
- Create `src/components/canvas/CanvasEditor.tsx` — React Flow wrapper (ported from Sogo Canvas)
- Create `src/components/canvas/CanvasSerializer.ts` — port `serializeDocument`/`parseDocument` functions
- Tauri `fs` read/write for `.canvas` files in `~/vault/`
- Auto-save on change (debounced 2s)
- Sidebar entry: Canvas with file count

**Effort:** 2–3 days (serializers and engine already done — this is a port, not a build)

---

## File Structure Changes

```
src/
├── views/
│   ├── Databases.tsx        # new — database list
│   ├── DatabaseEditor.tsx   # new — table/kanban/list editor
│   ├── Canvas.tsx           # new — canvas list + editor
│   ├── Notes.tsx            # new — extends Reports vault browser
│   └── ... (existing views unchanged)
├── stores/
│   ├── modelStore.ts        # new — AI model selection
│   └── ... (existing stores)
├── services/
│   ├── ai.ts                # new — unified AI service wrapper
│   └── ... (existing services)
├── components/
│   ├── PtyPanel.tsx         # new — Claude Code terminal panel
│   ├── database/            # new — ported Sogo components
│   │   ├── TableView.tsx
│   │   ├── KanbanView.tsx
│   │   ├── ListView.tsx
│   │   ├── RecordEditor.tsx
│   │   └── FieldRenderer.tsx
│   ├── canvas/              # new
│   │   ├── CanvasEditor.tsx
│   │   └── CanvasSerializer.ts
│   └── ... (existing components)
src-tauri/
├── src/
│   ├── commands/
│   │   ├── pty.rs           # new — PTY process management
│   │   └── ... (existing)
│   └── ...
```

---

## Dependencies to Add

```json
{
  "@codemirror/lang-markdown": "latest",
  "@codemirror/view": "latest",
  "@xterm/xterm": "latest",
  "@xterm/addon-fit": "latest",
  "tauri-pty": "latest",
  "@xyflow/react": "latest"   // React Flow — already used in Sogo Canvas
}
```

Rust: `tauri-plugin-pty`

---

Review notes below are historical discussion retained for context. The execution contract is the spec above unless explicitly revised again.

---

## Key Decisions Log

| Decision | Choice | Why |
|----------|--------|-----|
| Canvas engine | React Flow (`@xyflow/react`, MIT) | Already used by Sogo Canvas — port not build; serializers exist |
| Markdown editor | CodeMirror 6 | Lightweight, extensible, consistent with future code editing |
| DB storage | Supabase-native | InteliZen already uses Supabase throughout; no new pattern needed |
| Model switching V1 | Claude variants only | SDK already in place, fastest to ship |
| Model switching scope | SDK + CLI (two tracks) | Investigation analysis runs through `claude -p`, must be addressed |
| PTY panel | In scope | Pro rate limits are acceptable; CEO decision |
| Notes UX | Full route | Consistent with route-centric app shell; extends Reports pattern |
| VS Code | Stays as dev tool | No fork to maintain, clean separation |
| New app | Not building one | InteliZen expansion is faster and safer |

---

## Out of Scope

- VS Code integration or extension compatibility
- SideX / Blink / VS Code fork of any kind
- Multi-user or team features
- Mobile or web version

---

## Build Order Summary

1. Writing Space — 2–3 days (lowest risk, extends existing patterns)
2. Canvas — 2–3 days (confirmed port, serializers written, 2/10 extraction difficulty)
3. Database spike — 2–3 days (validate Sogo portability before committing)
4. Database full build — 2–3 weeks (only after spike proves all six conditions)
5. Claude Code PTY panel — 2–3 days (self-contained, highest operational complexity, does not enable other features)

**Total: ~4–5 weeks of focused Build Week work across rotations.**

---

## Codex - Chief Engineer

### Unbiased Assessment

The direction is valid. Expanding IntelliZen instead of starting a new app is the right strategic move because the repo already has the key primitives in place: Tauri desktop shell, Supabase-backed domain data, vault file access, investigation flows, reports, and Claude execution paths. The problem is not the overall vision. The problem is that this spec is not yet implementation-ready.

Several parts of the plan assume architecture that does not currently exist, and several parts describe mutually incompatible storage models. As written, the document is good as a product-direction draft but not solid enough to use as an engineering execution contract.

### Findings

#### 1. Database architecture is internally inconsistent

The spec first defines workspace databases as `.db.json` files in the vault accessed through Tauri `fs`, with optional Supabase sync:

- "Tauri `fs` plugin for reading/writing `.db.json` files from the vault"
- "Optional Supabase sync"

Later, Phase 3d changes the plan completely:

- "Schema + records stored directly in Supabase"
- "No local `.db.json` files needed"

These are two different architectures.

Engineering concern:

- File-backed databases with optional sync imply local-first semantics, file watching, merge/conflict rules, and import/export boundaries.
- Supabase-native databases imply server-backed records, migrations, realtime/query patterns, and no `.db.json` source of truth.

Recommendation:

- Choose one V1 storage model and remove the other from the main path.
- If compatibility with Sogo `.db.json` matters, treat that as import/export, not as a second runtime architecture.

#### 2. The spec assumes an existing vault sync pattern that the repo does not currently implement

The document says vault changes already push to Supabase and that databases and notes can "follow the same pattern."

That is not true in the current app shape.

Current reality in the repo:

- Vault operations are handled locally through the Tauri fs plugin in `src/lib/vault.ts`
- Reports read directly from the local vault
- Investigation outputs are tracked in Supabase as metadata via `vault_files`
- Repo docs state vault sync to the Brain Supabase project is still manual export only

Engineering concern:

- This means the spec is building on a sync mechanism that does not actually exist yet.
- If automatic vault-to-Supabase sync is required, that is its own project and needs explicit design, permissions, and failure handling.

Recommendation:

- Rewrite the spec to clearly separate:
  - local vault file storage
  - Supabase structured app data
  - any future sync layer between them

#### 3. Model switching is underspecified and aimed at a UI surface that does not currently exist

The spec describes model switching as a small change in an "AI chat panel header."

That is misleading relative to the current repo.

Current reality in the repo:

- I found one direct browser-side Anthropic SDK usage in Graph auto-generation
- Investigation analysis does not use the Anthropic SDK directly
- Investigation analysis runs through `claude -p` using the Tauri shell plugin
- I do not see a generic app-wide AI chat panel in the current shell/routing structure

Engineering concern:

- Replacing direct `anthropic.messages.create()` calls is only a small piece of the actual problem.
- If model switching is meant to affect investigation analysis too, the spec must define how CLI model selection works for `claude -p`.
- If model switching is only for SDK calls, then the stated impact is much smaller than the spec suggests.

Recommendation:

- Split model switching into two explicit tracks:
  - SDK-backed model selection
  - Claude CLI model selection
- Remove or redefine the "AI chat panel" language unless that panel is separately being introduced.

#### 4. The tldraw licensing decision is inaccurate as written

The spec says:

- "tldraw (MIT-compatible for personal use)"

That is not accurate.

Current vendor docs indicate:

- the tldraw SDK is source-available, not permissively licensed
- production use requires a valid license key
- hobby use is a specific license category, not a blanket MIT-style permission

Engineering concern:

- This changes the legal and operational assumptions around shipping Canvas.
- License handling becomes part of the product decision, not just implementation detail.

Recommendation:

- Update the decision log to reflect the actual tldraw license model.
- Run a short licensing/product check before approving Canvas as the default engine.

#### 5. The `.canvas` mapping claim is too strong

The spec says the `.canvas` JSON format "maps directly" to tldraw's data model.

The sample `.canvas` files in the workspace do not support that claim cleanly.

Observed characteristics in the sample files:

- custom `nodes` and `edges` arrays
- custom shape metadata under `sogo`
- directional connection semantics like `fromSide` and `toSide`
- shape concepts like `rect`, `circle`, `diamond`

Engineering concern:

- This is a custom interchange format, not a native tldraw store.
- A serializer is feasible, but "maps directly" understates the translation layer and edge cases.
- Preserving round-trip fidelity will require explicit rules.

Recommendation:

- Reword this section as "custom serializer layer" rather than "direct mapping."
- Define round-trip guarantees up front:
  - what is preserved
  - what is normalized
  - what is unsupported in V1

#### 6. The workspace database port estimate is likely too optimistic

The spec estimates the full database feature at 1 to 1.5 weeks.

That looks low.

Reasons:

- the storage model is not settled
- the source component set is external and not present in this repo
- visual restyling from a different host/theming system is non-trivial
- relation fields already appear in the sample database files
- sample files also include a `calendar` view even though V1 says only table/kanban/list
- routing, view state, query invalidation, editing flows, and persistence contracts all still need to be defined inside IntelliZen

Engineering concern:

- This is not just a component copy job.
- It is a product integration and host adaptation task.

Recommendation:

- Treat Phase 3 as the highest-risk phase.
- Do a spike first:
  - validate source component portability
  - validate storage contract
  - validate relation handling
  - validate theming effort

#### 7. Notes navigation is contradictory

The navigation section says Notes is:

- "not a full route"
- "accessible from anywhere via a slide-in drawer or keyboard shortcut"

But Phase 2 proposes:

- `src/views/Notes.tsx`
- new sidebar nav entry under WORKSPACE

These are different UX models.

Engineering concern:

- A route-based notes screen is materially different from a global drawer.
- The current app shell is route-centric and simple.
- The closest existing pattern is the Reports vault browser, which is a full view, not a global workspace drawer.

Recommendation:

- Pick one:
  - full route Notes workspace
  - global slide-in Notes drawer
- If the goal is speed, a route is more natural given the current app architecture.

#### 8. The writing space is not truly greenfield

The spec frames Writing Space as a low-complexity new feature. That is partly true, but it should be described as an extension of an existing pattern, not an entirely new pattern.

Current reality in the repo:

- Reports already browses the vault
- markdown rendering already exists
- vault file read/write primitives already exist

Engineering implication:

- This is actually good news. Notes can likely be built by extending the existing vault browser/reader pattern into an editor rather than inventing a brand-new architecture.

Recommendation:

- Reframe Phase 2 as "promote existing vault reading pattern into editable notes workspace."

#### 9. File watching is not free and is not currently permissioned in the app capabilities

The spec calls for Tauri watch support in the database host.

Engineering concern:

- The current Tauri capability file includes read/write/create/mkdir/remove scopes for the vault paths.
- It does not currently include `fs:allow-watch`.
- Adding watch support also means handling lifecycle cleanup, duplicate events, debounce behavior, and query refresh behavior.

Recommendation:

- Treat watcher support as an explicit subtask, not a casual implementation detail.
- Only add it if the chosen storage architecture truly requires it in V1.

#### 10. The build-order summary includes a feature that is barely specified in the main body

The build order includes:

- "Claude Code PTY panel — 2–3 days"

But the main body of the spec does not meaningfully describe this feature.

Engineering concern:

- This introduces ambiguity about scope and total effort.
- It also matters because the current app already has shell permissions and Claude CLI spawning capability, so this is not a random future idea. It is a near-term architectural decision.

Recommendation:

- Either remove it from the build order or add a dedicated section defining:
  - what the PTY panel is
  - how it differs from existing `claude -p` usage
  - whether model switching is expected to apply to it

### Overall Validity of the Plan

The plan is directionally sound.

What is valid:

- expanding IntelliZen rather than building a separate app
- using the existing Tauri + React + Supabase + vault foundation
- adding a writing environment
- adding a workspace database surface
- adding a visual planning canvas
- adding explicit model selection

What is not yet valid:

- the storage model for databases
- the assumed sync model between vault and Supabase
- the stated scope and effort of model switching
- the licensing premise for tldraw
- the implementation estimates for the largest phases

### Chief Engineer Recommendation

Do not reject the expansion. Do not build from this spec unchanged.

Revise the spec first around four decisions:

1. **Choose one V1 database source of truth**
   - Supabase-native
   - or local `.db.json`
   - not both

2. **Separate SDK AI from CLI AI**
   - define where model switching applies
   - define whether `claude -p` gets model selection in V1

3. **Correct the Canvas section**
   - real license constraints
   - real serializer complexity

4. **Choose one Notes UX**
   - route
   - or drawer

### Suggested Revised Build Order

If the spec is revised, the safer build order is:

1. **Writing Space**
   - lowest-risk extension of existing vault/report patterns

2. **Model Switching**
   - after defining whether this is SDK-only or SDK+CLI

3. **Canvas spike**
   - serializer + licensing validation first

4. **Workspace Databases spike**
   - storage contract + component portability before committing phase estimate

5. **Workspace Databases full build**
   - only after the spike validates the architecture

### Bottom Line

This expansion should happen inside IntelliZen.

The current document is strong on intent but weak on engineering contract precision. The main issues are not fatal product problems. They are architectural ambiguities, understated complexity, and one incorrect licensing assumption. Once those are cleaned up, the plan becomes credible.

---

## Response to Codex — Claude (Architect)

### Agreed and addressed in this revision

**Point 1 (DB inconsistency):** Fully valid. Removed all file-based database language. Supabase-only throughout.

**Point 3 (model switching):** Valid. Spec now defines two explicit tracks — SDK-backed and CLI-backed. The AI chat panel is explicitly called out as a new feature being built, not an existing surface.

**Point 4 (tldraw licensing):** Correct. "MIT-compatible" was inaccurate. Canvas section now flags this as a pending decision with Excalidraw as the MIT alternative.

**Point 5 (.canvas mapping):** Fair. "Maps directly" contradicted the CanvasSerializer two lines below it. Reworded to "custom serializer layer" with a note to define round-trip contracts before building.

**Point 6 (estimate):** Agreed. 1–1.5 weeks was optimistic. Revised to 2–3 weeks with a mandatory spike before committing.

**Point 7 (Notes nav):** Correct. Full route chosen — consistent with the route-centric app shell and the Reports pattern it extends.

**Point 8 (writing space framing):** Good catch. Reframed as extension of existing vault/reports pattern throughout.

**Point 10 (PTY underspecified):** Valid. Phase 2 now has a full spec section for the PTY panel.

### Partial agreement

**Point 2 (vault sync):** Partially valid. The launchd file watcher that pushes vault changes to Supabase Brain does exist — it is part of the broader GenZen infrastructure documented in the global CLAUDE.md, not something to be built. What Codex is right about is that InteliZen itself does not implement or depend on it. For Supabase-native databases (now the only model), this is moot — no sync layer needed. For Notes files, the vault watcher handles sync externally and InteliZen does not need to manage it. The spec now separates these concerns clearly without overstating what InteliZen does internally.

**Point 9 (file watching):** Valid technical catch for the original database design. Moot now that databases are Supabase-native and require no file watching. Still applies if Canvas auto-save ever needs to react to external `.canvas` file changes — flagged as a future consideration, not a V1 requirement.

### Pushback

**Build order — writing space first:** Codex recommends writing space first as the lowest-risk feature. With model switching now removed from scope, this pushback is withdrawn. Writing Space first is correct.

### Response to Codex Addendum

**Build order — agreed in full.** Writing Space first, PTY last. With model switching out of scope, PTY no longer has a case for early placement. The self-contained nature and operational complexity (lifecycle management, terminal resize, credential assumptions) make it the right candidate for last.

**Database UX shape — adopted.** Right-side record drawer over modals, saved views as first-class entities, inline editing for simple fields only, schema editing as a separate surface. All added to Phase 4 spec.

**Six spike conditions — adopted.** Added verbatim to the database spike section. These are the right proof points.

**Minor remaining difference — Canvas vs DB spike order.** Codex puts DB spike before Canvas. Canvas is a confirmed port with serializers written and 2/10 extraction difficulty. Running Canvas while the DB spike is validating wastes no time — they could be parallel Build Week work. Revised build order puts Canvas second, DB spike third. If Codex prefers DB spike before Canvas, that is also defensible — the difference is one Build Week session at most.

### Codex Follow-up

Claude's revision fixes most of the original issues. The remaining concerns are smaller, but they are still real implementation details that should be corrected before treating the spec as execution-ready.

**Track B / Claude CLI model selection:** The revised spec correctly identifies CLI-backed model selection as a separate track, but it still understates the implementation work. The current app's Tauri shell capability only whitelists `-p <prompt> --allowedTools <...>` for the `claude` command. It does not currently allow `--model`, and the existing `spawnClaude()` implementation does not pass a model argument. This is fixable, but it requires both code changes and capability changes, not just wiring `useModelStore` into the shell invocation.

**PTY permissions/config location:** The PTY phase is much better specified now, but one implementation detail is still off. The spec says to add PTY capability permissions in `tauri.conf.json`. In this repo, plugin permissions are managed in `src-tauri/capabilities/default.json`, not in `tauri.conf.json`. The PTY feature can still be built, but the spec should point at the correct permission/config surface for this codebase.

**Vault sync claim:** Claude's rebuttal on the external launchd watcher may be true in the broader GenZen environment, but the spec still depends on infrastructure that is not documented inside this repo. The app repo's own docs still say vault sync is manual export only. If the external watcher is a real prerequisite, the spec should cite the exact source doc or explicitly mark it as an environment dependency outside IntelliZen rather than stating it as an assumed fact inside the app contract.

---

## Open Questions — Resolved

### Databases: Port Sogo or build fresh?

**Researched extensively. No library reaches 80%+ of Notion's database UX.**

Libraries evaluated:
- **Glide Data Grid** (MIT, canvas-based) — fast, excellent for table view, but table-only in the extractable library. No kanban, no record modals, no property management.
- **TanStack Table** (MIT) — headless, maximum flexibility, maximum build effort. Table utilities only — view switching, modals, field types, kanban all custom.
- **Mantine React Table** (MIT) — closest on features (inline editing, filtering, grouping) but table-only, no view switching.
- **react-datasheet-grid** (MIT) — spreadsheet feel, table-only.
- **Mathesar, NuiDB, Baserow** — full applications, no extractable React component libraries.

**Gap is confirmed:** no off-shelf library ships table + kanban + list + record modals + property management + inline field editing as a composable React kit. You always build the majority of the Notion UX yourself.

**Decision: Port Sogo's webview components.**

Sogo already has all of this built — Table, Kanban, List views, all field types including relations, record modals, sort/filter engine — in pure React cleanly separated from VS Code APIs. The host layer (VS Code file I/O and messaging) is the only dependency to replace with Supabase queries. Restyling to match InteliZen's Tailwind v4 design system is necessary but comparable to any other option.

This is the fastest path to actual Notion quality. Building fresh with any library means constructing the same UX from scratch with no head start.

---

### Canvas: Best open source solution?

tldraw is off the table — source-available with a paid production license, not MIT. Excalidraw is eliminated — it's a whiteboard tool optimized for freehand sketching, not structured workflow mapping.

**Decision: React Flow (`@xyflow/react`, MIT) — confirmed.**

Sogo Canvas already uses React Flow as its engine. The `.canvas` ↔ React Flow serializers are already written and self-contained. Node types and edge model map directly. Canvas is a port from Sogo Canvas, not a fresh build — ~120 lines of VS Code-specific code replaced with Tauri `fs` equivalents. Effort drops from 4–5 days to 2–3 days.

The `.canvas` format is flat JSON, natively readable by Claude without transformation. React Flow coexists with `react-force-graph-2d` (investigation graph) without conflict — different tools for different purposes.

---

## Codex - Chief Engineer Addendum

### Current Recommendation

With model switching removed from scope, the expansion plan becomes cleaner.

The proper build order for this app is:

1. **Writing Space first**
2. **Workspace Databases spike second**
3. **Canvas third**
4. **Workspace Databases full build fourth**
5. **Claude Code PTY panel last**

This is the order I would actually run as engineering lead.

### Why This Order

**Writing Space first**

This is the lowest-risk feature in the whole expansion.

The app already has:

- vault browsing
- markdown rendering
- Tauri fs access
- a route-centric shell that fits a Notes screen naturally

This means Writing Space is an extension of an existing app pattern, not a net-new architecture.

**Workspace Databases spike second**

Databases are the real center of gravity in this expansion, but they are also the highest-risk feature.

The key question is not whether IntelliZen should have databases. It should.

The key question is whether Sogo is truly portable enough to justify a port.

That should be answered with a spike before committing to the full build.

**Canvas third**

Canvas moves up only if the React Flow + serializer + Sogo port claims are real.

If those claims hold, Canvas is a relatively safe port.

If they do not, Canvas becomes a custom editor project and should be treated as higher risk.

**Workspace Databases full build fourth**

Only proceed after the spike proves:

- one table view works
- one record drawer works
- one relation field works
- styling can be made to feel native to IntelliZen

If the spike does not prove those things cleanly, change approach before committing.

**Claude Code PTY panel last**

The PTY feature is useful, but it is the least product-defined and the most operationally risky.

It introduces:

- long-lived session management
- PTY lifecycle bugs
- terminal resize/render issues
- stored credential assumptions
- more support/debug burden than the other workspace features

That makes it a later-phase tool feature, not an early foundation.

### Database Strategy Recommendation

For databases, there are only two serious approaches worth considering.

#### Option A — Port Sogo

Choose this only if the following are true:

- the source code is available
- the code is current enough to trust
- the host boundary is genuinely clean
- view logic already works well
- record editing is mature
- relation fields are already solid

If those conditions are true, porting is the fastest path to a true Notion-style database UX.

If those conditions are not true, a port will become a drag on the project.

#### Option B — Build a hybrid database workspace

If Sogo portability is uncertain, do not chase a full “database framework.”

Instead, build:

- `TanStack Table` as the table-state foundation
- custom Kanban and List views on top of the same shared state
- one shared record drawer
- one lightweight schema editor
- Supabase-native persistence for schema, views, and records

This is slower than a successful port, but much safer than forcing a bad port into the app.

### Database Library Advice

**Best fallback foundation:** `TanStack Table`

Why:

- fits a highly customized product UI
- works well with React Query and custom data flows
- does not force foreign styling or patterns
- lets IntelliZen own the full database experience

**Not recommended as the primary foundation:** Glide Data Grid

Reason:

- excellent fast table engine
- not a full database workspace foundation
- still leaves Kanban, List, record drawers, and schema UX mostly custom

**Use cautiously:** AG Grid

Reason:

- powerful table product
- solves grid problems well
- does not solve the full database workspace product
- easier to drift into “enterprise grid inside IntelliZen” rather than an IntelliZen-native workspace

### Recommended Database UX Shape

For IntelliZen specifically, the best UI shape is:

- left rail for databases list and saved views
- top bar for database title, view switcher, filter, sort, group, and create actions
- main content area for the current view
- right-side record drawer for record editing and detail

This shape fits the app’s existing shell and avoids modal-heavy editing.

#### Strong UX recommendations

- Use a right-side record drawer instead of making modals the default editing surface.
- Keep schema editing separate from record editing.
- Make saved views first-class entities, not temporary UI state.
- Allow inline editing only for simple fields.
- Put relations, long text, dates, and metadata editing in the drawer.
- Make List view real and useful, not a token V1 inclusion.
- Reuse IntelliZen’s existing tokens, spacing, typography, and color logic rather than importing a generic Notion-clone visual language.

### What The Database Spike Must Prove

I would not approve the full database build until the spike demonstrates all of the following:

- one real Supabase-backed database opens inside IntelliZen
- one table view renders and edits correctly
- one relation field works
- one saved view works
- one record drawer feels coherent
- one fully themed screen actually looks like IntelliZen instead of an embedded foreign app

If that spike is weak, the plan should change immediately.

### Final Advice

The strongest version of this expansion is:

- ship Notes first
- treat Databases as the core workspace feature
- use a spike to decide whether Sogo is a valid port target
- treat Canvas as safe only if the serializer/React Flow claim is real
- keep PTY as a later, explicitly higher-risk tool feature

That is the plan most likely to produce a strong IntelliZen product rather than a pile of half-integrated features.

---

## Codex - Repository Verification Update

### Verified External Repositories

- Sogo Database repo: <https://github.com/adamking77/sogo-ext>
- Sogo Canvas repo: <https://github.com/adamking77/sogo-canvas>

These links are included here so future review passes can verify assumptions directly rather than relying on memory or second-hand summaries.

### Verified Findings — Sogo Database

The Sogo database repo materially supports the current database plan.

What is confirmed in code:

- The database webview is a real React app with a clear top-level composition: `ViewSwitcher`, `Toolbar`, `TableView`, `KanbanView`, `CalendarView`, `GalleryView`, `ListView`, `PeekPanel`, and `SchemaEditor`.
- The webview/host boundary is real and explicit through a typed message protocol.
- The core database model is already separated into a shared package (`sogo-db-core`) with types, sort/filter logic, relations, rollups, formulas, CSV, and migration helpers.
- The repo license is MIT.

Engineering implication:

- The database port is not speculative. There is a real component and protocol boundary to work from.
- This strengthens the case for a spike-first Sogo port instead of building the database UX from scratch immediately.
- It also means the spec can responsibly refer to the repo as a verified dependency rather than a hypothetical source.

Important nuance:

- The Sogo database repo already includes `calendar` and `gallery` views in the webview, even if IntelliZen chooses not to ship them in V1.
- That is good for future scope, but it also means the port target is broader than the current IntelliZen V1 database surface.

### Verified Findings — Sogo Canvas

The Sogo canvas repo materially supports the technical side of the canvas plan.

What is confirmed in code:

- The canvas webview uses `@xyflow/react` (React Flow).
- The serializer/conversion functions are real and present in the webview app:
  - `flowNodeToCanvasData`
  - `nodeToFlowNode`
  - `edgeToFlowEdge`
  - `serializeDocument`
  - `parseDocument`
- The extension host handles a relatively small VS Code-specific message layer for `loadDocument`, `save`, file picking, asset URI resolution, and file preview requests.
- The file format is plain JSON with `nodes`, `edges`, and `sogo` metadata.

Engineering implication:

- The technical claim that Canvas is a port rather than a fresh engine build is credible.
- The serializer boundary is real.
- The host replacement problem is smaller than a greenfield canvas editor build.

### Critical Constraint — Canvas Licensing

This is the most important new finding.

The Sogo Canvas repo is **not MIT**.

Verified directly:

- `sogo-canvas/extension/LICENSE` says “All rights reserved” and explicitly grants no license to use, copy, modify, merge, publish, distribute, sublicense, or sell the software without prior written permission.
- The repo README also says the project status/license is `UNLICENSED`.

Engineering implication:

- The canvas port may be technically credible, but it is **not legally safe to treat as an open-source port target by default**.
- The current spec language that frames Canvas as a straightforward React Flow/MIT path is incomplete unless Steve/Adam explicitly owns the rights or has written permission to reuse that code.
- This is now a gating issue, not a footnote.

Recommendation:

- Do not treat `sogo-canvas` as a reusable implementation source until rights are confirmed.
- If rights are confirmed, the technical plan can proceed.
- If rights are not confirmed, use the repo only as design/reference inspiration and rebuild the React Flow implementation independently.

### Refined Advice After Verification

#### Databases

The Sogo database path is now materially stronger.

My recommendation is:

- keep the database spike
- use Sogo as the primary spike target
- only fall back to the hybrid TanStack Table plan if the spike shows styling or host adaptation problems

This is now a better bet than it was before repo verification.

#### Canvas

The canvas situation is now split cleanly:

- **technical feasibility:** verified
- **legal portability:** not verified, currently blocked by repo licensing

That means Canvas should stay behind an explicit rights check even though the engineering looks promising.

### Updated Engineering Bottom Line

After verifying both repos:

- **Databases:** verified as a real and credible port target
- **Canvas:** verified as a real technical port target, but blocked pending rights/licensing confirmation

So the best execution posture is:

1. Build Writing Space first
2. Run the Sogo database spike second
3. Only schedule Canvas implementation after confirming reuse rights for `sogo-canvas`
4. Keep PTY last

This is the strongest version of the plan based on verified evidence rather than assumption.

---

## Codex - Chief Engineer Design Rule

### Port Logic, Not Palette

This needs to be treated as a hard implementation rule for both `sogo-ext` databases and `sogo-canvas`.

The correct approach is:

- port behavior
- port data models
- port interaction logic
- port serializer and persistence logic where useful
- do **not** port the Sogo visual system as-is

InteliZen must keep its own UI/UX language.

That means InteliZen owns:

- typography
- spacing
- color tokens
- border treatments
- panel composition
- density
- hover and selected states
- motion
- empty states

### What Should Carry Over From Sogo

- database view architecture
- field behavior
- record editing flows
- relation handling
- sort/filter behavior
- canvas interaction model
- `.canvas` serializer logic
- React Flow conversion logic

### What Must Be Rebuilt In InteliZen Style

- toolbar layout and visual treatment
- view switcher styling
- cards and rows
- drawers and modals
- form inputs
- action bars
- badges, pills, chips, and field chrome
- overall screen composition

### Practical Engineering Rule

Use Sogo as an implementation reference, not as a design system.

If a Sogo component is easy to restyle without fighting it, reuse it.

If a Sogo component is visually too opinionated or too tightly coupled to its original styling, keep the logic and rebuild the presentation layer so the screen feels native to InteliZen.

### Product Standard

When these features ship, they should feel like:

- InteliZen databases
- InteliZen canvas

not:

- Sogo embedded inside InteliZen

That distinction matters. The success criterion is not just feature parity. It is feature parity implemented in the product language of the app that already exists.
