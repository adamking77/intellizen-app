# I.4 approval flow — agent-authored plugin installation

Status: **approved 2026-09-04 for implementation only**. Adam approved the
remaining Phase I plan; every real plugin installation still needs its own approval.

## Decision

Should an agent-authored plugin move from staged code to a loaded plugin only
through an ordinary Tasks approval record that Adam explicitly approves?

## Flow

1. Adam asks an agent for a plugin or widget.
2. The existing `author_plugin` tool writes only to the staging directory and
   creates a Tasks record in Review. Nothing is installed or loaded.
3. Opening the record shows plugin name, author, files, source diff, requested
   capabilities, and the exact destination.
4. Adam chooses **Install** or **Reject**. Install is unavailable until every
   requested capability has an explicit grant or denial.
5. Install copies the reviewed staged files into the canonical plugin folder,
   records the approving Adam decision and author attribution, reloads plugins,
   and opens the loaded plugin surface. Reject leaves no loaded plugin.
6. Settings lists the plugin with author, version, status, capability grants,
   Enable/Disable, and Uninstall. Re-enabling never expands its grants.
7. A source change after approval invalidates that approval and requires a new
   review record.

## States

- Staged, awaiting approval, rejected, installed-disabled, loaded, and failed
  are distinct words.
- Loader failure isolates that plugin and keeps its approval receipt.
- Missing or changed staged files block installation and name the mismatch.
- No notification, prompt, or agent reply counts as approval.

## Smallest implementation

- Extend the current staged-plugin and Tasks-record contract; add no plugin
  inbox or second approval system.
- Add one guarded install operation that accepts the approval record id and
  verifies the staged file hashes before copying.
- Store attribution and capability grants with the installed plugin metadata.
- Reuse the existing plugin loader, reload command, boundary, and Settings
  patterns.
- Add preview/reject/install, changed-source, grants, and isolated-failure
  tests, plus one real agent-written fixture walk.

## Acceptance walk

Ask an agent for a small widget, open its approval record, inspect and grant its
capabilities, approve it, see the attributed widget load, disable and re-enable
it, then stage a changed version and confirm the old approval cannot install it.

Approval authorizes I.4 implementation only. Every real plugin installation
still requires Adam's explicit per-plugin approval. It does not authorize
I.1–I.3 or I.5–I.6, deployment, publication, or push.
