# Activity and panel delivery verification — 2026-09-05

## Sparse bar-width correction — reverified

Adam rejected the oversized Outcomes bars after the preceding review. That review missed the sparse-data width problem; its bar-proportion acceptance is superseded. Activity now caps Outcomes bars at 28 CSS pixels and Usage bars at 16, centered within unchanged category slots so labels and hover targets remain aligned. Dense charts can shrink below the cap. Other chart consumers retain their existing default widths. A focused rendered-SVG regression checks sparse and dense widths, group centering and horizontal/stacked thickness.

Fresh independent native review passed standard, wide and narrow proportions for both bar charts, category-label alignment and tooltip values/placement. The user’s current Bar/Bar selection, filters, pane sizes and empty draft were restored. Local evidence: `evidence/BAR-WIDTH-REVIEW.md`; private captures remain outside Git. Full frontend suite: 712 passed, one existing skip. Check, safe production build, bundle-secret scan and diff check passed.

## Pin destination focus correction — reverified

Adam identified the rejected accent outline around the Dashboard select in the Pin widget dialog. The shared select already supplied its neutral line-strong editing border, but the global keyboard-focus rule added a second accent outline. Shared select fields now suppress that outer outline and shadow. Native keyboard traversal also exposed the same global outline on the dialog container itself; that non-control surface now suppresses it while Cancel, Pin widget and other actionable controls retain their focus indicators.

Independent native review passed the full Pin Outcomes tab cycle: the Dashboard select remained neutral, the HTML and dialog surfaces showed no whole-modal outline, and both buttons retained their accent focus cue. A temporary Sogo selection was discarded. Escape and visible Cancel each restored exact focus to the invoking pin button, and no pin was saved. The current Activity filters, Bar/Bar display choice, pane sizes and empty draft were restored. Check, safe production build, bundle-secret scan and diff check passed. Local report: `evidence/SELECT-FOCUS-REVIEW.md`; private captures remain outside Git.

## Previous full visual verification — sparse-bar defect missed

Adam authorized a fresh independent native pass after edits, followed by a GitHub commit. This checkpoint supersedes the partial Activity and Capabilities native acceptance recorded below and in the CLI inventory receipt.

The reviewer exercised both pages in the native V3 Dev app, compared the supplied Hermes references, and repeated the affected checks after fixes. Activity coverage includes compact summaries and bounded review dialogs, 7/30-day periods, workspace and agent filters, honest empty/unattributed states, line/bar usage and ring/bar outcomes, keyboard chart selection, hover values, exact counts, and Home/workspace pin-dialog cancellation. Capabilities coverage includes provider filters and deep links, search/empty results, grouped inventories, visible on/off/provider-managed states, Hermes shared-profile scope and descriptions, unsupported provider coverage, and the separate SDK-only Plugins page. Both pages passed representative Macchiato/Latte, narrow-pane and 200% checks.

Findings repaired and reverified:

- Thirty-day line charts now use spaced domain ticks instead of labeling every date.
- Hermes descriptions expand independently of capability switches and remain readable at 200%.
- Narrow Settings panes use the existing chevron and shared navigation drawer, preserving the saved rail preference and active section.
- Activity review dialogs and the Settings drawer return focus to their exact invoking control on dismissal.
- Connections displays its global scope directly in the summary when a workspace filter is active.

Final checks: 708 frontend tests passed, one existing skip; product, TypeScript, file-size and design checks passed, including 40,964 theme/state contrast pairs. The placeholder-environment production build, bundle-secret scan and diff check passed. No dependency, native backend or schema change was needed for this follow-up.

Independent local report: `evidence/FULL-VISUAL-VERIFICATION.md`. Final captures include `full-41-activity-light-wide.jpg` and `full-42-final-dark-restored.jpg`; exact capture paths are indexed by the report. Live screenshots remain outside Git because they can contain private workspace content. The reviewer restored the original theme/accent/strength, pane sizes, collapsed Settings rail, Activity filters and chart styles, and empty chat draft before releasing the UI.

This passes the bounded visual gate for these two pages. No real capability switch, provider connection, pin save, message, workflow run or recording was used. Switch enforcement and pin save/retry remain covered by controlled tests rather than a new billable/live-provider exercise. This is not a release or main-branch merge.

## Earlier Activity visual revision — partial native acceptance

Adam rejected the earlier Activity design. All prior Activity visual passes below are historical and are superseded by this revision; panel and navigation results retain their separate scope.

Implemented a compact summary row with focused review dialogs, a prominent Bklit usage chart and outcome ring/bar chart, compatible persistent display selectors, grouped responsive filters, and explicit separation between live conversations and stored open workflow states. Reported and estimated costs remain distinct; missing dates remain gaps. Pinned chart displays use existing instrument configuration, with backward-compatible defaults. No new dependency, telemetry store or schema was added.

Final checks for this revision:

- `pnpm test`: 707 passed, one existing skip, across 141 passing files.
- Activity regressions: 14 passed, including old workflow states excluded from live Running, approval retention/order, chart-selection remount and pin serialization, pin write retry, and review-dialog close followed by exact workflow navigation.
- `pnpm run check`: file size, product contracts, TypeScript, design-system rules and 40,964 foreground/state contrast pairs passed.
- Placeholder-environment production build and `scripts/check-bundle-secrets.sh dist` passed. No native Rust or MCP implementation changed in this revision.
- React review: direct chart imports, existing query/preference subscriptions, event-driven selection, typed optional chart config, shared accessible Segmented/AppDialog controls; no additional data-fetching path or global event listener.

Independent native review: `evidence/ACTIVITY-REDESIGN-REVIEW.md`. The reviewer inspected the supplied Hermes reference images and assembled app. Corrected and reverified filter wrapping and point-marker emphasis; verified chart display switching with keyboard arrows, axes/legends, honest live counts, and the larger-pane layout. The review found that expanded lists stretched summary cards; those lists were subsequently moved to the shared dialog and covered by mounted interaction tests. This final dialog change has **not** received fresh native visual acceptance.

Native gestures stopped when automatic approval review rejected selecting Last 30 days because of active user interaction. Tooltip hover, period application, pin-dialog cancellation, 200%/narrow reflow and the final detail dialogs remain unverified in this new native pass. The last observed state was Activity visible, Last 7 days, All workspaces, Line/Ring defaults, empty Wave 1 ACP composer, and Settings rail collapsed from the wider-pane check; no attempt was made to overwrite active user state. No live pin writes, agent messages, workflow runs, recordings or provider changes were used for verification.

## Historical delivery below


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
