---
name: IntelliZen
description: A calm, editorial desktop workspace for directing intelligence work.
colors:
  rail: "#11111a"
  panel: "#171724"
  work: "#1d1d2c"
  raised: "#262637"
  text: "#cdd6f4"
  text-muted: "#9ca4bd"
  accent: "#89b4fa"
  waiting: "#fab387"
  verified: "#a6e3a1"
  failure: "#f38ba8"
  runtime: "#74c7ec"
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
  row: "4px"
  message: "10px"
  plane: "12px"
  pill: "999px"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.rail}"
    rounded: "{rounded.pill}"
    padding: "5px 13px"
  navigation-selected:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.row}"
    padding: "7px 10px"
  message-agent:
    textColor: "{colors.text}"
    rounded: "{rounded.message}"
    padding: "8px 11px"
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

- **User accent:** selection, primary action, user voice waveform, links, and
  focus. The user selects one of fourteen named accents.

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
- Rows, fields, disclosures, and state fills: 4px.
- Messages: 10px.
- Tags, compact actions, and mode controls: full pill.

Selection is a raised fill, never a colored side stripe or focus ring. Borders
mean editable input or failure. A hairline may separate adjacent content without
enclosing it.

## Components

### Buttons

Compact text actions use pill geometry. Icon-only actions are circles and carry
a programmatic name. Primary action uses the user accent; destructive action uses
failure only after consequence is clear. Hover and focus are distinct states.

### Cards / Containers

Cards exist only for movable or independently actionable objects. Basic groups
use spacing and dividers. Empty states do not nest a second card inside a card.

### Inputs / Fields

Fields use the row radius, the input plane, and a functional edge. Focus uses a
two-ring treatment that survives accent/surface hue collisions. Errors name the
problem and recovery beside the field.

### Navigation

Navigation selection raises the entire row. Hover uses a quieter fill. Connected
and segmented modes preserve the same information architecture and focus order.

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

## Do's and Don'ts

### Do:

- **Do** keep loading, content, empty, error, disabled, and recovery visually distinct.
- **Do** pair color with text, position, shape, or iconography.
- **Do** keep all controls keyboard reachable and restore focus after overlays.
- **Do** announce consequential asynchronous state changes through scoped live regions.
- **Do** preserve user reading position while streaming agent output.
- **Do** verify every primary surface at desktop, 390px, and 200% zoom.

### Don't:

- **Don't** use generic card grids as page scaffolding or nest cards inside cards.
- **Don't** add pane borders where the shell gap already provides separation.
- **Don't** use arbitrary radii, font sizes, shadows, or palette utilities.
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
