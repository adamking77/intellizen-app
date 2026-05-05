# Home Dashboard Handoff

Updated: 2026-05-05

## What was completed

- `Home` is now a real route at `/home`.
- `/` now redirects to `/home`.
- Home renders pinned database views using the existing pin store.
- Home has its own layout persistence for widget placement.
- `/databases` is no longer a dashboard; it now behaves as a launcher/index page.
- Pinning copy was changed from "Pin to dashboard" to "Pin to Home".

## Files changed

- `src/App.tsx`
- `src/views/Home.tsx`
- `src/views/Databases.tsx`
- `src/components/home/pinned-view-grid.tsx`
- `src/lib/home-dashboard.ts`
- `src/lib/rotation.ts`
- `src/components/layout/sidebar.tsx`
- `src/views/DatabaseEditor.tsx`
- `src/components/database/ViewTabBar.tsx`

## Important product decision

Home is the only dashboard surface.

- Pinned widgets belong on Home.
- `/databases/:id` remains the working surface for a database.
- `/databases` is a launcher, not a second dashboard.

## What was explicitly rejected

Do not build static operational widgets just to show state.

The user called out that an operational widget is not useful unless it is directly usable. That means the next Home widget should be interactive, not just informational.

## Recommended next step

Build an actionable Home widget instead of a passive due-date summary.

Good candidates:

1. A work queue widget with inline actions.
   - Open item
   - Mark status
   - Snooze / set due date
   - Jump to related project / investigation / operation

2. A lightweight Tasks-on-Home flow.
   - Either bootstrap a Tasks workspace database
   - Or provide a fast-add / fast-edit surface that writes into an existing tasks database

3. Steve messages only if they help drive action.
   - Messages should link somewhere actionable
   - Avoid "FYI only" cards as the next build step

## Deferred items

- `due_date` schema additions for `operations`, `projects`, `investigations`
- `dashboard_messages` table
- MCP write tools for dashboard messages
- Rename the Home pin store away from `database-dashboard` naming

## Build status

- `pnpm build` passed after the Home work landed.
- Existing Vite font warnings were present but not blocking.

## Suggested prompt for the next session

"Read `build-plans/home-dashboard-handoff.md` and continue the Home dashboard work. Do not build passive widgets first. Propose and implement the first actionable Home widget."
