# 2050 controls and icons audit

Status: completed. Started 2026-09-08 after Adam requested a systematic audit
of Settings, Canvas, Graph, Docs and Workflows, including icons. This report
records control families and the exact verification limits.

## Contract and scope

The current Desktop/2050-design-system reference is read against the app's
binding DESIGN.md and CLAUDE.md exceptions: compact existing chat geometry,
calm typography, retained modal shadow/blur, contextual toolbars and authored
canvas material. Rail icon metrics do not automatically apply to graph handles,
editor block-type glyphs or visualization marks. Legacy Button variant names
that map to compliant rendered controls are compatibility aliases, not visual
violations. A 28px `h-7` field is not a size violation.

Ponytail full governs each lane. Sol owns Canvas/Graph and Workflow reviews;
Terra owns Settings/Activity; Luna supplied a read-only cross-surface icon
inventory. Keel owns Docs, shared controls, integration and native verification.
No GenZen Build workflow is used.

## Source coverage

| Area | Inventory and disposition |
| --- | --- |
| Settings and Activity | All eight sections, switches, native fields/selectors, accent dialog/swatches, contrast/strength/plane controls, capability disclosures, provider actions, plugin confirmation, chart toggles, filters, pin/status dialogs. See spec-2050-settings-audit.md. |
| Canvas and Graph | Toolbars, modes, rails, inspectors, nodes/edges, selection, searches, export dialogs, context menus, controls and icon families. See spec-2050-canvas-graph-audit.md. |
| Workflows | Library, Canvas/Steps designer, inspector, insertion/type selectors, action menus, schedule, run drawer and approval controls. See spec-2050-workflow-controls-audit.md. |
| Docs | Reports route, folder/search/view rail, New menu, folder form, favorites, document header/menu, title editor, read/edit/focus dock, history selection, proposal choices, attachments/images and graph embeds; BlockNote formatting and block controls. |
| Shared controls | Control/Button, Select/Input/Textarea, Checkbox, Segmented, ActionMenu/ContextMenu, field shells, modal/drawer, focus and icon semantics. |

## Docs and shared corrections

- The Docs header menu and New menu now reuse the existing workflow menu
  implementation, moved into shared `ActionMenu`. Both have named menu semantics,
  first-item focus, Arrow/Home/End navigation, Escape/focus return, disabled-item
  handling, and viewport-bounded placement. Long titles wrap; duplicate action
  labels do not collide as React keys. The workflow export remains an alias.
- The shared Checkbox exposes its keyboard focus on the visible mark and its
  disabled state on that mark. Its native input owns the click target; a span
  wrapper avoids invalid nested labels in Workflow fields. The checked Lucide
  mark uses the normal icon stroke rather than an isolated heavy weight.
- Icon-sized Controls inherit a tooltip from their accessible label unless a
  specific title is provided. Existing action names/callbacks are preserved.
- Docs rows/favorite controls use the defined `--r-ctl` token; `--r-control`
  was undefined. History and proposal selection now expose pressed state.
- Shared AppDialog restores the opening control when its parent unmounts the
  open dialog. Native Schedule dismissal previously returned to the page root;
  the regression test covers the unmount path.
- Editing a document title now shows the shared field hairline and accent
  focus edge. Reading typography and the existing footer layout stay intact.

## Native observations and evidence

The baseline and final native passes used packaged Tauri
WebKit, not a browser preview. Appearance started at Mocha / blue / Calm /
Connected with Accent Strength 0.08 and system appearance off. Temporary view
and theme changes were restored.

The Context folder chooser opened and Cancel dismissed it. Afterwards native
accessibility lost the web content tree; the native menu still responded and a
restart restored inspection. A sampled main thread was idle in its event loop,
not deadlocked. Context source cancellation returns through finally and clears
its busy state. This is recorded as an automation/accessibility interruption,
not a proven application cancellation defect.

### Baseline inspection

The baseline pass inspected every Settings section, Activity filters and Pin
(open/cancel), Docs rail/read/edit/reading-focus and BlockNote block-type menu,
Canvas background tray, Graph Insight and Controls rail, Workflow cards,
Canvas/Steps, expanded role controls, Schedule (open/Escape), and an existing
run with recorded approval details. No records, schedules, approvals, providers,
or document bodies were changed.

The BlockNote Paragraph menu initially failed to appear through automation.
A fresh selected-text/direct-pointer attempt opened all fifteen native menu
options. Escape dismissed it without applying formatting, and Reading was
restored with the original Updated date. No product defect or CSS fix is claimed
for that transient failure. In particular, BlockNote already imports Mantine
Menu/Popover styles; adding a second global stylesheet was rejected.

## Integrated automated verification

- Complete source suite: 181 files / 923 tests passed; one file/test skipped.
- Clean publishing checkout: `pnpm run check` passed (file size, product
  contracts, design rules, TypeScript). Contrast verification passed 145,110
  actual foreground/state pairs across seven flavors, fourteen accents and
  thirty-three strengths; the lowest checked ratio was 4.50.
- Focused publishing suite: 29 files / 131 tests passed, including the compact
  Settings menu: arrow navigation keeps the overlay open and retains focus;
  clicking a destination still closes it.
- Scoped staged diff has no whitespace errors. Bundle secret scan passed.
- Generated frontend verified to contain the visible checkbox focus rule,
  native input hover treatment, and the corrected Settings keyboard branch.

Native verification below determines the assembled-product result; these
checks alone do not claim every interaction was exercised.

## Final native artifact

The local unsigned Tauri package was rebuilt from the current source after
integration fixes. All TypeScript/TSX/CSS under `src` matched the clean publishing
checkout before native review. The final executable SHA-256 is
`b7975e79828edba182bd9b07629ee4b32d1263de78b1bb1216ab722f52463a5b`.
The local package contains the workstation access configuration and is not a
release upload. Publication contains source and verification notes only.

The native reviewer found a Graph-specific menu-to-dialog handoff after the
first final build: PNG export Cancel returned to the page root. Graph now
focuses its saved Export/More opener synchronously when closing the menu,
including the Embed and Clear dialog paths. The package was rebuilt again for
this correction; no other application code changed in that rebuild.

## Final native results and scope limits

- Canvas: normal and 200% controls remained reachable; background options
  exposed state, Escape closed the tray, and focus returned to its opener.
- Graph: settled Insight and Construct; named controls; rail arrows;
  menu arrows/disabled skipping/Escape. On the rebuilt d571 package, PNG Cancel
  and Add to document Escape both returned to More. No export or record write.
- Settings: all eight sections were inspected in the baseline pass; final
  Providers/Appearance and switches/selectors were reviewed in light/dark
  themes. Accent Escape returned focus. At exact 200%, the compact menu stayed
  open through Tab then Down, selected Capabilities, and retained keyboard focus.
- Docs: New opens on Note, Down selects Folder, Escape returns to New. The saved
  document menu exposes template/history/link/delete actions. History selection
  announces its selected state; Escape returns to Document menu. The reading
  surface and footer remained usable at exact 200%. No formatting, template,
  filing, deletion or document save was performed.
- Workflows: Cards/List, Canvas/Steps, role inspector and advanced controls,
  Add step (open/Escape), Schedule (open/Escape), and recorded run history were
  inspected. Schedule Escape now returns to Workflow actions. Steps and its
  footer wrapped at exact 200%; run history showed absolute recorded timestamps
  and no elapsed-duration column. No run, approval, schedule or definition was
  changed.

The bounded native checks used existing data. Destructive actions, provider
connection changes, installed-plugin removal, graph connector creation and
workflow execution were not triggered; their unchanged callbacks/guards and
relevant fixture paths were reviewed. This audit does not claim every live
runtime branch or external integration was exercised.

Keel independently inspected the reviewer’s normal/200% screenshots. Private
native evidence is under `/tmp/2050-final-native/`; it is not published with
source. The Canvas/Graph report records the earlier d3e artifact and its
then-unfixed export-focus result rather than disguising it as final proof.

## Final user correction: remove dock help

Removed both help disclosures at their shared sources: Home Dock (all modes)
and Graph Dock. Removed the same phrase from the room-purpose placeholder.
The project contract records Adam’s instruction so the controls are not added
back. Source search returned zero instances. Home/Dock tests: 17 passed.

The final b797 package was rebuilt after that removal and inspected on Home
(Thinking and Not today) and settled Graph. Neither dock contains the removed
help control. Existing modes, Pulse, left/right dock placement and action
controls remain. Home was left in Not today at 100%, with Mocha / blue / Calm /
Connected / strength 0.08, follow-system off and agent panel off.
