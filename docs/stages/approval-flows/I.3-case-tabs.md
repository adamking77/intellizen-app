# I.3 approval flow — case tabs

Status: **approved 2026-09-04**. Adam approved the remaining Phase I plan and
asked Keel to run it to completion.

## Decision

Should a client-case project become the one place for case work, with Case,
Evidence, and Entities tabs, while the old Intel, Investigate, and Search pages
stop being navigation destinations?

## Flow

1. Select a client-case project in the tree.
2. Its existing project room opens on **Case**. Case carries the current brief,
   scope, phase, hypotheses, notes, and case actions now split between
   `Project`, `Projects`, and `Investigation`.
3. **Evidence** shows the case's signals and linked evidence records. Selecting
   an item opens its existing detail surface.
4. **Entities** shows the people, organizations, objects, locations, and events
   linked to the case. Selecting one opens its existing entity detail.
5. Search remains a command-palette action. The query and result list appear
   in the palette; selecting a case-linked result opens the owning project and
   appropriate tab. It does not navigate to a standalone Search page.
6. New case and new evidence-pile actions start from the tree or palette and
   finish by opening the created project room.
7. Old `/intel`, `/investigate`, and `/search` URLs redirect to the closest
   safe current surface; they are absent from the sidebar and palette targets.

## States

- A case without evidence or entities teaches how those records arrive.
- A project with no linked case keeps the ordinary Brief/Table/Board room; it
  does not show empty case tabs.
- A failed source names that source and offers Retry without blanking the
  other tabs.
- Search results without a case link open their existing record detail rather
  than fabricating a case relationship.

## Smallest implementation

- Extend the existing `ProjectView`; add no parallel case model.
- Move and reuse the required sections from `Investigation.tsx` and
  `Projects.tsx` before retiring their destination routes.
- Reuse current case, signal, entity, graph, and workspace-record reads.
- Reuse the command palette as the Search host; do not build a second search
  service.
- Add route-redirect, tab-selection, and palette-search hand-off tests.

## Acceptance walk

Open a populated client case from the tree, move through Case, Evidence, and
Entities, open one item from each, search for a case item from the palette, and
confirm no sidebar or palette action lands on `/intel`, `/investigate`, or
`/search`.

Approval authorizes I.3 only. It does not authorize I.1–I.2 or I.4–I.6, a
migration, deployment, publication, or push.
