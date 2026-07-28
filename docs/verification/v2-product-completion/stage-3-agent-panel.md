# Stage 3 — Role-aware Agent Panel

Date: 2026-07-28

Artifact:

- `/Users/adamking/projects/intellizen-app/src-tauri/target/debug/bundle/macos/IntelliZen V2 Dev.app`
- bundle identifier `com.genzen.intellizen.v2dev`

Verified in the exact Tauri app:

- The panel header presents the selected role first, then separate availability, occupant, runtime, and execution-mode facts.
- Chief Engineer reports `Blocked · Keel · codex-cli · ephemeral`.
- Its canonical work accessory links to `Zen Futurism distribution 1.1.0 local release proof` and surfaces the exact publication approval gate.
- Verifier reports `Unavailable · No eligible occupant and runtime binding`; the composer remains disabled.
- Collapse and expand preserve the selected role, conversation, route context, and active-work state.
- Eject opens the exact `tauri://localhost/agent-panel` standalone window. After its canonical queries resolve, Chief Engineer, the blocked work item, conversation, and `/home` context remain intact.
- Re-attach restores the same state in the main window.
- Team and Workflows consume the same workflow-run read model used by the panel.

Evidence:

- `03-panel-active-work.png`
- `03-panel-standalone.png`

Automated checks:

- `pnpm test` — 207 passed, 1 skipped.
- `pnpm run check` — passed.
- `VITE_INTELLIZEN_LOCAL_ACCESS_KEY= pnpm smoke` — passed.
- Local debug `.app` rebuild — passed.

No roster, workflow, run, approval, or receipt record was added or updated during manual acceptance.
