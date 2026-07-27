# IntelliZen V2 Gate 6 Review

**Date:** 2026-07-27  
**Status:** Passed
**Branch:** `v2-integration`

Gate 6 is closed. The implementation, deterministic verification,
latest-binary visual pass, isolated Claude worker probe, and reviewed local
binding are complete.

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
- Workflow Run action states derived from the returned canonical run status;
  creating a run no longer displays `Completed` unless the durable status is
  actually `Done` or `Completed`.
- production schema-v1 start path connected to the fenced in-app dispatcher;
- unique native-created local assignment directories inside the reviewed
  binding grant;
- production artifact guard that permits the approval-bound internal
  simulation and rejects document/record writes without a separate
  preview/confirm-write surface.
- Hermes API and webhook credentials moved out of the webview bundle and
  behind typed native-host commands for health, streaming, cancellation, runs,
  and signed gateway submission.

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

The isolated Claude profile reports authenticated provider state and the live
probe passed:

```text
adapter: claude-cli 2.1.220
worker MCP servers: intelizen-worker only
worker tools: 11 reviewed tools
admin MCP servers visible: none
permission mode: dontAsk
capability calls: list_roles exactly once
assignment modified: false
terminal result: GATE6_OK:<nonce returned only by the capability broker>
```

No global Claude configuration or credential was copied, linked, or inherited.
Provider login material remains under Claude's control inside the isolated
profile.

The live probe at `scripts/v2-gate6-claude-probe.mjs` accepted Gate 6 only after
the actual `system/init` event reported:

- exactly one MCP server, `intelizen-worker`;
- exactly the 11 reviewed worker tools;
- `permissionMode: dontAsk`;
- one authenticated `list_roles` capability call returning a nonce absent
  from the prompt;
- no admin MCP server;
- no assignment modification;
- a successful terminal result with measured usage.

The first authenticated run failed closed because Claude 2.1.220 interprets
`--safe-mode` as disabling even the explicitly supplied MCP server. Removing
that flag made `intelizen-worker` visible. The next run identified three
non-credential process descriptors injected by Claude into its MCP child; the
worker guard now admits only those exact names and continues to reject
unreviewed `CLAUDE_*` and secret-shaped environment variables. The final live
run passed.

Evidence:

- `build-plans/evidence/v2-gate6-live-claude-proof.json`
- `scripts/v2-gate6-claude-probe.mjs`

Settings → Runtimes showed Claude `READY`, displayed the reviewed local-binding
preview, and wrote `claude-local-primary` only after Adam's explicit approval.
The rebuilt V2 dev bundle now shows Claude `BOUND`. Readback confirms
`--strict-mcp-config`, no `--safe-mode`, no secret references, and the exact
worker profile.

## Product-surface evidence

The exact V2 dev bundle is:

```text
/Users/adamking/projects/intellizen-app/src-tauri/target/debug/bundle/macos/IntelliZen V2 Dev.app
CFBundleIdentifier: com.genzen.intellizen.v2dev
```

The production app at `/Applications/IntelliZen.app` is excluded and has not
been launched for Gate 6.

The latest V2-dev visual pass verified:

- role selector states for Operations Director, Chief Engineer, Founder
  Approval Authority, and Verifier;
- `Chief Engineer · Keel · codex-cli · ephemeral`;
- selected role and draft survival across eject/re-dock;
- `Command+Shift+A` focus return to the Agent Panel composer;
- a 394 px observed panel-width pass for the 390 px target, with the header,
  controls, and composer visible and no horizontal overflow;
- one truthful visible Codex failure followed by explicit edit/resend and a
  successful `GATE6_PANEL_OK` result;
- one `GATE6_HERMES_OK` result through the native-host Hermes transport;
- the real `/workflows` route;
- all four Draft patterns;
- a valid four-step coordinator-to-specialist graph;
- `DRY-RUN · DISPATCHES NOTHING` with role, approval, and graph checks passing;
- exact JSON and no-authority-expansion save preview;
- Codex and Claude bound Settings states.

The production app remained stopped throughout. Evidence is recorded in
`build-plans/evidence/v2-gate6-latest-ui-proof.json`.

## Deterministic verification

Current targeted Claude adapter/binding suite:

```text
2 test files passed
26 tests passed
```

It covers:

- exact Codex and Claude adapter contracts;
- worker-isolation acceptance parsing;
- runtime-binding candidates;
- ConversationEvent v2;
- canonical Workflow Run status-to-action-state mapping;
- per-role selection and storage migration;
- run-inspector authority and verification labels;
- save-to-document preview/write separation;
- local runtime chat terminal handling;
- Workflow Designer transforms and canonical validation;
- designer output passed unchanged into the Gate 4 runner;
- production artifact authority guard and UI-to-runner dispatch seam;
- attachment, panel-history, and Hermes profile regressions.

Native verification covers the sanitized process boundary, per-run deny broker,
dedicated grant-contained assignment directories, timeout, cancellation,
process-tree cleanup, binding validation, and runtime discovery. The current
native suite has 14 passing tests.

The first broad exact-value scan found the Hermes API key and webhook signing
secret in the frontend output, despite the earlier service-role-only scans
passing. After the native-host correction, a fresh production build contains:

```text
Supabase service-role key: 0 files
Hermes webhook signing secret: 0 files
Hermes API key: 0 files
intended local access header: 1 compiled asset
```

Current full regression:

```text
app: 38 test files passed, 187 assertions passed
intentional live Gate 4 skip: 1
MCP: 12 tests passed
Rust: 14 tests passed
TypeScript: passed
clippy -D warnings: passed
Vite production build: passed
pnpm smoke: passed
V2 dev app debug bundle: passed
```

The exact-value scan also passed against the final rebuilt V2 dev app bundle.
Its plist still reads `IntelliZen V2 Dev` and
`com.genzen.intellizen.v2dev`. The production app remained stopped.

Final Gate 6 verification:

```text
app: 38 test files passed, 187 assertions passed
intentional live Gate 4 skip: 1
MCP: 12 tests passed
Rust: 14 tests passed
Claude adapter/binding target: 26 tests passed
Claude live isolation probe: passed
TypeScript: passed
clippy -D warnings: passed
Vite production build: passed
pnpm smoke: passed
V2 dev app debug bundle: passed
service-role exact value: dist 0, app 0
Hermes API key exact value: dist 0, app 0
Hermes webhook secret exact value: dist 0, app 0
Hermes dashboard token exact value: dist 0, app 0
intended local access header: dist 1, app 0
```

Gate 7 may now begin.
