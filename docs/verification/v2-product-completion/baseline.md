# IntelliZen V2 product-completion baseline

Recorded before the product-correction implementation.

- Commit: `bdd30a8`
- Branch: `v2-integration`
- Runtime bindings: Codex `0.145.0` and Claude Code `2.1.220`, both bound locally; both model allowlists are empty.
- Live roster: Fiona occupies Operations Director through Hermes, Keel occupies Chief Engineer through `codex-local-primary`, Adam occupies Founder Approval Authority, and Verifier is unstaffed.
- Live Workflow Registry: 18 records, 5 schema-v1 definitions, 13 SOP-only records.
- Historical baseline snapshot at `f6daee3`: `pnpm test` passed 190 assertions; `VITE_INTELLIZEN_LOCAL_ACCESS_KEY= pnpm smoke` passed 17 Rust tests and the production bundle build. These are commit-anchored historical counts, not the current suite total.

Observed product gaps in the exact `IntelliZen V2 Dev.app`:

- Settings is a two-runtime modal launched from a static `Systems nominal` claim.
- Runtime readiness collapses installed, supported, authenticated, bound, assigned, and usable into `BOUND`.
- Team is not reachable as a top-level product surface.
- Workflows mixes executable and SOP-only records in one lane.
- The designer presents a vertical step form rather than a spatial, shared topology.
- The Agent Panel remains open beside Workflow Design and does not show a canonical active-work accessory.

Baseline screenshots:

- `00-baseline-home.png`
- `00-baseline-settings-dialog.png`
- `00-baseline-workflow-library.png`
- `00-baseline-workflow-designer.png`
