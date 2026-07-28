# Stage 5 — Shared visual workflow topology

Date: 2026-07-28

Artifact:

- `/Users/adamking/projects/intellizen-app/src-tauri/target/debug/bundle/macos/IntelliZen V2 Dev.app`
- bundle identifier `com.genzen.intellizen.v2dev`

Verified in the exact Tauri app:

- The seven-step Gate 4 proof is understandable on one spatial canvas without opening the property inspector.
- The graph exposes the manual trigger, primary action, role handoff, condition with true/false branches, distinct verification, recorded decision, founder approval, simulated artifact, blocked terminal, and complete terminal.
- Design mode owns the center plane with a workflow outline, spatial canvas, and step inspector. The Registry rail and Agent Panel collapse by default.
- `Ask this role` reopens the panel on Operations Director without turning the designer into a roster editor.
- Dragging a new edge reconnects the exact schema-v1 `next`, `then`, or `else` field. Automated round-trip coverage proves the resulting schema remains valid and runner-compatible.
- Dry-run reuses the same node and edge identities, resolves the explicit Keel verifier override, reports all seven steps, and states `dispatches nothing`.
- The existing blocked proof run opens from its canonical active-work link on the same topology.
- Live state is explicit: execution blocked, receipt pending, founder approval approved, verification completed, and overall completion not recorded.
- The live artifact node and blocked terminal are visually distinct from completed action, handoff, decision, verification, and approval nodes.

Evidence:

- `05-workflow-designer.png`
- `05-workflow-dry-run.png`
- `05-workflow-live-run.png`

Automated checks:

- Historical snapshot at `a55038b`: `pnpm test` — 213 passed, 1 skipped.
- `VITE_INTELLIZEN_LOCAL_ACCESS_KEY= pnpm smoke` — passed.
- Topology identity and direct-edge round-trip tests — passed.
- Local debug `.app` rebuild — passed.

No workflow definition, run, approval, receipt, roster, or runtime-binding record was added or updated during manual acceptance.
