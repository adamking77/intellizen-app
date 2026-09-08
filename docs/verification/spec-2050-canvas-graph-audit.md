# SPEC-2050 Canvas and Graph control audit

## Coverage

Reviewed the rendered control paths in `Canvas`, `CanvasEditor`, and `Graph`: page rails and headers; canvas spatial controls; selected-card and selected-connector toolbars; color, shape, border, alignment, background, and snap trays; add-card fields; Graph scope/search; Insight and Construct canvases; node/edge handles; both bottom toolbars; overflow/export actions; Inspect and Controls rail tabs; editing fields, filters, switches, sliders, label density, shortest path, ego network, export, and add-to-document dialogs.

## Confirmed fixes

- Canvas title Escape now cancels without the following blur committing stale React state. A failed rename keeps the typed title available for retry. Save state is announced.
- Canvas global Enter/Delete/Backspace shortcuts no longer edit or delete the spatial selection while focus is in a field, button, link, select, or editable region. Open option trays close on Escape and restore focus to their trigger.
- Canvas toolbar/tray groupings and toggle states are exposed to assistive technology; the add-file/image field has an accessible name; custom controls have a visible keyboard focus ring.
- Graph scope, search, export destinations, ego depth, node-picker search, construct nodes, and connector handles now have explicit accessible names.
- Graph rail tabs use tab semantics, one tab stop, arrow/Home/End navigation, and a labelled tab panel. The duplicate rail close control was removed.
- Graph filters, selection focus, live layout, label density, export destination, and node-picker selection expose their current state.
- Graph toolbars and separators expose their structure. The overflow menu moves focus inside, supports arrow/Home/End navigation, closes with Escape or outside click, and restores focus when the next action does not open a dialog. Async results use `status` or `alert`.
- The Graph switch knob now animates with `transform` instead of the layout-triggering `left` property.
- Document destination loading failures are actionable with an inline Retry control.

## Preserved decisions

Authored Canvas colors, selection outlines, resize/connect handles, compact toolbar geometry, and modal shadow/blur remain intact. The audit did not alter graph/canvas records, delete confirmation, export behavior, approval behavior, or workflow semantics.

## Changed package manifest

- `src/views/Canvas.tsx`
- `src/views/Canvas.test.tsx`
- `src/components/canvas/CanvasEditor.tsx`
- `src/components/canvas/canvas.css`
- `src/components/canvas/toolbar-icon.tsx` (extracted existing icon renderer to stay below the file-size gate)
- `src/views/Graph.tsx`
- `src/components/graph/add-to-document.tsx`
- `src/components/graph/graph-controls.tsx`
- `src/components/graph/graph-entity-presentation.ts` (extracted existing entity presentation constants to stay below the file-size gate)
- `src/components/graph/node-picker.tsx`
- `src/components/graph/node-picker.test.tsx`
- `docs/verification/spec-2050-canvas-graph-audit.md`

`src/components/graph/obsidian-graph.tsx` was reviewed but this package did not add a new edit there.

## Checks

- Focused Vitest: `src/views/Canvas.test.tsx` and `src/components/graph/node-picker.test.tsx` — 13/13 passed.
- File-size gate — passed; `CanvasEditor.tsx` is 1,738 lines and `Graph.tsx` is 3,552 lines.
- `git diff --check` — passed.
- TypeScript `--noEmit` — run after the focused tests; one test-only `requestAnimationFrame` callback typing error was corrected, then rechecked before freeze.

## Remaining native coverage

The final native pass should spot-check 200% toolbar wrapping, Escape/focus return for Canvas background and Graph overflow trays, Graph rail arrow navigation, keyboard selection of a Construct node, native color input, connector dragging, and contrast across the shipped themes. Connector creation remains a spatial drag/pointer action; its handles are named, but this audit did not invent a second keyboard connection workflow.

## Native evidence — d3e bundle

Bundle: `/Users/adamking/projects/genzen-solutions/intellizen-app/src-tauri/target/release/bundle/macos/IntelliZen.app`
Build SHA supplied by the integration owner: `d3e34b11fc2754a4a69d5899b938e6137f1f6e4629899b2795cc29dd7294f4e0`

- Canvas normal layout rendered without control overlap (`/tmp/2050-final-native/canvas-normal.png`). The background tray exposed plain/dots/grid/snap with truthful toggle state. Escape closed the tray and returned focus to **Edit canvas background**.
- `/tmp/2050-final-native/canvas-200.png` is retained as an intermediate zoom capture. Exact 200% was then set from reset using five sequential Tauri zoom increments of 0.2 and captured at `/tmp/2050-final-native/canvas-200-final.png`. The canvas rail doubled from its normal geometry and the compact toolbar wrapped to two unobstructed rows.
- Graph settled in Construct mode with named controls and truthful disabled states (`/tmp/2050-final-native/graph-construct-normal.png`).
- Right Arrow moved the selected Graph rail tab from Inspect to Controls. The controls panel exposed named filters, switches, sliders, path pickers, and **Ego network depth**.
- More moved focus to the first enabled action; Down skipped disabled Tidy layout; Escape closed the menu and returned focus to **More graph actions**.
- Export PNG opened a labelled preview without writing. Cancelling exposed a focus-return defect: focus landed on the document root because the menu item opener had unmounted. The source correction and rebuilt-artifact recheck are tracked separately below.
- Exact Graph 200% used the same reset plus five registered increments and is captured at `/tmp/2050-final-native/graph-200-final.png`. The Graph view and Construct toolbars wrapped without blocking their actions.
- Settings Providers settled successfully at `/tmp/2050-final-native/settings-normal.png`. Down Arrow moved the selected settings tab from Providers to Capabilities. The Appearance accent dialog opened with blue selected; Escape closed it and restored focus to **Choose accent, blue**.
- Settings exact 200% is captured at `/tmp/2050-final-native/settings-200-final.png`; the compact navigation collapsed while Appearance remained readable and scrollable.
- Appearance was restored to Mocha, blue, Calm, Connected, accent strength `0.08`, follow-system off, and agent panel off (`/tmp/2050-final-native/settings-restored.png`). The app was returned to Graph / Bali Cult Connections / Insight at 100% and quit with Command-Q before GUI handoff.

No Canvas/Graph records, documents, definitions, exports, or provider preferences were changed during this review.
