# Wave 1 fidelity evidence manifest — round 2

Collected 2026-09-03 after the round-one fixes.

| ID | Artifact | State | Environment | Limitation |
| --- | --- | --- | --- | --- |
| R2-SET-01 | `screenshots/current-settings-providers.png` through `current-settings-general.png` | Every Settings section after title normalization | Chromium/Vite, 1440×900, Mocha, dark | Tauri-backed data remains unavailable. |
| R2-SHELL-01 | `screenshots/current-shell-toolbar.png` | Home with donor-style main-strip controls | Chromium/Vite, 1440×900, Mocha, dark | Native eject/HUD actions were not invoked. |
| R2-SMOKE-01 | Playwright interaction run | Panel collapse/expand, focus enter/leave, sidebar collapse/expand | Chromium/Vite | Safe existing state only. |
| R1-DONOR | `../../round-1/evidence/screenshots/donor-*` | Donor comparison set | Built Hermes Workspace `.app` and donor visual references | See round-one manifest. |

The macOS session remained locked, so a second native capture could not be
collected. The round-one native Home capture remains the most recent native
evidence.
