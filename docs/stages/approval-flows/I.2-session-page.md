# I.2 approval flow — the session page

Status: **awaiting Adam's approval**. This describes the flow only; no I.2
implementation is authorized by this document.

## Decision

When Adam selects a session beneath a project in the tree, should the center
show that one session as a large, read-only transcript with its receipts,
instead of opening the project room's Sessions view with a second session list?

## Flow

1. Expand a project in the tree and select a session.
2. The existing project route opens with that session selected. The center is
   the transcript: session title, profile Identity, last activity, message and
   tool counts, then the messages in order.
3. User and assistant turns keep their current transcript treatment. Tool
   events render as tool rows beneath the turn that caused them.
4. Matching `workspace.work_events` render as receipt rows: files written,
   records linked, cards moved, approvals requested, and other recorded work.
5. The transcript is read-only. Continuing the conversation remains in the
   panel or HUD.
6. Selecting the project itself still opens the project room and its Sessions
   view. Selecting another session in the tree replaces the transcript in the
   same center.

## States

- Loading uses transcript skeletons in place.
- A session with no readable messages explains that nothing was recorded.
- Missing receipt correlation does not hide messages; it shows no invented
  receipts.
- A failed message or tool event keeps the failure word and detail.
- A failed transcript source names Hermes and offers Retry.

## Smallest implementation

- Keep `/project/:id?session=<profile:id>`; add no route or session store.
- Reuse `ProjectSessions`, `getHermesSessionMessages`, `Identity`, `ToolRow`,
  and `Receipt`.
- When the tree supplied `session`, render only the selected transcript and its
  page header; do not render the in-room session rail.
- Join read-only `workspace.work_events` only where their payload identifies
  the selected session.
- Add one focused route/render test and one receipt-correlation test.

## Acceptance walk

Select two sessions under one project and confirm each opens as a large
read-only transcript; verify a real tool row and receipt, return by selecting
the project, then open a failed or empty session and confirm its honest state.

Approval authorizes I.2 only. It does not authorize I.1 or I.3–I.6, a
migration, deployment, publication, or push.
