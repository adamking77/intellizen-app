# IntelliZen V2 Gate 3 Review

**Date:** 2026-07-27  
**Status:** In progress — human-owned provider login pending  
**Branch:** `v2-integration`

## Implemented

- exact Codex CLI pin: `codex-cli 0.145.0`;
- reviewed stdin/JSONL/ephemeral/workspace-write invocation;
- observed event normalization and measured token usage;
- worker-only `CODEX_HOME` profile writer;
- runtime discovery for version and isolated auth readiness;
- Settings → Runtimes review/create flow;
- live isolation probe script using a clean assignment directory;
- worker environment names aligned to the canonical MCP capability contract:
  `INTELLIZEN_WORKER_CAPABILITY_URL` and
  `INTELLIZEN_WORKER_CAPABILITY_TOKEN`.

## Current readback

```text
worker profile:
  ~/Library/Application Support/IntelliZen/worker-profiles/codex-local-primary

MCP inventory:
  intelizen-worker

admin MCP servers visible:
  none

provider auth:
  login required
```

The global Codex profile, its auth state, and its admin MCP inventory were not
copied, linked, or mounted into the worker profile.

## Verification already green

- Codex adapter fixture and exact-version rejection tests;
- native sanitized environment, cancellation, timeout, and process-tree tests;
- generated worker config contains no `supabase-genzen`, service-role name, or
  provider API key;
- Settings dialog renders as a keyboard-complete application modal and exposes a
  distinct browser/native-discovery failure state;
- `pnpm smoke` passed after the Gate 3 UI and runtime changes;
- bundle scan found no Supabase service-role JWT.

## Exit work remaining

Adam must complete provider-managed login in the isolated profile. After that:

1. run `scripts/v2-gate3-codex-probe.mjs`;
2. verify the terminal result and provider-measured usage;
3. verify the clean assignment fixture was not modified;
4. record the dedicated schema-v1 transition and receipt against local test data;
5. rerun full smoke and the bundle scan.

Gate 4 does not begin until those checks pass.

