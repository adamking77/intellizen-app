# Handoff — 2026-09-02

**Phase 0 of 6 is committed on `v3/phase-0` (`2497b1b`). Nothing is pushed.
Phase A, the engine door, is next.**

## Do this first

```
git checkout v3/phase-0
pnpm install && (cd mcp-server && pnpm install)
pnpm check && pnpm test        # file sizes, tsc, 294 tests
pnpm tauri dev                  # the app, against the live GenZen Supabase
```

Then read `ROADMAP.md`: the rule, the center-panel rule, the tree, design
fidelity, and the Phase A stages. It carries status per phase.

## How this build runs

Claude is chief engineer and overseer. Builders get whole-problem briefs with
disjoint file ownership and must verify with screenshots. The overseer runs
every check on the combined tree, reads the screenshots, then Adam walks the
built app. A stage is accepted when Adam has used it, not when tests pass.

Nothing is committed and no migration is applied without Adam's word.

## Facts a cold session needs

- Hermes is the engine, reached through `hermes serve` (JSON-RPC over
  WebSocket at `/api/ws`, REST beside it). Hermes Desktop's TypeScript client
  under `~/.hermes/hermes-agent/apps/shared/src/json-rpc-gateway.ts` is MIT
  and is what Phase A copies into `src/engine/`.
- Claude Code, Codex, Gemini and Qwen join over ACP on Adam's subscriptions;
  Hermes cannot use those subscriptions cleanly. The ACP client to move in is
  `~/projects/hermes-app/crates/agent/src/acp.rs`.
- hermes-app is the design donor. Where it designed a surface, match it
  screen for screen (its built app is at
  `~/projects/hermes-app/target/release/bundle/macos/`).
- The Hermes MCP wrapper at `~/.hermes/mcp-servers/intellizen/run.sh` points
  at `~/projects/intellizen-app-v2/mcp-server/dist/index.js`. Check that path
  before assuming agents can reach the workspace.
- The hierarchy table is live: `workspace.hierarchy_nodes`, filled from
  operations, projects and investigations with `legacy_*` ids. Sessions are
  not yet a tier in the tree; they arrive with the gateway.
- Scripted mouse clicks into the Tauri window are blocked on this Mac;
  keyboard through osascript and `screencapture -x` work.
