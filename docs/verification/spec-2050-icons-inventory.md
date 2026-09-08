# Spec 2050 icon and shared-control inventory

Date: 2026-09-08
Status: final source dispositions after the Canvas, Graph, Docs, Workflow, and shared-control fixes

## Rules and accepted exceptions

The review used `DESIGN.md`, `docs/stages/design-system-v3.md`, and `docs/verification/spec-2050-controls.md`. Adam’s accepted product overrides remain binding: compact contextual toolbars, authored Canvas colors, lower page headings, tinted database rows, Accent Strength, and shadow/blur on popup modals.

Canvas selection bounds, resize handles, and connector handles are manipulation affordances. Their accent outlines are preserved with the authored Canvas presentation; they are not a forbidden page-list selection style. Graph and Canvas contextual controls may retain compact pill geometry where it communicates a local mode or keeps the spatial canvas usable.

## Final dispositions

### Fixed — Graph control names and state

- The Graph scope select, graph search, export destination selects, ego depth field, node-picker search, Construct nodes, and connector handles have programmatic names.
- Entity filters, selection focus, live layout, label density, export destination, toolbar mode, and node-picker choices expose their current state.
- Async Graph results use `status` or `alert` semantics.

Source: `src/views/Graph.tsx`, `src/components/graph/node-picker.tsx`, and `src/components/graph/graph-controls.tsx`.

### Fixed — Graph rail and overflow keyboard behavior

The Inspect/Controls rail uses a labelled `tablist`, `tab`, `aria-selected`, `aria-controls`, one tab stop, and Arrow Left/Right/Home/End navigation. The panel is labelled by its active tab. The duplicate rail close action was removed.

The bottom action menu now moves focus to its first enabled command, supports Arrow Up/Down/Home/End, closes with Escape or outside click, and restores focus to the actual opening control when the selected command does not open a dialog.

### Preserved — Graph and Canvas contextual geometry

The Graph dock, rail controls, Canvas toolbars, color swatches, and topology handles retain their compact contextual geometry. Their semantics and visible focus behavior were corrected without forcing shared page-control dimensions onto spatial authoring tools. The Graph switch knob now moves with `transform` instead of animating `left`.

### Fixed — Canvas cancellation, shortcuts, and tool state

- Escape cancels a Canvas title edit without blur committing the cancelled value. Failed renames retain the typed title for retry.
- Enter/Delete/Backspace spatial shortcuts do not fire while focus is in an input, select, button, link, or editable region.
- Canvas option trays close on Escape and restore focus to the opener.
- Contextual toolbar groups, expanded trays, selected options, background choice, snap state, add-file/image field, and save status expose their meaning and state. Custom controls have a visible focus treatment.

The selected-node accent bound remains because it identifies the node currently available for resize, edit, and connector manipulation. Authored node colors are unchanged.

### Fixed — Docs and Workflow source findings

- The Docs rail uses the defined control radius token; the earlier `--r-control` reference is gone.
- The Workflow terminal selection override that used a separate terminal outline is gone from the final topology CSS.
- A Tailwind `h-7` utility resolves to 28px and was never evidence of a height defect. The preliminary finding that grouped `h-7` and `h-8` as one failure was incorrect.

### Preserved — legacy Button aliases

`Button` still accepts compatibility names such as `outline`, `ghost`, and `accent-outline`, but maps them to the shipped `Control` variants. This is API migration debt, not a visual or usability defect, and it does not require a product-facing change in this milestone.

## Inventory and coverage

The source pass covered shared UI controls and the rendered control paths for Settings, Canvas, Graph, Docs, and Workflows. The detailed Canvas/Graph inventory includes page rails and headers; spatial controls; selected-card, selected-connector, Construct, and Graph view toolbars; option trays; scope/search; Graph nodes and connections; overflow/export; Inspect/Controls; filters, switches, sliders, density, path, ego, and document export.

The implementation record and native follow-ups are in `docs/verification/spec-2050-canvas-graph-audit.md`.

## Remaining native evidence

The final native review should verify behavior rather than reopen the settled source design: Canvas tray Escape/focus return, Graph rail arrow navigation, Graph action-menu focus/Escape, 200% toolbar wrapping, Construct node keyboard selection, connector dragging, native color input, and shipped-theme contrast. Connector creation remains a named spatial drag action; this milestone did not add a second keyboard graph-construction workflow.
