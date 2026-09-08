# IntelliZen V3 · structural inventory, 2026-09-07

What the app is made of today, from the code and the evidence captures in `design/features/app-refinement/evidence/`. Facts only; the direction is in `DIRECTION.md`.

## Shell

| Element | As built | Source |
| --- | --- | --- |
| Panes | Sidebar 216 (min 160, max 360), centre, agent panel 336 (min 300, max 560). Both resizable, widths persisted. | `src/components/layout/app-shell.tsx:75-76` |
| Sidebar collapse | Auto-collapses to a 56px icon rail below 1100px; ⌘\ toggles and remounts. | `sidebar.tsx:60,93` |
| Agent panel modes | Docked · overlay drawer at <900px (390 wide) · ejected Tauri window 380×620 · HUD window 468×126 top-right, roster/chat open upward. | `app-shell.tsx:277-282`, `panel-window.ts:31-36`, `hud.tsx:126` |
| Focus mode | ⌘⇧F hides the sidebar only. Panel stays. Hint text in the strip. | `app-shell.tsx:141-171,232` |
| Window strip | 34px drag region; 4 to 5 chrome buttons top-right: sidebar, focus, show/hide panel, eject, reduce to HUD. | `app-shell.tsx:222-267` |
| Command palette | ⌘K, 588 wide at 15vh: Navigation, Actions, Workspace search, Plugins. | `command-palette.tsx:161-201` |
| Shortcuts | ⌘1-8 Places, ⌘⇧F, ⌘\, ⌘⇧A reveal panel, Esc leaves focus. | `sidebar.tsx:30-39` |
| View transitions | `room`, `drawer`, `segment` kinds; skipped under reduced motion. | `src/lib/view-transitions.ts` |
| Window | 1500×940 default, min 900×620, transparent, overlay title bar. | `src-tauri/tauri.conf.json:16-28` |

## Places and their header anatomy

Each Place owns its own header. Five different anatomies exist.

| Place | Header as built | Second-level rail |
| --- | --- | --- |
| Home | Tracked-caps `HOME`, Add widget at right; free 12-column grid of pins. | none |
| Databases | Rail of databases (own width) · editor with 24px bold title, breadcrumb, Trash/Edit taxonomy, view tabs, Filter/Sort/Settings/New record toolbar. | hand-rolled |
| Docs | Rail `DOCS` with New, folder tree, search · reading page with crumb, mode line (`Reading · ⌘E to edit`), 28px title, byline. | hand-rolled (`DocsRail`) |
| Graph | Graph picker dropdown · Insight/Construct segmented · stat chips · right rail (inspect/controls) · minimap (construct). | right rail |
| Canvas | Canvas picker · editor with its own sidebar and tool cluster. | own sidebar |
| Workflows | Tracked-caps `WORKFLOWS` + sentence + filters + card library → composer with title field, Save draft/Run, Add step, Canvas/Steps, zoom cluster bottom-left, runs drawer bottom. | none |
| Agents | Tracked-caps `AGENTS` + count · card grid. | none |
| Settings | Rail of 8 sections · section title tracked caps. | hand-rolled |
| Unit | Crumb + tracked-caps name · count · Projects/Dashboard segmented · projects table. | none |
| Project | Crumb + tracked-caps name · document count · 7-view segmented · primary action. | none |

## Overlays and floating elements

| Element | As built | Source |
| --- | --- | --- |
| Shared Drawer | 320 wide, right, inset 8px, `--mantle`, focus trap. Used by project room detail, narrow agent panel, Settings nav (<600), docs, board, sessions. | `src/components/ui/drawer.tsx:59` |
| Workflow run drawer | Same primitive at 620 wide. | `workflow-run-drawer.tsx:30` |
| Database peek panel | Separate component: fixed right, resizable, full-page toggle, min 360. | `DatabasePeekPanel.tsx:117,450` |
| Dialogs | AppDialog, ConfirmDialog, database ConfirmDialog, graph export/clear/delete, Activity pin. | various |
| Menus | Context menu (tree, databases rail), Add widget menu, target picker, graph overflow/export, database property/filter/sort, record picker, node picker, workflow action menu. | various |
| Toasts | Sonner bottom-right, duplicated in the ejected window. | `app-shell.tsx:292-306` |
| Tool clusters | Graph zoom/fit top; workflow zoom/fit bottom-left; canvas tools; graph minimap bottom. | `Graph.tsx`, `Workflows` composer |
| Docs selection toolbar | Does not exist. | none |
| HUD | External window only. No in-window compact form. | `hud.tsx` |

## Agent panel

Identity header (avatar, tracked-caps name, target picker) · `Context <place>` line · empty-state sentence · thread · composer with attach, mic, send. Decisions render as `decision-card.tsx`. Ejected header adds Reduce to HUD / Redock. Team rooms via `panel-room.ts`.

## Themes and type

Calmppuccin, seven flavours (Flat White, Latte, Frappé, Macchiato, Mocha, Nitro Cold Brew, Oledppuccin), fourteen accents each, selection strength slider writing `--sel-step`. Closed type scale 16/14/13/12/11/10 for chrome. Geist for UI; Geist Mono for identifiers.

## Half-built or inconsistent

- Three detail surfaces (Drawer 320, run drawer 620, DatabasePeekPanel) with three widths and behaviours.
- Three hand-rolled second-level rails (Docs, Databases, Settings) with different widths and collapse rules; with the panel open the shell shows four columns.
- Five page-title treatments: tracked caps 14px, bold 24px, regular 28px, dropdown, editable field.
- Corner tool clusters differ per surface; toasts and the runs drawer share the bottom edge.
- Focus mode removes navigation but not noise: rails, panel and toolbars remain.
- Panel context is one word; the panel cannot show what it is looking at.
- Compat redirects still mounted for ten retired routes.
