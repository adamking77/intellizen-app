# Home Dashboard — Plan

Reference doc for a Home dashboard screen in InteliZen. Not yet scheduled.

## Goal

A single Home screen that surfaces, at a glance:

1. Pinned charts from Workspace Databases
2. Real-time list of Tasks / Projects / Operations / Investigations due today or this week
3. Persistent indicator of the current rotation week (Build / Marketing / Ops / Slack)
4. Daily messages and notifications from Steve (the AI COO layer)

Single-user, single-window, opened first when the app launches.

## Core principle

**Flexible, not fixed.** Home uses `react-grid-layout` (already in the stack from `/databases`) for a moveable, resizable widget grid. Each widget is a React component dropped into the grid; the user can rearrange and resize without touching code. Layout state persists in localStorage keyed to `home-layout`.

This matches the Database Dashboard model — same library, same drag/resize UX, different set of widgets.

## Foundational shift — Workspace Databases provides most of the infrastructure

Audit confirmed that InteliZen's existing Workspace Databases feature already provides:

- Saved named views per database (table / kanban / list / gallery / calendar / chart)
- Generic filter DSL (composable conditions, field-type-aware operators including date-range)
- Sort, hidden fields, group-by, chart settings — all persisted per view
- Six rendering components, each handling a view type
- A pinning system at `/databases` (using `react-grid-layout`) but **scoped to that route**

**The single missing primitive:** a generic `<EmbeddedView databaseId={x} viewId={y} />` component that can take any saved view and render it inside any screen. Per the audit this is mostly plumbing existing renderers into a new shell.

**This changes the dashboard architecture meaningfully.** Several "widgets" become EmbeddedView instances, not bespoke components. And the Tasks question goes away — Tasks becomes a Workspace Database, not a new dedicated table.

## Reuse audit (do this before any new component work)

Default posture: **reuse before build**. Audit each widget against existing InteliZen components before writing anything new.

| Widget | Reuse from | Build new |
|---|---|---|
| Pinned charts | Existing chart view renderers + the `/databases` pin grid logic | EmbeddedView wrapper; possibly port pin grid into Home |
| Tasks due | EmbeddedView pointed at a "Tasks" workspace database with date filter applied | Tasks workspace database itself (data, not a UI build) |
| Projects/Operations/Investigations due | Hand-coded list components querying existing tables | Date-grouping headers; small list rows |
| Rotation banner | Existing UI primitives (Badge, surfaces, typography tokens) | The banner layout itself |
| Steve's messages cards | Inbox signal card if visual shape matches; otherwise UI primitives | Tone iconography mapping; dismiss action |
| Layout grid | Existing Bento patterns from current dashboard work | Probably nothing — slot existing patterns into Home route |
| Empty states | Existing empty state component if one exists in Projects/Inbox | Copy only |

**Codex briefing rule:** before building any component for this dashboard, grep `src/components/` and `src/views/` for the closest existing equivalent. If something matches at 80%, extend or wrap it — don't fork. The recent dashboard / chart / Workspace Databases work has already produced most of the visual language; Home should compose those, not invent alongside them.

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Header: "Home"          Week 2 — Marketing · 4 days left   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  react-grid-layout widget grid                              │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Pinned chart    │  │ Steve msgs   │  │  Due items   │  │
│  │  (EmbeddedView)  │  │              │  │              │  │
│  └──────────────────┘  └──────────────┘  └──────────────┘  │
│                                                             │
│  (widgets are moveable and resizable)                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Header carries the rotation display. Below it, a free-form `react-grid-layout` grid containing all widgets. Layout persists in localStorage (`home-layout`).

## Rotation display — in the page header

The rotation indicator lives in the Home page header, not in the widget grid. The header area is otherwise minimal, so this won't compete with anything.

**The elegant solve: compute, don't store.**

The rotation is deterministic — 4-week cycle of Build / Marketing / Ops / Slack. Pick an anchor date (a known Build week 1 start) and compute the current week from `Math.floor(weeksSince(anchor) % 4)`. No database row, no Claude Code state dependency, no settings UI. Fully self-contained.

```typescript
// src/lib/rotation.ts
const ANCHOR_DATE = new Date('2026-04-13')  // Build week 1 start
const ROTATION = ['Build', 'Marketing', 'Ops', 'Slack'] as const

export function currentRotation(now = new Date()) {
  const weeksSince = Math.floor((now.getTime() - ANCHOR_DATE.getTime()) / (7 * 86400 * 1000))
  const index = ((weeksSince % 4) + 4) % 4
  return {
    week: ROTATION[index],
    weekNumber: index + 1,
    daysRemaining: 7 - Math.floor((now.getTime() - startOfThisRotationWeek(now).getTime()) / 86400000),
  }
}
```

Displays inline in the header as: `Week 2 — Marketing · 4 days remaining`. Each week type gets its own color from the Catppuccin Mocha palette. Color is paired with the text label — no icons.

Suggested color mapping (adjust to taste):
- **Build** — Teal (`#94e2d5`) — the primary accent
- **Marketing** — Peach (`#fab387`)
- **Ops** — Yellow (`#f9e2af`)
- **Slack** — Lavender (`#b4befe`)

Color applies to the week label chip/badge in the header.

**Risk:** if the anchor date drifts from your actual rotation start, the header lies. Mitigation: a `rotation_overrides` table for explicit one-off shifts, checked before falling back to computed. Build only if that situation arises.

## Widget 2 — Pinned charts (via EmbeddedView)

The existing `/databases` pinning system already stores `{ id, databaseId, viewId, x, y, w, h }` per pin in localStorage. Two clean options:

**Option A — Single source, two consumers.** Keep the existing pin storage. Both `/databases` and Home read from it. Home renders pinned chart-type views in its own bento layout (smaller scale than `/databases`). Pinning UX stays in Workspace Databases.

**Option B — Separate "pin to home" concept.** Add a `pinned_to_home: boolean` on chart views (or a new `home_pins` storage), distinct from the `/databases` dashboard pins. More flexible but more state to manage.

**Recommend Option A** for v1. One pin store, two views of it. Home just filters to chart-type pins and renders them in a simpler, smaller grid.

The EmbeddedView component (built once, used everywhere) handles the actual rendering by dispatching to the existing chart/table/list renderers based on `view.type`.

## Widget 3 — Due today / this week

**Mixed approach** — EmbeddedView for what fits naturally, hand-coded for what doesn't:

### Tasks
Becomes a **Workspace Database**, not a new dedicated table. Suggested schema:
- `title` (text)
- `status` (select: not_started / in_progress / done)
- `due_date` (date)
- `project` (relation to projects)
- `operation` (relation to operations)
- `notes` (text)

Tasks management lives in the existing Workspace Databases UI for free — table view, kanban, calendar, filters, the whole thing. The Home widget is then an EmbeddedView pointing at a saved view named "Due this week" with a date-range filter on `due_date`.

This eliminates a previously-open scope decision (do we add a tasks table, do we build tasks UI) and uses existing infrastructure end-to-end.

### Projects / Operations / Investigations
These are dedicated tables with their own screens, not workspace_records. For these, hand-coded list widgets are right:
- Add `due_date` (nullable timestamptz) columns to all three tables
- Single component that queries each table where `due_date <= end_of_this_week`
- Groups: Overdue / Today / This week

EmbeddedView could be extended later to support non-workspace-database sources if the pattern proves useful, but that's deferred.

## Widget 4 — Steve's messages

**The interesting one.** Mechanism design matters here.

### Storage

New table: `dashboard_messages`

```sql
create table dashboard_messages (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  tone text not null check (tone in ('info', 'nudge', 'alert', 'celebration')),
  link_label text,
  link_target text,           -- internal route or external URL
  scheduled_for date not null,
  created_at timestamptz default now(),
  dismissed_at timestamptz
);
```

Dashboard query: `where scheduled_for <= today() and dismissed_at is null order by created_at desc`.

### Write mechanism

Add an MCP tool `write_dashboard_message` to the intelizen MCP server. Then Steve can write messages from any session, scheduled task, or wrap-up flow.

Three natural write moments:
1. **Session start hook:** if there's relevant context to surface (overdue items, unfinished threads from last session, rotation-week reminders), write a message
2. **Scheduled tasks:** weekly rotation transition gets an automatic message (Sunday night → "Marketing week starts tomorrow"); intelligence sweeps post a summary message
3. **Manual:** during a working session, when something's worth surfacing for tomorrow, write a message

### UX

Messages render as a vertical stack of cards. Tone dictates visual treatment — but per the no-glow rule and the colorblindness constraint, tone is conveyed via icon + text label, not color washes. Each card has a dismiss action that sets `dismissed_at` and removes it from the dashboard but leaves the row in the table for audit.

Limit displayed to today's messages plus undismissed messages from the past 3 days. Older messages auto-archive.

## Real-time updates

Real-time here means "fresh enough" not "live." TanStack Query's `refetchInterval: 60_000` for each widget is the right call. Supabase Realtime subscriptions are overkill for a single-user desktop app and add infra surface for no real benefit.

A manual refresh button in the corner handles the "I just changed something, I want to see it now" case.

## Tech stack decisions

| Concern | Choice | Reasoning |
|---|---|---|
| Layout | `react-grid-layout` (already in stack) | Moveable, resizable widgets; layout persists in localStorage |
| Data | TanStack Query with `refetchInterval: 60s` | Already in stack |
| Rotation | Computed from anchor date | No state, no source of truth dependency |
| Embedded views | New `<EmbeddedView />` component reusing existing renderers | Single primitive, multiple consumers |
| Tasks | Workspace database (no new table or UI) | Reuses Workspace Databases entirely |
| Pinned charts | Reuse existing pin storage and chart renderers via EmbeddedView | No fork |
| Messages | New `dashboard_messages` table + MCP tool | Lets Steve write from any context |
| Update mechanism | Polling, not Realtime | Simpler, sufficient |

## Schema additions required

```sql
-- Migration: add_dashboard_schema
alter table projects       add column due_date date;
alter table operations     add column due_date date;
alter table investigations add column due_date date;

create table dashboard_messages (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  tone text not null check (tone in ('info', 'nudge', 'alert', 'celebration')),
  link_label text,
  link_target text,
  scheduled_for date not null,
  created_at timestamptz default now(),
  dismissed_at timestamptz
);
```

**No new tasks table.** Tasks is a workspace database, created via the existing Workspace Databases UI as a one-time setup step.

## MCP additions required

Two new tools on the intelizen MCP server:

- `write_dashboard_message({ body, tone, scheduled_for, link_label?, link_target? })`
- `list_dashboard_messages({ include_dismissed?, days_back? })` — for Steve to check what's already been said before duplicating

## Open design decisions

1. **Default route.** Does Home become the new default landing route, displacing Inbox? Probably yes, but worth confirming.
2. **Empty states.** What does the dashboard look like with zero pinned charts, no due items, no messages? Needs an honest empty state — not motivational filler.
3. **Pin storage scope.** Option A (shared pin store between `/databases` and Home) vs. Option B (separate `pinned_to_home` flag). Lean Option A.
4. **Rotation override mechanism** — build now or wait until needed.
5. **Message dismissal vs snooze.** Just dismiss, or also "remind me tomorrow"? Dismiss-only for v1.
6. **Auto-write triggers from Steve.** What scheduled tasks or hooks should write messages? Worth a separate small spec.
7. **EmbeddedView filter overrides.** v1 — embedded views render with their saved-view filters as-is. Per-embed filter overrides (e.g., "show this Tasks view but force date filter to today only") deferred until needed.

## Phased build plan

### Phase 1 — Schema + EmbeddedView primitive
- Migration: add due_date columns, dashboard_messages table
- Create the Tasks workspace database (one-time setup, via existing UI)
- Build the `<EmbeddedView databaseId={x} viewId={y} />` component — the foundational primitive
- Create empty `/home` route + layout grid
- Default route switch (Inbox → Home), pending design decision

### Phase 2 — Widgets
- Rotation banner (computed)
- Pinned charts widget (EmbeddedView fed by existing pin store)
- Tasks due widget (EmbeddedView of Tasks workspace database with date filter)
- Projects/Operations/Investigations due widget (hand-coded list)
- Steve's messages widget (with dismiss action)

### Phase 3 — Steve write mechanisms
- MCP tools: `write_dashboard_message`, `list_dashboard_messages`
- Session-start hook integration to write rotation reminders
- One scheduled task to demo: Sunday-night rotation transition message

### Phase 4 — Polish
- Empty states
- Manual refresh
- Visual treatment per taste-skill standards
- Validate in running app

## Post-build: Database Dashboard page

Once Home is live, the existing Database Dashboard page (`/databases`) changes role. Currently it's a blank canvas for pinned charts — a holding pattern before Home existed.

**The new intent:** when a database is selected in the database nav, the Database Dashboard page shows that database directly. It becomes a contextual view of the selected database, not a generic chart pinboard.

This is a scope note, not a block on the Home build. The change is small — the `/databases` route needs to read the selected database from nav state and render it (probably defaulting to the last-used or first saved view for that database). The pinned charts concept migrates fully to Home via EmbeddedView; the `/databases` route stops being about the pin grid and starts being about the active database.

Sequence: build Home → validate → then rework `/databases` route to show the selected database.

## Status

Discussed 2026-04-26. Architecture validated against actual Workspace Databases capabilities — saved views, filter DSL, and view renderers all exist; only the EmbeddedView wrapper is missing. Not scheduled. Two preconditions to lock before build commit: confirmation that Home displaces Inbox as the default route, and Option A vs Option B on pin storage scope.
