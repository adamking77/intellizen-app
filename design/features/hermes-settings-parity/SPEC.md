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

## CLI capabilities correction — 2026-09-05

Settings Plugins is reserved exclusively for IntelliZen SDK extensions. CLI plugins, skills, commands and MCP connections share the Capabilities page, with one provider selector, search field and collapsible kind sections. Provider details open a provider-filtered Capabilities view. Hermes shared profile controls appear within the selected Hermes view.

IntelliZen capability selections are app-scoped, persisted in local app data and applied to new adapter sessions; no provider configuration files are written. Existing chats are not interrupted and require reconnection to receive changed selections. Supported switches: Codex skills, plugins and MCP enablement; Claude plugins and MCP tool access. Claude MCP restrictions block tool calls without disconnecting the provider-owned server. Other entries are labeled provider managed. Existing Hermes profile switches retain gateway-backed writes and explicitly disclose that profile settings are shared with other apps.

Inventory scanning reads user-scope configuration and installation metadata and returns names, kinds and configuration states only. It does not start agents, expose credential values, count arbitrary cache directories as installations, or infer live connection health. Coverage is disclosed in the UI: user skills; Claude commands and Codex prompts; Hermes manifests, Claude installation registry and Codex configured plugins; Claude/Codex/Gemini/Qwen MCP configuration. Project overrides, bundled plugin contributions, remote installs and other CLI formats are outside the inventory.
