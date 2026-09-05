# Activity and panel delivery verification — 2026-09-05

## Delivered

GitHub checkpoint 34adf6b and team panel repair b93a7a2 were pushed in the requested order to `codex/refinement-and-activity`. Activity adds the five-card dashboard, shared chart rendering, progressive filters, Home/workspace card pins and collapsible Settings navigation. Activity remains under Settings after the navigation correction below; the transitional Agents Activity route redirects back. Backend ACP usage preserves optional cumulative cost and unknown context values. No database migration was required.

Independent native review reproduced a missed initial individual HUD frame after restart. The correction stores the main-owned frame in native memory before opening the detached window and reads it after installing the live listener. Revision ordering rejects older reads. The cache holds only the current in-memory frame and never persists conversation content. Long HUD rosters now scroll within the native viewport.

## Checks

- `pnpm run check`: file-size, product-contract, TypeScript and design-system checks passed, including 40,964 foreground/state contrast pairs.
- Frontend: 689 tests passed, one existing skip. Includes missed-event initial handoff, out-of-order read/live update, team send ownership and draft revisions, workflow deduplication, UTC period boundaries, unknown/estimated/reported costs, stale source recovery, partial provider availability, deepest-folder ownership, pin reload/scope enforcement, and actual card pin read/write/read with retry after failure.
- Native: 56 tests passed, three opt-in integration tests ignored. ACP cost/context translation covered. Native build and Clippy with warnings denied passed.
- MCP: build passed and 30 tests passed. Card IDs remain compatible with instrument pinning; workspace pins do not block creating a Home instrument pin.
- Frontend production build uses placeholder Supabase settings with local/service credentials omitted. The ordinary build guard correctly refused the credential-bearing environment. The safe build and bundle-secret scan are recorded in `/tmp/intellizen-final-build.log` and `/tmp/intellizen-final-secrets.log`.
- Updated executable installed in the local V3 Dev wrapper, with prior binaries retained. No release artifact was uploaded or deployed.

## Native evidence and limits

Local independent evidence: `evidence/NATIVE-REVIEW.md`, plus the final handoff follow-up. Captures remain outside Git because the live app can display private workspace content. Activity review exercised light and dark themes, actual narrow content panes, progressive filters, pin destinations and both Escape/Cancel focus return. The original narrow Settings picker has been superseded by the shared rail controls (see navigation correction below). Team/individual panel transitions were exercised without sending messages or recording audio.

Pin persistence and failure/reload behavior were tested against controlled read/write/read fixtures; native review did not save test pins into the live Supabase workspace. Provider cost production was not triggered by a real billable agent run. No claim of arbitrary terminal history, account limits or complete provider billing coverage is made.

Current data boundaries are deliberate and visible: entity scope is not workspace ownership; workflow, team and aggregate historical costs remain unassigned to hierarchy workspaces. Known session working directories use the existing project hierarchy. CLI usage shown here is cumulative live-session data, separate from Hermes history. Completion counts are not quality scores.

Final fresh-app native handoff acceptance passed: direct individual/team HUD, roster scroll with pill visible, selected-team highlight, chat/full expansion and redock. Original target, empty drafts, window width and theme preferences were restored. The final section of `evidence/NATIVE-REVIEW.md` supersedes the earlier initial-frame blocker.

## Settings navigation correction

Adam rejected the Activity relocation and the bespoke Settings collapse/picker behavior. Activity has been restored to Settings; the shared rail controls now match Databases and Canvas. Dashboard cards, charts, filters and pin contracts are preserved. Current repair receipt: `design/features/hermes-settings-parity/CLI-INVENTORY-VERIFICATION.md`.
