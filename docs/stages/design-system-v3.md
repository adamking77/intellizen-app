# Design system v3 — the one control kit

Written 2026-09-04 from Adam's review of the direction studies and the
"IntelliZen Room Views" prototype. This file is the complete brief for the
front-end design-system change. A cold agent should be able to read this file,
`DESIGN.md`, and the code it names, and run every work package below to
completion without asking a question that this file could have answered.

Status: **approved by Adam 2026-09-04.** The rules in "Binding rules" are his.
Where this file and `DESIGN.md` disagree, this file wins until `DESIGN.md` is
amended in work package K.8, after which they must agree.

**Database correction, Adam 2026-09-04:** the Databases workspace and its
table, list, board, gallery, calendar, timeline, chart, and record-panel designs
were already approved. K.7 must not restyle them. Their Sogo-parity controls,
compact row radius, neutral selection, and resizable/full-page record panel are
a scoped exception to the kit migration.

Prototype (the visual reference for every rule below):
`https://claude.ai/code/artifact/d0ad8810-8d17-433b-b45b-6cf3981c98ad`.
Direction studies with the Docs and Workflows pages and the Pinterest pass:
`https://claude.ai/code/artifact/6d8fa88b-87f8-4a78-8431-f902376b8850`.
Kept reference images: `design/references/pinterest-2026-09-04/`.

## Binding rules

1. **Selection is the selected plane.** Never a border, an outline, a ring, a
   glow, a bar, or an inset border. Not on rows, controls, cards, nodes,
   tabs, or swatches other than the colour swatch exception in `DESIGN.md`.
   Keyboard focus is the one visible exception and shows only on
   `:focus-visible`, never on click.
2. **Two radii and a pill.** `--r-plane` 12px for the rail, work, panel,
   drawer, palette and dialogs. `--r-ctl` 8px for every control, field,
   select, button, card, board card, builder node, widget, message bubble and
   decision field. `--r-pill` full round for state pills only. Nested
   elements step in by padding, never by a smaller radius.
3. **One height.** Controls and fields are 28px. Tree and list rows are
   26px. Table lines are 32px. Nothing interactive is sized by its content
   alone.
4. **One hover, one selection.** Hover is a 6% text wash. Selection is the
   selected plane with 450 weight and full-strength text. A selected thing
   that is hovered lifts to the selected-hover plane, never back down to the
   wash.
5. **Borders mean two things:** editable now, or failed. A field shows a
   hairline only while focused for editing. A failed thing shows a failure
   hairline with a word. Nothing else has a border. Containers separate by
   plane, hairline gap, tint or space.
6. **Nothing persistent has a shadow.** The drawer, the command palette,
   dialogs, menus and the ejected HUD are transient and take the one
   transient shadow. Everything else is flat.
7. **Colour is a word.** Every state pill, ring, dot and field carries its
   label in text. The accent never touches semantic colours.
8. **The HUD is only the ejected panel reduced.** No docked strip inside the
   window, ever.
9. **Consistency beats layout.** A page may not introduce a control, a
   radius, a height, or a hover that is not in this file.

## 1. Tokens

All changes are in `src/index.css` unless stated. Flavor blocks live at
`:root[data-flavor="…"]` (lines 35 to 225 today); shared tokens follow them.

### 1.1 Radius

Today: `--r-plane: 12px`, `--r-row: 4px`, `--r-msg: 10px`, `--r-pill: 999px`
(`src/index.css:301-304`). Usage in `src/`: `--r-row` 161, `--r-plane` 63,
`--r-msg` 10, `--r-pill` 158, plus 442 bare Tailwind `rounded` and one
`rounded-none`.

After:

```css
--r-plane: 12px;   /* rail, work, panel, drawer, dialog, palette */
--r-ctl: 8px;      /* every control, field, card, node, bubble, widget */
--r-pill: 999px;   /* state pills only */
```

`--r-row` and `--r-msg` are removed. Codemod: every `var(--r-row)` and
`var(--r-msg)` becomes `var(--r-ctl)`; every bare `rounded` on an interactive
or card element becomes `rounded-[var(--r-ctl)]`; `rounded` on a plane
becomes `rounded-[var(--r-plane)]`. Avatars and dots stay `rounded-full`.
Badge (`src/components/ui/badge.tsx`) moves from `--r-row` to `--r-ctl`.
Buttons (`src/components/ui/button.tsx`) move from `--r-pill` to `--r-ctl`;
a button is never a pill. Status pills (`src/components/ui/status-pill.tsx`)
keep `--r-pill`.

### 1.2 Heights

```css
--h-ctl: 28px;   /* controls, fields, selects, segmented */
--h-row: 26px;   /* tree rows, list rows, menu items */
--h-line: 32px;  /* table lines */
```

Today `src/` uses `h-7` 14 times, `h-8` 34, `h-9` 45, `h-10` 6, `h-11` 1 on
controls. All become `h-[var(--h-ctl)]`. Button sizes collapse to one height;
the `size` prop keeps only horizontal padding variants (`sm` 10px, `default`
12px, `icon` square). Select sizes `xs`, `sm`, `default`
(`src/components/ui/select.tsx:15-17`) collapse to one.

### 1.3 Selection, in lightness not percent

Today `--selected: var(--raised)` and `--selected-hover` is a 4% text mix
(`src/index.css:4829-4836`). Adam finds it washed out on dark flavors. The
cause: a percentage mix of text into raised moves lightness a lot on light
flavors and very little on dark ones, and almost none on OLED.

After: the selected plane is the raised plane shifted by a fixed step of
perceptual lightness. The step is signed per flavor (lift on dark, sink on
light), so the same number means the same thing everywhere.

```css
:root {
  --sel-step: 0.08;               /* written by the Appearance slider, 0.04 to 0.14 */
  --sel-dir: 1;                   /* dark flavors lift */
  --sel-chroma: 0.02;             /* accent chroma added on dark only, scales with step */
  --selected: oklch(from var(--raised)
                calc(l + var(--sel-dir) * var(--sel-step))
                calc(c + var(--sel-chroma) * (var(--sel-dir) + 1) / 2)
                h);
  --selected-hover: oklch(from var(--raised)
                calc(l + var(--sel-dir) * (var(--sel-step) + 0.03))
                calc(c + var(--sel-chroma) * (var(--sel-dir) + 1) / 2)
                h);
}
:root[data-flavor="latte"],
:root[data-flavor="flat"] { --sel-dir: -1; }
```

Notes for the implementer:

- Relative colour syntax (`oklch(from …)`) is supported by the WKWebView the
  app ships in on macOS 14 and later. Verify once in `pnpm tauri dev` on
  Adam's Mac; if the footer reads a flavor correctly and a tree row selects,
  it works. Do not add a JS fallback unless it fails.
- The hue of the selected plane should be the accent's hue on dark flavors,
  so the chroma reads as "yours". Implement by mixing: `--selected` on dark
  is `color-mix(in oklch, <lifted raised> , var(--accent) calc(var(--sel-step) * 60%))`.
  On light flavors add no accent. Keep the lifted-raised form above as the
  base and apply the mix on top; the result must still pass the floor below.
- **Floor per flavor.** The selected plane must sit at least 0.06 OKLCH
  lightness from its ground (`--base` for rows and tables, `--raised` for
  cards). OLED's raised plane is near black, so at the smallest slider value
  clamp the step to the floor. Implement as `max(var(--sel-step), 0.06)`.
- Muted text on the selected plane must still score at least 4.5:1. Check
  every flavor at the slider's strongest value (0.14) with the script in
  section 8.

### 1.4 Hover and focus

```css
--hover: color-mix(in srgb, var(--text) 6%, transparent);        /* dark */
--hover: color-mix(in srgb, var(--text) 8%, transparent);        /* latte, flat */
```

Hover is applied as an inset `box-shadow` of the wash on elements whose
`background` is set inline, and as `background` on components with their own
class, per `DESIGN.md`. Selected elements do not take the wash; they take
`--selected-hover`.

Focus: keep the existing `:focus-visible` outline (`src/index.css:1303-1311`).
Remove every `focus:` class that draws a border or shadow on click:
`src/components/ui/select.tsx:10` (`focus:border-…`),
`src/components/home/pinned-view-grid.tsx:271` (`focus:border-[var(--accent-border)]`),
and any other `focus:border` or `focus:ring` found by the audit script.

### 1.5 Borders

Remove `border border-[var(--border)]` from containers, cards and controls.
Today `src/` has 192 matches for `ring-`, `outline-`, `border-l-` and
`border border-[`. After this package, the only borders allowed are:

- a field while focused for editing: `1px solid var(--line-strong)`;
- a failed thing: `1px solid color-mix(in srgb, var(--failure) 40%, transparent)`
  with a failure word beside it;
- the colour swatch's double inset ring, per `DESIGN.md`;
- the workspace tree's drop-target indicator while dragging.

Dashed borders are removed everywhere, including
`src/components/ui/empty-state.tsx:12` and
`src/components/ui/query-state.tsx:94`.

### 1.6 Shadows and motion

Unchanged from `DESIGN.md`: `--shadow-elevated` only on transient surfaces;
`--t-fast` 90ms, `--t-base` 120ms, `--t-slow` 200ms, `--ease`
`cubic-bezier(.22,.61,.36,1)`. The drawer uses `--t-slow`. View switches
fade in 160ms with a 3px rise; both respect `prefers-reduced-motion`.

## 2. The Appearance slider

File: `src/components/settings/appearance.tsx`. Beside the accent picker
(the fourteen swatches, lines 45 to 120), add one row:

- Label "Selection strength", section-caps style like the other labels.
- A native `<input type="range">` styled to the kit (28px track height area,
  8px thumb radius, accent thumb), min 0.04, max 0.14, step 0.01, default
  0.08.
- A live preview to its right: three rows in the current flavor and accent,
  one plain, one hovered, one selected, using the real `.nav-node` classes.
- The value is written to `--sel-step` on `document.documentElement` and
  stored under `intelizen:selection-strength` through the same
  `readPreference` / `writePreference` helpers `src/lib/theme.ts` uses. It is
  applied at boot in `applyTheme` (`src/lib/theme.ts:144`) and on change;
  `THEME_CHANGED_EVENT` fires so the avatar hue listener in
  `src/components/agents/avatar.tsx` keeps working.
- Reset link "Default" beside the slider sets 0.08.

The slider is the only place intensity is set. Remove nothing else; there is
no other intensity control in the app today.

## 3. The control kit

Twelve components. Each lives in `src/components/ui/` and is the only way to
draw that thing. Anatomy is fixed; content varies.

| Kit component | File (new or changed) | Replaces |
|---|---|---|
| Control | `control.tsx` (new) | `button.tsx` variants primary, secondary, outline, ghost, selected, accent-soft, accent-outline, destructive |
| Segmented | `segmented.tsx` (new) | ad hoc tab rows in Graph (Insight/Construct), Docs, Workflows lanes, Appearance panes |
| Field | `input.tsx`, `textarea.tsx` (changed) | same |
| Select | `select.tsx` (changed) | same |
| Card | `card.tsx` (new) | board cards, builder nodes, widget frames, drawer sections, `metric-cell.tsx` |
| Pill | `status-pill.tsx` (changed), `badge.tsx` (folded in) | Badge's outline and coloured variants |
| Identity | `identity.tsx` (new) | `agents/avatar.tsx` wrappers in rows, bubbles, receipts |
| Decision field | `decision-field.tsx` (new) | `agent/decision-card.tsx` and the workflow approval banner |
| Receipt and tool row | `receipt.tsx` (new) | tool rows in `agent-turn.tsx`, session rows in `project-sessions.tsx` |
| Drawer | `drawer.tsx` (new) | `database/DatabasePeekPanel.tsx` chrome, the workflow `?run=` detail, card detail |
| Skeleton | `skeleton.tsx` (new) | every centred `Loader2` |
| Empty state | `empty-state.tsx` (changed) | dashed box; `query-state.tsx` error and empty branches |

### 3.1 Control

- Height `--h-ctl`, radius `--r-ctl`, padding 0 10px (sm) or 0 12px
  (default), 12.5px Geist, gap 6px, `white-space: nowrap`.
- Variants: `default` (raised plane, text), `selected` (selected plane,
  strong text, 450), `primary` (`--go-bg` / `--go-fg`), `quiet` (transparent,
  muted text), `danger` (failure tint 18%, failure text). No outline
  variants. No accent-border variants.
- States: hover wash; selected as above; `:focus-visible` outline; disabled
  at 45% opacity with no hover; loading shows a 6px running dot before the
  label and disables.
- `Button` becomes a thin alias of Control so call sites migrate in place.
  Grep count to migrate: `variant="outline"` and `variant="ghost"` call
  sites map to `quiet`; `secondary` maps to `default`; `accent-soft` and
  `accent-outline` map to `primary` or `default` by intent (a primary action
  is the one thing on the surface the user came to do).

### 3.2 Segmented

- A track on the crust plane (raised on light flavors), radius `--r-ctl`,
  2px inner padding, 2px gap, height `--h-ctl`. Children are Controls with
  transparent ground; the selected child takes the selected plane.
- Roving keyboard: arrows move, Home and End jump, the selected child is the
  one tab stop. `role="tablist"` when it switches views, `role="radiogroup"`
  when it sets a value.
- Used by: the room's view switcher, the flavor picker, Panes, Insight and
  Construct, Read and Edit, Workflows lanes, Search modes.

### 3.3 Field and Select

- Height `--h-ctl`, radius `--r-ctl`, on the crust plane (`--input`), white
  on light flavors, no border at rest. While focused for editing, a hairline
  `--line-strong`. Placeholder in `--dim`. Leading icon slot at 14px.
- Select strips `appearance` and draws its chevron in `--dim`, as today.
- Textarea shares the same rest and focus treatment with auto height.

### 3.4 Card

- Raised plane, radius `--r-ctl`, padding 9px 11px, hover wash, selected
  plane when selected. Title line in strong text; meta line in `--dim` at
  11px; an optional Identity at the foot. A card that waits on you takes a
  10% waiting tint over raised; that is the only coloured card.
- Nested content (chips, selects, fields inside a builder node) uses the same
  radius and steps in by padding.

### 3.5 Pill

- Radius `--r-pill`, 11px text, 1px 8px padding, 16px line height, muted
  text on raised. Semantic variants: `waiting` (waiting tint 18%, waiting
  text), `verified`, `failure`, `runtime` (text colour only). A pill always
  carries a word; icon-only pills are forbidden. Pills are never clickable.
- `Badge` is deleted; its call sites become Pill or plain text.

### 3.6 Identity

- 16px avatar (agent hue, initial), name, then a `runtime` Pill. Three
  kinds: Hermes profile, ACP agent (with model after a dot when known), you.
  Used in table lines, cards, bubbles, receipts, the panel header, the drawer.

### 3.7 Decision field

- Radius `--r-ctl`, waiting tint 10% over the surface, padding 11px 13px,
  two columns: text and choices. Caps label "Waiting on you" in waiting
  colour; the question in strong text; a one-line "why" in muted. Choices are
  Controls, the recommended one `primary`. It is the only filled peach in
  the app and it sits at the top of the room, the top of a card in the
  drawer, and the top of a turn. It is not a modal and never a toast.

### 3.8 Receipt and tool row

- Mono 11px. Tool row: 6px dot (verified green settled, muted running,
  failure red failed) then `tool · detail · duration`. Receipt: verb in
  muted (`wrote`, `moved`, `asked`, `linked`), object in dim, indented 14px
  under the turn that did it.

### 3.9 Drawer

- A transient plane, 320px wide, over the work pane only, never over the
  panel or the rail; radius `--r-plane`, the transient shadow, 200ms slide
  from 24px right with a fade. Escape closes; focus returns to the opener.
  Header: caps kind line, title, Identity. Body: key-value grid, optional
  Decision field, sections. Foot: Controls (Move to, Reassign, Open in
  Table, Open session).
- Opens for: a board or table card, a session row, a decision, a database
  record (replacing `DatabasePeekPanel`'s chrome; keep its field editors as
  the body), a workflow run.

### 3.10 Skeleton

- Rows of `--raised` bars at the height and width of the content that will
  arrive, in the place it will arrive, with a 1.4s sheen that stops under
  `prefers-reduced-motion`. Never a centred spinner. `Loader2` is removed
  from all views; the only spinner left is the 6px running dot in a Control
  or a tool row.

### 3.11 Empty state

- Left-aligned in the content area, no box. One sentence about what would
  appear here and the one Control that makes it appear. Failure is a
  separate component: a sentence in failure colour that names the cause and
  one Control that opens the fix (Settings, Retry). Loading, empty and
  failed are never the same shape.

### 3.12 Page header

- Title in caps as today, breadcrumb in dim, then one line of state (a
  count, "2 changed today") and, at the right, what waits on you in waiting
  colour, then the view switcher if the page has views, then at most one
  primary Control. Nothing else. Search and filters live in the list or
  table they filter.

## 4. The eight consistencies

Each is a rule with a place and an acceptance check.

1. **Records are rows, not label stacks.** Any record shown inside a widget,
   a peek or a drawer list is one line: title, Identity, state Pill, one
   meta value. Fields open in the drawer. Check: no Home widget renders a
   vertical label-value list for a record.
2. **Loading is a skeleton in place.** Check: `grep -rn Loader2 src` returns
   only `control.tsx` and `receipt.tsx`.
3. **Empty states teach and are never dashed boxes.** Check: `grep -rn
   border-dashed src` returns nothing; every empty state has a sentence and
   at most one Control.
4. **Selection carries a mark.** The tree row and list rows selected state
   appends a chevron; table lines and cards do not (the plane is enough
   there because their context is not a list of peers). Check: `.row.sel`
   renders `›`.
5. **Attribution on every unit of work.** Cards, table lines, turns,
   receipts, runs and sessions show an Identity. Check: no card or line
   without one unless the holder is genuinely unassigned, which shows "—".
6. **The decision field has one shape and one place.** Check:
   `decision-field.tsx` is the only component that uses the waiting tint as
   a fill.
7. **Receipts as mono lines under the thing that did them.** Check: every
   agent turn with tool events renders Receipt rows; the session page and
   drawer render them too.
8. **Page headers carry state.** Check: every view under `src/views/` uses
   the Page header from 3.12; no header contains a search field.

## 5. Surfaces this round touches

### 5.1 The room and its view switcher

`src/views/Project.tsx`, `src/views/Unit.tsx`, `src/components/project/*`.
The header gets a Segmented with the views the material offers. Defaults:

| Material | Opens as | Other views |
|---|---|---|
| Department or workspace | Table of projects | Board by state, Brief rollup |
| Client case | Brief | Table (evidence), Board, Graph, Timeline |
| Venture, publication, relationship research | Brief | Table, Board, Canvas |
| Session | Page (transcript with receipts) | Table (tool calls) |
| Document | Page | Read, Edit |
| Database | Table | Board, Gallery, Calendar, Timeline, Chart |
| Workflow | Steps | Graph, Runs, Schedule |

The chosen view is remembered per node under `intelizen:view:<node-id>`.
The Brief, Table and Board views show the Decision field at the top; Graph,
Timeline and Session do not. The drawer is the detail surface for all of
them. The Brief's lines per project kind are a small template each; write
the client-case one first from the prototype and leave the other three as
the same lines minus the stage strip until Adam reviews them.

### 5.2 Docs

`src/views/Reports.tsx` (782 lines). The list rail becomes a drag handle
between 180 and 480px, remembered under `intelizen:docs-rail`, hidden by
`⌘\`. The list groups by project from the hierarchy, with "Waiting on you"
(documents with pending proposals) first, then Unfiled, then Templates.
Search and New sit at the top of the list. The header is breadcrumb, save
dot (verified green saved-and-in-vault, muted saving, failure red failed
with a word on hover), "Editing · ⌘E to read" or "Reading · ⌘E to edit",
and a menu (Save as template, History, Delete). The page is the document:
title, one provenance line in plain words ("You wrote it · Fiona edited 41m
ago · linked to Case record"), the proposals strip at the top when edits are
pending, then the body with no box. The type filter, venture scope, count
line and the graph-above-title arrangement are removed.

### 5.3 Workflows

`src/views/Workflows.tsx` (903 lines), `src/components/workflows/*`. The
page opens on one Table: workflow, runs as (Identity), last ran, result
(Pill), next, and a Run Control. Draft rows say Finish and open the builder.
A Decision field at the top shows any run needing approval. Under the
selected row, a Segmented: Runs, Steps, Schedule, Source. Runs is a Table
with receipts. Steps is the builder: a palette of the five step kinds
(`role-assign`, `condition`, `approval`, `artifact`, `decision` from
`src/schemas/workflow-v1.schema.json`) on the left, a vertical list of Cards
in the centre, each card editing its fields in place with kit Selects and
chips, a plus between cards, yes and no branches drawn under a condition.
The existing React Flow topology (`workflow-topology.tsx`) becomes the
Graph view of the same definition, read-only. Schedule is the Hermes cron
form with pause and resume (round-2 G.5). Source shows the SOP text, owner
role and canonical record link. SOP-only records leave this page for Docs
with a "Make runnable" action. "Draft with an agent" opens the panel scoped
to the workflow; the agent writes the definition through the MCP tools
`get_workflow_definition` and `validate_workflow`; Save stays with the user.

### 5.5 Layout moves approved 2026-09-04

K.9 **The tree is the sidebar.** `src/components/layout/sidebar.tsx`,
    `workspace-tree.tsx`. The hierarchy takes the whole rail. The eight page
    links (Home, Databases, Docs, Graph, Canvas, Workflows, Agents,
    Settings) move into one "Places" group at the foot of the rail, text
    only, 26px rows, with `⌘1` to `⌘8` in tree order and the shortcut shown
    in dim at the right of each row. The footer engine line stays beneath.
    The collapsed rail keeps its icon column for Places (the one place icons
    are allowed, per Adam's 2026-09-02 rule). *Open it: the tree fills the
    rail; `⌘3` opens Docs.*
K.10 **Follow macOS appearance.** `src/lib/theme.ts`,
    `src/components/settings/appearance.tsx`, `src-tauri/src/lib.rs` for the
    theme-changed event. Appearance gains "Follow system": when on, the user
    picks one light flavor and one dark flavor (defaults Flat White and
    Mocha) and the app switches with the OS. Accent and selection strength
    are shared. When off, behaviour is as today. Listen to Tauri's window
    theme change event and `prefers-color-scheme`; apply without a reload.
    *Open it: change the Mac's appearance, the app follows.*
K.11 **Real traffic lights.** `src-tauri/tauri.conf.json`,
    `src/components/layout/window-chrome.tsx`, `sidebar.tsx`. Switch the
    main window from drawn buttons to macOS's own: `titleBarStyle:
    "Overlay"` with `hiddenTitle: true`, `decorations: true`. Remove the
    drawn lights and their handlers; keep custom drag regions and the eight
    resize edges. The rail's top strip leaves the first 78px clear. The
    ejected panel window keeps its current chrome. Verify the lights
    behave: hover glyphs, double-click title zoom, fullscreen. *Open it:
    the lights are Apple's.*
K.12 **Continuity motion.** `src/index.css`, `src/lib/view-transitions.ts`
    (new), `drawer.tsx`, `segmented.tsx`, the room view switcher. Use the
    View Transitions API (`document.startViewTransition`) for: view
    switches in the room (crossfade 160ms), the drawer opening from a row or
    card (the row's plane grows into the drawer, 200ms), and the segmented
    control's selected plane sliding between children (120ms). Transforms
    and opacity only; `--ease`; all off under `prefers-reduced-motion` and
    when the API is missing (feature-detect, never polyfill). No page-load
    choreography. *Open it: click a row, it becomes the drawer.*
K.13 **Activity page and instrument widgets.** `src/views/Settings.tsx`
    (new section), `src/components/settings/activity.tsx` (new),
    `src/components/home/instrument-widget.tsx` (new), the MCP
    `pin_view_to_home` contract. Settings gains an Activity page that reads,
    never records: per agent (sessions today and this week, tokens and cost
    from `session.usage`, average turn time, tool calls, failures); per
    engine (Hermes connected time, ACP agents reachable, last restart);
    work (cards moved, documents written, proposals accepted or rejected,
    decisions answered and their wait time, workflow runs and outcomes,
    from `workspace.work_events` and Hermes cron runs); attention (what
    waits on you now and for how long). Every row has a Pin control that
    writes an ordinary view into the Home Pins database, so a pinned stat
    is draggable, unpinnable and visible to agents like any pinned view.
    The instrument widget is one tabular figure, its word, a sparkline, and
    colour on the value only when it carries meaning. **Nothing is pinned
    by default.** *Open it: pin "waits on you" to Home, see it update.*

Estimates: K.9 half a day, K.10 half a day, K.11 half a day, K.12 one day,
K.13 one day. K.9 and K.11 touch `sidebar.tsx`; run K.11 after K.9.

### 5.4 Everything else

Home widgets, Databases, Agents, Settings and the panel adopt the kit
through the primitives; no layout change beyond what section 4 requires.

## 6. Work packages

Disjoint file ownership. K.1 first; K.2 to K.6 and K.10 to K.13 in parallel
after it; K.9 then K.11 after K.4 (they share `sidebar.tsx` and
`workspace-tree.tsx`); K.7 and K.8 last. Each package ends green on `pnpm check`, `pnpm test`, and the
audit script in section 8, with screenshots in all seven flavors of the
surfaces it touched, saved under `docs/verification/design-system-v3/`.

K.1 **Tokens and the slider** (about half a day). `src/index.css`,
    `src/lib/theme.ts`, `src/components/settings/appearance.tsx`,
    `scripts/check-design-system.mjs` (new, section 8). Radius collapse with
    codemod, heights, selection in lightness with floor and accent chroma,
    hover, focus cleanup, the slider. Commit: `design-system: tokens,
    selection in lightness, appearance slider`.
K.2 **Kit primitives** (about one day). `src/components/ui/*` only: Control,
    Segmented, Field, Select, Card, Pill, Identity, Decision field, Receipt,
    Drawer, Skeleton, Empty state, Page header. Delete `badge.tsx`,
    `metric-cell.tsx`, `indicator-strip.tsx` after moving their call sites.
    Replace `@base-ui/react` dialogs in `app-dialog.tsx` and
    `confirm-dialog.tsx` with a kit Dialog on the same keyboard contract
    (Escape, focus trap, restore), then remove `@base-ui/react`,
    `@mantine/core`, `@mantine/hooks`, `@mantine/utils` from `package.json`
    if `@blocknote/mantine` still resolves; if BlockNote needs Mantine as a
    peer, keep only what it needs and record why.
K.3 **Panel and agents** (about half a day). `src/components/agent/*`,
    `src/components/agents/*`, `src/components/layout/agent-panel.tsx`.
    Turns use Identity and Receipt; the decision card becomes the Decision
    field; composer is a Field; message bubbles take `--r-ctl`.
K.4 **Room, tree, drawer** (about one day). `src/views/Project.tsx`,
    `src/views/Unit.tsx`, `src/components/project/*`,
    `src/components/layout/workspace-tree.tsx`, `sidebar.tsx`. View
    switcher, Brief view for client cases, Table and Board views on the
    kit, Graph and Timeline views (Graph reuses `graph/` Insight; Timeline
    is new and small), the drawer for cards and sessions.
K.5 **Docs** (about one day). `src/views/Reports.tsx`,
    `src/components/docs/*`, `src/proposals/*` strip placement.
K.6 **Workflows** (about one and a half days). `src/views/Workflows.tsx`,
    `src/components/workflows/*`, `src/services/hermes-cron.ts` for pause
    and resume.
K.7 **Sweep** (about one day). Home widgets, Databases (peek becomes the
    drawer body), Settings, Search, Graph, Canvas: kit adoption and the
    eight consistencies. Rotation banner and the retired-surface presets on
    Home stay until Adam decides I.5 in `round-2.md`.
K.8 **Record** (about two hours). Amend `DESIGN.md` in place: Shapes (two
    radii and a pill), Components (the twelve), Named Rules (selection in
    lightness, borders mean two things, the slider), Do's and Don'ts.
    Update `.impeccable/design.json` to the shipped values. Add the audit
    script to `pnpm check`. Update `round-2.md` F.7 and F.8 to point here.

## 7. Migration notes and gotchas

- `--selected` is referenced 48 times; keep the name, change the value.
- `pnpm check:file-sizes` limits file length; `Reports.tsx` and
  `Workflows.tsx` are already near the limit. Split views into
  `src/components/docs/` and `src/components/workflows/` rather than growing
  them.
- `check:product-contracts` forbids the phrase "needs me" in `src/`; use
  "waits on you".
- Tailwind arbitrary values with `var()` need underscores for spaces inside
  `color-mix`; follow the existing pattern in `badge.tsx`.
- The workspace tree's roving keyboard and drop indicator must survive the
  row height change; run `src/components/layout/use-roving.test.ts`.
- `applyTheme` sets the native window theme; the slider must not call it,
  only set the CSS variable and fire the event.
- Fonts, flavors, accents, type scale and the seam are unchanged; do not
  touch the seven flavor blocks except to add `--sel-dir`.

## 8. Verification

Add `scripts/check-design-system.mjs`, run by `pnpm check`. It fails on:

- `var(--r-row)`, `var(--r-msg)`, bare `rounded ` or `rounded-(sm|md|lg|xl|2xl)` in `src/`;
- `ring-`, `outline-` (except `outline-none`), `border-l-`, `border-dashed`, `focus:border`, `focus:ring`, `inset 0 0 0 1px` in `src/`;
- `Loader2` outside `control.tsx` and `receipt.tsx`;
- `h-7`, `h-8`, `h-9`, `h-10`, `h-11` on elements with `rounded-[var(--r-ctl)]`;
- any `<Badge` import;
- the string `needs me`.

Contrast check: a small Node script (same file, `--contrast` flag) computes
the selected plane for each flavor at slider values 0.04, 0.08 and 0.14 and
asserts: at least 0.06 OKLCH lightness from `--base`, and muted text at
least 4.5:1 on the selected plane. Print a table; fail on any miss.

Tests to add: `control.test.tsx` (variants and states), `segmented.test.tsx`
(roving keys), `drawer.test.tsx` (Escape and focus return),
`decision-field.test.tsx` (choices render, primary is recommended),
`theme.test.ts` (slider value applied and persisted). Existing suites stay
green: 397 tests today.

Screenshots: every touched surface in all seven flavors at the default slider
value, plus Mocha and Flat White at 0.04 and 0.14, under
`docs/verification/design-system-v3/<package>/`. The overseer reads them
before Adam's walk.

Adam's walk, one sitting, after K.8: switch flavor and accent, turn on Follow system and change the Mac's
appearance, move the
slider, select a row, a card and a segment in each flavor, open the drawer
from a card and a session, use Docs read and edit with the rail at both
ends, build a two-step workflow by hand, then have an agent add a third step.

## 9. Not doing

- No new layouts beyond section 5. No glass, no gradient, no glow.
- No Home widget changes beyond rows and skeletons.
- No new routes. The Activity page is a Settings section, not a route or a
  sidebar item.
- No change to flavors, accents, fonts, type scale or the seam.
- No docked HUD.

## 10. Waiting on Adam

- I.5 in `round-2.md`: the rotation banner and the retired-surface widget
  presets on Home.
- The three non-case Brief templates (venture, publication, relationship)
  after he has seen the client-case Brief in the built app.
- The default slider value, after he has moved it in the built app.
- The default light and dark flavors for Follow system, after he has used it.
