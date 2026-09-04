# I.1 approval flow — the unit page

Status: **approved by Adam on 2026-09-04**. Workspace-first scope only;
department dashboards and project dashboards remain deferred.

## Decision

When Adam selects a workspace in the sidebar tree, its operating page always
offers **Projects** and **Dashboard**. Dashboard exists even when empty; adding
the first widget does not create a separate dashboard object.

## Flow

1. Select a workspace in the tree.
2. The existing `/unit/:id` center opens on **Projects**. Its header shows the
   breadcrumb, project count, and Projects / Dashboard.
3. Each project is one row: project, holder Identity, state, blocker or `—`,
   and what waits on Adam or `—`. Values come from the project's board and
   linked workspace records; no duplicate unit-only state is created.
4. Select a row to open that project room. The unit page keeps its selected
   view when Adam returns.
5. Select **Dashboard** at any time, including before a widget exists. Its
   empty-state **Add widget** action opens a picker of current database views.
   A pinned view uses the existing Home Pins placement model, scoped to this
   workspace rather than Home.
6. Pins can be dragged, resized, opened, refreshed, or removed with the same
   controls as Home. Nothing is pinned by default.

## States

- Loading uses row skeletons in place.
- No projects explains that projects are added from the sidebar tree; the blank
  Dashboard remains available and does not fabricate sample content.
- Missing board/record data shows `—`; it does not hide the project.
- A failed source names the source and offers Retry.
- Departments retain their current hierarchy/list views in this slice. A
  workspace starts with its direct projects. Nested projects remain inside
  their owning room.

## Smallest implementation

- Extend the existing `UnitView`; add no route or parallel unit model.
- Derive row fields from current hierarchy, board, and workspace-record reads.
- Reuse the Home grid and pin record shape with one scope value inside existing
  pin config; missing scope continues to mean Home. No migration.
- Add one focused row-derivation test and one pin-scope test, then run the
  existing project-center, Home-pin, check, test, and smoke gates.

## Acceptance walk

Open a populated workspace, confirm holder/blocker/waits values, open a project
and return, switch to Dashboard, confirm its blank state, open Add widget, pin
one existing view, drag it, remove it, then confirm the Dashboard tab still
exists after the final widget is removed.

Approval authorizes I.1 only. It does not authorize I.2–I.6, a migration,
deployment, publication, or push.
