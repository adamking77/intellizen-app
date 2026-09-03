# Interaction smoke — round 2

One Playwright run exercised the new main-strip controls and failed the run on
any unexpected state.

| Action | Expected | Result |
| --- | --- | --- |
| Collapse agent panel | Docked panel becomes the compact Expand control | Passed |
| Expand agent panel | Target and composer return | Passed |
| Enter focus mode | Sidebar and docked panel leave the layout | Passed |
| Leave focus mode | Sidebar and docked panel return | Passed |
| Collapse sidebar | Compact Expand sidebar control appears | Passed |
| Expand sidebar | Full navigation returns | Passed |

Eject and HUD were not invoked in Chromium because those actions require the
native window host. No durable data changed.
