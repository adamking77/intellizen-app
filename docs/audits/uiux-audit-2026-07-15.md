# IntelliZen UI/UX Audit — 2026-07-15

**Method:** hybrid. Live walkthrough of every primary surface + zombie routes (vite dev in Chrome; Tauri fs/Exa unavailable — noted where relevant) cross-referenced with parallel code audits (state coverage, interaction consistency, orphaned workflows, design tokens) across `src/views/` and `src/components/`.

**Verdict:** the app's bones are strong — Databases and the command palette are genuinely well-engineered, Canvas and Monitors are polished, mutations on primary entities are properly instrumented. What keeps it below "sophisticated daily driver" is not visual slop (there is almost none) but **trust and consistency debt**: silent failures, unguarded destructive actions, and the same object behaving differently on every surface.

---

## Top 10 by daily-driver impact

1. **Intel collection content never renders.** Collection shows "ATTACHED SIGNALS · 127" with zero rows, no spinner, no error, dead scroll — observed live, stayed blank indefinitely. The core payload of the Intel surface is invisible. Root cause matches code audit: `Projects.tsx:238` signals query has no loading/error state. **BLOCKER**

2. **Docs failed read renders as an empty editable doc.** A doc whose vault read throws (`Vault paths must be relative`, `Reports.tsx:126` — reproduced live with an absolute-path doc) shows a blank BlockNote editor saying "Enter text or type '/' for commands" under a header promising "edits save in place." A read failure is indistinguishable from an empty doc, and invites overwriting real content. **BLOCKER — data-loss shaped**

3. **Unguarded destructive actions.** Record delete (`DatabaseEditor.tsx:696`), bulk record delete (`:768`), view delete (`:1002` + `ViewTabBar.tsx:545` — an always-visible X on every tab), Home pin remove (`Home.tsx:192`), Agent Panel "New session" wiping visible history (`agent-panel.tsx:831`) — all fire instantly, no confirm, no undo. Meanwhile record-delete elsewhere in Databases *does* confirm. One misclick = silent loss. Also: red "Delete database" sits in the global header one click away, adjacent to "New database." **BLOCKER**

4. **Same signal, different rules per surface.** Signal card: Save+Attach+Dismiss in detail pane, Open+Save+Dismiss in feed, Dismiss-only in Collections, Save-only in Search. In Collections/Search the card has `cursor-pointer` + hover highlight but no onClick — a dead click that teaches users the app is unresponsive (`signal-card.tsx:44`, `Search.tsx:328`). **MAJOR**

5. **Table view click roulette.** In Databases Table view one click does three different things depending on invisible field type (toggle / inline-edit / open peek), and the identical record in List/Gallery/Kanban always opens the peek (`DatabaseTableView.tsx:542`). Multi-select and bulk actions exist only in Table. **MAJOR**

6. **Silent failure culture in the Agent Panel.** Voice output, dictation preview, workflow start without run id, GenUI pin — all swallow errors (`agent-panel.tsx:512,590,735,869`; `agent-chat-widget.tsx:41` flips to "Pinned to Home" even if the pin failed). Sandboxed GenUI widgets that fail their handshake stay a blank box forever, no loading/error/retry (`sandboxed-genui.tsx:32,37`). For an agent-first app, agent-output trust is the product. **MAJOR**

7. **Error states are dead ends app-wide.** Not one error surface has a retry button: Intel top-level (`Projects.tsx:442`), AgentWork full-screen takeover that hides healthy data on a partial failure (`AgentWork.tsx:227,325`), Agent Panel banner (`agent-panel.tsx:1055`). Recovery = reload the app. **MAJOR**

8. **Legacy vocabulary on primary surfaces.** Docs surface: section header "REPORTS", view file `Reports.tsx`; Investigation copy says "Reports" 4× where it means Docs (`Investigation.tsx:66,273,277,584`); "INTEL GROUP / INTEL COLLECTION" schema chips as user-facing labels. **MAJOR**

9. **Six built surfaces are unreachable.** /monitors, /inbox, /workflows, /roles, /agent-work, /investigate are healthy, maintained views (code audit: essentially clean) with zero UI paths in. Monitors has 7 monitors — all paused, last sweep 86 days — a working subsystem quietly dying because no surface shows it. Either give them owned entry points (Home pin, cmd+K, contextual links) or retire them. **MAJOR**

10. **Loading is spinner-or-nothing.** No skeletons anywhere; secondary queries (signals, vault files, counts, investigations, catalog) have no pending state at all, so panes flash "empty" before data lands and counts render 0 while loading (`Projects.tsx:142,238,244`; `agent-panel.tsx:1064` flashes the "Message an agent to get started" empty state before history loads). **MAJOR**

---

## Live-only findings (screenshots, dev walkthrough)

- **Home charts:** Decision Pipeline x-axis labels overlap bars and truncate ("Awaiting Ad…"); Workflow Runs y-axis uses fractional ticks (0.5–3.5) for integer counts.
- **Graph header overlap:** graph selector clipped under the Insight/Construct toggle; empty Construct canvas has stats chips but no "create first node" CTA.
- **Intel header:** group title truncates to "Spec O…" while action buttons keep full width; collections double-listed (rail + detail pane) in the same viewport.
- **Agent Panel:** "↓ Latest" pill floats over widget content; task-tracker widget truncates every title ("Phase 4: …" ×6 — useless rows).
- **Canvas:** node cards show raw `## 4a` markdown as literal text.
- **Search:** mode tab strip overflows with a truncated "Deep" tab and awkward mini-scrollbar.
- **Docs list:** slug-derived titles lose casing ("Uhnw", "Pda", "Adhd"); no doc search box; raw absolute filesystem path displayed under the doc title.
- **Databases:** rail collapsed to an unlabeled ">" chevron by default.

## Interaction consistency (code audit, condensed)

- **Modal chaos:** three hand-rolled modal shells in Intel with different backdrops and Escape behavior; attach-investigation dialog has no Escape, no focus trap, no overlay close (`attach-investigation-dialog.tsx:28`) — the only modal that traps keyboard users. `DatabaseSchemaEditor` (`:239`) ignores Escape too, no role="dialog".
- **Two pin systems on Home:** database-view pins (drag grid, icon-X) vs GenUI agent widgets (static, text "Unpin") — one mental object, two behaviors (`Home.tsx:255`).
- **Docs have no delete action at all** while every other object type does (`Reports.tsx:433`).
- **Hover-only actions recur** (`opacity-0 group-hover:opacity-100`) on signal cards, table rows, Home widgets — invisible at rest, dead for keyboard/touch.
- **Context menus:** shared ContextMenu primitive exists, used nowhere.
- **Keyboard:** cmd+K palette is the only keyboard-complete surface (arrow nav, Enter, Esc, ARIA). Table view has no Tab-to-next-cell, no arrow rows, no keyboard selection; peek panel doesn't restore focus on close.
- **Open-link mechanics differ:** internal search results use `<a target="_blank">`, signal cards use Tauri `openUrl()` — same list, two behaviors (`Search.tsx:692`).
- **Kanban drag persists instantly with no undo;** bulk duplicate has no pending indicator (`DatabaseKanbanView.tsx:189`, `DatabaseTableView.tsx:664`).

## State coverage (code audit, condensed)

- **Silent-save class (MAJOR):** Home pin layout/removal persistence does `saveHomePinsToWorkspace(...).catch(()=>{})` (`Home.tsx:137,144`) — remote pins are authoritative, so a failed save looks successful then silently reverts on the next 15s sync. PeekPanel notes autosave failure just reverts to "dirty" (`DatabasePeekPanel.tsx:220,365`) — indistinguishable from still-editing; user navigates away, notes lost.
- **Error-as-empty-state (MAJOR):** Investigation's 7 queries never destructure `error` (`Investigation.tsx:193–247`) — a failed load renders as "No investigations yet." Failure masquerades as no-data.
- **Orphan vault files:** Docs create writes the vault .md before the workspace record (`Reports.tsx:159`); if the record insert throws, the orphan file stays with no cleanup.
- Systemic split: parent-entity mutations (rename/delete/archive/assign) are fully instrumented (toast + optimistic + confirm, snapshot rollback; deleted records even get a Trash panel with restore); secondary/detail queries and autosave paths fail silently and flash empty.
- Cheap fix already in codebase: `toast.ts` exposes an `action` field usable for undo — currently unused everywhere.
- Silent success: header-field save, DB rename, sub-record create give no confirmation (`DatabaseEditor.tsx:330,510,1285`).
- Silent background repair loop swallows write failures (`DatabaseEditor.tsx:305`); workspace sync failure invisible (`Projects.tsx:128`).
- Delete-last-view silently no-ops with no explanation (`DatabaseEditor.tsx:1002`).
- Empty states without CTAs: AgentWork "No work matches this view" (no clear-filters), Active Projects renders blank container (`AgentWork.tsx:434,621`), workflow menu "No active workflows." dead end (`agent-panel.tsx:1204`); GenUI table/insights/metrics/links cards render silently blank when arrays are empty (`agent-chat-widget.tsx:63–89`).
- Signal dismiss is immediate, toast-only, no undo (`Projects.tsx:1003`).

## Design consistency + AI slop

Token hygiene is strong at the leaf level (~2 rogue Tailwind-palette classes app-wide), no gradient slop, sentence-case buttons and smallcaps headers consistent. But two structural fractures:

**MAJOR**
- **Databases is a design island** — the entire subtree (16 files) renders through a bespoke `.db-*` CSS system (~500 lines in index.css: db-table, db-icon-btn, db-schema-*, db-gallery, db-kanban…) parallel to the tokenized Tailwind primitives every other view uses. Single largest consistency fracture; highest-leverage fix.
- **Emoji as UI icons inside Database components** (✕ 🗑 📄 ✓ — `DatabaseSchemaEditor.tsx:248,333`, `DatabaseTableView.tsx:859`, `DatabaseGalleryView.tsx:109`, `PickerDropdown.tsx:164`) while the rest of the app is 100% lucide (41 imports, 0 other libs). DESIGN.md bans emoji-as-icons. Replace with lucide X/Trash2/FileText/Check.
- **Page-title typography drift**: same-role detail H1 at 17px (Reports), 18px (empty states), 22px (DatabaseEditor), 24px (Roles/Workflows/AgentWork) — no shared heading token.
- **`ui/data-row.tsx` is dead code** — the DataRow primitive DESIGN.md specs for list surfaces is imported by zero files; every list hand-rolls flex+border-b rows, guaranteeing density drift (Docs p-5 vs Intel p-6 gutters observed).
- **Chart-library defaults never Catppuccin'd**: `date-ticker.tsx:23,96` uses zinc/white + dark: variants in a dark-only app; `gauge.tsx:81` defaults to a lime→emerald gradient off-palette.

**MINOR**
- `Graph.tsx:2810` inlines #f03f3f/#a6e3a1 instead of var(--danger)/var(--success); Graph also hardcodes the Catppuccin chart palette rather than tokens.
- 8 sites of 9px labels below DESIGN's 10px floor (`Graph.tsx`, `Search.tsx:551`, `agent-panel.tsx:1099…`); 14 sites of uppercase-label tracking below the 0.14em minimum.
- Two checkbox radii (3px hand-rolled in `signal-card.tsx:86` vs 4px `ui/checkbox.tsx`).
- Vocabulary in one view: `Reports.tsx` uses "Docs", "Documents", and "Reports" for the same surface.
- Chart axis/tick hygiene (fractional ticks, label collision on Home) is the visible dataviz gap.
- Loading affordance drifts skeleton (Search) vs spinner (5 views) vs bare text (`DatabaseEditor.tsx:1373`).
- Monitors uses monospace body copy unlike any other surface.

## Route inventory

| Route | Sidebar | Linked internally | State |
|---|---|---|---|
| /home /search /intel /databases(/;id) /docs /graph /canvas | yes | yes | healthy |
| /investigate | no | yes (from Intel "New case investigation") | healthy, hidden |
| /inbox | no | no | zombie (clean code) |
| /monitors | no | no | zombie (clean, data stale 86d) |
| /agent-work | no | no | zombie (clean) |
| /workflows | no | no | zombie (clean; links out to /databases) |
| /roles | no | yes (Workflows → /roles link) | near-zombie; stale "Agent Panel" hardcoded label `Roles.tsx:449` |
| /projects → /intel, /reports → /docs | redirects | — | fine |

## Systemic root causes → fix leverage

1. **No shared query-state wrapper.** Every view hand-rolls loading/error/empty. One `<QueryState>` component (skeleton / error+retry / empty+CTA) applied to the ~20 secondary queries kills findings #1, #7, #10 as a class.
2. **No standard destructive-action contract.** Databases' `ConfirmDialog` is the gold standard and already exists — route every delete/unpin/clear through it, add undo-toast for high-frequency ops (dismiss, unpin). Kills #3.
3. **SignalCard superset props.** One component, per-surface prop subsets = divergent contracts. Fix the contract once (always clickable → detail, fixed action set, kebab overflow). Kills #4 and the dead-click.
4. **cmd+K palette is the keyboard reference implementation.** Extract its Escape/focus/ARIA behavior into the shared dialog primitive; migrate the 5 hand-rolled modals. Kills the keyboard-trap class.
5. **Vocabulary layer.** A single labels module (Docs/Collections/Groups) instead of schema names + legacy strings scattered through copy. Kills #8.
6. **Surface governance decision needed** (Adam pins): promote, link, or retire the six zombie routes. Monitors especially — working monitor fleet, paused 86 days, invisible.
7. **Dissolve the Databases design island.** Fold the `.db-*` CSS dialect + emoji icons into the ui/ primitive system (or document db-* as an explicit layer). One subtree, touches every daily surface.
8. **Adopt or delete dead primitives.** DataRow specced-but-unused; toast `action` (undo) unused. Both already built — using them closes several finding classes for near-zero cost.

---

# Part 2 — Remediation Plan

What to do with the findings. Not a redesign — the visual language is right and stays. This is a consistency-and-trust hardening pass, done as primitives-first, then sweeps. Fix the class, never the instance.

## 2.1 Design doctrine to lock first

Five rules. Every finding in Part 1 is a violation of one of them. Adopt these into DESIGN.md so future surfaces can't regress:

1. **Failure must look different from empty.** A query that errored may never render the empty state, and a read that failed may never render an editable surface. Every data region shows exactly one of: skeleton, content, empty+CTA, error+retry.
2. **Every action is acknowledged.** Every mutation produces a visible outcome — optimistic change, toast, or state transition. `.catch(() => {})` is banned on user-initiated writes. Autosave must expose a saved/dirty/failed indicator.
3. **Destructive means confirmed or undoable.** High-friction path: ConfirmDialog. High-frequency path (dismiss, unpin, drag-move): instant + undo toast. Never neither. Nothing red lives at the top level of a surface.
4. **One gesture, one meaning.** A given object renders with one click contract and one action set everywhere it appears. If a surface can't support the full set, it shows the subset disabled — not absent — or opens the detail where the full set lives.
5. **Keyboard parity.** Every overlay: Escape closes, focus is trapped, focus returns to the trigger. Every primary flow reachable without a mouse. cmd+K is the reference implementation.

## 2.2 Workstreams

### WS-1 · Primitives (build first — everything else consumes these) — ~1 session
| Deliverable | Detail | Kills |
|---|---|---|
| `<QueryState>` wrapper | Skeleton / error+retry / empty+CTA around any query; skeleton shapes per surface type (list, table, card grid) | Findings #1, #7, #10, error-as-empty-state, loading drift |
| Shared `<AppDialog>` | Extract cmd+K's Escape/focus-trap/ARIA behavior into the dialog primitive; ConfirmDialog rebased on it | keyboard-trap class, modal chaos |
| Undo toasts | Wire the existing unused `toast.action` field into a `useUndoableMutation` helper (execute, toast with Undo, revert on click) | dismiss/unpin/drag no-undo class |
| Labels module | `src/lib/labels.ts` — single user-facing name per concept (Docs, Collections, Groups); schema names never rendered | vocabulary drift class |

Acceptance: primitives exist, documented in DESIGN.md, at least one consumer each.

### WS-2 · Trust batch (the two blockers + data safety) — ~1–2 sessions
1. **Intel signals render**: `Projects.tsx` secondary queries (signals, files, counts, investigations) through `<QueryState>`; find and fix why 127 attached signals render zero rows; counts show skeleton not 0.
2. **Docs read failure**: failed vault read renders error+retry panel, editor never mounts on error; absolute-path docs either supported explicitly or shown as "outside vault" with an open-in-Finder affordance; fix create order (workspace record before vault write, or cleanup on failure).
3. **Confirm/undo pass**: view delete → ConfirmDialog; Home pin remove → undo toast; Agent Panel new-session → confirm; signal dismiss → undo toast; bulk delete keeps confirm + gets pending state; last-view delete explains itself instead of no-op.
4. **Silent saves surfaced**: Home pin persistence and PeekPanel notes autosave get failure toasts + dirty/saved indicator; Investigation queries destructure `error`.
5. **Move "Delete database"** out of the global header into an overflow (⋯) menu with ConfirmDialog.

Acceptance: doctrine rules 1–3 hold on Home, Docs, Intel, Databases, Agent Panel. Kill-test: unplug network, use the app — every failure is visible and recoverable.

### WS-3 · Object contracts — ~1–2 sessions
1. **SignalCard**: one fixed contract — card click always opens detail; fixed action set (Open, Save, Attach, Dismiss) with unavailable actions hidden behind one kebab, not silently missing; actions visible at rest at reduced opacity, not `opacity-0`; remove dead `cursor-pointer` when genuinely inert.
2. **Record click model**: clicking a record opens the peek in every view; inline edit in Table becomes an explicit affordance (pencil-on-hover or double-click, one choice) instead of hit-target roulette; active-record highlight added to Table.
3. **Pin unification**: one pin object model — DB-view pins and GenUI widgets share grid, drag, remove affordance (icon-X + undo toast).
4. **Docs get a delete action** (with confirm), matching every other object type.
5. **Escape/focus migration**: attach-investigation dialog, Intel's three bespoke modals, DatabaseSchemaEditor → `<AppDialog>`.

Acceptance: object × surface matrix from Part 1 collapses to one row per object.

### WS-4 · Design island + typography — ~1 session
1. Fold `.db-*` CSS into ui/ primitives (or, minimum viable: keep the classes but re-express them in tokens and document db-* as a sanctioned layer — decide once).
2. Emoji → lucide (X, Trash2, FileText, Check) in the 4 Database files.
3. Heading token: one detail-title size/tracking, applied to the 17/18/22/24px drift sites.
4. Sweep: 9px labels → 10px floor; tracking → 0.14em; checkbox radius unified on ui/checkbox; date-ticker + gauge + Graph palette onto tokens.
5. Adopt DataRow in Docs/Intel/Search lists — or delete it and codify the hand-rolled row as the primitive. Either, once.

Acceptance: zero `.db-*`-only components with emoji; zero sub-floor labels; one H1 spec; DataRow either used ≥3 surfaces or gone.

### WS-5 · Polish sweep — ~1 session
Charts: integer y-ticks, x-label collision (rotate/truncate-with-tooltip), Home pin chart titles untruncated. Graph header overlap. Canvas cards render markdown. Search mode-tab overflow (wrap or scroll affordance). Doc titles from record title not slug (fix casing at source); doc search input in Docs rail. Intel: title truncation (title gets priority over buttons), de-duplicate rail vs detail collections list (detail keeps the list, rail keeps counts only — or vice versa). Empty states get CTAs (AgentWork clear-filters, Graph "create first node", workflow menu "open registry").

### WS-6 · Surface governance — Adam decisions, then ~half session to wire
Recommendations per zombie route (final call is yours per surface-governance rule):
| Route | Recommendation |
|---|---|
| /monitors | **Promote** — it's the intake engine for Intel and it's silently dead (86d). Either a rail entry under Intel or a Home pin "Monitor health" + cmd+K. Also: resume or delete the 7 paused monitors. |
| /inbox | Fold into Intel as the triage feed (it IS the signal feed); retire the standalone route after. |
| /agent-work, /workflows, /roles | Keep as deep-links + add cmd+K entries now (zero UI risk); longer term one "Agent Ops" surface if usage warrants. |
| /investigate | Keep hidden — it's flow-entered from Intel, correct as-is. |
| /projects, /reports redirects | Keep. Rename `Reports.tsx` → `Docs.tsx` and fix the 4 Investigation copy strings + REPORTS header regardless (WS-1 labels module). |

## 2.3 Explicitly NOT doing
- No visual redesign, no new theme, no layout rework — the aesthetic is already differentiated and disciplined.
- No new routes or sidebar items without your pin (governance rule stands).
- No schema/table renames — vocabulary fixes live in the labels layer only.
- No feature building inside this pass — anything that smells like new capability gets parked.

## 2.4 Order + effort
WS-1 → WS-2 → WS-3 → WS-4 → WS-5, with WS-6 decisions gathered async anytime. Roughly 5–7 working sessions total. Each WS lands as its own reviewable branch against the DESIGN.md gate; WS-2 is the one that changes how the app *feels* (demo → daily driver), so it ships first after primitives.

## 2.5 Definition of done (per surface checklist)

*(superseded in part by Part 3 and the cockpit spec — kept for the checklist)*
- [ ] Every query region: skeleton / content / empty+CTA / error+retry — all four reachable and distinct
- [ ] Every mutation: visible acknowledgment; failure produces a toast
- [ ] Every destructive action: confirm or undo
- [ ] Every overlay: Esc closes, focus trapped and restored
- [ ] Object behaves identically to its other surfaces (matrix row check)
- [ ] No schema vocabulary, no legacy names in user-visible copy
- [ ] Network kill-test passes: nothing silently reverts, nothing dead-ends

---

# Part 3 — Job-Coverage Pass (the designer's half, 2026-07-15)

Method: real jobs from the discovery interview, walked end-to-end in the live app, scored by frequency × pain. Five-second test per surface. Benchmarked against the tools that set expectations (Notion, Linear, Claude/ChatGPT chat, Telegram). Browser-mode caveat: vault writes unavailable — flagged where it matters.

## Job scorecard

| # | Job | Freq | Verdict | What the walk showed |
|---|-----|------|---------|---------------------|
| J1 | Morning review: "what did agents do overnight, what needs me?" | daily, first thing | **FAIL** | Home answers nothing. Four aggregate charts, no names, no items, no links; bars are look-don't-touch (hover tooltip only). No "needs approval" list, no "finished overnight" list, no unread anything. The single most-run job in the app has no surface. |
| J2 | Work today's tasks: find due/overdue, mark done | daily | **POOR** | Due column exists but off-screen right; a task a month overdue renders identical to any other (no red, no flag); no "My day"/"Overdue" preset view. Fiona's chat widget marks overdue red — the actual board doesn't. The board is a data table, not a working tool. |
| J3 | Review a doc an agent wrote | daily | **FAIL** | No new/changed indicators, no author, no dates in the list; slug-mangled titles. Cannot tell what appeared since yesterday. |
| J4 | Quick-capture a note | daily | **FAIL** | No quick-capture path anywhere (no global shortcut, no panel command). "New doc" button clicked → nothing visible happened, no feedback of any kind (browser-mode write failure, but the silent no-op is the UX finding). |
| J5 | Delegate to Fiona and follow up | daily | **PARTIAL** | Sending works (and Telegram/Hermes cover it too). Following up fails: tracker widget rendered blank twice in-session (silent data handshake death), AgentWork is a hidden zombie page, no unread badge. Chat lacks copy/retry/edit/stop/steer. |
| J6 | Invoice a client: create → send → track paid | monthly+ | **UNSUPPORTED** | Invoices DB is a bare table with 1 row. No template, no create-from-template, no PDF, no sent/paid flow. The job cannot be done in the app. |
| J7 | Scoping run: who's who, ecosystem, entity map | per case | **STITCHED** | Search is genuinely good (best surface in app). Save-to-collection works. Entities/claims exist. Graph exists but standalone, empty-state dead end, and threw an infinite render loop (Graph.tsx:177, "Maximum update depth exceeded"). The flow spans 4 surfaces with nothing case-born connecting them — it lives in the operator's head. |
| J8 | Produce a distribution asset through copy-audit to published | weekly | **PARTIAL** | Docs holds drafts, stages exist as badges, but no copy-audit hook, no publish target, no template. Pipeline is nominal. |
| J9 | Build a widget by asking Fiona | weekly | **PARTIAL** | Tier-1 (quick visuals) real. Promotion tier is a localStorage prototype: frozen blob, no edit/filter, no sync, chat-size caps, false "Pinned" confirmation. DB-view pinning is solid (remote-authoritative). |
| J10 | Weekly Biz Ops triage | weekly | **PARTIAL** | Board data is all there and structured; triage itself is driven by the Steve session, which is fine — app's role is data, and it serves it. |

## Five-second tests (open page cold: know what it is + what to do next?)

- **Home: FAIL** — communicates nothing actionable; "Build week · 5 days remaining" is the only oriented element
- **Search: PASS** — best surface in the app; clear question, clear modes, clear action
- **Databases/Tasks: PASS** — obvious table, obvious actions
- **Docs: PARTIAL** — "REPORTS" header + slug titles + raw paths blur what this room is for
- **Intel: FAIL** — taxonomy soup (INTEL GROUP / INTEL COLLECTION / RESEARCH chips, double-listed collections); doesn't communicate "this is where cases live"
- **Graph: FAIL** — empty canvas, stat chips, no first action
- **Canvas: PASS** — content-forward, obvious

## ND lens (the client builds ND systems; the audit never applied the lens)

- The app's dominant failure shape is **executive-function tax**: every daily job starts with the operator reconstructing state by hunting (which page, which filter, scroll right for dates) instead of the app presenting triggers. J1/J2/J3 all fail this way.
- **No completion/feedback loops**: silent saves, silent no-op buttons, no acknowledgment pulses — the reward circuit of "it worked" is missing exactly where habits form.
- **Decision fatigue at entry points**: "New doc" with no type/template offers a blank page and a naming decision; task board offers 90 rows with no "just today" cut.
- What passes the lens: Search's single-question entry, Canvas's visual thinking, panel's context chip.

## Deletion candidates (subtraction the audit never proposed)

- The four default Home chart pins as the morning surface (aggregate charts serve no daily job — replace with needs-you / overnight-output / overdue widgets)
- Intel detail-pane duplicate collections list (rail already shows them)
- "All stages" as Docs' only control (replace with search + provenance, per spec)
- Confirmed kills from discovery: Monitors, Inbox, AgentWork/Workflows/Roles as pages

## New defects found during the pass

- **Graph.tsx:177 — infinite render loop** ("Maximum update depth exceeded", repeated) on Graph mount
- **GenUI tracker widget rendered blank twice in one session** — silent data-handshake failure, live confirmation of the sandboxed-genui blocker
- **"New doc" silent no-op** (browser-mode caveat; still zero user feedback on failure)
- **Overdue tasks carry no visual state** on the board (due date renders as plain text, off-screen)

## Re-ranked build order (frequency × pain; replaces Part 2 §2.4 and feeds spec §5)

1. **Trust fixes** — unchanged; everything sits on honest save/delete/error behavior. Add: Graph infinite loop, GenUI blank-widget failure state
2. **The morning loop** — Home widget board (flexible, per spec) shipping with the widgets the daily jobs need: needs-you, overnight agent output, overdue/today tasks; unread badges on panel + Docs; overdue made visible on the task board with a "My day" preset view. J1+J2+J3+J5 are all daily — this outranks everything but trust
3. **Doc model** — file+row, provenance, templates, quick-capture path (J3, J4, J6, J8 all depend on it)
4. **Panel chat functions** — copy/retry/edit/stop/steer + unread badge (J5, hit ~20×/day)
5. **Kill list** — Monitors, Inbox, pages→widgets
6. **GenUI promotion tier** — durable widget contract (rides on #2's widget system)
7. **Intel research desk** — case spine, case-born Graph, four work types (per-case cadence)
8. **Daily brief** (rides on #3)
9. **Venture labels** (additive, anytime)
10. **Polish sweep** — five-second-test fixes fold in here (Home orientation, Docs header, Intel taxonomy chips)

---

# Part 4 — Visual Polish Audit (designer's close-range pass, 2026-07-15)

Close-range critique of live rendered screens against DESIGN.md and plain visual craft. No engineering findings; this is what the app looks and feels like at reading distance.

**Overall verdict:** the shell is genuinely distinctive — floating rounded panes, disciplined dark Catppuccin, no gradients, no glow, quiet chrome. The bones pass the slop test. What fails is the **middle layer**: chips, charts, and labels — the parts that touch data all day. The chrome whispers, then the data layer shouts and repeats itself. Scores per dimension below (out of 10).

---

## 1. Color discipline — 4/10. The chip confetti problem.

The single worst visual habit in the app: **full-saturation filled pills on every data cell.** The Tasks table renders status, priority, AND assignee as solid color blobs — orange, blue, green, grey — so a six-row table contains eighteen shouting chips. Your own DESIGN.md badge contract says tinted background at ~15% with full-strength colored text. That contract is right and it isn't being followed.

Worse than the loudness is the **collision**: Medium-priority blue is the same blue as Adam's assignee chip; High-priority orange is Keel's orange. Same hue, unrelated meanings, adjacent columns. Color can encode one dimension per view — right now it encodes three at once and cancels itself out. You cannot scan this table by color, which is the only reason to color it.

**Fix direction:** chips go to tint-plus-colored-text per the existing contract. Pick ONE column that gets color (priority is the honest candidate — it's the action signal); status becomes text or a small dot; assignees become neutral chips or tiny initials. The table should read as text with one colored accent channel, not as candy.

Also in this dimension: the rotation line on Home renders green while the reconciled accent is blue — the first colored element you see every morning is off-accent.

## 2. Signal vs. wallpaper — 3/10. Labels that never vary.

The app repeats itself constantly, and repetition is invisibility:

- Intel rail: **"COLLECTION · RESEARCH" on all five rows**, a second line per row that adds zero information and doubles row height. The rail fits five rows a screen because of a label nobody reads.
- Same rail: a green status dot on every row — all green, always. A status light that never changes state is decoration.
- Docs list: **ten identical "Draft" pills** in a column. A badge with one value is wallpaper. Show state only when it deviates (Approved, Copy-audit) and let Draft be the silent default.
- Every collection row also restates "INTEL GROUP" / "INTEL COLLECTION" chips in the detail header — taxonomy as chrome.

**Fix direction:** the rule is *show the exception, not the default.* Strip constant labels, keep variable ones. Intel rail rows become one line: name + count. Instantly twice the density, and what remains means something.

## 3. Typography — 6/10. Right system, drifting scale.

The label system (10–11px uppercase, tracked, overlay color) is applied consistently and looks sharp — best-executed part of the type system. Mono for counts and hints (⌘↵ hint, count rings) lands right. But:

- **The data/UI font contract breaks where it matters most:** case IDs in the Docs list (`case-2026-009`) render in the UI font. IDs, timestamps, counts — the intelligence texture — should always be mono. Half the app honors this, half doesn't.
- **Scale drifts upward:** chat body in the Agent Panel (~15–16px), doc list titles (~15px), chart axis labels (~15px in-card) all float above the 13px UI band. Each is defensible alone; together the app has two densities — dense intel surfaces and roomy SaaS surfaces — and they don't feel like one instrument.
- Heading sizes across views still vary (17/18/22/24px for the same role), already flagged in the audit; visually it reads as different apps.

**Fix direction:** enforce the band. 13px UI everywhere except deliberate heroes; every ID/timestamp/count to mono, no exceptions.

## 4. Charts — 3/10. The weakest visual layer.

"Data is the decoration" is the design principle; the charts are where it should shine and instead they are the least crafted thing on screen:

- **Fat rounded-corner bars** read as friendly-SaaS-toy, not instrumentation. Precision language wants square-ended or hairline-radius bars, thin, tight.
- **No values on the chart.** The Agent Workload bars end in empty space — how many tasks is Keel's bar? The one number the chart exists to show isn't shown. Mono value at each bar end.
- Fractional axis ticks (0.5, 1.5, 2.5) for counts; x-labels colliding with bars and truncating ("Awaiting Ad…"). Axis hygiene is table stakes.
- Bar colors are arbitrary pastel spread — five bars, five hues, no meaning. One hue with the leader emphasized, or entity-palette hues only when the hue MEANS the entity.
- Fiona's GenUI tracker widget shares the same problems plus its own (bar-with-count layout truncating every task title).

**Fix direction:** a chart primitive pass — square-ish bars, integer ticks, mono end-values, one-hue default, labels never collide. This one pass upgrades Home, Databases chart views, and every future agent widget at once.

## 5. Hierarchy & composition — 5/10.

- **Intel header inverts importance:** the group's NAME truncates to "Spec O…" while three action buttons luxuriate at full width beside it. The name of the thing you're looking at is the most important element on the surface; actions are secondary. Title gets the space, actions collapse to icons or overflow.
- **Primary-action inflation:** on Intel, two filled-accent buttons ("New intel group", "Add collection") plus a third outline create-action are visible simultaneously. One filled primary per surface; everything else outline or ghost.
- Home's morning read has no focal point: four equal-weight cards, no entry element, nothing that says "start here" (matches the failed five-second test).
- Search is the compositional bright spot: one question, one input, clear modes — but the **Run button is an oversized dull-slate blob** that reads disabled at rest, and the fat grey scrollbar under the mode tabs reads as a broken progress bar.

## 6. Micro-craft — 5/10. The last-2% list.

Small things that separate polished from almost:

- Always-visible chunky scrollbars under Databases view-tabs and Search mode-tabs — should be invisible until scroll, thin when present.
- Truncations everywhere at rest: "Agent Ka…" view tab, "Deep ASY…" mode tab, "Spec O…" title, every task title in Fiona's widget. A surface at rest should show whole words; truncation is for edge cases, not the default state.
- Tasks table row anatomy: the expand chevron sits on its own line above the title, making every row two ragged lines.
- The "↓ Latest" pill floats over widget content in the panel thread.
- Graph header: mode toggle physically overlaps the graph selector.
- Canvas cards show raw `##` markdown as text.
- Intel loading: header stats render mono zeros while the rail spinner runs — "Total 0" as a lie is a polish issue as much as a trust issue; blank or skeleton, never zero.
- Send button in the composer is a rounded square; DESIGN.md says icon buttons are circles. Small, but it's the button you look at most.
- Raw model slug "deepseek-v4-pro" as permanent header chrome; "markdown, edits save in place" as permanent header copy — engineering vocabulary living in the interface.

## 7. What's already right (don't touch)

- The floating-pane shell: distinctive, calm, immediately recognizable. Nobody would say "AI made that" about the shell.
- Zero gradients, zero glow, flat surfaces, hairline borders — the banned list is genuinely enforced in the chrome.
- Pill button language is applied consistently (New doc, New record, Run now, Settings) and the pill-vs-square-chip distinction (actions vs taxonomy) is a smart, legible rule.
- Uppercase label system + mono count rings — sharp, consistent, correct.
- Search's composition and the command palette pattern.
- Breadcrumbs on Intel ("GenZen Solutions / Research & Intelligence / Shadow Lotus") — quiet and exactly right.

---

## Priority order for a polish sprint (visual-only, roughly a session each)

1. **Chip system pass** — tint contract enforced, one color channel per view. Biggest visual upgrade per hour of work; touches Databases, Docs, Intel, Home widgets.
2. **Wallpaper strip** — remove never-varying labels/dots/badges (Intel rail one-liners, Draft suppression). Doubles density where the daily work happens.
3. **Chart primitive pass** — instrumentation bars, mono end-values, integer ticks, collision-free labels.
4. **Type band enforcement** — IDs to mono, UI text to 13px band, one heading spec.
5. **Micro-craft list** — scrollbars, truncations, chevron anatomy, composer circle, zeros-while-loading, header vocabulary.

Items 1, 2, and 4 are mechanical enough to delegate; 3 and 5 want taste review against DESIGN.md's reference anchors before landing.
