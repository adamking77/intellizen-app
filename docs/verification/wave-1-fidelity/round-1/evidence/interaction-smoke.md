# Interaction smoke — round 1

| Path/state | Action | Expected | Observed | Side effect |
| --- | --- | --- | --- | --- |
| Settings → Appearance | Select Connected panes | Shell switches from segmented cards to one divided surface | Passed in Chromium; `aria-pressed` moved to Connected and subsequent Home capture used connected panes | Local preference only |
| Agents | Open New agent | Donor-shaped editor opens and focuses name | Passed in Chromium | None; dialog closed without saving |
| Agent panel | Open target picker | Popover opens over panel with available groups | Passed; empty browser fixture displayed `No agents listed` | None |
| Donor Agents | Open agent row menu | Small menu with Open in chat, Edit, Delete | Passed in built donor | None; menu dismissed |
| Donor Agents | Open New agent | Editor modal opens | Passed in built donor | None; cancelled |
| Donor Agents | Open New team | Team sheet opens with roster and disabled Create | Passed in built donor | None; cancelled |
| Donor panel | Open target picker | Teams and Agents roster appears | Passed in built donor | None |
| Donor panel | Reduce to HUD | Floating HUD replaces full panel | Action executed, but transparent capture was blank and macOS subsequently locked | Window mode only |

No send, delete, save, publish, deploy, or database mutation was performed during
the fidelity evaluation.
