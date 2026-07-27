# IntelliZen V2 Gate 6 Review

**Date:** 2026-07-27  
**Status:** Verification pending  
**Branch:** `v2-integration`

Gate 6 is not closed. The implementation and deterministic verification are
present, but the isolated Claude worker login and the final visual pass against
the latest `IntelliZen V2 Dev.app` binary still require Adam's local browser and
unlocked Mac.

## Implemented

- pinned `claude-cli` adapter for exactly `2.1.220 (Claude Code)`;
- strict worker-only Claude MCP configuration with the same 11 reviewed tools
  as the Codex worker plane;
- `CLAUDE_CONFIG_DIR` isolation, `--strict-mcp-config`, `dontAsk`,
  `--no-session-persistence`, stdin prompt delivery, and stream-JSON
  normalization;
- runtime discovery and Settings review/create flow for Codex and Claude;
- role-first Agent Panel routing through Roles, Agents, Role Assignments, and
  local runtime bindings;
- ConversationEvent v2 migration and per-role history, draft, unread, and
  cleared-state keys;
- role and draft continuity across eject/re-dock;
- behavior-frozen shell, thread, composer, and run-inspector seams;
- Hermes transport seam and corrected active-profile selection;
- explicit Save-to-document preview followed by a separate confirm-write
  action;
- schema-v1 Workflow Designer with list, graph, inspector, raw JSON, validator
  dry run, save preview, and activation preview;
- four Draft Workflow Registry patterns: role handoff, founder approval,
  independent verification, and coordinator-to-specialist;
- a truthful decision record that Wave 1 does not claim parallel fan-out
  without fork/join schema semantics;
- per-run deny-only loopback capability broker for local panel chats that have
  no explicit worker capability grant.

## Isolation and runtime evidence

The ungranted Codex panel path has a completed live native proof:

```text
adapter: codex-cli 0.145.0
dispatch boundary: src-tauri/src/runtimes.rs
runtime run: gate6-panel-5f5f6b4f-6c4d-415c-b57f-bae5af974c5b
provider session: 019fa393-fb46-7c72-92b4-48d03bf0d749
terminal message: GATE6_PANEL_OK
explicit capability grant: false
deny-only broker injected: true
assignment modified: false
production desktop launched: false
```

Evidence:

- `build-plans/evidence/v2-gate6-live-panel-proof.json`
- `scripts/v2-gate6-panel-probe.mjs`

The isolated Claude profile currently reports:

```json
{
  "loggedIn": false,
  "authMethod": "none",
  "apiProvider": "firstParty"
}
```

The installed Claude CLI exposes browser login only; `claude auth login --help`
has no device-code option. A login process is already waiting on the isolated
profile. No global Claude credential has been copied, linked, or inherited.

The Claude live probe is prepared at
`scripts/v2-gate6-claude-probe.mjs`. It will accept Gate 6 only when the actual
`system/init` event reports:

- exactly one MCP server, `intelizen-worker`;
- exactly the 11 reviewed worker tools;
- `permissionMode: dontAsk`;
- one authenticated `list_roles` capability call returning a nonce absent
  from the prompt;
- no admin MCP server;
- no assignment modification;
- a successful terminal result with measured usage.

## Product-surface evidence

The exact V2 dev bundle is:

```text
/Users/adamking/projects/intellizen-app/src-tauri/target/debug/bundle/macos/IntelliZen V2 Dev.app
CFBundleIdentifier: com.genzen.intellizen.v2dev
```

The production app at `/Applications/IntelliZen.app` is excluded and has not
been launched for Gate 6.

An earlier V2-dev visual pass verified:

- role selector states for Operations Director, Chief Engineer, Founder
  Approval Authority, and Verifier;
- `Chief Engineer · Keel · codex-cli · ephemeral`;
- selected role and draft survival across eject/re-dock;
- the real `/workflows` route;
- all four Draft patterns;
- a valid four-step coordinator-to-specialist graph;
- dry-run language stating that nothing dispatches;
- exact JSON and no-authority-expansion save preview;
- Codex bound and Claude login-required Settings states.

That pass found and fixed the `/workflows` redirect defect. The latest V2-dev
binary also contains the deny-only panel broker, so it must be relaunched and
the final role-chat, 390 px, and keyboard-focus checks repeated before closure.
The Mac is currently locked; no substitute app or browser preview counts.

## Deterministic verification

Current targeted Gate 6 suite:

```text
13 test files passed
75 tests passed
```

It covers:

- exact Codex and Claude adapter contracts;
- worker-isolation acceptance parsing;
- runtime-binding candidates;
- ConversationEvent v2;
- per-role selection and storage migration;
- run-inspector authority and verification labels;
- save-to-document preview/write separation;
- local runtime chat terminal handling;
- Workflow Designer transforms and canonical validation;
- designer output passed unchanged into the Gate 4 runner;
- attachment, panel-history, and Hermes profile regressions.

Native verification covers the sanitized process boundary, per-run deny broker,
timeout, cancellation, process-tree cleanup, binding validation, and runtime
discovery. Full smoke and bundle-secret scans will be repeated after the final
Claude/UI proof, not inferred from an earlier binary.

## Remaining closure actions

1. Adam completes the already-open Claude browser login for the isolated
   `claude-local-primary` profile.
2. Run the prepared live Claude nonce/capability probe and store its sanitized
   result.
3. Create the reviewed Claude binding only after the Settings preview and
   explicit confirm-write action.
4. Unlock macOS, quit and reopen only the exact V2 dev bundle, and repeat the
   latest-binary role-chat, eject/re-dock, 390 px, and keyboard-focus checks.
5. Run the full app, MCP, Rust, smoke, and secret-scan suite.
6. Change this review to `Passed` and commit the final Gate 6 evidence package.

Gate 7 must not be credited until every item above is complete.
