---
name: IntelliZen
description: A calm, editorial desktop workspace for directing intelligence work.
colors:
  rail: "#11111a"
  panel: "#171724"
  work: "#1d1d2c"
  raised: "#252539"
  text: "#aeb6cf"
  text-muted: "#9ca4bd"
  accent: "#7fa6e6"
  waiting: "#e2a47d"
  verified: "#a6cfa1"
  failure: "#d47b95"
  runtime: "#789cd6"
typography:
  title:
    fontFamily: "Geist, sans-serif"
    fontSize: "16px"
    fontWeight: 300
    lineHeight: 1.2
    letterSpacing: "0.16em"
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

Hermes Workspace is the UI and interaction reference. IntelliZen keeps its own
information architecture and domain surfaces, but shared shell, agent, theme,
type, motion, accessibility, and component behavior follows the Hermes system.
The implemented source of truth is `src/index.css`, `src/lib/theme.ts`, and the
shared components under `src/components`.

**Key Characteristics:**

- Three stable planes: rail, panel, and work.
- Editorial hierarchy from space and type rather than decoration.
- Dense desktop controls with complete keyboard parity.
- Agent identity carried consistently by avatar, bubble, voice, and HUD.
- Explicit loading, content, empty, error, and recovery states.

## Colors

Seven Calmppuccin-derived flavors provide five dark and two light compositions.
Each exposes the same semantic roles; components never know which flavor is
active.

### Primary

- **User accent:** primary action, user voice waveform, links, keyboard focus,
  and color swatches. Ordinary selection uses the neutral raised plane. The
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

**Selection in Lightness.** Selection shifts the raised plane by a fixed OKLCH
lightness step—up on dark flavors and down on light flavors—with a 0.06 floor.
Dark selections borrow a small amount of the active accent's chroma; light
selections stay neutral.

**Borders Mean Two Things.** A border marks a field actively being edited or a
failure whose word appears beside it. The color-swatch inset ring and the tree's
live drop target are the only operational exceptions. Accent borders are not
selection, button, checkbox, or card decoration.

**The Selection Strength Rule.** Settings ▸ Appearance is the only place that
writes `--sel-step`. Its 0.04–0.14 slider defaults to 0.08, and every selected
surface reads the same token.

## Typography

**Display Font:** Geist
**Body Font:** Geist
**Label/Mono Font:** Geist Mono

**Character:** restrained, compact, and editorial. The interface has no display
type and no marketing-scale headings inside the shell.

### Hierarchy

- **Page title:** 16px, weight 300, uppercase, +0.16em tracking.
- **Section:** 11px, weight 300, uppercase, +0.14em tracking, muted.
- **Body:** 14px, weight 400, sentence case.
- **Interface:** 13px, weight 400, sentence case.
- **Meta:** 12px, weight 400.
- **Rail group:** 11px, weight 450, uppercase, +0.14em tracking.
- **Identifier:** Geist Mono, 12px, weight 400.
- **Count:** 10px, weight 400, muted; counts only.

### Named Rules

**The Closed Scale Rule.** Chrome uses only 16, 14, 13, 12, 11, and 10px. A
size outside the scale is a defect unless it belongs to user content or a data
visualization whose readability requires it.

**The Light Capitals Rule.** Tracking gives uppercase hierarchy its structure;
heavy uppercase labels do not.

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
Persistent cards do not use shadows. One soft shadow is reserved for transient
popovers/dialogs and one for the detached HUD, which sits outside the window's
plane hierarchy.

**The No Ghost Card Rule.** Do not combine a structural border, rounded
container, and wide shadow on the same persistent surface.

## Shapes

Shape communicates role rather than decoration:

- Major planes: 12px.
- Controls, rows, fields, cards, messages, disclosures, and nodes: 8px.
- Pills: 999px, reserved for non-clickable state words and circular identity.

Selection is a raised fill, never a colored side stripe or focus ring. Borders
mean editable input or failure. A hairline may separate adjacent content without
enclosing it.

## Components

The kit has twelve components. These are the only shared shapes for their roles;
page-specific content composes them rather than creating new variants.

| Component | Shipped contract |
|---|---|
| Control | 28px high, 8px radius; default, selected, primary, quiet, danger; loading is a 6px running dot. |
| Segmented | 28px track, 2px inset and gap; roving keys; the selected child uses the selected plane. |
| Field | Input-plane ground, no border at rest, line-strong while editing; text entry relies on the caret. |
| Select | Field contract with native appearance removed and one dim chevron. |
| Card | Raised plane, 8px radius, 9px × 11px padding; hover wash; selected plane when selected. |
| Pill | Non-clickable state word, 999px radius; neutral, waiting, verified, failure, runtime. |
| Identity | 16px identity mark, name, then runtime; Hermes, ACP, or you. |
| Decision field | One waiting-tint question with compact choices; the recommended choice is primary. |
| Receipt | Mono 11px tool or work line with explicit settled, running, or failed state. |
| Drawer | 320px transient work-plane detail, 12px radius, 200ms motion, Escape and focus return. |
| Skeleton | In-place raised bars; 1.4s sheen stops under Reduce Motion. |
| Empty state | Left-aligned teaching sentence and at most one Control; no box. |

All non-text-entry controls use one 1px accent `:focus-visible` outline at a 2px
offset. There is no focus shadow. Fields and textareas use the caret plus their
line-strong editing edge.

### Procedural Avatar

Every agent chooses a mesh gradient sphere or Blobatar. The sphere is rendered by
`@outpacelabs/avatars`; the blob is rendered by `blobatar`. Name/identifier seeds
are deterministic. Blob silhouette and identity color may be pinned per agent.
Uploaded profile pictures may override the procedural face without deleting the
saved procedural choice.

Cards and editor previews animate a Blobatar only on direct hover. Dense rows and
team stacks are static. While an agent speaks, its avatar responds to measured
audio level—never to a decorative timer—and Reduce Motion removes the transform.

### Agent Conversation

Every turn is a message bubble. The user enters from the opposite side on one
constant accent-derived ground. An agent bubble uses that agent's identity hue
and always includes the same avatar and name. Work products are actionable cards;
tool runs collapse to a summary. Run status sits directly above the bottom
composer.

The log follows the live edge only while the reader is within 32px of it. When
the reader has moved away, position holds and a “New reply” action appears.

### HUD

The detached HUD is a fixed-height pill. Stacked agent avatars are its status
display: full strength is running, dimmed is idle. Longer content opens above the
bar. The bar never grows and uses the sole sanctioned persistent shadow.

### Page Header Pattern

A page header carries the caps title, breadcrumb, one state line, what waits on
you, an optional view switcher, and at most one primary Control. Search and
filters belong to the list or table they affect.

## Do's and Don'ts

### Do:

- **Do** keep loading, content, empty, error, disabled, and recovery visually distinct.
- **Do** pair color with text, position, shape, or iconography.
- **Do** keep all controls keyboard reachable and restore focus after overlays.
- **Do** announce consequential asynchronous state changes through scoped live regions.
- **Do** preserve user reading position while streaming agent output.
- **Do** use the same selection-strength token for rows, cards, and segments.
- **Do** use borders only for active editing or an explicitly named failure.
- **Do** verify every primary surface at desktop, 390px, and 200% zoom.

### Don't:

- **Don't** use generic card grids as page scaffolding or nest cards inside cards.
- **Don't** add pane borders where the shell gap already provides separation.
- **Don't** use arbitrary radii, font sizes, shadows, or palette utilities.
- **Don't** use accent borders to decorate buttons, checkboxes, cards, or selection.
- **Don't** create a thirteenth kit component when composition of the twelve works.
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
