# I.1 approval flow — the unit page

Status: **awaiting Adam's approval**. This describes the flow only; no I.1
implementation is authorized by this document.

## Decision

When Adam selects a department or workspace in the sidebar tree, should the
center become its operating page: project rows first, followed by an empty,
pinnable widget board?

## Flow

1. Select a department or workspace in the tree.
2. The existing `/unit/:id` center opens on **Table**. Its header shows the
   breadcrumb, project count, what waits on Adam, and Table / Board / Brief.
3. Each project is one row: project, holder Identity, state, blocker or `—`,
   and what waits on Adam or `—`. Values come from the project's board and
   linked workspace records; no duplicate unit-only state is created.
4. Select a row to open that project room. The unit page keeps its selected
   view when Adam returns.
5. Below the rows is an empty 12-column widget board. Its single empty-state
   action opens the existing database-view picker. A pinned view uses the same
   Home Pins placement model, scoped to this unit rather than Home.
6. Pins can be dragged, resized, opened, refreshed, or removed with the same
   controls as Home. Nothing is pinned by default.

## States

- Loading uses row skeletons in place.
- No projects explains that projects are added from the sidebar tree; it does
  not fabricate sample rows.
- Missing board/record data shows `—`; it does not hide the project.
- A failed source names the source and offers Retry.
- A department aggregates the projects in its workspaces; a workspace starts
  with its direct projects. Nested projects remain inside their owning room.

## Smallest implementation

- Extend the existing `UnitView`; add no route or parallel unit model.
- Derive row fields from current hierarchy, board, and workspace-record reads.
- Reuse the Home grid and pin record shape with one unit scope field.
- Add one focused row-derivation test and one pin-scope test, then run the
  existing project-center, Home-pin, check, test, and smoke gates.

## Acceptance walk

Open a populated workspace, confirm holder/blocker/waits values, open a project
and return, pin one existing view, drag it, remove it, then open an empty
workspace and confirm the teaching state.

Approval authorizes I.1 only. It does not authorize I.2–I.6, a migration,
deployment, publication, or push.
