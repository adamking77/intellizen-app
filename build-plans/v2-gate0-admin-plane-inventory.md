# IntelliZen V2 Admin-Plane Inventory

**Date:** 2026-07-27
**Inspection mode:** Read-only configuration and capability inspection
**Credential values:** Deliberately excluded

## Boundary

An admin-plane profile is any interactive configuration that can reach direct database credentials, a service-role-backed tool, broad company records, credential stores, external communication systems, or unrestricted generic workspace writes.

This inventory describes names, paths, and capability classes only. It is the Gate 3 worker-session exclusion list.

## Codex interactive profile

Primary paths:

```text
~/.codex/config.toml
~/.codex/auth.json
/Users/adamking/projects/intellizen-app/.env.local
```

Relevant configured MCP servers:

| Server | Capability | Current observation | Worker disposition |
|---|---|---|---|
| `intelizen` | Full IntelliZen MCP. The server reads `SUPABASE_SERVICE_ROLE_KEY` from process env or repo `.env.local`. | Enabled. Read-only assignment calls succeeded after restoring locked package dependencies. | Exclude. Replace with the future `--plane worker` registration only. |
| `supabase-genzen` | Direct Supabase project MCP for `jicrdrwtwubveyvzyyrh`. | Configured and enabled; CLI reported `Not logged in` on 2026-07-27. | Exclude regardless of current auth status. |
| `github` | Broad repository access through bearer-token auth. | Enabled. | Exclude unless a later workflow explicitly scopes and approves it. Not part of Wave 1 worker tools. |
| `node_repl` | Broad local orchestration/browser/computer capability with global Codex paths in env. | Enabled. | Exclude. |
| `codex-security` and plugin-supplied tools | Global plugin capability. | Present in the interactive profile. | Exclude from the generated worker profile unless separately approved. |

Credential/config finding:

- The interactive profile is logged in with ChatGPT.
- A clean `CODEX_HOME` was not logged in and contained no MCP servers.
- Therefore neither `~/.codex/config.toml` nor `~/.codex/auth.json` may be mounted, copied, symlinked, or inherited by a worker.
- The worker profile requires its own provider-managed login and generated config.

Readiness finding:

- `mcp-server/dist/index.js` existed, but `mcp-server/node_modules` was absent at Gate 0 start.
- The configured server initially failed with `ERR_MODULE_NOT_FOUND` for `@modelcontextprotocol/sdk`.
- `pnpm install --frozen-lockfile` under `mcp-server/` restored the locked dependencies without changing tracked files.

## Claude interactive profile

Primary paths:

```text
~/.claude.json
~/.claude/.credentials.json
~/.claude/settings.json
~/.claude/settings.local.json
/Users/adamking/projects/intellizen-app/.mcp.json
```

Relevant configured capabilities:

| Configuration | Capability | Current observation | Worker disposition |
|---|---|---|---|
| `supabase-db` | Direct Supabase project access. | Connected. Its configured command contains an inline access token and project reference. | Exclude. Never reproduce its command in logs or worker config. |
| `intelizen` | Full service-role-backed IntelliZen MCP. | Connected after locked MCP dependencies were restored. | Exclude. |
| `genzen-brain` | Broad GenZen knowledge/brain MCP. | Configured with credential material embedded in its URL; health check failed during inspection. | Exclude regardless of health. |
| `fiona-bridge` | Local Fiona bridge. | Visible from project-scoped configuration. | Exclude. |
| Gmail, Google Calendar, Google Drive, Notion, Vercel, Canva, Playwright, Perplexity | External data, messaging, browser, or platform capability. | Several were connected in the interactive profile. | Exclude from Wave 1 worker sessions. |

Security observations:

- `claude mcp list` renders command and URL credential values in plaintext for some servers. Raw output from that command must not be stored in Gate artifacts, logs, or receipts.
- The tracked project `.mcp.json` has `intelizen` as its top-level key. Claude 2.1.220 expects `mcpServers`, reports the file as invalid, and continues.
- An empty `CLAUDE_CONFIG_DIR` removed user auth and most user MCPs but did not stop project-scoped MCP discovery.
- `CLAUDE_CONFIG_DIR` alone is not worker isolation. Gate 6 must use a valid worker-only MCP file plus `--strict-mcp-config` and verify the `system/init` event reports only the intended servers.

## Fiona / Hermes interactive profile

Primary paths:

```text
~/.hermes/.env
~/.hermes/auth.json
~/.hermes/.anthropic_oauth.json
~/.hermes/profiles/fiona/.env
~/.hermes/profiles/fiona/auth.json
~/.hermes/profiles/fiona/config.yaml
~/.hermes/profiles/fiona/cache/bws_cache.json
~/.hermes/profiles/fiona/google_client_secret.json
~/.hermes/profiles/fiona/google_token.json
~/.hermes/profiles/fiona/mcp-servers/intellizen/run.sh
~/.hermes/profiles/fiona/plugins/supabase/
```

Sensitive capability classes present by key name:

- Bitwarden Secrets Manager access
- Supabase platform/project access
- provider API credentials for multiple model services
- Exa and Google API access
- Telegram bot credentials and allowlist controls
- Google OAuth client and token files
- Hermes gateway, session, cron, delegation, browser, shell, network, and MCP configuration

The Fiona IntelliZen wrapper:

- executes the one canonical build at `/Users/adamking/projects/intellizen-app/mcp-server/dist/index.js`;
- can receive `SUPABASE_SERVICE_ROLE_KEY` from the Hermes environment or Bitwarden;
- falls back to the repo `.env.local`;
- therefore exposes the full admin-plane IntelliZen tool surface.

Fiona remains a durable runtime and organizational authority. That does not make her interactive Hermes profile an acceptable child-process environment for a runner-dispatched worker.

## Repo-local credential source

Path:

```text
/Users/adamking/projects/intellizen-app/.env.local
```

Sensitive key classes present by name:

- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_INTELLIZEN_LOCAL_ACCESS_KEY`
- Supabase URL and anon key
- Hermes API, webhook, voice, and dashboard credentials

The file is not tracked and no value was read into this document. Worker processes must not inherit it through cwd-based loading. In particular, the full IntelliZen MCP automatically searches this file; the worker-plane server must refuse service-role fallback or receive a separate scoped credential mechanism.

## Gate 3 exclusion list

### Paths that must be unreachable or unused

```text
~/.codex/
~/.claude.json
~/.claude/
~/.hermes/
/Users/adamking/projects/intellizen-app/.env.local
```

The app may know these paths for admin diagnostics. It must not place them in a worker's config, environment, MCP arguments, readable working directory, or additional directory grants.

### Environment names to remove

Sanitization denies by default:

```text
SUPABASE_*
VITE_SUPABASE_*
VITE_INTELLIZEN_*
OPENAI_*
ANTHROPIC_*
CLAUDE_*
HERMES_*
GITHUB_*
NOTION_*
GOOGLE_*
TELEGRAM_*
BWS_*
*_API_KEY
*_ACCESS_TOKEN
*_AUTH_TOKEN
*_WEBHOOK_SECRET
*_SESSION_TOKEN
```

Allowlist only the minimum process/runtime values needed to start the pinned CLI. Provider login remains inside the isolated provider profile, not in inherited environment variables.

### MCP servers and capability classes to exclude

```text
supabase-genzen
supabase-db
genzen-brain
intelizen (full/admin plane)
fiona-bridge
node_repl
computer-use
browser automation
email and calendar connectors
Google Drive and Notion connectors
GitHub write access
generic record mutation
roster mutation
Home pin/view mutation
direct SQL
credential/config tools
external send/publish tools
```

The only Wave 1 MCP registration allowed inside a worker is the generated worker-plane IntelliZen server with an explicit tool allowlist.

## In-session proof required at Gate 3

The worker session must report:

- its `CODEX_HOME`;
- the exact MCP server names visible to the runtime;
- the exact worker tool names visible;
- absence of all denied environment variable names;
- absence of readable admin config paths;
- provider sandbox mode and working directory;
- inability to discover or call `supabase-genzen`, the full `intelizen`, direct SQL, generic roster writes, or connector tools.

The proof must come from the spawned worker session and the parent process's sanitized spawn record. A parent-side config inspection alone is insufficient.

## Decision threshold

Gate 3 passes only if both views agree:

1. the parent spawn record contains only the generated worker profile, allowlisted environment, sandbox, and assignment directory; and
2. the child session cannot discover any admin server, admin credential, or excluded path.

If either view fails, the Codex adapter remains blocked and Gate 4 does not start.
