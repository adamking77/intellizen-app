# Wave 1 fidelity evidence manifest — round 3

Collected 2026-09-03 from the locally built release app at
`src-tauri/target/release/bundle/macos/IntelliZen.app`, with the uncommitted
Wave 1 completion changes present on `063de67`.

| ID | Artifact | State | Environment | Limitation |
| --- | --- | --- | --- | --- |
| R3-SHELL-01 | `screenshots/current-release-home-toolbar.png`, `current-release-sidebar-collapsed.png`, `current-release-focus-mode.png` | Connected Home and the five donor shell controls; sidebar and focus modes | Built macOS `.app`, 1500×940 logical window, Mocha, dark | Home contains Adam's current local data. |
| R3-SET-01 | `screenshots/current-release-settings-appearance.png`, `current-release-settings-voice.png` | Donor-matched Appearance and Voice pages after heading correction | Built macOS `.app` | The remaining Settings pages were already captured after the same heading correction in round 2. |
| R3-AGENT-01 | `screenshots/current-release-agents.png`, `current-release-agent-menu.png`, `current-release-agent-editor.png`, `current-release-team-editor.png` | Populated Agents page, row menu, existing-agent editor, and new-team sheet | Built macOS `.app`, live Hermes profiles | No profile or team was saved, edited, or deleted. |
| R3-HOOK-01 | `screenshots/current-release-agent-open-in-chat.png` | Agents row action selects Fiona and opens the real docked panel and composer | Built macOS `.app`, live Hermes profile | No message was sent. Streaming and message rows were already accepted in the Phase A walk on 2026-09-02. |
| R3-PANEL-01 | `screenshots/current-release-panel-collapsed.png`, `current-release-panel-reopened.png`, `current-release-panel-detached.png`, `current-release-panel-redocked.png`, `current-release-hud.png` | Docked, collapsed, detached, redocked, and HUD states | Built macOS `.app` | The HUD is intentionally compact; its donor reference is `../../round-1/evidence/screenshots/donor-reference-hud-*.png`. |
| R3-DOCS-01 | `screenshots/current-release-docs-external-workspace-copy.png` | An absolute external-file reference opens the complete workspace copy without crossing the vault-relative boundary | Rebuilt macOS `.app`, live Documents data | The external file is deliberately left unchanged; edits persist to the workspace copy. |
| R3-PROPOSAL-01 | `screenshots/current-release-docs-proposal-ready.png` | Disposable Docs record with two independent proposal hunks ready for Adam's accept-one/reject-one walk | Rebuilt macOS `.app`, live Documents data and local proposal store | No hunk was accepted or rejected during preflight. |
| R3-ACP-01 | `screenshots/current-release-settings-codex-acp-ready.png`, `current-release-agents-acp-fixture.png`, `current-release-agent-panel-codex-ready.png` | Codex ACP adapter discovered, one configured agent, and its real panel target ready on demand | Rebuilt macOS `.app`, `codex-acp` at `~/.local/bin/codex-acp` | No ACP prompt was sent during preflight. |
| R3-ROOM-01 | `screenshots/current-release-agents-mixed-team-fixture.png`, `current-release-room-mixed-team-ready.png` | Prepared mixed team and reusable room containing Fiona through Hermes plus Wave 1 ACP through Codex ACP | Rebuilt macOS `.app`, live Hermes and local ACP configuration | The room log is intentionally empty for Adam's walk. |
| R3-WALK-FAIL-01 | `screenshots/current-release-room-acp-failure.png` | Adam's mixed-team walk reached both doors: Fiona replied and the legacy Codex ACP adapter returned an internal error | Rebuilt macOS `.app`, live Hermes and local ACP configuration | Failure evidence is preserved. The local registry now points at the successor adapter proven by the ignored live Rust contract test. |
| R3-REPAIR-01 | `screenshots/current-release-workflows-runnable.png`, `interaction-smoke.md` | Successor ACP turn, repaired Schedule binding, non-blocking Quick Note creation, hidden frontmatter, and conventional Graph embed parsing | Rebuilt macOS `.app`, live configuration plus automated contract tests | Workflow redesigns are not claimed; the four interaction changes in Adam's feedback remain approval-gated. |
| R3-REFLOW-01 | `../../../../../output/playwright/wave-1-200-percent-equivalent-reflow.png` | 720×900 CSS viewport, equivalent to a 1440×900 viewport at 200% | Chromium/Vite | Supplementary layout evidence only; Tauri-backed calls are unavailable in a browser. |
| R1-DONOR | `../../round-1/evidence/screenshots/donor-*` | Donor comparison set for every surface in the roadmap table | Built Hermes Workspace `.app` and donor references | See the round-one manifest. |

`current-native-shell-toolbar.png` is a black capture taken while the screen was
locked and is deliberately excluded from the evidence IDs above.
