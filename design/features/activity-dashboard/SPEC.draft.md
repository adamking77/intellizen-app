# Activity dashboard — discussion draft

Status: proposal, not approved for implementation. Owner: Keel; product decision: Adam. Reviewed 2026-09-05. Sources: current request, DESIGN.md, Settings/Activity, shared chart components, dashboard pins, ACP bridge and independent panel-target recheck. This draft does not authorize deployment or introduce a new top-level navigation item.

## Intent and evidence

Adam needs to see what is happening across agents, what requires his action, and whether the work is completing reliably. The current Activity view renders seven measures per Hermes profile plus shared counters as long rows. Its collector reads ACP connection count and workspace receipts, but per-agent analytics come from Hermes. InstrumentFigure draws its own SVG sparkline. Activity exposes Home pinning, while the underlying dashboard model already supports workspace scopes.

The ACP bridge already maps context usage updates into session usage but drops optional cost. The public ACP usage contract supports context used/size and optional cumulative cost; presence depends on the provider. Connected does not mean every metric is available. Missing analytics currently fall through several zero-valued conversions; the redesign must distinguish unknown from measured zero.

## Information priority

Five default cards, aggregated across providers. Agent/team and workspace are filters, not repeated dashboards for every agent.

| Card | User decision | Primary content | Presentation |
| --- | --- | --- | --- |
| Needs attention | What must I unblock? | Pending approvals/questions, failed work, actionable disconnects; owner and waiting age | Prioritized actionable list, prominent when nonempty |
| In progress | What is happening now? | Work title, responsible agent/team, stage, elapsed time and last meaningful activity | Compact list linking to the actual conversation/run |
| Outcomes | Is work finishing reliably? | Completed, failed, cancelled and blocked runs in the selected period | Shared stacked bars; counts and denominator available |
| Usage | What resources are being consumed? | Reported cost or clearly labeled estimate, reporting coverage; token/context detail on expansion | Shared line chart when real historical samples exist |
| Connections | Is anything preventing work? | Connected/available/unreachable providers, last update and recovery action | Compact status card; never equate idle with broken |

Tool-call counts, cards moved, per-agent session totals, raw token breakdowns, uptime and restart timestamps belong in details/diagnostics. Completion is not a claim of verified output quality. Account subscription limits are distinct from session usage and require an explicit provider source.

## Journey and placement

Proposed placement: an Activity tab within the existing Agents destination. Settings retains provider configuration and detailed diagnostics. This is a proposed information-architecture change, not an approved route migration.

Enter → scan attention and current work → narrow the date/workspace/agent filter only if needed → open a card's relevant conversation or details → return with filters intact. Keep the header to period, scope and an overflow menu; filters beyond these are progressive disclosure.

Cards use the app's neutral theme surfaces and existing radius/type hierarchy. At wide content widths use two columns with attention/in-progress given more space; at narrow pane widths use one column. Fit the actual content pane rather than assuming a full desktop window.

## Responsibilities

- Reuse the existing chart library for real time series and outcome comparisons; do not draw another sparkline implementation. Lists are the appropriate visualization for attention and live work.
- Each card offers Pin to Home and Pin to workspace dashboard from one menu. Reuse the existing pin records/rendering. Save the selected scope/period with the pin; workspace widgets show workspace-attributed data, never quietly global totals. Opening details keeps the same scope.
- Keep one normalizer per connected runtime boundary. Use native structured events/ACP usage where available. Uninstrumented external CLI sessions are outside coverage until explicitly integrated. Do not scrape every terminal or fabricate telemetry.
- Deduplicate by runtime/session/run/event identity. Cumulative session usage must not be summed as incremental usage. Do not double count one workflow and its provider events as separate completed workflows. Persist only normalized observations needed for the chosen history window, using the existing storage surface after schema review.
- Settings navigation can collapse to reclaim width. Show a labeled section picker when collapsed/narrow, not an unexplained strip of icons; retain the active section and keyboard access.

## Boundary states

Unavailable usage reads Not reported; an offline provider is distinguished from stale data and true zero. Partial totals disclose reporting coverage and retain available providers. Preserve the last good sample with its timestamp on refresh failure. Charts show gaps for missing samples and an empty state without invented history. Current work without a trustworthy last-event signal says so; elapsed time alone does not prove a stall.

Pinning failure leaves the previous dashboard intact and offers retry. No approval, stop, retry, provider restart, or message send happens merely by viewing a card. Pending decisions open their existing scoped controls. Keyboard order follows visual order; menus and filters work at 200% and narrow pane widths.

## Acceptance and implementation order

1. Verify telemetry coverage for connected Hermes/ACP providers; preserve unknown/estimated/reported distinctions and cumulative accounting in executable tests.
2. Build the five cards using existing charts; list details remain contextual. No seven-row-per-agent default.
3. Add Home/workspace pin destination support for the same card renderer and saved filters. Verify reload, partial data and no cross-workspace leakage.
4. Implement the approved Activity placement and collapsible Settings navigation only after Adam accepts that direction.
5. Independently inspect live native light/dark, narrow/200%, offline/partial and keyboard states. Confirm each displayed total against its source period and ownership.

Dependencies: historical CLI usage may need additional persistence; workspace attribution is not implemented in the current Activity collector. Do not substitute global metrics. No Activity implementation has been made in this discussion.

Protocol reference: https://agentclientprotocol.github.io/typescript-sdk/types/UsageUpdate.html

## Related panel repair recommendation

The stable individual-agent HUD recheck passed both direct and full-panel handoff; the earlier AGENTS fallback was not reproduced. Team chat currently replaces the panel header with RoomView and disables ejection; PanelFrame carries only selectedProfile/directory/individual threads. Use one shared target header for agents and teams, retain each draft, and carry the selected room plus its main-owned state/actions across ejection before enabling team HUD. The team HUD should show team identity/current speaker and reopen the same room. Simply enabling the button would display the wrong conversation. Team voice addressing needs an explicit recipient/coordinator rule before voice chat can start.

## Git checkpoint recommendation

Create a reviewed source checkpoint before another feature implementation. Current inspection found 93 modified tracked files, 38 tracked deletions and 380 untracked files (including generated evidence). Review the audit deletions and new migrations explicitly; include required new source/tests/docs alongside their consumers. Exclude temporary browser traces, local outputs, credentials and unreviewed business-content captures. Use a codex/ branch and separate reviewable commits where dependencies permit. A local commit is distinct from pushing that branch to GitHub; nothing was committed or pushed during this discussion.
