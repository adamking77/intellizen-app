# IntelliZen Refinement PRD — GenZen OS Daily Driver

**Date:** 2026-07-07
**Status:** Approved for build (two default-pending decisions below)
**Source:** Grill-me planning session (Adam + Claude), building on `intellizen-business-audit-2026-07-06.md`, `audit-findings-2026-07-07.md`, `osint-workflow-analysis.md` (canonical OSINT spec), and the sogo-app shell refinement as the UI model.
**Goal:** IntelliZen becomes the daily desktop UI layer for GenZen OS — appealing enough to live in all day, structured so agents operate it and Adam decides.

---

## 0. Decision log (locked in the planning session)

| # | Decision | Status |
|---|---|---|
| D1 | Investigations page retired from sidebar. Investigation is a workflow, not a destination. `/investigate` survives as a deep link (same treatment as Inbox/Monitors). | **Locked** |
| D2 | Fold direction: Investigations fold **into** Operations (a GZS case = an operation with an investigation attached), not the reverse. Operations infrastructure stays generic for all entities. | **Locked** |
| D3 | Naming: sidebar section "Operations" → **"Intel"**; intel projects display-renamed → **"Collections"**. UI strings only — **no table, migration, or MCP tool renames.** "Operations/Projects" vocabulary is freed for business use in workspace databases. | **Locked** |
| D4 | Reports section → **Docs**: unified document surface (reports, briefs, contracts, invoices, one-pagers) with stage lifecycle. | **Locked** |
| D5 | Sidebar spine: **Home · Search · Intel · Databases · Docs · Graph · Canvas**. Graph/Canvas stay (cross-business mapping utilities). Agent Work / Workflows / Roles / Inbox / Monitors remain routable deep links, not sidebar items. | **Locked** |
| D6 | UI/UX adopts the sogo-app segmented style: responsive shell, sidebar ejects to icon pill, agent panel ejects to a floating window. All within DESIGN.md tokens. | **Locked** |
| D7 | Docs data spine = **workspace Documents database** (records carry stage/entity/links; bodies are vault markdown edited in-app via the vault lib). `knowledge.documents` remains the embedded corpus — never an editing surface. | **Default — cancel by 2026-07-10** |
| D8 | OSINT Search split: pure-HTTP-API sensors become in-app Search modes; Python/long-running sensors (Maigret, edgartools, geolocation) are agent-executed workflows, never Search features. Ship Sanctions + Corporate sensors now; the rest on first live-case or report demand. | **Default — cancel by 2026-07-10** |

**Standing constraints (do not violate):**

- UI changes gated by `DESIGN.md` — tokens only, required states, review gate at the end of that file.
- Migrations are additive. No destructive edits to live contracts. No schema renames.
- Anything that reaches an external human (contract/invoice sends, publishes) is human-gated — Playbook R11. The app surfaces approval; it never automates the send.
- Agent receipts go to `workspace.work_events` via MCP/RPC, never pasted into record bodies.
- Build-ahead-of-use is this codebase's named failure mode. Every workstream below ships only what the daily loop or a dated commitment needs; "on demand" gates are real gates.
- Never commit `.env.local`. Any new API key must be assessed against the DMG publish credential gate (audit F-01) before any release build.

---

## 1. WS1 — Navigation & naming

**Files:** `src/components/layout/sidebar.tsx`, `src/App.tsx`, `src/views/Projects.tsx`, `src/views/Reports.tsx`, string occurrences in views/components.

1. Sidebar `NAV_ITEMS` becomes: Home, Search, **Intel** (`/intel`), Databases, **Docs** (`/docs`), Graph, Canvas.
2. Route changes with redirects (no dead links):
   - `/projects` → `/intel` (redirect old path).
   - `/reports` → `/docs` (redirect old path).
   - `/investigate` removed from sidebar; route stays mounted for deep links from Intel case workspaces and existing URLs.
3. Display strings: "Operations" → "Intel" where it names the section; intel "Project(s)" → "Collection(s)" in Intel views, Search save-to-project affordances, Graph project scoping labels, and anywhere else user-facing. **Do not touch:** `anchors.operations`, `anchors.projects`, `intel.*` schema names, MCP tool names (`list_operations`, `create_project`, …), or TypeScript type names (`Operation`, `Project`) — types may be renamed later with the bridge removal, not now.
4. Icon: Intel gets a distinct icon (e.g. `Radar` or `Crosshair` from lucide); Docs keeps `FileText`.
5. Add two lines to `AGENTS.md`: intel schema names ≠ UI labels; workspace databases own the business vocabulary ("Operations", "Projects" in business sense live there).
6. **Entity options become DB-driven:** replace the hardcoded `TAXONOMY_ENTITY_OPTIONS` in `src/lib/taxonomy.ts` with a query against `workspace.entities` (TanStack Query, long staleTime; keep the constant as offline fallback). Adding a new GenZen entity must require only a DB insert — no code change. All entity selects (sidebar filter, record editors, Docs, Intel) read the same source.

**Acceptance:** old URLs redirect; no user-visible "Operations/Projects" strings remain in the Intel section; MCP tools and schema untouched (verify with grep + `pnpm build`); inserting a test row into `workspace.entities` makes the new entity appear in every entity select with zero code changes.

---

## 2. WS2 — Intel section: fold investigations in

**Files:** `src/views/Projects.tsx` (becomes Intel view), `src/views/Investigation.tsx`, `src/lib/data.ts`.

1. **Case affordance on operations.** An operation with a linked investigation (investigations already carry `operation_id`/`operation_record_id`) renders an "Open case workspace" action that routes to the existing 3-phase Brief → Collect → Analyse view for that investigation.
2. **Investigation creation moves into Intel.** "New investigation" is created *from* an operation (inherits entity + operation link). The standalone create path in the Investigate view is removed; the view becomes a pure case workspace reached via Intel or deep link.
3. Optional taxonomy value `case` on operations for filtering; not required — "has linked investigation" is the functional definition of a case.
4. Entity filter scoped to `genzen_solutions` + Intel = the case list. No separate case list surface is built.
5. No changes to signals, monitors, collection flows beyond the display renames in WS1.

**Acceptance:** create an operation → create investigation from it → open case workspace → complete a phase → artifacts land keyed to `case_id` exactly as today. Zero regression in the existing investigation flow.

---

## 3. WS3 — Docs (Reports → unified document surface)

**Files:** `src/views/Reports.tsx` (becomes Docs view), `src/lib/data.ts`, `src/lib/vault.ts`, one additive migration, seed data.

**Spine (D7):** a `Documents` workspace database. Fields:

| Field | Type | Notes |
|---|---|---|
| title | text | |
| doc_type | select | report · brief · contract · invoice · one-pager · note |
| stage | select | Draft → Copy-audit → Approved → Published/Sent |
| entity | entity slug | existing entity dimension |
| vault_path | text | body location under `$HOME/vault/**` |
| linked case / engagement | relation | to Intel case records / Engagements records |
| dates | created/updated + stage-changed | |

1. **Docs view:** table + kanban-by-stage (existing `DatabaseKanbanView` machinery), entity-scoped, opening a doc loads the vault markdown body in an in-app editor (vault lib already read/writes `$HOME/vault/**`). Existing Reports functionality (investigation artifact reading) is preserved as doc_type=report entries; migrate the current view's data access rather than rebuilding it.
2. **Stage transitions:** Draft → Copy-audit → Approved are operable in-app by Adam and (once WS5 write tools land) by agents. **Approved → Published/Sent is human-only in the UI** and does nothing external — it records that Adam sent/published through the appropriate external channel (R11).
3. **Contract/invoice generation is agent work, not app code:** an agent workflow instantiates a template into a vault file + Documents record at stage Draft. The app's job is view/edit/stage only. No template engine is built into the app.
4. **Money stays in Finance database rows** (seeded per business audit B.2 — not an engineering task); an invoice doc links to its Finance record, never replaces it.
5. `knowledge.documents` is untouched.

**Acceptance:** a report, a contract draft, and an invoice draft each visible in Docs, editable in-app, moved through stages, with the stage change reflected in the record and the body persisted to vault. `knowledge.documents` row count unchanged by any Docs operation.

---

## 4. WS4 — Search: OSINT sensor modes + Admiralty capture

**Files:** `src/views/Search.tsx`, new `src/lib/sensors/` (one module per sensor, same isolation pattern as `src/lib/exa.ts`), one additive migration on `intel.signals`, `.env.local`.

1. **Mode groups** in the Search view: **Exa** (existing 7 modes) · **Sensors** (new) · **Internal** (existing FTS). Visual grouping only; existing modes unchanged.
2. **Sensors shipping now:**
   - **Sanctions** — OpenSanctions consolidated screening (OFAC/UN/EU/UK), fuzzy name matching via their API.
   - **Corporate** — GLEIF (LEI/ownership chains) + Companies House (UK) + SEC EDGAR (filings). Companies House requires a free API key → `.env.local`.
3. **Sensors stubbed behind an on-demand gate** (mode tabs hidden behind a feature flag until a live case or report needs them; modules may be scaffolded but not wired): Domain (crt.sh + Shodan InternetDB), Courts (CourtListener + JudyRecords), Power map (LittleSis).
4. **Explicitly NOT Search features:** username enumeration (Maigret), financial anomaly (edgartools), geolocation (EXIF/sun-shadow) — Python/long-running; these become agent workflows later (out of scope here).
5. **Admiralty grading at capture (the rigor chokepoint):** additive migration adds `source_reliability` (A–F, nullable) and `claim_credibility` (1–6, nullable) to `intel.signals`. The save-signal affordance (Search results → save) exposes both as optional selects, defaulting to ungraded. `raw_payload` preserved as always.
6. **Credential gate:** sensor keys are `VITE_`-prefixed (client calls) and therefore embed in builds. Companies House free-tier key is low-sensitivity but must be added to the `check-bundle-secrets.sh` review checklist and assessed before any published DMG. OpenSanctions/GLEIF/EDGAR need no key for basic tiers.

**Acceptance:** sanctions query on a known OFAC name returns graded, saveable results that land in `intel.signals` with Admiralty fields populated and dedup intact; corporate query resolves an LEI ownership chain; existing Exa modes regression-free.

---

## 5. WS5 — MCP write tools (agent hands)

**Files:** `mcp-server/src/index.ts`.

The days-31–60 item from the business audit, pulled in because Docs stages and Intel case state need agent operability:

1. `create_record`, `update_record`, `link_records` — all routing through the existing RPC layer (`workspace.append_record_section`, `workspace.update_relation_links`), never raw table writes from the tool layer.
2. Every write emits a `workspace.work_events` row automatically — the receipt rule enforced by implementation, not discipline.
3. Body-section appends only via `append_record_section` (never read-modify-write).
4. Read tools already shipped (`list_databases`, `query_records`) stay as-is.

**Acceptance:** an agent can move a Docs record Draft → Copy-audit and update a CRM pipeline stage via MCP; each write produces a work_events row; no service-role dependency added to the app client.

---

## 6. WS6 — Shell UI/UX: sogo segmented pass

**Files:** `src/components/layout/` (sidebar, agent-panel, app shell), `src-tauri/` (window config for eject), `DESIGN.md` review gate applies to all of it.

Reference model: `~/projects/sogo-work/sogo-app` shell — segmented floating panes, rounded containers, resize handles, ejectable columns.

1. **Segmented visual language:** main content, sidebar, and agent panel render as distinct rounded panes with gutter spacing (sogo's `rounded-[20px]` pane pattern adapted to IntelliZen's tokens) instead of full-bleed columns. Tokens only — no new colors/typography outside DESIGN.md.
2. **Sidebar pill:** collapse behavior already exists (216→56px). Refine collapsed state to the sogo floating-pill aesthetic (detached rounded vertical pill, icons only, entity dot indicator). Keep localStorage persistence.
3. **Agent panel eject:** panel gains an eject control that detaches it into a separate always-on-top Tauri window (multi-window API), leaving the main window full-width for data. Re-dock control in the floating window. Chat state survives eject/re-dock (state already persisted to localStorage keys). Panel stays chat-first — run/approval surfaces remain Databases-native per existing governance comment in `agent-panel.tsx`.
4. **Responsive pass:** `useWindowSize`/`isCramped` extended so every primary view (Intel, Docs, Databases, Search, Home) degrades cleanly at narrow widths — no horizontal scroll of the page body, tables scroll within their own containers.
5. **DESIGN.md review gate is mandatory before merge** of this workstream. If the segmented pattern needs new tokens, propose them in DESIGN.md first; Adam approves.

**Acceptance:** DESIGN.md gate passed; eject/re-dock round-trip preserves chat; app usable at 1024px width; no layout regression at default size.

---

## 7. WS7 — Home dashboard & palette

**Files:** `src/views/Home.tsx`, `src/lib/data.ts`, command palette component, one small migration or workspace table for pins.

1. **Pins move localStorage → workspace table** (audit B.9b): layout becomes agent-visible and machine-portable. Migration path: read existing localStorage pins once, write to table, delete key.
2. **Dashboard cards** (his stated 9am need: "important charts/graphs/updates on essentials"): pinned database views drive it — Decisions queue, Finance vs gates chart, Active cases (Intel/GZS), stalled workflow runs. **Card availability depends on the Decisions/Finance/Engagements databases being seeded — that is Steve's data task, not engineering; the engineering deliverable is that pinned views of *any* workspace database render as Home cards** (table snippet, kanban summary, or existing chart view).
3. **Command palette gains internal search** (audit B.9c): wire `workspace.search_workspace` results into the palette alongside navigation.

**Acceptance:** pin a database view → appears on Home with live data → visible from a second machine (DB-backed); palette query returns records, not just routes.

---

## 8. WS8 — Cleanup (simplification addendum)

**Files:** repo-wide.

1. Delete 4 verified-unimported components: `charts/area-chart.tsx`, `database/primitives/MarkdownToolbar.tsx`, `database/primitives/ColumnHeaderPopover.tsx`; **mount** `layout/app-error-boundary.tsx` in App.tsx (one line — wiring is the right call, not deletion).
2. Move stale spec docs to `docs/archive/`: `IntelliZen-Revival-Strategy.md`, `PORTING_PLAN.md`, `intellizen-expansion-spec.md`, `intellizen-tauri-spec.md`, `dashboard-design.md`. **Keep at root:** `osint-workflow-analysis.md` (canonical OSINT spec), this PRD, `CLAUDE.md`, `DESIGN.md`.
3. `AGENT.md` and `AGENTS.md` become 3-line pointers to `CLAUDE.md`.
4. Delete + gitignore the loose `phase-*.png/md`, `panel-*.png`, `tier2-*.png` screenshots at root.
5. Run `npx depcheck`; remove flagged unused runtime deps (verify each before removal).
6. Update `CLAUDE.md` route/section table to post-refinement reality at the end of the build.

**Acceptance:** `pnpm build` + `pnpm tauri build` green; error boundary catches a thrown render error in dev; repo root contains only live docs.

---

## 9. Sequencing

Order minimizes rework; WS5 unblocks agent operability early:

1. **WS1 + WS2** (nav, naming, fold) — one session, mostly mechanical, everything else builds on the new IA.
2. **WS5** (MCP write tools) — unlocks agent-operated Docs/CRM/Decisions for every later workstream.
3. **WS3** (Docs) — needs WS1 routes + benefits from WS5.
4. **WS4** (Search sensors + Admiralty) — independent; can run parallel to WS3.
5. **WS7** (Home + palette) — after WS3 so Docs/Decisions cards exist to pin.
6. **WS6** (shell UI pass) — last of the majors; touches everything visually, so land after the IA settles. DESIGN.md gate.
7. **WS8** (cleanup) — final sweep + CLAUDE.md update.

**Non-engineering prerequisites (Steve, parallel):** seed Decisions / Finance / Engagements workspace databases (business audit D-sequence #1); Telegram queue-ping wiring (audit B.1/B.6) — out of this PRD's scope but Home cards (WS7) light up when done.

## 10. Out of scope (explicit)

- anchors↔workspace bridge removal / schema renames — quarterly-review structural work.
- Python/agent-executed sensors (Maigret, edgartools, geolocation) — later agent workflows.
- POLE population — parked until first live case (audit B.10).
- Any template engine, external send automation, notification service in-app — sends stay human, delivery rail is Telegram/Fiona.
- New routes or sidebar surfaces beyond D5. Agents propose, Adam pins.
- Multi-user auth, cross-platform, vault-sync changes.

## 11. Open questions (named, not hidden)

1. **D7/D8 cancel window** — if Adam cancels by 2026-07-10, WS3 (spine) or WS4 (split) re-plans; everything else stands.
2. **Docs editor depth** — v1 is a markdown editor over vault files. Rich contract formatting (letterhead, PDF export) is unscoped; flag when the first real contract needs it.
3. **Eject window behavior on macOS Spaces/fullscreen** — verify always-on-top UX during WS6; degrade to in-window overlay if Tauri multi-window fights macOS fullscreen.
4. **Sensor rate limits** — OpenSanctions/GLEIF free tiers are generous but unverified under real case load; measure during WS4, add client-side throttle if needed.
