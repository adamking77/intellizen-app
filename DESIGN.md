---
name: IntelliZen
description: A calm, editorial desktop workspace for directing intelligence work.
colors:
  rail: "#11111a"
  panel: "#171724"
  work: "#1b1b29"
  raised: "#252539"
  text: "#dfe4f0"
  text-muted: "#9ca4bd"
  accent: "#7fa6e6"
  waiting: "#e2a47d"
  verified: "#a6cfa1"
  failure: "#d47b95"
  runtime: "#789cd6"
typography:
  title:
    fontFamily: "Geist, sans-serif"
    fontSize: "28px"
    fontWeight: 300
    lineHeight: 1.3
    letterSpacing: "0"
  body:
    fontFamily: "Geist, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  interface:
    fontFamily: "Geist, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.35
  meta:
    fontFamily: "Geist, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.35
  identifier:
    fontFamily: "Geist Mono, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.35
rounded:
  plane: "12px"
  surface: "10px"
  control: "8px"
  pill: "999px"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  control:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.rail}"
    rounded: "{rounded.control}"
    height: "28px"
  segmented:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
  field:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
  select:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
  pill:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.pill}"
  identity:
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
  decision-field:
    backgroundColor: "{colors.waiting}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
  receipt:
    textColor: "{colors.text-muted}"
    rounded: "{rounded.control}"
  drawer:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.plane}"
  skeleton:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.control}"
  empty-state:
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
---

# Design System: IntelliZen

## Overview

**Creative North Star: "The Editorial Instrument"**

IntelliZen is a precise macOS operating surface for intelligence work. Stable
planes, deliberate whitespace, and attributed data make sophisticated work feel
calm. The interface is advanced through behavior and clarity, never through
glow, glass, ornamental gradients, or generic dashboard furniture.

The current visual authority is `design/features/app-architecture/SPEC-2050.md`
and its Turn 8 frames, with the engineering corrections in REVIEW-2050.md.
Adam authorized full implementation on 2026-09-07. The 2050 rules below replace
the older v3 typography, floating-surface and decision presentation contracts;
existing functional capabilities and explicit database exceptions remain.
The implemented source of truth is `src/index.css`, `src/lib/theme.ts`, and the
shared components under `src/components`.

**Key Characteristics:**

- Three stable planes: rail, panel, and work.
- Editorial hierarchy from space and type rather than decoration.
- Dense desktop controls with complete keyboard parity.
- Agent identity carried consistently by avatar, bubble, voice, and HUD.
- Explicit loading, content, empty, error, and recovery states.

### 2050 interaction rules

No elapsed-time counters, countdowns, escalation deadlines, streaks or pressure
language. Static asked-at timestamps are facts. Say "a question for you" and
describe only work that is actually continuing. Counts remain counts; completion
never implies verification. Preserve failure, denial and unknown-data meaning.

Decisions use equally weighted text actions with a hairline underline. A
recommendation is explicit source data, never the first option by position.
Creation actions may retain primary styling. Every move/task/output exposes its
done condition when known; missing evidence is not invented. Local session modes
are Thinking, Deciding, Executing and Not today. Not today suppresses presentation
interruptions across main/ejected/HUD windows without changing agent execution.

Keep vault markdown, workspace records and profiles in their existing stores.
Agent writes retain proposal/confirmed-MCP boundaries. Cards serve inventories;
activity and long sets are lists. Use no coloured left borders. Adam confirmed
database selection uses a tinted row on 2026-09-07. Meaningful metadata, hints and quiet
controls must meet 4.5:1 contrast; dim/faint decoration is never the only way to
read an action, permission, done condition or receipt.

## Colors

Seven Calmppuccin-derived flavors provide five dark and two light compositions.
Each exposes the same semantic roles; components never know which flavor is
active.

### Primary

- **User accent:** primary action, user voice waveform, links, keyboard focus,
  hover/selection, and color swatches. Selection uses a gentle accent tint over neutral planes. The
  user selects one of fourteen named accents. Blue is the deliberate default
  for every flavor; this is IntelliZen's deviation from Catppuccin's mauve
  default, not an accidental palette mismatch.

### Secondary

- **Agent identity:** a deterministic, non-semantic hue shared by an agent's
  procedural avatar, message bubble, speaking state, and team stack. Identity
  must never imply waiting, success, failure, or runtime.

### Neutral

- **Rail:** the deepest dark or lightest light plane.
- **Panel:** the intermediate plane used by side panels and agent surfaces.
- **Work:** the primary content plane.
- **Raised:** selected rows and transient floating surfaces.
- **Text muted:** measured secondary text, never manufactured with opacity.

### Named Rules

**The Three-Plane Rule.** The navigation rail uses the rail plane, secondary
panels use the panel plane, and primary work uses the work plane. Depth comes
from their relationship, not borders around each pane.

**The Semantic Supremacy Rule.** Waiting is peach, verified is green, failure
is red, and runtime is blue. User accent and agent identity never override them.

**The Token Rule.** Hard-coded colors are allowed only inside the flavor token
definitions, procedural-avatar palette resolution, platform-native traffic
lights, or user-authored canvas content. UI components consume semantic tokens.

**Accent in Interaction States.** Every flavor uses the chosen accent for hover and selection. The selected ground mixes base 75% with raised 25%, then adds 2.4–8.4% accent according to Accent Strength. Selected hover adds two percentage points. This replaces the former OKLCH lightness shift and neutral-only light selection, which produced unreadable text at stronger settings.

`--accent` preserves the exact palette color for fills, swatches and focus. `--accent-text` is its readable text derivative on neutral surfaces. Solid fills use `--accent-fg`, selected automatically as black or white for contrast; their hover moves the fill away from that ink. Dark primary actions retain a gentle selected tint. Controls own their hover feedback; no blanket button shadow may stack another wash over selected/primary states.

**Borders Follow Role.** Opaque floating surfaces use one neutral hairline.
An edited field may use a focus hairline, and a failure may use its semantic
hairline with a word. Preserve the colour-swatch and live drop-target affordances.
Accent borders are not selection, button, checkbox or card decoration.

**The Accent Strength Rule.** Settings ▸ Appearance is the only place that
writes `--sel-step`. Its 0.04–0.14 slider defaults to 0.08, and every selected
surface and shared hover wash read the same token. The existing preference key is retained so saved choices survive the label change.

**The Database Preservation Rule.** Preserve the existing database controls,
compact row radius, coloured property badges, every view type and the
resizable/full-page record panel. SPEC-2050 now governs their framing.
Adam confirmed on 2026-09-07 that selected rows use the tinted plane and
preserve Accent Strength; the old 2px coloured selection rail is superseded.

## Typography

**Display Font:** Geist
**Body Font:** Geist
**Label/Mono Font:** Geist Mono

**Character:** restrained and editorial. One light sentence establishes the
situation; smaller controls and mono metadata support the material.

### Hierarchy

- **Sentence:** 20–26px, weight 300, line 1.3; Adam reduced the oversized display scale on 2026-09-07.
- **Page heading:** 24–28px maximum, weight 300, sentence case.
- **Card/dialog title:** 19–22px, weight 300.
- **Section/eyebrow:** about 10px Geist Mono, uppercase, restrained +0.08em tracking; preserve readable contrast.
- **Body:** 14–17px, weight 400, line 1.55–1.65, sentence case.
- **Interface:** 13–16px, weight 400, sentence case.
- **Meta:** 12px, weight 400.
- **Rail group:** 11px, weight 450, uppercase, +0.14em tracking.
- **Identifier:** Geist Mono, 12px, weight 400.
- **Count:** 10px, weight 400, muted; counts only.

### Named Rules

**The Role Scale Rule.** Use the named roles above. Existing compact controls
may retain 12.5px during migration. No page invents another scale. User content
and analytical visualizations retain sizes required by their material.

**The Light Capitals Rule.** Tracking gives uppercase hierarchy its structure;
heavy uppercase labels do not. Page titles are never tracked capitals.

## Layout

The main window has three possible panes: navigation rail, work surface, and
agent panel. Connected mode is the default: a 1px shell gap over the line color
with square pane corners. Segmented mode uses a 10px transparent gutter and 12px
pane corners. The gap is the seam; pane borders are not drawn.

The macOS main window uses native traffic lights with an overlay title bar and a
hidden title. The first 78px of the rail's top strip remains clear. Chrome strips
belong to their pane and carry no border.

At narrow widths, secondary panes collapse before primary work is compressed.
At 390px the rail becomes a compact overlay/rail, work actions wrap or collapse,
and no horizontal content or control is lost. Every major surface must also hold
at 200% zoom.

Use a 4px spatial base. Proximity establishes groups before backgrounds or
containers are added. Data-heavy views may scroll in their natural axis, but
application chrome must not force viewport-level horizontal scrolling.

## Elevation & Depth

The system is flat by default. Major planes separate tonally or by a shell gap.
Floating content uses one opaque Surface: shared background, neutral hairline,
10px radius and no shadow at rest. Dialogs retain 12px radius over a 55–60%
ground scrim. The detached panel and HUD paint only their rounded surfaces;
the surrounding native window stays transparent, with no outer shadow.

**The No Ghost Card Rule.** Do not combine a structural border, rounded
container, and wide shadow on the same persistent surface.

## Shapes

Shape communicates role rather than decoration:

- Major planes: 12px.
- Controls, rows, fields, cards, messages, disclosures, and nodes: 8px.
- 2050 floating surfaces, decisions, popovers and record peeks: 10px.
- Pills: 999px, reserved for non-clickable state words and circular identity.

Selection is a raised fill, never a colored side stripe or focus ring. Borders
follow their semantic role. A neutral hairline may enclose a floating Surface
or separate adjacent content.

## Components

The existing kit remains the behavioral foundation. Surface, Eyebrow, Sentence
and Choices supply the 2050 presentation roles; compose them with existing
Control, Segmented, Drawer and dialogs instead of rebuilding their behavior.

| Component | Shipped contract |
|---|---|
| Control | 28px high, 8px radius; default, selected, primary, quiet, danger and text; loading disables the control. |
| Segmented | 28px track, 2px inset and gap; roving keys; the selected child uses the selected plane. |
| Field | Input-plane ground, no border at rest, line-strong while editing; text entry relies on the caret. |
| Select | Field contract with native appearance removed and one dim chevron. |
| Card | Raised plane, 8px radius, 9px × 11px padding; hover wash; selected plane when selected. |
| Pill | Non-clickable state word, 999px radius; neutral, waiting, verified, failure, runtime. |
| Identity | 16px identity mark, name, then runtime; Hermes, ACP, or you. |
| Decision field | Opaque Surface, question eyebrow and equal-weight Choices; recommendation is an explicit text annotation only. |
| Receipt | Mono 11px tool or work line with explicit settled, running, or failed state. |
| Drawer | 320px transient work-plane detail, 12px radius, 200ms motion, Escape and focus return. |
| Skeleton | In-place raised bars; 1.4s sheen stops under Reduce Motion. |
| Empty state | Left-aligned teaching sentence and at most one Control; no box. |

Buttons and other non-field controls use one 1px accent `:focus-visible` outline
at a 2px offset. There is no focus shadow. Fields and textareas use the caret plus
their line-strong editing edge. Shared select fields use only their neutral
line-strong focus border, without an outer accent outline.

### Procedural Avatar

Every agent chooses a mesh gradient sphere, Blobatar or seeded SVG trace through
`avatarStyle`. `avatarKind` remains a Blobatar silhouette. Trace seed is persisted
through profile/ACP adapters and rendered consistently everywhere. The sphere is rendered by
`@outpacelabs/avatars`; the blob is rendered by `blobatar`. Name/identifier seeds
are deterministic. Blob silhouette and identity color may be pinned per agent.
Uploaded profile pictures may override the procedural face without deleting the
saved procedural choice.

Cards and editor previews animate a Blobatar only on direct hover. Dense rows and
team stacks are static. While an agent speaks, its avatar responds to measured
audio level—never to a decorative timer—and Reduce Motion removes the transform.

### Agent Conversation

**Adam's native correction, 2026-09-07:** retain the pre-2050 layout in attached,
detached and HUD modes. Keep the previous small selected-agent name, compact
header and combined composer/controls area. Apply the new palette and visual
treatment without adding Sees/Thread bands, a separate permission strip or
extra padding that takes space from the conversation. Removable context stays
in its original compact location and determines the next-turn payload. Turns
retain attribution and the previous tool/fact placement and folding threshold;
decisions stay readable and actionable.
Preserve attachments, voice, picker, stop and all modes, with the common
`--r-ctl` (8px) composer radius and the functional decision/context fixes.

Team conversations use the same Composer component and panel spacing. The room
body inherits its panel surface; it does not add a nested background or a second
inset form. Team identity stays in the shared picker, member names sit behind a
compact disclosure, and team turn status stays above the composer. Mentions
extend the shared input without replacing its send shortcut, voice controls,
or Send/Stop affordance. User messages use the shared `--user-bubble` token.
In HUD mode, voice actions live once in the pill; the expanded composer does not
repeat them, for either an individual or a team.

The log follows the live edge only while the reader is within 32px of it. When
the reader has moved away, position holds and a “New reply” action appears.

### HUD

The detached HUD is a fixed-height pill. Stacked agent avatars are its status
display: full strength is running, quiet is resting. Longer content opens above the
bar. The bar never grows and has no outer shadow. Changing between HUD and full
panel keeps the window on its current monitor. The bar always uses `--r-pill`, including while chat or roster is open;
expanded conversation and roster surfaces use `--r-plane`. The full panel puts
the agent picker and reduce/redock controls in one row, without a redundant title.

### Page Header Pattern

A page header carries a sentence-case title, breadcrumb, one factual state line,
any question for the user and an optional view switcher. Search and
filters belong to the list or table they affect.

## Do's and Don'ts

### Do:

- **Do** keep loading, content, empty, error, disabled, and recovery visually distinct.
- **Do** pair color with text, position, shape, or iconography.
- **Do** keep all controls keyboard reachable and restore focus after overlays.
- **Do** announce consequential asynchronous state changes through scoped live regions.
- **Do** preserve user reading position while streaming agent output.
- **Do** use the same selection-strength token for rows, cards, and segments.
- **Do** use neutral hairlines for floating surfaces, and semantic field/failure borders.
- **Do** verify every primary surface at desktop, 390px, and 200% zoom.

### Don't:

- **Don't** use generic card grids as page scaffolding or nest cards inside cards.
- **Don't** add pane borders where the shell gap already provides separation.
- **Don't** use arbitrary radii, font sizes, shadows, or palette utilities.
- **Don't** use accent borders to decorate buttons, checkboxes, cards, or selection.
- **Don't** duplicate shared primitive behavior in a page-specific component.
- **Don't** use gradients as chrome; procedural avatars and analytical canvas
  rendering are the intentional exceptions.
- **Don't** pulse, spin, or shimmer to communicate waiting. State is explicit text.
- **Don't** animate content entrance. Controls may acknowledge interaction; the
  listening waveform and measured speaking avatar are the only ambient motion.
- **Don't** add a route, sidebar item, default view, or persistent surface without
  Adam's approval.

Every UI change is reviewed for token use, complete states, 390px reflow,
keyboard operation, reduced motion, and agreement with neighboring Hermes-derived
components before it lands.

### Pane widths and navigation — approved 2026-09-05

Settings has one permanent entry in Places; the sidebar footer displays connection status only. Internal pane edges resize app content, not the native window. The middle pane’s left edge adjusts the sidebar; its right edge and both agent-panel edges adjust chat width. Sidebar and chat widths persist locally. Keyboard arrows adjust a focused divider, and widths stay within bounds that preserve a usable center. The outer window retains top/bottom and corner resize grips; an ejected panel retains native window edge resizing.

### Theme verification scope

Surface and semantic palette roles above remain the authority. `scripts/check-design-system.mjs --contrast` checks the actual normal/muted selected text, selected hover, primary and solid-fill ink, ordinary hover text and accent text (including 20% accent-soft fills) over five neutral planes: seven themes × fourteen accents × eleven strengths. It asserts the modeled CSS formulas to prevent silent checker drift. This resolves the contrast gaps recorded in `design/features/app-refinement/evidence/pane-controls/THEME-AUDIT.md`. Native representative light/dark reviews supplement the source-derived contrast matrix; neither certifies every user-authored chart or document color. Current evidence: `design/features/app-refinement/evidence/accent-states/VERIFICATION.md`.

When the agent panel or HUD is detached, the main app reserves no side strip or placeholder pane. The existing header panel button focuses the detached window.

The HUD always shows idle dictation and voice-chat controls. Unavailable controls remain disabled with a reason in their label/tooltip; visibility must not enable recording or change voice preferences.

### Activity and Settings navigation

Settings retains the Activity destination. Activity presents five neutral cards: compact Needs attention, Running and Connections summaries above larger Usage and Outcomes charts. Running counts live conversations; persisted queued/in-progress workflow records stay in a separate review dialog. Period and workspace stay visible; target filters and detailed counters expand on demand. Cards become one column based on the content pane width. Use the existing Bklit chart kit with scales, hover values, and compatible line/bar or ring/bar selectors; keep exact counts/coverage available as text. Group header filters when wrapping; open status lists in the shared dialog so the summary row stays compact. Chart display choices persist locally and travel with pinned widgets. Pin dialogs use labeled Home/workspace destinations, a visible Cancel action and focus return to the invoking control.

Settings sections remain labeled. The menu uses the same CollapsibleRail and CollapsedRailTrigger chevrons as Databases and Canvas, with a persisted collapse preference. Below 600px of Settings content width, the same chevron opens the shared navigation drawer without changing that saved preference; dismissal returns focus to the opener. Agent/team identity and picker remain in the common panel header through docking/HUD. HUD height is bounded by the native viewport so long rosters scroll while the pill stays visible.

### Settings capability taxonomy

Plugins is reserved exclusively for IntelliZen SDK extensions built for this app. CLI plugins, skills, commands and MCP connections belong together in Capabilities: one provider selector, one search field and collapsible type sections. Provider details link to a filtered view. Do not move CLI inventories into Plugins or create separate Skills/MCP pages.

New capability switches are scoped to IntelliZen sessions and disclose when reconnection is needed. Existing Hermes profile controls must clearly identify their shared scope. Long capability descriptions expand separately from the switch and wrap fully, including at 200% zoom. Unsupported adapter controls are labeled provider managed rather than displayed as functional switches.
