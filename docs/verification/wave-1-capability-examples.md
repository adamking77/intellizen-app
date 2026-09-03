# Wave 1 agent capability examples

Collected 2026-09-03 against the local release `.app`. This ledger closes
Fable 5.1 Done requirement 2 without creating a second demo system.

| Capability | Recorded example | Evidence |
| --- | --- | --- |
| See what Adam sees | With `/agents` open in the center, Adam's Fiona panel was asked which IntelliZen page was open. Fiona replied exactly **Agents**. | Native accessibility readback from the sole running release app, 2026-09-03 12:13 +04. |
| Write with a receipt | Keel appended the Wave 1 completion note to **Complete IntelliZen cockpit PRD**. | Tasks record `e2c487d6-74dd-4c5f-b57c-f33f89128eba`; the confirmed MCP write emitted its work-event receipt. |
| Ask before consequential work | A role-directed workflow stopped at founder approval and recorded Adam's approval before its bounded simulation continued. | Workflow Run `48830d19-55ea-45cc-8f3c-f5e0fa03aa5e`; approval `b6dd118f-c675-4733-a34d-73c8c9db011d`. |
| Keep working while Adam is away | A delegated Docs task moved through the ordinary Tasks board and returned a Done receipt to its parent. | Child Task `7ca78b41-d224-4a94-aaed-442f25cebeb7`; parent Task `e2c487d6-74dd-4c5f-b57c-f33f89128eba`. E.17's scheduler-fired run is recorded in `wave-1-release.md`. |
| Build an approved widget or plugin | The installed **Wave 1 proof** plugin contributed its route, sidebar entry, Home widget, command, and direct Fiona panel action; the deliberately broken plugin failed alone. | Adam's D.13 walk plus `node scripts/verify-plugin-fixture.mjs`, passed 2026-09-03. |
| Hand work to another agent | The Docs task was delegated to Franklin with bounded tools, approval limits, expected output, and a return-path receipt. The mixed Fiona + Wave 1 ACP room also opened in the right panel. | Delegation `9b399fb2-1c3a-4434-96a0-a4c0bdb66f3b`; room `rmtl8f2oh-9m4ph`. |

The examples prove the six capability classes and close Done requirement 2.
