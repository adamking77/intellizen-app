# Evidence manifest

- Artifact: IntelliZen v3 working tree on `v3/phase-0`
- Base commit: `28876881df96b55cec7ee3b5c9ececd35c8cf5f4`
- Working-tree diff hash: `c41dd7663bf36636a76cd79aeeb7cb06f5a911bd9060b06e71ed8e74f1f5ca95`
- Collected: 2026-09-03, Asia/Tbilisi
- Environment: local Vite preview at `http://localhost:1420`; native Tauri v3 development process running separately
- Donor: local Hermes app at `http://localhost:5180`
- Theme: dark, IntelliZen blue accent; donor mauve accent where saved in Hermes
- Locale: English
- Input modalities: pointer clicks and accessibility/DOM inspection
- Source and implementation raw captures: 719 × 720 px each from the same browser capture surface
- Normalization: the six comparison boards place donor and implementation at equal size, then render each side at 2× for inspection; composite size 2876 × 1440 px
- Known limitation: the browser preview cannot execute Tauri `invoke` calls, so native-only profile-picture data is covered by the shared component primitive and regression test rather than browser fixture data. The installed production app was not launched.

| Evidence | State | File |
| --- | --- | --- |
| E-S01 | Providers, IntelliZen left / Hermes right | `screenshots/settings-providers-comparison.png` |
| E-S02 | Capabilities, IntelliZen left / Hermes right | `screenshots/settings-capabilities-comparison.png` |
| E-S03 | Context, IntelliZen left / Hermes right | `screenshots/settings-context-comparison.png` |
| E-S04 | Voice, IntelliZen left / Hermes right | `screenshots/settings-voice-comparison.png` |
| E-S05 | Appearance, IntelliZen left / Hermes right | `screenshots/settings-appearance-comparison.png` |
| E-S06 | General, IntelliZen left / Hermes right | `screenshots/settings-general-comparison.png` |
| E-A01 | Agents route | `screenshots/intellizen-agents-1438x1440.png` |
| E-A02 | New Agent editor, Sphere | `screenshots/intellizen-agent-editor-1438x1440.png` |
| E-A03 | New Agent editor, Blob | `screenshots/intellizen-agent-editor-blob-1438x1440.png` |
| E-A04 | Agent panel fully collapsed | `screenshots/intellizen-agent-panel-collapsed-1438x1440.png` |
| E-A05 | New Agent editor, compact avatar controls | `screenshots/intellizen-agent-editor-compact-avatar-controls.png` |
| E-A06 | New Agent editor, Hermes 86dvh modal cap | `screenshots/intellizen-agent-modal-hermes-height-719x870.png` |
