# Settings control audit · 2050

Date: 2026-09-08. Source audit and focused regression pass for the Settings
surface. It covers only `src/views/Settings.tsx` and
`src/components/settings/**`.

## Coverage

| Section | Controls and states reviewed |
| --- | --- |
| Settings navigation | Providers, Capabilities, Plugins, Context, Voice, Activity, Appearance and General tabs; collapsed rail; narrow drawer; tab selection, keyboard navigation and focus return |
| Appearance | System-appearance switch; light/dark selects; seven flavor choices; accent dialog and fourteen swatches; Calm/Clear/Strong segmented choice; Accent Strength range, reset and preview; Connected/Segmented choices |
| Providers | Rescan; Hermes and ACP connection states; connect/disconnect/manage actions; detail disclosure; provider identity icons; loading, unavailable and failure states |
| Capabilities | CLI provider select/search/refresh/disclosures/switches; Hermes profile and availability choices; capability disclosures, unavailable, loading, empty and error states |
| Plugins | Plugin enable/disable; destructive uninstall confirmation; capability metadata; loading, empty and error states |
| Context | Folder chooser; path list; missing-path state; remove action; empty and picker-error states |
| Voice | Dictation and speaking switches; service/model selects; custom service/model/language/API-key fields; local-model lookup failure |
| General | Workspace chooser; launch/reasoning/send switches; Disconnect everything; disabled and error states |

## Corrected source defects

- Settings used tab roles without roving tabindex, arrow navigation or a
  panel-to-selected-tab relationship. The navigation now follows the tab
  keyboard model and keeps focus on the newly selected item.
- Compact settings switches had 19px targets and regular switches 22px. Both
  now retain their small visual thumb while presenting a 28px focusable target;
  the shared global focus rule supplies the accent edge.
- Provider disclosure, provider identity, and folder icons used mixed 12–20px
  sizes and heavy strokes. They now use 16px and 1.5 stroke weight.
- Local legacy `action`, `pill`, `icon-button`, and inset-hover classes bypassed
  the shared control treatment. Settings actions now use `Control`; selected
  filter/profile choices use `aria-pressed` and the selected plane.
- Unavailable Hermes capabilities were rendered with `opacity-45`, dimming
  their name and description. They remain readable and state `Unavailable` in
  words; their switch remains disabled.
- Plugin removal used browser `window.confirm`, outside the app’s modal/focus
  system. It now uses the existing `ConfirmDialog`, including the approved
  modal shadow and blurred scrim.
- The Accent trigger lacked dialog semantics and focus restoration. It now
  exposes its expanded/dialog state, returns focus after close, and uses the
  standard 16px chevron. Pane choice cards wrap at narrow widths instead of
  compressing into clipped controls.
- Dynamic errors now use alert semantics where the control surface owns the
  failure. A failed local voice-model lookup no longer appears as an ordinary
  empty install list.

## Shared primitives not changed

`Control`, `Select`, `Input`, `Segmented`, `AppDialog`, and global token/CSS
rules are shared ownership. The settings changes rely on the global keyboard
focus edge and consume existing disabled and selected behavior. No shared
primitive or `src/index.css` rule was edited in this package.

## Verification

- `pnpm vitest run src/views/Settings.test.tsx src/components/settings/setting-switch.test.tsx src/components/settings/plugins.test.tsx src/components/settings/providers.test.tsx src/components/settings/cli-capabilities.test.tsx`
  — 18 tests passed.
- `pnpm exec tsc --noEmit` — passed.

The tests cover keyboard tab selection/panel association, compact switch focus
geometry, plugin confirmation before removal, provider connection controls,
and CLI capability filtering/persistence/failure presentation.

## Limits

This was source-only: no native window, folder chooser, browser GUI, or
screen-reader tree was operated. Source inspection confirms the Context folder
picker cancellation path always reaches `finally` and clears `busy`; it owns no
local dialog or focus trap. The reported native AX loss after cancelling that
chooser therefore has no matching Settings source path and needs native
reproduction before a product change. Root-owned native verification should
still check narrow Settings navigation, dialog focus restoration, disabled
switch contrast, picker cancellation, and all seven themes at normal and 200%
scale.

## Activity extension

The same source pass reviewed `src/components/activity/**`: the period,
workspace and agent filters; refresh and pin controls; chart display choices;
pin destination dialog; card navigation and disclosure controls; chart
semantics; loading, unavailable and retained-data states; and Pulse inputs.

The refresh and pin icons now use the shared 28px `Control` target, with
names, native keyboard activation, disabled treatment, and dialog state on
the pin trigger. The pin dialog uses the shared quiet cancel and primary
creation controls. Activity rows now state the recorded update date and time
instead of a changing elapsed “ago” value.

The chart style `Segmented` already supplies radio semantics, roving focus,
arrow/Home/End navigation, and immediate keyboard changes. The charts keep
reported, estimated, completed, failed and neutral non-terminal meanings;
they do not substitute missing reports with zeroes. Existing card rows have
real button targets, focus styling through the shared global focus rule, and
their dialogs restore focus to the trigger.

The activity model’s “Waiting on you” label describes a pending user decision.
It is retained as a factual state label; this pass found no need to change its
meaning or the underlying execution state.

Activity verification: `pnpm vitest run
src/components/activity/activity-dashboard.test.tsx
src/components/activity/activity-charts.test.tsx` — 6 tests passed. This
includes pin persistence/retry, chart display persistence and keyboard/reduced
motion behavior, dialog focus restoration, exact-run navigation, and the
static update-time regression.
