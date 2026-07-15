# InteliZen — UI/UX Plan

Design system refresh for the 7-screen Tauri build. This is the authoritative design reference; `src/index.css`, component primitives, and per-screen work derive from it.

> **Binding status (2026-07-15):** This document is a hard gate for every UI change, human- or agent-authored. See "Agent Surfaces & Review Gate" at the end. Where this doc and `src/index.css` disagree on a token value, **the live CSS wins** — update this doc, don't fork the tokens. Known reconciliations: accent is now Blue `#89b4fa` (not Teal), UI font is **Switzer** (not Satoshi), and Inbox/Monitors are retired in favor of Fiona's daily brief. Agent Work, Workflows, and Roles are database-backed Home widgets rather than standalone destinations.
>
> **Shell reconciliation (2026-07-07):** the app is now a frameless transparent window with floating rounded panes (sogo-app reference): custom traffic lights in the main pane's chrome strip, JS window drag, manual pane-edge resize (see `docs/chrome-layer-handoff-2026-07-07.md`), collapsible sidebar/agent-panel as detached pills, and **pill-shaped buttons app-wide** (Adam-pinned). The "Navigation shell" section below predates this and is historical where it conflicts; sidebar has icons and the section names are Home / Search / Intel / Databases / Docs / Graph / Canvas.

## Principles

1. **Precision instrumentation, not cockpit costume.** Refined intel dashboard as the chassis. HUD language applied only where it earns its place (monitoring data rails, graph canvas, phase telemetry).
2. **Editorial discipline over dashboard defaults.** Typography and negative space do the work that icons, glows, and gradient chrome would do in a generic dashboard.
3. **Data is the decoration.** Numbers, timestamps, and live readouts are the visual hero. The chrome stays quiet.
4. **Calm over kinetic.** Motion supports legibility, not aesthetic. No gimmicks.
5. **Single-user desktop app, keyboard-first.** ⌘K is the spine; mouse is supplementary.

### Trust doctrine

1. **Failure must look different from empty.** Every data region has distinct loading, content, empty-with-next-action, and error-with-retry states. A failed read never mounts an editable surface.
2. **Every action is acknowledged.** User-initiated writes never swallow failures. Optimistic changes, autosaves, and background persistence expose success or failure clearly.
3. **Destructive means confirmed or undoable.** Deliberate deletion uses the shared confirmation dialog; frequent reversible actions use an Undo toast. Destructive actions do not live in primary page chrome.
4. **One gesture, one meaning.** The same object has the same click contract and action vocabulary everywhere it appears.
5. **Keyboard parity.** Every overlay closes with Escape, traps focus while open, and returns focus to its trigger. Primary work remains reachable without a mouse.

## Reference anchors

- **`3e465f98…`** (air quality dashboard) — negative-space layout, custom viz primitives (hex gauge, radial arc), muted accents, tiny uppercase labels
- **`121bf66d…`** (neuro control panel) — dense branching lists with thin connector lines, LED indicator strips, near-monochrome discipline
- **`a3f80d79…`** (Handshake Sustainable Finance) — **Graph page anchor**: vibrant multi-color entity nodes, ghost background labels, focused-node halo, right-rail inspector

---

## Design tokens

### Palette — Catppuccin Mocha

https://github.com/catppuccin/catppuccin

**Surfaces (dark-first)**
| Token | Hex | Use |
|---|---|---|
| `--crust` | `#11111b` | Deepest — modal backdrops, scrollbar track |
| `--mantle` | `#181825` | Panels, sidebar background |
| `--base` | `#1e1e2e` | App background |
| `--surface-0` | `#313244` | Cards, inputs, buttons (secondary) |
| `--surface-1` | `#45475a` | Hover, dividers, active borders |
| `--surface-2` | `#585b70` | Elevated hover |

**Text**
| Token | Hex | Use |
|---|---|---|
| `--text` | `#cdd6f4` | Primary |
| `--subtext-1` | `#bac2de` | Secondary / hover |
| `--subtext-0` | `#a6adc8` | Muted / inactive nav |
| `--overlay-1` | `#7f849c` | Dim / section headers |
| `--overlay-0` | `#6c7086` | Placeholder / disabled |

**Accent — single primary**
| Token | Hex | Use |
|---|---|---|
| `--accent` | `#94e2d5` (Teal) | Interactive primary, active states, focus ring |
| `--accent-soft` | `rgba(148, 226, 213, 0.10)` | Subtle active-item tint |
| `--accent-border` | `rgba(148, 226, 213, 0.30)` | Focus outlines |

**Status**
| Token | Hex | Use |
|---|---|---|
| `--success` | `#a6e3a1` (Green) | Success states, healthy monitors |
| `--warning` | `#f9e2af` (Yellow) | Warnings, aging signals |
| `--caution` | `#fab387` (Peach) | Secondary warnings, highlights |
| `--danger` | `#f38ba8` (Red) | Errors, destructive actions |
| `--info` | `#74c7ec` (Sapphire) | Informational |

**Graph entity palette (8 hues, flat saturated fills on near-black)**
| Entity | Token | Hex |
|---|---|---|
| person | `--entity-person` | `#94e2d5` Teal |
| org | `--entity-org` | `#74c7ec` Sapphire |
| location | `--entity-location` | `#fab387` Peach |
| event | `--entity-event` | `#f38ba8` Red |
| topic | `--entity-topic` | `#cba6f7` Mauve |
| signal | `--entity-signal` | `#f9e2af` Yellow |
| investigation | `--entity-investigation` | `#89b4fa` Blue |
| report | `--entity-report` | `#a6e3a1` Green |

**Borders**
- `--border`: `rgba(69, 71, 90, 0.6)` (Surface1 @ 60%) — default 1px
- `--border-strong`: `#45475a` — active/focus
- `--border-subtle`: `rgba(69, 71, 90, 0.3)` — dividers inside cards

**Banned**
- All `box-shadow` glows (`rgba(X, X, X, Y) 0 0 Npx`)
- All linear/radial gradients on chrome (logos, buttons, cards, backgrounds)
- `pulse-glow`, `scanline`, `animate-gradient-shift` keyframes

### Typography

- **UI + display:** Satoshi — Regular 400, Medium 500, Bold 700
- **Data + numbers:** Geist Mono — Regular 400, Medium 500
- **Inter banned everywhere.** Remove from `:root` font stack.

**Self-hosted.** Add `src/assets/fonts/` with woff2 files. Declare via `@font-face` in `index.css`.

**Hierarchy**
| Role | Family | Size | Weight | Tracking |
|---|---|---|---|---|
| Display H1 | Satoshi | 28px | 700 | -0.02em |
| Section H2 | Satoshi | 18px | 600 | -0.01em |
| Body | Satoshi | 14px | 400 | 0 |
| UI | Satoshi | 13px | 500 | 0 |
| Label (uppercase) | Satoshi | 10-11px | 600 | 0.14em |
| Metric (hero number) | Geist Mono | 32px | 500 | -0.02em |
| Data cell | Geist Mono | 13px | 400 | 0 |
| Timestamp / ID / URL | Geist Mono | 11-12px | 400 | 0 |

**Rules**
- All numbers, timestamps, IDs, URLs, and technical strings → Geist Mono
- All uppercase labels use `tracking-[0.14em]` minimum
- No oversized H1s anywhere — control hierarchy with weight and color

### Radii, borders, elevation

*(Reconciled 2026-07-07 with the frameless floating-pane shell — Adam pinned the pill language.)*

- Shell panes (sidebar, main, agent panel): **16px** (`rounded-2xl`); collapsed floating pills **28px**
- Card/panel radius: **12px**
- Input/textarea/select radius: **8px** — fields stay rectangular; only actions are pills
- **Buttons: full pill (`rounded-full`), all variants and sizes; icon buttons are circles**
- **Status/count/stage chips: full pill.** Taxonomy/category badges: **6px square chip** (deliberate contrast — labels are not actions)
- Border weight: **1px default, 2px on active accent bars only**
- No `box-shadow` except: modal/popover elevation (single flat shadow, no glow: `0 8px 24px rgba(0, 0, 0, 0.4)`), and the collapsed-pill float shadow `0 18px 44px -24px rgba(0,0,0,0.75)`

### Spacing

Stick to 4px grid. Common gaps: 4, 8, 12, 16, 20, 24, 32, 48, 64.

Screen gutters: 24px default, 32px on analytical screens (Investigate/Reports).

---

## Motion policy

**MOTION_INTENSITY: 3–4 (Static → Fluid CSS).**

**Allowed**
- Color / opacity / transform transitions, 120–180ms, `cubic-bezier(0.16, 1, 0.3, 1)` ease-out
- Staggered list/grid mount: 20–40ms per item, fade-in + 4px upward travel
- Route crossfade: 150ms opacity
- Framer Motion `layout` on graph nodes only (physics reads as real in that context)
- Tactile `:active`: `scale-[0.98]`

**Banned**
- Magnetic / mouse-pull effects
- Breathing / pulsing status indicators
- Scanlines, gradient shifts, perpetual motion of any kind
- Spring overshoot on standard chrome (springs reserved for graph)
- Shimmer / skeleton shimmer loops (use static skeletons with a single 600ms fade-in on content arrival)

---

## Component primitives

Replace the current `.card-intel`, `.panel-hud`, `.btn-accent` with flat, glow-free equivalents. Add new primitives for the instrumentation language.

### Existing primitives — rebuild

- `<Card>` — 1px `--border`, 12px radius, Surface0 background, no hover glow, no gradient. Optional `interactive` prop triggers border-color shift to `--border-strong` on hover (150ms).
- `<Button>` — three variants: `primary` (Accent bg, Crust text), `secondary` (Surface0 bg, Text fg, 1px border), `ghost` (transparent, Subtext0 fg, no border). All 8px radius, 13px Satoshi medium. `:active` scale-[0.98]. No gradient. No glow.
- `<Input>` / `<Textarea>` — Surface0 bg, 1px border, 8px radius. Focus: border → Accent, 1px ring (`--accent-border`). No glow.
- `<Badge>` — 6px radius, uppercase 10px Satoshi 600, tracking-[0.14em]. Variants per status color, all with Surface0-tinted bg at 15% opacity + full-strength text color.
- `<Checkbox>` — Custom. Unchecked: 1px Surface1 border, 4px radius. Checked: Accent fill, Crust checkmark. 150ms transition.

### New primitives

- `<IndicatorStrip>` — horizontal LED-style readout row. Props: `items: {label, value, status?}[]`. Each cell: 10px uppercase label (Subtext0) above Geist Mono 12px value. Optional 2px status dot (Green/Yellow/Red/Accent). Used in screen headers to show live counts (unread, active monitors, queue depth, last refresh).
- `<DataRow>` — divider-separated data row, no card. Grid layout, first column accent-strip indicator (2px vertical bar, status color), subsequent columns data cells. Hover: background `rgba(49, 50, 68, 0.4)`. Used in Inbox, Monitors lists.
- `<StatusPill>` — 6px radius pill, Geist Mono 11px. Variants: `active`, `paused`, `error`, `stale`, `new`. Uses `--success`, `--overlay-1`, `--danger`, `--warning`, `--accent` respectively.
- `<MetricCell>` — for hero numbers. 10px uppercase label above 32px Geist Mono 500 metric. Optional small delta below (Geist Mono 11px, `--success` or `--danger` prefix arrow).
- `<BracketFrame>` — decorative corner bracket wrapper (`┌ ┐ └ ┘` motif, 1px Subtext0 at 40% opacity, 8px corner length). Use sparingly as section framers on analytical screens.
- `<CommandPalette>` — ⌘K modal. Global. Fuzzy search across: all routes, common actions (New Investigation, New Monitor, New Project, Run Monitor, Open Graph, Search Web/News/People/Research), recent projects/investigations. Built on a Dialog primitive. 12px radius, Mantle background, 1px Surface1 border, single flat shadow for elevation.

---

## Navigation shell

### Sidebar — 216px fixed, always expanded

- Mantle bg, 1px right border (`--border`)
- No icons — typography only
- Top: "INTELIZEN" wordmark, Satoshi 13px 700, Accent color, tracking-[0.18em]. Right side: ⌘K trigger (small rounded Surface0 pill, "⌘K" in Geist Mono 11px Subtext0)
- Below wordmark: 1px `--border` divider
- Four grouped sections, each with:
  - Section header: Satoshi 10px 600, `--overlay-1`, uppercase, tracking-[0.18em], 16px top padding, 8px bottom padding
  - Nav items: Satoshi 13px 500, 8px vertical padding, 16px horizontal padding, 4px radius

**Groups and order** *(2026-07-02: Inbox/Monitors demoted — routes remain deep-linkable; collection is agentic)*
```
HOME
  Home

SEARCH
  Search

ORGANIZE
  Operations
  Databases
  Graph
  Canvas

ANALYSE
  Investigate
  Reports
```

**Interaction states** (typography only — no glow)
- Inactive: `--subtext-0`, no background, no border
- Hover: `--subtext-1`, `rgba(49, 50, 68, 0.4)` background, 150ms
- Active: `--text`, 2px Accent left-bar flush against item (inside the item's left padding), no background fill
- Focus-visible: 1px `--accent-border` ring, 4px radius

**Footer** — 1px `--border` top divider, 12px padding. Single status line: 2px Success dot + "Systems nominal" in Satoshi 10px 500 uppercase `--overlay-1` tracking-[0.15em]. Version `v0.4.x` right-aligned, Geist Mono 10px `--overlay-1`.

### Command palette (⌘K)

- Global keyboard trigger (⌘K / Ctrl+K)
- Center-top modal, 560px wide, fade+4px slide-down mount (150ms)
- Input: Satoshi 15px, Crust bg, 1px `--border`, 8px radius
- Results grouped by type: Navigation → Actions → Recent
- Keyboard nav: ↑↓ to move, Enter to execute, Esc to close
- Scope awareness: when on `/investigate`, add case-scoped actions (Run Phase, Open Artifact, etc.)

---

## Graph page — Handshake anchor

Core visual contract:
- Pure Crust `#11111b` canvas (no dot grid — clean)
- Nodes: flat filled circles, entity palette hues, size scales with prominence (min 6px, max 28px)
- Edges: 1px lines. Default Overlay0 `#6c7086` at 40% opacity. Highlighted paths inherit the focused node's entity hue at 80% opacity.
- Labels: Satoshi 11px 500. Focused node label Text `#cdd6f4` with thin 1px Mantle-filled pill background. Unfocused labels Overlay1 at 40% opacity, no background.
- Selected node: 1px `--accent` halo ring at 4px offset, no glow.
- Right rail (Inspector): 320px Mantle panel, 1px left border. Sections: selected entity header, filters (type toggles with entity-hue chips), connections list, common topics chart, mutual connections table.
- Top bar: breadcrumb of graph context, group count, favorites count, avatar/owner, actions (…).

Construct mode keeps the same palette and node/edge contract. The existing custom canvas handles pan/zoom/connector/multi-select/minimap — only visual tokens need to change.

---

## Per-screen direction (high-level only — detail at refresh time)

- **Inbox** — IndicatorStrip header (unread / total / last refresh / monitor health). DataRow list with entity-hue accent strip on left, title + source + timestamp + project chip. Detail panel right. Keyboard-first (j/k nav, e to attach to investigation, a to archive).
- **Monitors** — IndicatorStrip header (active / paused / avg age / errors). DataRow list per monitor: status pill, query, category, last run, signal count, cadence. Detail panel with run history chart (Geist Mono axis, single hairline trend).
- **Search** — two-column: query composer (left, narrower), results (right, wider). Query composer: category chips, filters, DataRow results. No card wrap — just dividers. Active result gets 2px Accent left-bar.
- **Projects** — Kanban by project type with DataRow-style cards (no enclosed panels). Column header: type label + count chip. Cards: title, signal count, updated-at, entity-hue dot for project type.
- **Graph** — see anchor above.
- **Investigate** — 6-phase stepper across top (BracketFrame on active phase). Main area: phase-specific workspace. Right rail: case metadata, artifacts list (from vault_files). Each phase's "Run" action opens a small terminal-style panel showing Claude's streaming output (Geist Mono, Text color, 13px).
- **Reports** — Two-column. Left: artifacts browser grouped by type (sweep/assessment/deep/brief). Right: selected report rendered. Top bar IndicatorStrip: total artifacts / draft / shipped / last generated.

---

## Build sequence

### Phase 1 — Foundation (single commit)

1. **Fonts** — add Satoshi + Geist Mono to `src/assets/fonts/`, declare via `@font-face` in `index.css`. Remove Inter from the font stack.
2. **Tokens** — rewrite `:root` in `index.css`: replace existing palette with full Catppuccin Mocha token set per this doc.
3. **Strip chrome** — remove `pulse-glow`, `scanline`, `gradient-shift`, `subtle-float` keyframes and classes; remove body background radial gradients; remove all `box-shadow: 0 0 Npx …` glow styles; flatten `.card-intel`, `.panel-hud`, `.btn-accent` to glow-free, gradient-free equivalents.
4. **Rebuild UI primitives** — `src/components/ui/`: Card, Button, Input, Textarea, Badge, Checkbox per spec. Add new primitives: IndicatorStrip, DataRow, StatusPill, MetricCell, BracketFrame.
5. **Sidebar** — rewrite `src/components/layout/sidebar.tsx`: 216px fixed, text-only, 4-layer grouping, new interaction states, new footer.
6. **Command Palette** — new `src/components/layout/command-palette.tsx` mounted in `AppShell`. Global ⌘K binding. Navigation + scoped actions.
7. **Visual smoke test** — launch app, confirm every screen still renders (even if mid-refresh ugly), no runtime errors.

### Phase 2 — Screen refreshes, one commit per screen

Per-screen workflow: Adam reviews the live screen, signs off, we move to next.

1. **Inbox** — first launch screen, sets the pattern
2. **Graph** — Handshake anchor, proves the entity palette
3. **Monitors** — twin to Inbox, reuses patterns
4. **Investigate** — 6-phase workflow, most architecturally distinct
5. **Search** — form-heavy
6. **Projects** — kanban variant
7. **Reports** — artifact browser

No screen moves forward without sign-off.

---

## Open questions (deferred, not hidden)

- **Keyboard shortcut map.** Defined per-screen during each screen's refresh — not upfront.
- **Empty states per screen.** Each screen's refresh commit includes its empty state.
- **Phase-specific Investigate layouts.** The 6 phases (Plan / Collect / Collate / Timeline / ACH / Report) have different workspace needs. Resolved during Investigate refresh, not here.
- **Reports renderer.** Markdown vs. richer artifact view. Resolved at Reports refresh.
- **Mobile / narrow-window behavior.** Desktop-only for now. If window narrows below ~1100px, sidebar collapses to 56px icon-free rail with tooltip labels. Not a priority.

---

## Non-goals

- Responsive design for web/mobile. macOS desktop app only.
- Theming / light mode. Dark-only, Catppuccin Mocha only.
- Accessibility beyond keyboard navigation and sensible focus outlines. Single-user app, no a11y audit for V1.
- shadcn/ui migration. Hand-rolled primitives continue.

---

## Agent Surfaces & Review Gate (added 2026-07-02)

These rules bind all UI work by agents (Claude, Codex, or any future actor) and extend the system above to the agent-era surfaces (Agent Panel, Databases, Home operating views, Workflow Run panels).

### Agent-surface rules

- **The Agent Panel is a chat surface, not a form.** Its anatomy is fixed (VS Code agent chat reference): a full-height conversation thread and **one composer frame at the bottom** — textarea on top, controls row inside the frame (plus-menu for workflows/actions, Hermes profile picker, dictation mic, send). Turns are **full-width blocks, never bubbles**: user turns get a subtle `--surface-wash` block with a "You" label; agent turns are plain text with the profile name label; GenUI widgets render inline; timestamps only as dividers after 15-minute gaps. The header shows live Hermes connection state. Never stacked form sections; never a separate "voice box" (dictation types into the composer). Workflow, tool, approval, and receipt evidence may appear only as compact, collapsed-by-default inline conversation events when relevant to a turn. They summarize and link to the canonical Databases record; they never become a fixed run list, approval queue, dashboard, or second task system in the panel.
- **Agent UI uses the same tokens as everything else.** No "AI feature" styling: no purple/indigo gradients, no glow, no sparkle icons. An agent surface should be visually indistinguishable in material from a database table.
- **Anatomy consistency:** section headers are `font-ui 11px 600 uppercase --overlay-1`; counts are mono pills (`font-mono 10px` in a `--border` ring); data values are Geist Mono; interface text stays in the 10–13px band. Match the adjacent surface's density exactly.
- **Three states required** on every data surface: loading (static skeleton or spinner consistent with neighbors), empty (dashed `--border` box, icon + one-line label), error (`--danger`-mixed border box with the message). Mobile width (390px) renders without horizontal overflow.
- **Semantic color at reduced strength** via `color-mix(in srgb, var(--tone) N%, transparent)` — never new rgba literals.
- **lucide icons only**, 3.5–4 (14–16px) sizes; no emoji as icons.

### Banned (AI-slop list)

Default Tailwind palette classes (`gray-*`, `slate-*`, `blue-*`…) · hardcoded hex outside `index.css` · gradient heroes/glassmorphism · `shadow-xl` + `rounded-2xl` card soup · marketing-scale typography inside the shell · placeholder copy · entrance animations on data · new one-off spacing or radius scales.

### Surface governance (mirrors PRD)

No agent may add a route, sidebar item, default view, or persistent surface without Adam's approval. Agents **propose** views (pinnable, dismissible); Adam **pins**. Generated/operating views must be source-backed and use existing components.

### Review gate — run before any UI slice lands

1. **Interaction paradigm check:** name the pattern the surface implements (chat surface, table, board, peek panel, stepper…) and confirm the implementation matches how that pattern behaves in reference tools (VS Code agent chat, Notion, Linear) — not just what content it shows. A chat is a thread + bottom composer; a form is not a chat.
2. Tokens-only audit: `grep -nE '#[0-9a-fA-F]{3,8}|(gray|slate|zinc|neutral|stone|indigo|violet|purple)-[0-9]' <changed files>` → zero hits outside `index.css`.
3. Loading/empty/error states present.
4. 390px width: no horizontal overflow, no console errors.
5. Density/anatomy matches the adjacent surface (compare side-by-side).
6. Screenshot evidence captured for the receipt/changelog.
