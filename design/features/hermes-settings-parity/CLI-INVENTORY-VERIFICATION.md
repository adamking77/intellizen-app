# Settings navigation and CLI inventory repair — 2026-09-05

## Cause and authority

Adam reported the missing Settings Activity destination, inconsistent menu collapse controls, and missing CLI plugins. Activity had been moved into Agents in `69aa703`, which also introduced bespoke Settings collapse/picker controls. Both decisions were corrected. The dashboard itself and its pin/source contracts are retained.

The provider/plugin gap was older: the prior provider/capabilities implementation last changed in `a8c0ac3` (2026-09-04). CLI providers remained listed, but expanded provider details only said capabilities were inherited. Capabilities exposed Hermes skills/toolsets/connections, while Plugins enumerated only IntelliZen frontend extensions. There is no evidence this work deleted provider installations.

The backlog authority is `ROADMAP.md` B.5 donor parity and `design/features/hermes-settings-parity/SPEC.md`. The reference app's `src/pages/Capabilities.tsx` explicitly includes provider-filtered skills, commands, plugins and MCP connections. The earlier parity acceptance failed to catch the narrowed implementation. This repair adds the missing readout without adding a plugin marketplace or changing provider configurations.

## Result

- Activity remains at `/settings?section=activity`; transitional `/agents?view=activity` redirects back.
- Settings uses the same shared rail and chevron controls as Databases and Canvas. Collapse persists and does not change the active section.
- Provider details link into a filtered CLI inventory. Capabilities has one provider selector/search and retains shared Hermes profile controls within the Hermes selection. Plugins remains exclusively for IntelliZen SDK extensions. CLI plugins are grouped inside Capabilities alongside skills, commands and MCP connections.
- Native scanning is read-only and independent of Hermes availability. It returns names, kinds and configuration states, not credentials, command arguments or configuration bodies. It neither launches nor connects providers.
- Plugins are drawn from Hermes manifests, Claude's installation registry and Codex's plugin configuration. Arbitrary cache directories are not labeled installed plugins. Skill symlinks are supported.
- Search, provider selection, kind disclosures and explicit source coverage keep long inventories manageable. Read/parse failures preserve other results and disclose incompleteness; unsupported providers are distinguished from empty supported sources.

## Scope

User-level sources only: immediate skill directories, Claude commands, Codex prompts, the plugin sources above, and configured Claude/Codex/Gemini/Qwen MCP server names. Project overrides, bundled plugin contributions, remote installs and other CLI formats are not included. Configured/enabled does not establish runtime health. App-scoped switches are available for Codex skills/plugins/MCP enablement and Claude plugins/MCP tool access. Claude MCP switches block access without disconnecting the CLI-owned server. Other capabilities remain provider managed. Existing Hermes profile switches explicitly disclose their shared scope and retain their existing gateway writes. The new app-scoped controls never write CLI configuration files.

## Automated verification

- Full frontend suite: 703 passed, one existing skip; 26 focused tests cover: Settings navigation and collapse persistence, provider filtering, SDK-only Plugins separation, switch save/readback/failure, partial source warnings, native read failures, Activity aggregation/source coverage and pins.
- Full native suite: 67 passed, three opt-in integrations ignored. Parser and policy tests cover: installation registry versus cache, secret-value exclusion, safe parser errors with partial results, missing configuration and symlinked skills.
- `pnpm run check` passes (including 40,964 theme/state contrast pairs); native Clippy with warnings denied and native build pass.
- Production frontend build passes with placeholder public Supabase settings and local/service credentials omitted. Bundle-secret scan passes.
- MCP build passes after its Activity destination description was corrected.

## Native acceptance

Initial native review verified restored Activity entry, shared rail collapse/expand and 29 real provider plugin records (Claude 5, Codex 22, Hermes 2). That review preceded Adam’s SDK-only Plugins clarification and the app-scoped switch implementation. User activity interrupted filtering and narrow/200% checks. Final bounded native review confirmed SDK-only Plugins with no provider filter, Capabilities with 29 CLI plugins/112 skills/2 commands/13 MCP entries, visible Claude/Codex switches with correct on/off configuration state, provider-managed Hermes plugin labels, working group disclosure and empty-search behavior. Provider selection was again rejected by automatic approval review due to user activity, so the reviewer stopped. Selected-Hermes scope, native provider filtering, and narrow/200% checks remain incomplete; this is not a full native acceptance pass. Local captures remain outside Git because they can contain private workspace state. No provider connection, message send, recording, live pin write or deployment is part of this acceptance.

## Switch enforcement

The donor UI stores disabled capability ids, but `hermes-app/crates/agent/src/lib.rs` applies `Limits::args` only to Stream/Pty, not its ACP branch. That behavior is not ported as functional enforcement.

IntelliZen persists selections in its own `cli-capabilities.json`, reads them in the native adapter connection path, and applies Codex TOML table overlays or Claude SDK session options. Codex override keys are split literally on dots upstream, so capability names are encoded inside TOML values to preserve dotted names and avoid mis-targeted switches. The injected IntelliZen MCP server is also omitted when disabled for that provider. Selection save failure does not change the displayed switch. Malformed saved policy fails explicitly rather than silently resetting to unrestricted defaults. Existing sessions retain their snapshot until reconnected.

Primary adapter evidence: installed Codex ACP 0.16.0 `--help`; [Codex ACP v0.16.0 dependency contract](https://github.com/zed-industries/codex-acp/blob/v0.16.0/Cargo.toml); [Codex v0.137 configuration schema](https://github.com/openai/codex/blob/rust-v0.137.0/codex-rs/core/config.schema.json); [Claude ACP session options](https://github.com/zed-industries/claude-agent-acp/blob/main/src/acp-agent.ts). Native fake-adapter tests exercise real process arguments and the `session/new` JSON-RPC payload without opening a billable provider session. This proves transport wiring, not an end-to-end live-provider denial test.
