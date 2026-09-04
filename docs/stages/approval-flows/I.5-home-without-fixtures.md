# I.5 approval flow — Home without fixtures

Status: **Choice A approved 2026-09-04**. Remove the core rotation banner and
retired presets; preserve every existing pin.

## Decision

What should happen to the rotation banner and the three retired-surface widget
presets currently named Daily Brief, Agent Work, and Roles?

## Choice A — remove them

1. Home opens directly on Adam's actual pinned views and instruments.
2. The rotation banner is removed from core Home.
3. Daily Brief, Agent Work, and Roles are removed from Add widget.
4. Existing pins remain untouched; only the hard-coded suggestions disappear.

## Choice B — move rotation to a plugin

1. Core Home is the same clean, user-pinned board as Choice A.
2. The rotation banner becomes an optional attributed plugin widget.
3. Daily Brief, Agent Work, and Roles are still removed from core presets.
4. Installing or pinning the rotation plugin follows the ordinary plugin
   approval and Home pin flows; nothing is pinned by default.

## Shared states

- No pins shows one teaching action: Add widget.
- Existing database, activity, generated, and plugin pins keep their positions.
- Removing a preset never deletes a view or existing pin.
- No replacement fixture or sample content is introduced.

## Smallest implementation

- Delete the three entries from `home-widget-presets.ts` and update its test.
- Remove the core `currentRotation()` banner from `Home.tsx`.
- For Choice B only, package the same rotation readout through the existing
  plugin widget contract; do not build a new widget system.
- Add one preservation test proving existing pins survive the change.

## Acceptance walk

Open Home with existing pins, confirm their layout is unchanged, open Add
widget and confirm the retired presets are gone, then open an empty Home and
confirm it contains no fixtures. For Choice B, install and pin the optional
rotation widget through the normal approval path.

Approval must name **Choice A** or **Choice B**. It authorizes I.5 only and does
not authorize I.1–I.4 or I.6, deployment, publication, or push.
