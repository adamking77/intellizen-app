# Interaction smoke — round 3

The locally built release `.app` was exercised directly. Each action below was
performed and restored without a save, send, delete, database mutation, deploy,
or publish action.

| Action | Expected | Result |
| --- | --- | --- |
| Open Fiona's row menu and choose **Open in chat** | Fiona becomes the selected real panel target and the composer opens | Passed |
| Open Fiona's agent card, then cancel | Existing-agent editor matches donor anatomy and closes without a write | Passed |
| Open **New team**, then cancel | Team member sheet lists live profiles and closes without a write | Passed |
| Collapse and reopen the agent panel | Center reflows and the compact expand control restores the panel | Passed |
| Eject and redock the agent panel | A 380×620 native Agent Panel window opens and returns to the shell | Passed |
| Reduce the panel to the HUD and redock it | Compact native HUD opens and returns to the shell | Passed |
| Collapse and restore the sidebar | Icon rail and full navigation both render | Passed |
| Enter and leave focus mode | Both side panes leave and return without losing the selected agent | Passed |
| Open a Documents row whose source path is outside the GenZen OS vault | The workspace body opens, provenance says the external file is unchanged, and no vault-path error appears | Passed |
| Open the disposable Wave 1 proposal document | Two independent hunks render with accept/reject controls; neither hunk is applied during preflight | Passed |
| Configure **Wave 1 ACP** with the Codex ACP adapter and open it in chat | Providers reports Codex ready on demand and the panel selects the real ACP target without sending a prompt | Passed |
| Create **Wave 1 mixed team** with Fiona and Wave 1 ACP, then open it in chat | A reusable room opens with one Hermes member and one ACP member and an empty log | Passed |
| Reflow at a 720×900 CSS viewport | Sidebar and panel collapse automatically, all five shell controls remain reachable, no horizontal overflow | Passed |
| Run one real turn through the installed successor Codex ACP adapter | The adapter streams a reply and completes instead of returning the legacy internal error | Passed — ignored live Rust contract returned `ACP OK` when explicitly enabled |
| Open `V2 Gate 4 role-directed proof` after binding the ACP registry entry to `keel` | The workflow is Runnable and **Schedule** opens its scheduling dialog | Passed — no schedule was created |
| Create a Quick Note while the vault reconciliation runs in the background | The note appears immediately and the create controls cannot create duplicates while pending | Passed |
| Reopen a document containing a conventional fenced Graph embed | The editor hides portable frontmatter and renders a linked Graph snapshot | Passed |

The reflow probe measured `scrollWidth === clientWidth === 720`. It supplements
the native check; it does not replace it.

The post-walk repair tree also passed `pnpm check`, all 379 frontend tests
(one intentional skip), `git diff --check`, and the local-only `pnpm smoke`
gate. The ordinary publishable build path correctly refused to inline Adam's
local access key; smoke was rerun with the repository's explicit
`ALLOW_LOCAL_ACCESS_KEY_BUILD=1` guard for this non-distributable walk build.
