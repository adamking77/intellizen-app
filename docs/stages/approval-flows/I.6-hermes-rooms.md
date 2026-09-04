# I.6 approval flow — Hermes rooms

Status: **approved and implemented 2026-09-04**.

## Decision

Should rooms containing only Hermes profiles use Hermes `groups.*` and its
durable log, while the vendored room engine remains only when a room includes
an ACP member that Hermes cannot seat?

## Flow

1. Open a team or room from the tree or target picker, or create one from the
   existing room sheet.
2. The member picker shows current avatars and labels each member Hermes or
   ACP.
3. A Hermes-only room is created and continued through `groups.*`. Its log,
   mentions, turn order, stops, approvals, and receipts survive app relaunch.
4. Before mixed-room work begins, the implementation probes the pinned running
   Hermes contract with the code open. If `groups.*` can seat ACP members, all
   rooms use it and the vendored engine is removed. If it cannot, only mixed
   rooms use the existing vendored engine.
5. The room surface stays the same whichever door owns it. The door is named
   in muted metadata; users do not manage two copies of a room.
6. Rooms and teams appear in the shared tree and in the panel target picker.
   Selecting one opens its existing durable log.

## States

- Loading rehydrates the durable log before accepting a new turn.
- Offline Hermes names the engine and offers Retry; it does not silently fork
  a local room.
- A mixed room clearly states when the ACP-compatible local door is required.
- A partial turn keeps the durable messages and resumes from the last recorded
  event rather than replaying the whole round.

## Smallest implementation

- First add a contract/parity probe for the exact `groups.*` methods and ACP
  seating capability exposed by the pinned running Hermes.
- Add a room-owner field to the existing room shape and branch its existing
  create, load, send, stop, and approval functions by that owner; add no second
  room store or parallel UI. Keep current group-round logic only for mixed
  rooms if required.
- Reuse the current room sheet, composer, decision handling, avatars, target
  picker, and tree presentation.
- Migrate no room silently; preserve readable local logs until their durable
  successor is verified.
- Add Hermes-only persistence, relaunch replay, mention, approval, and selected
  door tests; retain mixed-room tests only if that door remains.

## Acceptance walk

Create a room with two Hermes profiles, ask one question, relaunch the app and
confirm its log remains; address one member by name; stop and resume a turn;
then inspect a mixed Hermes/ACP room and confirm it uses the one supported door
without duplicating the room.

Approval authorizes I.6 only. It does not authorize I.1–I.5, a migration,
deployment, publication, or push.

## Implementation record

The pinned Hermes source at `src/engine/HERMES_PIN` exposes the required
`groups.*` methods, but its roster validator accepts only local or peer Hermes
profiles. It has no ACP target kind. Hermes therefore owns rooms whose members
all use the gateway; the existing local round engine remains only when any
member uses ACP.

Both doors use the existing room store and room surface. Hermes room events
rehydrate the cached transcript and receipts from sequence zero on launch,
then continue from the durable cursor. A failed rehydrate keeps the cache
readable, disables the composer, names Hermes as offline and offers Retry.
Rooms and unopened teams are listed in the shared tree and target picker;
opening a team reuses its matching room instead of creating a second copy.

Verification covers the pinned method parity, owner selection, exact hosted
roster, relaunch replay, typed message projection, approval identity, mentions,
mixed-room persistence and tree roving behavior. No room migration was run.
