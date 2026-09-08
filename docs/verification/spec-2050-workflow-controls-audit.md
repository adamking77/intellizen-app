# Spec 2050 workflow controls audit

Date: 2026-09-08

Scope: `src/views/Workflows.tsx` and `src/components/workflows/**`. This was a source and focused-test audit. It did not dispatch work, change workflow records, or alter approval and execution semantics.

## Inventory

- Entry and library: `Workflows.tsx`, `workflow-library.tsx`, `workflow-workspace.tsx`, and `workflow-detail.tsx`.
- Definition editing: `workflow-designer.tsx`, `workflow-composer-canvas.tsx`, `workflow-topology.css`, `workflow-step-card.tsx`, `workflow-step-type.tsx`, `workflow-change-review.tsx`, and `workflow-proposal-preview.tsx`.
- Execution and review: `workflow-run-drawer.tsx`, `workflow-run-pulse.tsx`, `workflow-run-timeline.ts`, `workflow-approval-card.tsx`, `workflow-meanwhile.ts`, and `workflow-presentation.ts`.
- Scheduling and menus: `schedule-sheet.tsx` and the `workflow-action-menu.tsx` compatibility alias to the shared `ActionMenu`.
- The colocated workflow tests were included in the focused verification run.

## Confirmed fixes

- Workflow library cards remain one named button, but their contents now use valid phrasing elements. The previous button contained headings, paragraphs, and a div, which violates the native button content model.
- The workflow outline exposes the selected step with `aria-current="step"` and the selected plane. Terminal nodes use the same flat selected plane; the terminal border and selected outline were removed.
- Outline navigation reveals a selected canvas node instantly after keyboard input and when motion is disabled. Pointer-triggered reveal keeps the existing 160 ms movement.
- Existing schedule rows use a two-column `minmax(0,1fr)` grid with a wrapping control cluster, so names shrink before controls and the row remains usable in a narrow or 200% view. Schedule rows and messages no longer draw bordered filled boxes.
- Run history and the run drawer no longer show elapsed duration or relative elapsed labels. The recorded start is shown as an absolute date and time.
- Workflow editor inputs now inherit the shared 28 px field geometry instead of overriding it with local `h-7` or `h-8` classes. The step insertion and trigger editor reuse their existing surface instead of adding nested borders or fills.
- A disabled Schedule action now explains each cause: unsaved workflow, missing valid saved definition, or unsaved edits.

## Reviewed without changes

- Approval decisions continue to use shared `Choices`; their exact identity, disabled state, error, and receipt behavior were preserved.
- The shared `ActionMenu`, `Control`, `Input`, `Select`, `Textarea`, `Drawer`, and dialog primitives provide the keyboard and focus contracts used here. The workflow alias remains intact.
- React Flow ports, manipulation handles, and zoom controls remain topology controls. The neutral expanded-card outline remains an editing-state cue rather than a selection cue.
- The designer inspector already changes from a side pane to a bounded bottom pane at its container breakpoint. The run drawer already supports a bounded drawer and full-page view.
- Static next-run dates remain factual schedule data. No countdown, interval-driven elapsed label, or automatic escalation was added.

## Verification

`pnpm exec vitest run src/components/workflows`

- 14 test files passed.
- 77 tests passed.
- Added regression coverage for valid workflow-card button content, outline selected state, keyboard-triggered instant canvas reveal, and absence of the removed duration label.

The final repository-wide compiler, bundle, and packaged-app checks remain with the integration owner.
