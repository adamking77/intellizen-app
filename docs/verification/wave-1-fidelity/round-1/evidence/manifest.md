# Wave 1 fidelity evidence manifest — round 1

Collected 2026-09-03 in the `v3/phase-0` working tree at `063de67`, with the
uncommitted Wave 1 completion changes present.

| ID | Artifact | State | Environment | Limitation |
| --- | --- | --- | --- | --- |
| CUR-NATIVE-01 | `screenshots/current-native-shell.png` | Home, connected Hermes, installed fixture plugin and isolated broken plugin | Running Tauri dev app, 1500×940 logical window | One native state only; macOS locked before the remaining native interactions could be captured. |
| CUR-SET-01 | `screenshots/current-settings-providers.png` through `current-settings-general.png` | Every Settings section | Chromium/Vite, 1440×900, Mocha, dark | Tauri APIs are absent, so provider scans and filesystem-backed values are not representative. |
| CUR-APP-01 | `screenshots/current-settings-appearance-connected.png` | Appearance, Connected panes selected | Chromium/Vite, 1440×900, Mocha, dark | Visual state is representative; native window chrome is not. |
| CUR-AGENT-01 | `screenshots/current-agents.png`, `current-agent-editor.png` | Empty Agents page and new ACP-agent editor | Chromium/Vite, 1440×900, Mocha, dark | Native Hermes profiles and AppData teams are unavailable. |
| CUR-PANEL-01 | `screenshots/current-agent-panel-target-picker.png`, `current-ejected-panel.png` | Empty target picker and standalone panel route | Chromium/Vite, 1440×900, Mocha, dark | No live transcript; standalone route is not the native floating-window size. |
| CUR-SHELL-01 | `screenshots/current-shell-home-connected.png` | Home shell, Connected panes | Chromium/Vite, 1440×900, Mocha, dark | Native data calls fail visibly, as expected outside Tauri. |
| DONOR-SET-01 | `screenshots/donor-settings-*.jpeg` | Every donor Settings section | Built Hermes Workspace `.app`, 1272×768 logical window, Mocha, dark | Captures contain Adam's local donor data. |
| DONOR-AGENT-01 | `screenshots/donor-agents.jpeg`, `donor-agent-editor.jpeg`, `donor-team-sheet.jpeg`, `donor-agent-row-menu.png` | Populated Agents page, editor, team sheet, row action menu | Built donor `.app` | Row-menu capture is a full-screen capture because the accessibility menu has no window screenshot. |
| DONOR-PANEL-01 | `screenshots/donor-agent-panel-target-picker.jpeg`, `donor-shell-workspace.jpeg` | Docked panel and populated target picker | Built donor `.app` | Providers were offline, so no live message was sent. |
| DONOR-HUD-01 | `screenshots/donor-agent-hud.jpeg`, `donor-agent-hud-screen.png` | Live donor HUD capture attempt | Built donor `.app` | The transparent HUD captured blank; the Mac locked during the attempt. Not valid visual proof. |
| DONOR-HUD-REF-01 | `screenshots/donor-reference-hud-*.png` | Donor-authored HUD collapsed, expanded, panel, and voice references | Copied from `~/projects/hermes-app/visual-references/07-hud-voice/` | Design reference, not a fresh executable capture. |
| SRC-DONOR-01 | `~/projects/hermes-app/src/pages`, `src/AgentPanel.tsx`, `src/EjectedPanel.tsx`, `src/Hud.tsx` | Donor implementation | Source inspection | Source supports anatomy and behavior claims, not rendered pixel claims. |
| SRC-CURRENT-01 | `src/components/settings`, `src/views/Agents.tsx`, `src/components/agent`, `src/components/layout` | Current implementation | Source inspection | Source supports implementation and semantic claims, not native rendered state. |

The browser captures deliberately retain the visible “not in the desktop host”
errors. They prove failure-state treatment and layout but are not evidence that
the corresponding native capability is broken.
