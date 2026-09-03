# Hermes settings and interaction parity

## Outcome

IntelliZen uses the Hermes application as its visual and interaction donor for Settings, hover, selected, focus, select, and disabled states while preserving IntelliZen's Hermes-plus-ACP product model.

## Acceptance criteria

- Settings uses the donor's seam-aware internal pane shell, navigation width, body width, spacing, rows, notices, and control density.
- Providers, Capabilities, Context, Voice, Appearance, and General expose the donor's relevant anatomy and interaction feedback without inventing incompatible provider controls.
- Ordinary selection uses the neutral raised plane; accent remains for primary actions, focus, semantic status, and color swatches.
- Buttons, icon buttons, pills, raw selects, shared selects, disabled controls, and keyboard focus have one consistent state contract.
- Agent avatar style, blob silhouette, and color choices respond on hover and show a neutral selected plane or a swatch ring as appropriate.
- There is no persistent or double focus glow around the composer, active agent rows, or other controls.

## Verification

- Typecheck and targeted/full tests pass.
- Production frontend build passes.
- Settings and agent surfaces are inspected in the running desktop application at normal and constrained widths.
