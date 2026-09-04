# I.6 approval flow — Hermes rooms

Status: **awaiting Adam's approval**. This describes the flow only; no I.6
implementation is authorized by this document.

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
