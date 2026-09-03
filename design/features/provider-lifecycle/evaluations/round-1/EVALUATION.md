# Provider lifecycle and Settings indicators — round 1

## Audit scope

- Surface: IntelliZen v3 Settings → Providers, General, Capabilities, Context, Voice, and Appearance.
- Reference: `/Users/adamking/projects/hermes-app/src/pages` and `/Users/adamking/projects/hermes-app/src/tokens.css`.
- User goal: discover supported provider CLIs on the computer, connect or disconnect them in one click, and always read identity, selection, success, failure, and inactive states by the same color rules used in Hermes.

## Findings and resolution

1. **Provider discovery — fixed.** Discovery now probes each provider CLI independently from its ACP adapter, includes common Finder-launched macOS binary locations, and recognizes the bundled Codex executable.
2. **Provider connection — fixed.** Every usable provider row exposes Connect; the first click creates the provider's default agent when needed and starts its ACP session.
3. **Provider disconnection — fixed.** A connected row exposes Disconnect, which stops every live agent session for that provider without deleting agent configuration.
4. **Claude Code default agent — fixed.** A discovered Claude Code CLI now uses the official ACP bridge on demand when a global adapter is absent, and creates `provider-claude-code` before starting it.
5. **App lifecycle — fixed.** Reconnect on launch restores previously connected ACP providers; Disconnect Everything includes Hermes and all live ACP sessions.
6. **Settings indicator colors — fixed.** Provider identity uses `--runtime`; connected/verified uses `--ok`; unavailable/failure and destructive actions use `--bad`; enabled switches and explicit active labels use `--accent`; neutral metadata and inactive switches stay on the text ramp.
7. **Shared switch implementation — fixed.** General, Capabilities, and Voice now use one Settings switch, matching Hermes' 55%-accent enabled track, accent knob, 14%-text inactive track, and muted-text knob.

## Verification

- Type and product-contract checks: passed.
- Frontend tests: 386 passed, 1 skipped.
- ACP Rust tests: 5 passed, 1 ignored because it requires a logged-in adapter.
- Rust clippy with warnings denied: passed.
- Production frontend build and bundled-secret scan: passed.
- Targeted assertions cover one-click default-agent creation, connected Disconnect state, runtime-blue provider identity, semantic-green connected state, and both enabled and inactive Hermes switch treatments.

## Evidence limit

The in-app browser's narrow viewport clipped the Settings work surface, and its web runtime cannot execute Tauri discovery commands. That capture was rejected and is not used as audit evidence. The v3 native process remains running for manual visual and first-connection verification. A first connection through an on-demand npm bridge may download and execute that provider's official ACP package, so it was not triggered autonomously.

final result: passed with named native verification gap
