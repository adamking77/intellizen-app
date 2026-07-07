# Sogo → InteliZen Database UI/UX Porting Plan

## Root Cause Analysis: Why Previous Attempts Failed

Your engineers tried to **copy-paste components wholesale**. This cannot work because the two projects are architecturally incompatible at the surface level:

| Dimension | Sogo (VS Code Extension) | InteliZen (Tauri App) |
|-----------|-------------------------|----------------------|
| **CSS Variables** | `--vscode-editor-background`, `--vscode-focusBorder` | `--mantle`, `--accent`, `--border` (Catppuccin) |
| **State API** | `postCommand({ type: 'update-record', ... })` | `onUpdateField(recordId, fieldId, value)` |
| **Types** | `DBRecord`, `Database`, `Field` from `sogo-db-core` | `WorkspaceDatabaseModel`, `WorkspaceDatabaseField` |
| **Styling** | Raw CSS classes + inline `style={{}}` with vscode vars | Tailwind v4 utility classes |
| **Icons** | Unicode characters (`⧉`, `🗑`, `↗`) | `lucide-react` SVG icons |
| **Backdrop** | Native `<dialog>` element | Hand-rolled fixed overlays |

**The correct approach is UX Pattern Extraction & Adaptation — not component transplantation.**

---

## Strategy: The Adapter Layer Method

Instead of copying files, we will:

1. **Map design tokens** (Sogo's vscode vars → InteliZen's Catppuccin vars)
2. **Identify specific UX gaps** where Sogo is superior
3. **Extract the interaction pattern** (the "how it works") from Sogo
4. **Re-implement the pattern** inside InteliZen's existing component structure, using InteliZen's props/APIs
5. **Create shared primitives** only where genuinely missing

---

## Phase 1: Design Token Translation Layer

Create `src/lib/sogo-adapter.ts` — a mapping reference used during porting:

```ts
// Token map: Sogo vscode variable → InteliZen Catppuccin variable
export const TOKEN_MAP: Record<string, string> = {
  'var(--vscode-editor-background)': 'var(--mantle)',
  'var(--vscode-sideBar-background)': 'var(--base)',
  'var(--vscode-panel-border)': 'var(--border)',
  'var(--vscode-widget-border)': 'var(--border-subtle)',
  'var(--vscode-list-hoverBackground)': 'var(--surface-wash)',
  'var(--vscode-focusBorder)': 'var(--accent)',
  'var(--vscode-button-background)': 'var(--accent)',
  'var(--vscode-button-foreground)': 'var(--crust)',
  'var(--vscode-button-secondaryBackground)': 'var(--surface-1)',
  'var(--vscode-input-background)': 'var(--base)',
  'var(--vscode-input-foreground)': 'var(--text)',
  'var(--vscode-input-border)': 'var(--border)',
  'var(--vscode-descriptionForeground)': 'var(--overlay-1)',
  'var(--vscode-errorForeground)': 'var(--danger)',
  'var(--vscode-badge-background)': 'var(--surface-1)',
  'var(--vscode-badge-foreground)': 'var(--text)',
};
```

This file is reference-only — no runtime dependency.

---

## Phase 2: UX Gap Inventory & Porting Order

### Priority A — High Impact, Clear Gap

#### A1. Table Inline Editing: Click-to-Edit Pattern
**Sogo advantage:** `TableCell` handles display; clicking enters `InlineEditor` edit mode. InteliZen currently renders `<Input>` elements directly in every cell with `onBlur` save — inputs are always visible and feel noisy.

**Target file:** `src/components/database/DatabaseTableView.tsx`
**Work:**
- Extract `TableCell` display component from Sogo's `TableCell.tsx` → adapt to InteliZen types
- Refactor `InlineCell` to be **hidden until clicked**
- On cell click: enter edit mode (show `InlineCell`)
- On blur/Enter/Escape: exit edit mode, show `TableCell`
- Port Sogo's keyboard handling (Escape=cancel, Enter=save, Tab=next)

**Sogo reference:** `packages/extension/src/webview/components/table/TableCell.tsx` + `InlineEditor.tsx`
**InteliZen target:** `src/components/database/DatabaseTableView.tsx` lines 380–502 (renderRow + InlineCell)

---

#### A2. Column Header Property Edit Menu
**Sogo advantage:** Clicking a column header opens a full property editor panel (name, type, options with color picker, delete). InteliZen's `ColumnHeaderPopover` only offers sort/group/hide — no field editing.

**Target file:** New: `src/components/database/primitives/PropertyEditPanel.tsx`
**Work:**
- Port Sogo's `openPropertyMenu` logic from `TableView.tsx` lines 244–336
- Create `PropertyEditPanel` component with:
  - Field name input (auto-save after 160ms debounce)
  - Type `<select>`
  - Options editor with color picker per option
  - Delete field button
- Replace/extend `ColumnHeaderPopover` to include "Edit property" button that opens this panel
- Port Sogo's `OPTION_COLOR_PRESETS` and `PropertyColorButton`

**Sogo reference:** `packages/extension/src/webview/components/table/TableView.tsx` lines 244–714
**InteliZen target:** `src/components/database/primitives/ColumnHeaderPopover.tsx` + new panel

---

#### A3. ConfirmDialog Primitive (Replace window.confirm)
**Sogo advantage:** Has a proper `<dialog>`-based `ConfirmDialog` component. InteliZen uses `window.confirm()` in at least 3 places (PeekPanel delete, Projects delete).

**Target file:** New: `src/components/ui/confirm-dialog.tsx`
**Work:**
- Port Sogo's `ConfirmDialog.tsx` → adapt styles to InteliZen tokens
- Replace all `window.confirm()` calls in database components
- Use InteliZen's existing modal backdrop pattern (see DatabasePeekPanel or modals)

**Sogo reference:** `packages/extension/src/webview/components/shared/ConfirmDialog.tsx`
**InteliZen targets:** `DatabasePeekPanel.tsx`, `DatabaseTableView.tsx`, `DatabaseKanbanView.tsx`

---

### Priority B — Medium Impact, Polish

#### B1. PickerDropdown with Status Grouping
**Sogo advantage:** `PickerDropdown` groups status options into "To-do", "In progress", "Complete" sections. InteliZen's `InlinePillPicker` shows a flat list.

**Target file:** `src/components/database/primitives/InlinePillPicker.tsx`
**Work:**
- Port Sogo's `getStatusSection()` logic and grouped rendering
- Keep InteliZen's existing popover positioning/styling
- Apply to both `InlinePillPicker` and `RecordPickerDropdown`

**Sogo reference:** `packages/extension/src/webview/components/shared/PickerDropdown.tsx` lines 33–124

---

#### B2. Table Row Hover Actions (Primary Cell)
**Sogo advantage:** Hovering a row reveals open/duplicate/delete buttons on the first cell. InteliZen already has this but uses different icons/positioning.

**Target file:** `src/components/database/DatabaseTableView.tsx`
**Work:**
- Compare Sogo's `db-row-actions-inline` pattern (lines 462–495)
- Ensure InteliZen's row actions match Sogo's behavior (appear on hover, stop propagation)
- Already mostly implemented — verify parity

---

#### B3. ViewSwitcher Inline Rename + Add View Menu
**Sogo advantage:** Double-click view tab to rename inline. Click "+" to add view with type picker menu. InteliZen's `ViewTabBar` is 1008 lines — likely has this but verify.

**Target file:** `src/components/database/ViewTabBar.tsx`
**Work:**
- Port Sogo's `ViewSwitcher.tsx` inline rename pattern (lines 51–118)
- Port Sogo's add-view dropdown menu (lines 135–165)
- Adapt to InteliZen's view state management

**Sogo reference:** `packages/extension/src/webview/components/ViewSwitcher.tsx`

---

#### B4. Task Relations Inline Toolbar
**Sogo advantage:** Related tasks section has mini toolbar: +Task, Link existing, Filter, Sort, Fields. InteliZen has `TaskRelationsSection` but may lack this toolbar.

**Target file:** `src/components/database/primitives/TaskRelationsSection.tsx`
**Work:**
- Port Sogo's `TaskRelationCard` toolbar (lines 776–969)
- Add inline create, link existing, filter, sort, field visibility controls
- Port inline table rendering for related records

**Sogo reference:** `packages/extension/src/webview/components/record/PeekPanel.tsx` lines 625–969

---

### Priority C — Low Impact / Already Parity

#### C1. Badge Component
**Status:** InteliZen already has `src/components/database/primitives/Badge.tsx`. Sogo's is simpler. No action needed unless color logic differs.

#### C2. EmptyState / Spinner
**Status:** InteliZen already has these in `src/components/ui/`. No action.

#### C3. SchemaEditor
**Status:** InteliZen's `DatabaseSchemaEditor.tsx` is a side panel with full field editing. Sogo's is an overlay modal. Both are complete — this is a layout preference, not a capability gap.

#### C4. Kanban View
**Status:** InteliZen's `DatabaseKanbanView.tsx` is **more polished** than Sogo's (better shadows, DragOverlay, collapsed column UI). No porting needed.

#### C5. Gallery / List / Calendar Views
**Status:** InteliZen's implementations are visually richer. No porting needed.

#### C6. PeekPanel / Record Editor
**Status:** InteliZen's `DatabasePeekPanel.tsx` is **more feature-complete** than Sogo's (resizable, full-page mode, dnd-kit header reordering, image upload). No porting needed.

---

## Phase 3: Implementation Order (Recommended)

1. **A3 ConfirmDialog** — easiest win, establishes primitive
2. **A1 Table Inline Editing** — biggest UX improvement to most-used view
3. **A2 Property Edit Panel** — closes major gap vs Sogo
4. **B1 PickerDropdown Grouping** — refinement
5. **B3 ViewSwitcher Enhancements** — if gaps exist after inspection
6. **B4 Task Relations Toolbar** — if gaps exist after inspection
7. **B2 Row Hover Actions** — verify parity

---

## Phase 4: Anti-Patterns to Avoid

| ❌ Don't Do This | ✅ Do This Instead |
|-----------------|-------------------|
| Copy Sogo component files into InteliZen | Extract the interaction logic, re-implement with InteliZen props |
| Import `sogo-db-core` types | Map Sogo types to InteliZen's `WorkspaceDatabase*` types inline |
| Use `--vscode-*` CSS variables | Translate to Catppuccin tokens using the adapter map |
| Use `postCommand()` calls | Replace with InteliZen's callback props (`onUpdateField`, `onSaveSchema`) |
| Use Unicode icons (`⧉`, `🗑`) | Replace with `lucide-react` equivalents (`Copy`, `Trash2`) |
| Use raw CSS class strings from Sogo | Convert to Tailwind utility classes |
| Paste Sogo's `styles.css` rules | Extract visual patterns (shadows, borders) and apply via Tailwind |

---

## Appendix: Quick Reference — Sogo File → InteliZen Target

| Sogo Source | InteliZen Target | Action |
|-------------|-----------------|--------|
| `shared/Badge.tsx` | `database/primitives/Badge.tsx` | Verify parity — likely skip |
| `shared/ConfirmDialog.tsx` | `components/ui/confirm-dialog.tsx` (new) | **Port** |
| `shared/EmptyState.tsx` | `components/ui/empty-state.tsx` | Skip — exists |
| `shared/Spinner.tsx` | `components/ui/` | Skip — exists |
| `shared/PickerDropdown.tsx` | `database/primitives/InlinePillPicker.tsx` | **Adapt grouping logic** |
| `table/TableView.tsx` | `database/DatabaseTableView.tsx` | **Extract patterns** |
| `table/TableCell.tsx` | `database/DatabaseTableView.tsx` | **Port display cell** |
| `table/InlineEditor.tsx` | `database/DatabaseTableView.tsx` | **Adapt click-to-edit** |
| `kanban/KanbanView.tsx` | `database/DatabaseKanbanView.tsx` | Skip — InteliZen is better |
| `kanban/KanbanCard.tsx` | `database/DatabaseKanbanView.tsx` | Skip — InteliZen is better |
| `record/PeekPanel.tsx` | `database/DatabasePeekPanel.tsx` | Extract patterns only |
| `record/RecordEditor.tsx` | `database/DatabasePeekPanel.tsx` | Skip — PeekPanel covers this |
| `schema/SchemaEditor.tsx` | `database/DatabaseSchemaEditor.tsx` | Skip — both complete |
| `Toolbar.tsx` | `database/ViewTabBar.tsx` | Extract if gaps found |
| `ViewSwitcher.tsx` | `database/ViewTabBar.tsx` | Extract rename/add patterns |
| `styles.css` | `index.css` | Extract visual tokens only |
