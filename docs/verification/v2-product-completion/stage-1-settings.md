# Stage 1 — Settings and runtime truth

Date: 2026-07-28

Artifact:

- `/Users/adamking/projects/intellizen-app/src-tauri/target/debug/bundle/macos/IntelliZen V2 Dev.app`
- bundle identifier `com.genzen.intellizen.v2dev`

Verified in the exact Tauri app:

- Settings is a full route with Runtimes, Defaults, Worker access, Connections, and Diagnostics sections.
- Sidebar health is query-derived and reports `2 system issues`; the former static “Systems nominal” claim is gone.
- Codex CLI is installed, supported, authenticated, bound, assigned to Chief Engineer, and usable.
- Claude Code is installed, supported, authenticated, and bound, but not usable because it has no active role assignment.
- No model selector is shown because neither reviewed binding declares confirmed model choices.
- Supabase workspace, Hermes API, and local MCP report ready. Hermes gateway reports unavailable.
- Defaults restore through `?section=defaults`; Panel start role correctly includes the durable Operations Director target.

Evidence:

- `01-settings-runtimes.png`
- `01-settings-defaults.png`

Automated checks:

- `pnpm test` — 201 passed, 1 skipped.
- `pnpm run check` — passed.
- `VITE_INTELLIZEN_LOCAL_ACCESS_KEY= pnpm smoke` — passed.
- Rust runtime probe tests — 8 passed.
- Local debug `.app` rebuild — passed.

No runtime binding, role assignment, production Supabase record, external message, deployment, or release was created during this verification.
