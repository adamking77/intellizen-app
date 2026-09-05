# Activity dashboard

Approved by Adam on 2026-09-05. Sequence: GitHub checkpoint → team panel repair → Activity dashboard. This is the implementation contract; SPEC.draft.md preserves the earlier discussion.

## Experience

Activity lives in the existing Agents destination at `/agents?view=activity`. Agents & teams and Activity are adjacent views. Old Settings Activity links redirect there. Settings keeps configuration; its labeled section list can collapse and becomes a native section picker when the content pane is narrow.

Five neutral cards answer the main operating questions:

| Card | Content | Action |
| --- | --- | --- |
| Needs attention | Pending approvals/questions, failed conversations, blocked workflows, unavailable configured runtimes | Open the existing conversation, exact workflow run, or provider settings |
| In progress | Current individual/team turns and queued/running workflows, owner, known elapsed/last-activity times | Open that conversation or run |
| Outcomes | One latest state per durable workflow run in the period, with completed/total denominator | Shared bar chart and expandable exact counts/coverage |
| Usage | Hermes session history; reported and estimated costs kept separate, plus live Hermes/ACP session usage | Shared line chart with missing-data gaps; expand daily/source/session details |
| Connections | Connected, available on demand, or unavailable configured runtimes | Open provider settings |

Period and workspace stay visible. Agent/team filtering expands on demand. Four list entries show initially; additional entries expand inside the card. The grid changes to one column based on the content pane, not the outer screen width. Each card opens a labeled pin dialog with Home/workspace destinations, visible Cancel, focus trapping and return to the invoking control.

## Data and accounting contract

- Live conversations are those owned by this app's session/room stores. Their pending decisions retain exact target/request identity. Reading Activity never approves, sends, records audio, retries work or restarts a provider.
- Hermes profile history comes from `/api/analytics/usage?days=…&profile=…`. The local Hermes implementation was checked: it groups session lifetime cost by session start date, and COALESCE turns absent costs into zero. Positive cost subtotals are displayable; zero aggregates cannot prove free usage and read Not reported. Reported costs and estimates may describe overlapping sessions and are never added together.
- Period choices use the current and preceding 6 or 29 UTC calendar dates. Workflow results use completion timestamp when present, otherwise last update. Each run ID counts once; workflow events are not counted as additional completed runs. Deferred is distinct from cancelled. Failed/cancelled step states distinguish those outcomes on blocked/deferred runs. Completed does not claim verified output quality. Source reads are limited to the latest 1,000 workflow records, with a visible coverage note at the limit.
- ACP's optional `usage_update.cost` is cumulative amount/currency. The bridge retains it with context used/size. Missing/invalid values remain unknown. Current session usage is displayed separately from historical period totals, never summed repeatedly or blended across currencies. Token/context values appear only when supplied.
- Source failures retain last good values and their original timestamps. Hermes failure cannot erase available ACP data. Missing days stay gaps, not fabricated zeros. External terminal sessions and account subscription limits need explicit integrations and are not inferred.

## Workspace ownership and pins

The existing hierarchy's deepest matching project folder assigns a known session working directory to a workspace. This includes configured ACP working directories and Hermes session directories. Similar path prefixes do not match; nested projects in another workspace win.

Workflow records currently carry entity scope, not hierarchy workspace identity. Team rooms and profile-level cost history also lack durable workspace attribution. These are excluded from workspace totals and the cards explain the limitation. Connections remain labeled global configuration. This prevents cross-workspace leakage without inventing ownership or adding a new telemetry storage layer.

Home/workspace cards share the same renderer and collector. Pins use existing instrument records and persist period, target and source workspace filters in `config.activity`, with the destination in `config.dashboardScope`. A workspace widget enforces its destination scope even if config is edited. Pin writes use existing authoritative read/write/read reconciliation. Failed saves remain retryable. Legacy instrument IDs remain readable; the old private SVG sparkline was replaced with the chart kit.

## Related panel repair

Individual and team conversations retain the common target header through docked/full/HUD modes. Drafts are per target; only a successful accepted send with the same draft revision clears them. Main owns execution. The native host keeps one in-memory frame for initial handoff before the detached window opens; live revisions prevent an old read from replacing a newer update. It is not persisted to disk. Suffixed room names match team identity using the existing name/roster contract. A long HUD roster scrolls within the native viewport while the pill stays visible. Team voice conversation requires an explicit recipient rule; its disabled reason stays visible.

## Verification

See VERIFICATION.md and the local independent native reports. No deployment, main-branch merge, real agent message or voice recording belongs to this implementation.
