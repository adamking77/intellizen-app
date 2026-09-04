# K.13 — Activity and instrument widgets

## Implemented

- Settings has an `Activity` section; it is not a route or sidebar item.
- The page reads per-agent Hermes usage, current turn timing, session failures, engine/ACP state, `workspace.work_events`, workflow approvals, and Hermes cron outcomes.
- Every metric row can add or remove one `instrument` record in the existing shared Home Pins database. Nothing is pinned by default.
- Home renders that record through the existing draggable/resizable grid. The instrument is one tabular value, its word, a neutral sparkline, and semantic color only on the value.
- `pin_view_to_home` accepts either `view_id` or `instrument_id`; confirmed MCP writes retain the existing receipt contract.
- Proposal accept/reject actions now emit the receipts their Activity counters read.

## Evidence

The seven screenshots are the current branch rendered against the existing Vite server in its browser shell. Hermes/Tauri-only sources correctly report unavailable there; live data is exercised by the same collector in the desktop host.

- `activity-flat.png`
- `activity-latte.png`
- `activity-frappe.png`
- `activity-macchiato.png`
- `activity-mocha.png`
- `activity-nitro.png`
- `activity-oled.png`

Automated acceptance coverage:

- `src/lib/home-pins.test.ts` pins and unpins `attention.waiting` without changing unrelated pins.
- `src/components/home/instrument-widget.test.tsx` renders the pinned value and proves it changes when the shared Activity query refreshes.
- `src/lib/activity.test.ts` verifies agent, engine, work, decision-wait, workflow-outcome, and current-attention aggregation.

## Gates

- `pnpm check`
- `pnpm test`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- `cargo test --manifest-path src-tauri/Cargo.toml engine --lib`
- `cd mcp-server && pnpm test && pnpm build`
- `VITE_INTELLIZEN_LOCAL_ACCESS_KEY= pnpm build`
- `scripts/check-bundle-secrets.sh dist`
