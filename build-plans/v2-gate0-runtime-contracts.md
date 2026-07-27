# IntelliZen V2 Installed Runtime Contracts

**Date tested:** 2026-07-27
**Purpose:** Pin Gate 3 and Gate 6 adapters to observed local behavior
**Test mode:** Non-interactive, no feature writes, no production data writes

## Result

The Gate 3 Codex worker-isolation premise passes on the installed CLI.

- `CODEX_HOME` isolates both MCP configuration and login state.
- A clean home contained zero MCP servers and was logged out.
- Global configuration did not merge into the clean home.
- The worker design does not require a foundation rewrite.
- Every worker profile must receive its own provider-managed login. The interactive login cannot be assumed or inherited.

The Gate 6 Claude premise is conditional.

- `CLAUDE_CONFIG_DIR` isolates user auth and user settings.
- It does not by itself suppress project MCP discovery.
- Actual non-interactive runs are isolatable with a valid worker-only MCP file plus `--strict-mcp-config`.
- The adapter must verify isolation from the emitted `system/init` event, not from `claude mcp list`.

## Codex CLI

### Installed identity

```text
binary: /Users/adamking/.local/bin/codex
resolved binary: /Users/adamking/.codex/packages/standalone/current/bin/codex
version: codex-cli 0.145.0
initial Wave 1 pin: exactly 0.145.0
```

A different version is unsupported until its help output and JSONL fixtures pass the adapter contract suite.

### Gate 3 exec contract

Prompt and compiled context go through stdin:

```text
codex exec \
  --strict-config \
  --json \
  --ephemeral \
  --ignore-rules \
  --sandbox workspace-write \
  -c 'approval_policy="never"' \
  -C <assignment-worktree> \
  -
```

Parent process requirements:

- set `CODEX_HOME` to the assignment's isolated provider profile;
- launch the canonical binary directly, without a shell;
- keep stdout and stderr separate;
- close stdin after writing the complete bounded prompt;
- use a clean assignment worktree or snapshot that does not contain `.env.local` or other untracked admin files;
- terminate the process group on cancel or timeout;
- record binary path, version, args, profile path, working directory, sandbox, and sanitized environment names.

Do not pass the prompt as a process argument.

`--ignore-user-config` was useful for a diagnostic run, but it is not the worker invocation because it would also ignore the generated worker config. Isolation comes from the clean `CODEX_HOME`.

### Flag findings

Observed from installed help and execution:

| Flag | Contract |
|---|---|
| `--json` | Emits one JSON event per stdout line. It does not mean the final answer alone is JSON. |
| `--output-schema <FILE>` | Optional final-response schema. Separate from the JSONL event envelope. |
| `-o, --output-last-message <FILE>` | Writes the last agent message to a file. Not needed by the adapter because the result arrives in JSONL. |
| `--ephemeral` | Prevents session-file persistence for the run. |
| `--ignore-user-config` | Ignores `$CODEX_HOME/config.toml`; auth still uses `CODEX_HOME`. Diagnostic only for this design. |
| `--ignore-rules` | Ignores user/project exec-policy rule files. |
| `--sandbox` | Accepted values: `read-only`, `workspace-write`, `danger-full-access`. Wave 1 permits `read-only` or `workspace-write`, never bypass mode. |
| `-C, --cd` | Sets the working root. The parent must canonicalize and grant it before spawn. |
| `--strict-config` | Fails on unknown config fields. Required for a generated worker profile. |
| `--ask-for-approval` | **Not accepted by `codex exec` 0.145.0**, despite appearing in top-level help. Passing it returned exit code 2. |
| `-c 'approval_policy="never"'` | Tested exec-compatible replacement for the rejected approval flag. |

### MCP tool approval

Codex 0.145.0 accepts these `default_tools_approval_mode` values:

```text
auto
prompt
writes
approve
```

In non-interactive tests:

- `auto` returned `user cancelled MCP tool call`;
- `approve` allowed the read-only IntelliZen call to complete.

The generated worker profile therefore uses `approve` only on the worker-plane IntelliZen server, whose registered tools are already restricted. It does not apply `approve` to an admin server.

Illustrative worker profile fragment:

```toml
[mcp_servers.intelizen-worker]
command = "/usr/local/bin/node"
args = [
  "/Users/adamking/projects/intellizen-app/mcp-server/dist/index.js",
  "--plane",
  "worker"
]
default_tools_approval_mode = "approve"
enabled_tools = [
  "advance_workflow_step",
  "report_verification",
  "append_agent_work_note"
]
```

This fragment is a Gate 1/3 target, not current configuration. The worker server must not load the repo service-role key. Its scoped calls need a host-mediated, per-run capability boundary or another approved credential-free broker path.

### Observed stdout JSONL

Thread start:

```json
{"type":"thread.started","thread_id":"<uuid>"}
```

Turn start:

```json
{"type":"turn.started"}
```

Agent message:

```json
{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"GATE0_OK"}}
```

MCP call start:

```json
{"type":"item.started","item":{"id":"item_0","type":"mcp_tool_call","server":"intelizen","tool":"list_agent_projects","arguments":{"actor":"Keel","include_done":false,"limit":1},"result":null,"error":null,"status":"in_progress"}}
```

MCP call completion:

```json
{"type":"item.completed","item":{"id":"item_0","type":"mcp_tool_call","server":"intelizen","tool":"list_agent_projects","arguments":{"actor":"Keel","include_done":false,"limit":1},"result":{"content":[{"type":"text","text":"<tool JSON string>"}],"structured_content":null},"error":null,"status":"completed"}}
```

Recoverable/error item:

```json
{"type":"item.completed","item":{"id":"item_0","type":"error","message":"<message>"}}
```

Turn completion:

```json
{"type":"turn.completed","usage":{"input_tokens":21028,"cached_input_tokens":0,"cache_write_input_tokens":0,"output_tokens":8,"reasoning_output_tokens":0}}
```

Parser rules:

- Parse stdout one complete line at a time.
- Treat stderr as diagnostics, never as JSONL. Installed runs emitted human-readable warnings on stderr.
- Preserve unknown event types for display/diagnostics and continue.
- A successful `agent_message` is not terminal until `turn.completed` or process exit.
- Tool completion is not workflow verification.
- Tool `result.content[].text` may itself be a JSON string and requires separate bounded parsing.
- A non-null `error` or `status: "failed"` becomes an adapter error event.
- The exact token fields above are optional measurements; no dollar cost is inferred.

### Exit and auth probes

| Probe | Result |
|---|---|
| Successful no-tool JSONL run | exit 0 |
| Unsupported `codex exec --ask-for-approval ...` | exit 2 |
| Interactive-profile `codex login status` | exit 0, logged in with ChatGPT |
| Clean `CODEX_HOME` `codex login status` | exit 1, not logged in |
| Clean `CODEX_HOME` `codex mcp list` | no MCP servers configured |

### Gate 3 isolation decision

Pass, subject to these requirements:

1. IntelliZen creates a clean worker profile and a clean assignment worktree.
2. Adam completes provider login inside that worker profile.
3. The generated config registers only the worker-plane server.
4. The spawned child reports no admin MCPs, denied env names, or admin paths.
5. The worker-plane server has no direct service-role fallback.

If any condition fails, the adapter is blocked.

## Claude Code

### Installed identity

```text
binary: /Users/adamking/.local/bin/claude
version: 2.1.220 (Claude Code)
initial Gate 6 pin: exactly 2.1.220
```

### Tested non-interactive contract

The no-tool contract was tested with:

```text
claude \
  --safe-mode \
  --mcp-config build-plans/evidence/v2-gate0-empty-mcp.json \
  --strict-mcp-config \
  --tools '' \
  --permission-mode dontAsk \
  --no-session-persistence \
  --verbose \
  --include-partial-messages \
  --output-format stream-json \
  -p 'Do not call tools. Return exactly GATE0_OK.'
```

Gate 6 will replace the empty tool list and empty MCP config with explicit worker allowlists. It must keep `--strict-mcp-config`, `--no-session-persistence`, stream JSON, a restrictive permission mode, and a generated config.

Prompt-via-stdin must be re-probed at Gate 6 before final adapter pinning. Claude's `--input-format stream-json` is a separate realtime input protocol and is not assumed from the Codex contract.

### Observed stream event families

Initialization:

```json
{"type":"system","subtype":"init","cwd":"<assignment>","session_id":"<uuid>","tools":[],"mcp_servers":[],"model":"claude-sonnet-4-6","permissionMode":"dontAsk","claude_code_version":"2.1.220"}
```

Status:

```json
{"type":"system","subtype":"status","status":"requesting","session_id":"<uuid>"}
```

Rate limit:

```json
{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","rateLimitType":"five_hour","isUsingOverage":false},"session_id":"<uuid>"}
```

Partial message stream:

```json
{"type":"stream_event","event":{"type":"message_start","message":{"model":"claude-sonnet-4-6","id":"<id>","role":"assistant","content":[],"usage":{"input_tokens":3,"output_tokens":8}}},"session_id":"<uuid>","parent_tool_use_id":null}
{"type":"stream_event","event":{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}},"session_id":"<uuid>"}
{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"GATE0_OK"}},"session_id":"<uuid>"}
{"type":"stream_event","event":{"type":"content_block_stop","index":0},"session_id":"<uuid>"}
{"type":"stream_event","event":{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":3,"output_tokens":8}},"session_id":"<uuid>"}
{"type":"stream_event","event":{"type":"message_stop"},"session_id":"<uuid>"}
```

Assembled assistant message:

```json
{"type":"assistant","message":{"model":"claude-sonnet-4-6","role":"assistant","content":[{"type":"text","text":"GATE0_OK"}],"usage":{"input_tokens":3,"output_tokens":8}},"session_id":"<uuid>","parent_tool_use_id":null}
```

Terminal result:

```json
{"type":"result","subtype":"success","is_error":false,"terminal_reason":"completed","stop_reason":"end_turn","session_id":"<uuid>","result":"GATE0_OK","usage":{"input_tokens":3,"output_tokens":8},"total_cost_usd":0.009580899999999998}
```

Parser rules:

- `stream_event` text deltas drive visible streaming.
- `assistant` is an assembled message snapshot and must not be appended as a second copy.
- `result` is terminal for the invocation.
- `is_error`, `subtype`, `terminal_reason`, and process exit decide adapter completion.
- `total_cost_usd` is provider-emitted measured data and may be displayed as measured for this invocation. It must not be extrapolated to subscription cost.
- Unknown event types are preserved and do not crash the thread.

### Claude isolation findings

| Probe | Result |
|---|---|
| Interactive `claude auth status` | exit 0 |
| Clean `CLAUDE_CONFIG_DIR` auth status | exit 1, not logged in |
| Clean `CLAUDE_CONFIG_DIR` with ordinary `mcp list` | project-scoped servers still appeared |
| Strict empty MCP config in actual print session | `system/init` reported `mcp_servers: []` and `tools: []` |
| Baseline project config | `.mcp.json` reported invalid because it lacks the `mcpServers` wrapper |

The `mcp list` subcommand did not provide a reliable strict-config isolation readback in this version. Gate 6 uses the actual session's `system/init` event as the acceptance evidence.

## Adapter version policy

- Codex Wave 1: exact `0.145.0`.
- Claude Gate 6: exact `2.1.220`.
- Discovery may show other installed versions, but the binding remains unavailable until fixtures are captured and the relevant trace suite passes.
- Version drift never silently falls back to a prior parser.
- Parse failure degrades to display-only with a named reason.

## Review decision

No Gate 3 architecture amendment is required for Codex config isolation.

Two implementation constraints are now locked:

1. provider auth is provisioned separately inside each isolated worker profile; and
2. Claude Gate 6 adds strict worker-only MCP configuration because `CLAUDE_CONFIG_DIR` alone is insufficient.

Neither constraint authorizes Gate 1 or later work before Gate 0 approval.
