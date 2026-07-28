# Stage 4 — Workflow library semantics

Date: 2026-07-28

Artifact:

- `/Users/adamking/projects/intellizen-app/src-tauri/target/debug/bundle/macos/IntelliZen V2 Dev.app`
- bundle identifier `com.genzen.intellizen.v2dev`

Verified in the exact Tauri app against the live Workflow Registry:

- The library reports 5 executable schema-v1 records and 13 SOP-only records in separate lanes.
- Executable records distinguish Runnable, Draft, Blocked, and Needs review.
- The active Gate 4 proof is Runnable. The four schema-v1 pattern records are Draft.
- Catalog derivation reports exact definition, role, assignment, binding, runtime, and approval blockers.
- SOP-only records explicitly state that they are canonical reference material and cannot enter the designer or runner.
- Selecting `GenZen Daily Newsfeed` in the SOP-only lane exposes no Design or run control.
- The Agent Panel workflow picker lists only `V2 Gate 4 role-directed proof`, the sole currently runnable catalog item. It excludes every SOP-only record and every draft.
- Generic template, active, approval, and linked-run metric cards were removed.
- Canonical provenance remains available as the secondary `Open canonical record` action.

Evidence:

- `04-workflow-catalog.png`
- `04-workflow-sop-only.png`

Automated checks:

- `pnpm test` — 210 passed, 1 skipped.
- `VITE_INTELLIZEN_LOCAL_ACCESS_KEY= pnpm smoke` — passed.
- Local debug `.app` rebuild — passed.

No workflow, run, approval, receipt, roster, or runtime-binding record was added or updated during manual acceptance.
