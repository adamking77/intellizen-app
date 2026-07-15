# IntelliZen Cockpit Spec — 2026-07-15

Product direction locked in the grill-me discovery session (Adam + Claude, 2026-07-15), following the full UI/UX audit. This supersedes Part 2 of the audit report as the remediation contract. Audit Part 1 findings (bugs, trust gaps) still stand. Implementation design happens per-workstream, against this document.

Written in plain language on purpose. Keep it that way when updating.

---

## 1. What IntelliZen is

**The business cockpit.** One app where Adam sees the state of every venture and directs the agent fleet. Hermes is the orchestration harness underneath; Fiona is the operations director Adam talks to; she delegates to Claude, Codex, and whoever else joins the fleet. The app handles ops for any venture launched — GenZen Solutions, GoKart Studio, whatever comes next.

Intelligence casework is one workload inside the cockpit, not the app's identity.

IntelliZen is also one door among several: Adam delegates from Hermes desktop, Telegram, and IntelliZen. What IntelliZen uniquely does is **show the business** — structured data, review surfaces, widgets. Chat exists everywhere; the cockpit view only exists here.

---

## 2. Locked decisions

1. **One app, venture labels.** Every task, doc, record, collection carries a Venture label. One Home, one Docs, one Tasks database — filter by venture when needed. No workspace switching, no per-venture Homes. A venture label can become a hard partition later if a venture ever needs a real wall (outside collaborators, sale); don't build walls now.

2. **Home is a flexible widget board, Notion-style.** Widgets can be filtered, edited, removed, and replaced per need. Nothing is fixed — as systems mature and clients come in, metrics and priorities change, and Home must absorb that without rebuilds.

3. **Anything observational is a widget, never fixed app chrome.** If it tracks, counts, or monitors something, it's a widget — agent-buildable, filterable, replaceable. The shell stays thin: pages for working, widgets for watching, panel for talking. New capability earns its way in as a widget first.

4. **Fiona is the only counterpart in the panel.** No agent picker. Choosing who executes is her job. Threads are separate per platform (Telegram, Hermes desktop, IntelliZen panel) for token/storage economy, but context is shared — her memory lives below the threads, so any door knows what happened at the others.

5. **A doc is a file plus a row — one object.** The words live as a real markdown file in a real GenZen OS vault folder (readable by Adam, Claude, Codex, Fiona; movable in Finder/Obsidian — a frontmatter id lets sync re-find moved files). The facts (type, venture, client, case, stage, template flag) live on the doc's row in the workspace database. Sync keeps file and row agreeing. Docs never get trapped inside the app.

6. **Attachment = the doc's row pointing at another record.** Points at a case → case artifact, filed in the case folder. Points at a client → deliverable, filed in the client folder. Points at a company → e.g. an invoice. Points at nothing → note, framework, knowledge doc — folder-filed only. Same doc system throughout; only the pointer differs.

7. **Templates are rows flagged "template."** "New invoice / contract / report / brief" copies the template row and its page, fields pre-wired. Create-from-template is the primary creation flow for anything repeatable; blank quick-note creation stays zero-friction.

8. **Docs (the page) is the writing room** — the surface with the good editor, over everything with a body. Money records (invoices, contracts) are mostly touched from their databases; their documents are one click deep, never a separate copy.

9. **Monitors and Inbox are dead.** Wasted API calls. Replaced by an **agent-led daily brief**: Fiona-side job that reads Adam's RSS feeds, Substack feed, email newsletters, and current headlines, and produces one digest — a doc (typed "Daily brief") plus a Home widget. Topic-specific hunting happens as Search sessions.

10. **Intel is the research desk for everything**, four work types on one engine (search sessions, saved evidence, entity map, output docs):
    - **Client case** (GZS) — staged: Scoping → Discovery → Report → Live
    - **Venture research** — OSINT for GoKart or any venture
    - **Publication research** — deep research becoming articles, pattern briefs, expertise pages
    - **Relationship research** — e.g. an introduction report to open an introducer relationship
    Client cases keep stage gates; research types don't pretend to have them. The case/work item is the spine; collections are just evidence piles inside it (current hierarchy is inverted and gets fixed).

11. **Case participants by stage:** Scoping = Adam + agents. Discovery = Adam + client (session). Report = Adam + agents + **contractors**. Live = Adam + agents + contractors + **client**. Contractors and clients are relations on the case record — who's on it, what they sent, what they received — never app users. Multi-user auth stays out of scope. Contractor material gets ingested as case evidence/docs credited to them (mechanics designed at Report-stage build).

12. **The scoping run is the app's first job on any client case** — OSINT-light entity work: who's who, companies, ecosystem of connections. The entity map (Graph) is the scoping workspace, born per-case; its output feeds the discovery session. The 15k report is a doc attached to the case; its skeleton can come from the canonical OSINT spec (ACH, POLE, Admiralty) as a template.

13. **AgentWork / Workflows / Roles pages become widgets**, not sidebar-adjacent pages (per decision 3).

14. **Plain language rule.** All design and option discussions with Adam are in plain English — what it's like to use, analogies over architecture words. (Also recorded in agent memory.)

---

## 3. Agent Panel spec

Identity: the ops line to Fiona, standing next to what you're looking at. Page-context actions (Level 2 — she acts on the current page through the existing MCP tools with receipts) already work and stay as they are.

**Chat functions to add (must-have):**
1. Copy a message (as markdown)
2. Retry — rerun her last answer
3. Edit & resend your own message
4. Stop — kill a response mid-stream
5. Steer mid-response — type while she's answering; she course-corrects
6. Unread badge — she finishes while you're elsewhere → badge on the panel; nothing lands silently

**Should-have:**
7. Save to doc — turn an answer or exchange into a filed doc (free once the doc model lands)
8. Past conversations — browse/search old threads
9. Draft survives navigation
10. Keyboard shortcut to focus the panel input from anywhere
11. Paste an image / drop a file into the message

**Skipped deliberately:** quote-reply, pin-a-message (save-to-doc covers it).

**Voice:** keep the mic as plain dictation (speech-to-text only — no spoken reply on the mic path). Add a separate **live voice mode**: real-time voice conversation with Fiona with proper visuals, entered deliberately.

**GenUI — two tiers, both wanted:**
1. **Quick visuals** — Fiona renders a live chart/table/tracker in the chat as a fast answer; glanced at, scrolls away, disposable by design.
2. **Promoted widgets** — the keepers get pinned into the app as durable custom widgets for necessary metrics. Once promoted, a GenUI widget follows the same rules as every widget (decision 2): live data that never goes stale, filterable, editable, replaceable — without Fiona rebuilding from zero.
Chat is the workshop; Home is the shelf. The two pin systems the audit flagged (database-view pins vs GenUI widgets) converge on one widget contract at promotion time. Audit blockers here get fixed regardless: a widget that fails to load shows an error with retry (never a permanent blank box), and "Pinned to Home" is only claimed after the pin actually persisted.

**Audit trust fixes still apply:** no silent failures (voice, pin, workflow start), no history wipe without confirm, fix widget title truncation and the "Latest" pill overlap.

---

## 4. Surface disposition

| Surface | Verdict |
|---|---|
| Home | Rebuild as true flexible widget board (filter/edit/replace per widget, venture-filterable) |
| Agent Panel | Keep; add chat functions + live voice mode (section 3); fix trust findings |
| Docs | Rebuild on the doc model (sections 2.5–2.8) — the "unusable page" fix |
| Databases | Keep — most consistent surface; fix audit findings (confirm on view delete, click-model consistency, design island) |
| Intel | Rebuild as research desk (decision 10); trust-fix signals rendering first |
| Search | Keep; session outputs save into work items/cases |
| Graph | Keep; becomes per-case scoping workspace rather than standalone destination |
| Canvas | Keep as-is (fix raw-markdown rendering in cards) |
| Monitors, Inbox | **Delete** (decision 9) |
| AgentWork, Workflows, Roles | Convert to widgets, delete pages (decision 13) |
| Investigation flow | Keep; wire to case stages; fix stale "Reports" copy |

---

## 5. Build order (re-ranked by the job-coverage pass, frequency × pain — confirm at implementation kickoff)

The job-coverage pass (audit report Part 3) scored the real jobs; the daily jobs (morning review, today's tasks, review agent output, follow up on delegation) all fail or score poor today, so they outrank per-case and monthly jobs.

1. **Trust fixes** (audit Part 1 blockers + Part 3 additions): Intel signals rendering, Docs failed-read state, no-confirm deletes, silent save failures, dead-end errors, Graph infinite render loop (Graph.tsx:177), GenUI blank-widget failure state — everything later builds on honest save/delete/error behavior. **Includes the emoji purge**: emoji-as-icons in the 4 Database component files replaced with lucide (hard rule: no emojis anywhere, ever; icons very sparingly) — mechanical, ships with this batch, not with polish
2. **The morning loop**: Home widget board (flexible, per decision 2) shipping with the widgets the daily jobs need — needs-you, overnight agent output, overdue/today tasks; unread badges on panel + Docs; overdue made visible on the task board with a "My day" preset view
3. **Doc model** — file+row, attachments, folders, templates, provenance, quick-capture path, Docs page rebuild
4. **Panel chat functions** — the must-have six (copy/retry/edit/stop/steer/unread), then should-haves
5. **Kill list** — Monitors, Inbox out; AgentWork/Workflows/Roles → widgets
6. **GenUI promotion tier** — durable widget contract (rides on #2's widget system)
7. **Intel research desk** — case spine, four work types, case-born Graph-as-scoping
8. **Daily brief** — agent workflow + doc type + widget (rides on doc model)
9. **Venture labels** — additive, can land alongside any of the above
10. **Polish sweep** — audit Part 4's five-item order: chip system pass (tint contract, one color channel per view), wallpaper strip (never-varying labels/dots/badges removed), chart primitive pass (instrumentation bars, mono end-values, integer ticks), type band enforcement (IDs to mono, 13px band, one heading spec), micro-craft list — plus Part 3 five-second-test fixes (Home orientation, Docs header, Intel taxonomy chips) and remaining design-island/consistency findings
11. **Live voice mode** — after the daily spine is solid

---

## 6. Open questions (named, not hidden)

- Where the scoping run actually happens today — validate against the next live/imminent GZS case before building the scoping workspace
- Contractor material ingestion mechanics — design at Report-stage build
- Structured fields + PDF export for invoices/contracts — type model anticipates it; build later
- Live voice mode tech approach — implementation question, discuss at its slot in the order

## 6b. Owed follow-up: job-coverage pass

The audit inspected artifacts (what's broken); it never tested jobs (what's missing). Before implementation kickoff: enumerate every job the cockpit must do — invoice a client, run a case end-to-end, review overnight agent output, produce a distribution asset, ask Fiona to build a widget, file a framework doc, prep a discovery session — walk each one through the app, and log every point where the app can't do it at all. Those gaps rank alongside the audit findings in the build order.

## 7. Relation to other documents

- **Audit report: [docs/audits/uiux-audit-2026-07-15.md](docs/audits/uiux-audit-2026-07-15.md)** — Part 1 findings (bugs/trust) remain valid; Part 2 workstreams superseded by this spec's build order; Part 3 is the job-coverage pass that produced the re-ranked order; Part 4 is the visual polish audit whose 5-item sprint feeds build-order item 10 (chip system, wallpaper strip, chart primitives, type band, micro-craft)
- **CLAUDE.md:** remains the engineering contract (stack, credentials, release rules); update its scope section when kill list lands
- **osint-workflow-analysis.md:** still the canonical OSINT methodology; feeds the report template and case stages
- **DESIGN.md:** still gates all UI changes
