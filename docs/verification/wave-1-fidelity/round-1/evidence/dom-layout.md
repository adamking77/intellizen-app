# DOM, layout, and accessibility facts

- Current Chromium viewport: 1440×900 at default zoom, Mocha dark theme, mouse
  input. No horizontal viewport overflow was observed on the inspected routes.
- The shell exposes navigation, main, complementary agent-panel, dialog, listbox,
  textbox, separator, status, and alert semantics in the inspected states.
- The new-agent dialog moves focus into `Agent name`; Cancel and Close are named;
  Create remains disabled until a name is supplied.
- The target selector is a named button and exposes a listbox. In the browser
  fixture it truthfully reports that no agents are listed.
- Current Settings sections are keyboard-addressable buttons. Providers,
  Capabilities, Context, and General use visible `h1` elements; Appearance has
  no visible or semantic page heading. Voice follows the donor's no-title layout.
- Current native Home renders the shell, real workspace tree, database widgets,
  connected engine status, agent composer, the healthy plugin sidebar entry, and
  the broken plugin's isolated failure label without clipping.
- The current main title strip contains traffic lights and a drag surface only.
  The donor strip also exposes sidebar, focus, panel visibility, eject, and HUD
  controls. Current keyboard and panel-local controls exist, but the discoverable
  shell controls are absent.
- Browser-only errors from missing `window.__TAURI_INTERNALS__.invoke` are
  expected environment limitations and were not classified as product defects.
- The native HUD and ejected-window focus order could not be re-inspected after
  macOS locked. Their component semantics and reducers are covered by source and
  automated tests, but this round does not treat that as visual evidence.
