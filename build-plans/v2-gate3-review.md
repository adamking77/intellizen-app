# IntelliZen V2 Gate 3 Review

**Date:** 2026-07-27  
**Status:** Passed
**Branch:** `v2-integration`

## Implemented

- exact Codex CLI pin: `codex-cli 0.145.0`;
- native runtime dispatch through `src-tauri/src/runtimes.rs`;
- exact invocation contract:
  `exec --strict-config --json --ephemeral --ignore-rules --sandbox workspace-write -c 'approval_policy="never"' -C <working-directory> -`;
- stdin prompt delivery and JSONL event normalization;
- truthful terminal failure for provider, JSON, timeout, cancellation, and
  rejected-output failures;
- worker-only `CODEX_HOME` profile with a single canonical IntelliZen MCP build;
- per-run capability environment inheritance by name only:
  `INTELLIZEN_WORKER_CAPABILITY_URL` and
  `INTELLIZEN_WORKER_CAPABILITY_TOKEN`;
- runtime discovery for installed version and isolated authentication readiness;
- Settings → Runtimes review/create flow and versioned local binding store;
- native live probe with a clean Git assignment, nonce challenge, scoped loopback
  broker, and measured provider usage;
- durable schema-v1 Workflow Run receipt in `workspace.records` and
  `workspace.work_events`.

## Isolation and binding readback

```text
worker profile:
  ~/Library/Application Support/IntelliZen/worker-profiles/codex-local-primary

binding:
  codex-local-primary

binding/profile permissions:
  0600

MCP inventory:
  intelizen-worker

admin MCP servers visible:
  none

provider auth:
  Logged in using ChatGPT
```

The global Codex profile, global auth file, and admin MCP inventory were not
copied, linked, or mounted into the worker profile. Device authorization wrote
only the isolated profile's provider-managed auth state.

`runtime-bindings.json` contains the exact pinned arguments, the canonical
Codex binary, the IntelliZen working-directory grant, an empty `secretRefs`
array, and Gate 3 capability evidence. The generated worker `config.toml`
contains only `intelizen-worker`, its 11 reviewed tools, and the two capability
environment variable names. It contains no capability value, provider token,
Supabase credential, or admin MCP.

## Settings → Runtimes proof

The settings write was exercised through a separate local debug bundle with the
unique identity `IntelliZen V2 Dev`. `/Applications/IntelliZen.app` was not used
for the successful proof and is excluded from all subsequent V2 build
verification.

Observed flow:

```text
Settings · Runtimes
  Codex CLI
  codex-cli 0.145.0
  READY

Review binding
  Review complete. Creating this binding writes the local binding store
  and worker-only Codex profile.

Create binding
  Codex runtime binding created
  BOUND
```

The first review exposed and prevented a real defect: the argument validator
rejected the required `approval_policy="never"` value because it contained an
equals sign. The fix permits only that exact value when paired with `-c`; all
other assignments and credential-like arguments remain rejected. The native
profile writer was also corrected to preserve the two per-run capability
environment names.

The expanded sidebar settings control now has an explicit accessible name,
which made the dev UI flow keyboard/automation addressable.

## Live native worker proof

The live probe:

1. creates an isolated temporary Git assignment with no application source or
   credentials;
2. starts a loopback broker that accepts only one authenticated `list_roles`
   capability;
3. returns a random proof nonce only from the broker result;
4. dispatches Codex through the same native runner used by the app;
5. requires the terminal response to echo that unknown nonce;
6. rejects extra tools, unsafe arguments, missing capability calls, provider
   errors, terminal-contract mismatches, and fixture changes.

Post-UI proof:

```text
result: passed
version: codex-cli 0.145.0
runtime run: gate3-e5d495d8-7467-4854-946a-e450abee6093
provider session: 019fa313-c8bd-70c0-9049-f31c42c99bb7
worker MCP servers: intelizen-worker
admin MCP servers visible: none
capability calls: list_roles exactly once
assignment modified: false
input tokens: 59688
cached input tokens: 37376
output tokens: 258
reasoning output tokens: 178
```

Evidence:

- `build-plans/evidence/v2-gate3-live-codex-proof.json`
- `build-plans/evidence/v2-gate3-post-ui-live-codex-proof.json`
- `scripts/v2-gate3-codex-probe.mjs`

## Durable receipt

Production project: `jicrdrwtwubveyvzyyrh`

Affected tables:

- `workspace.records`
- `workspace.work_events`

Read-only preflight found the Workflow Runs schema-v1 fields, the three expected
RPC signatures, and zero existing records with the proof key.

Write/readback:

```text
workflow run:
  517efab1-59b0-4a21-b044-2e89af1a9a8d

assignment:
  7b58b7c9-40d0-428f-85c8-0884cbb56e2b

status:
  Done

run version:
  4

step state:
  completed

dispatcher lease:
  released

events:
  dispatcher_lease_acquired
  runtime_assignment_started
  runtime_assignment_completed
  dispatcher_lease_released

secret markers in event payloads:
  0
```

The run was created once, transitioned only through the Gate 1 RPC family, and
read back through both the local service client and the Supabase connector.

Evidence:

- `scripts/v2-gate3-persist-proof.mjs`

## Verification

- Codex adapter fixture and exact-version rejection tests;
- native sanitized environment, cancellation, timeout, and process-tree tests;
- native runtime-binding tests, including safe pinned config and rejected
  environment/credential arguments;
- generated worker config contains no `supabase-genzen`, service-role name, or
  provider API key;
- canonical `mcp-server/dist/index.js --plane worker` negotiation exposes
  exactly the 11 reviewed worker tools;
- live worker negotiation exposes zero generic create, update, relation, or
  roster-proposal tools;
- live Codex proof passes before and after Settings-created binding persistence;
- durable receipt is complete, leased/fenced, versioned, append-only, and
  secret-free;
- full application, MCP, Rust, smoke, and bundle-secret regression is green.

Gate 4 may begin.
