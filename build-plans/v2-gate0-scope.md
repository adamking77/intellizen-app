# IntelliZen V2 Gate 0 Scope Reconciliation

**Date:** 2026-07-27  
**Status:** Gate 0 review package  
**Build branch:** `v2-integration`  
**Implementation scope:** `~/projects/intellizen-app-v2/spec/01` through `06`, as revised by `09-audit-closure.md`

## Gate 0 call

The reviewed V2 spec is the implementation authority for Gates 1 through 7. Existing cockpit, runtime, and agent-native plans remain binding where they do not conflict with that later, narrower authority.

No feature code, migration, production data write, deploy, or publish is authorized by this package. Gate 1 remains blocked pending Adam's explicit approval.

## Repo and branch strategy

**Decision: confirm the locked strategy without amendment.**

Build in:

```text
/Users/adamking/projects/intellizen-app
branch: v2-integration
base: main at 904a4567ea957660e5a58b281950ce2b83177199
remote: https://github.com/adamking77/intellizen-app.git
```

Treat this checkout as spec context only:

```text
/Users/adamking/projects/intellizen-app-v2
remote: https://github.com/adamking77/intellizen-app-v2.git
```

Evidence:

- `main` and `origin/main` in the build target resolved to the same commit before branch creation.
- The build target worktree was clean.
- The V2 repo was already dirty with a documentation move, so using it as the build checkout would mix unrelated work into Gate commits.
- Comparing committed trees found identical blobs for every common tracked path. The V2 repo's only additional committed paths are `spec/01` through `spec/09` and `spec/README.md`.
- The single-build MCP contract names `/Users/adamking/projects/intellizen-app/mcp-server/dist/index.js`.
- The app's canonical GitHub remote remains `adamking77/intellizen-app`.

Decision threshold: amend this strategy only if a required implementation source exists solely in the V2 app copy or the production remote stops being the release source. Neither condition is present.

## Cockpit spec reconciliation

Source: `intellizen-cockpit-spec.md`.

| Cockpit decision | Gate 0 disposition |
|---|---|
| D1, one app with venture labels | Preserved. V2 adds no workspace switcher or venture partition. |
| D2, flexible Home widget board | Preserved. V2 does not add fixed monitoring chrome. |
| D3, observational state is a widget | Preserved. Run state appears only in a triggered conversation event, Workflow Run record, or run inspector. |
| D4, Fiona is the only panel counterpart | **Reversed by locked V2 D3.** The panel target is a role. Fiona remains Operations Director and may be the explicit `panel_start_role`, but there is no system-wide Fiona fall-through. |
| D5 through D12, docs and intelligence model | Outside this V2 slice and preserved. |
| D13, Agent Work, Workflows, and Roles become widgets | Preserved for Agent Work and Roles. **Narrowly amended for Workflows:** Gate 6 restores `/workflows` as a working definition/designer surface after the trust path passes. Workflow observation still belongs in records/widgets; the route exists to author and validate definitions. |
| D14, plain language | Preserved for user-facing design and option discussions. |

The D13 exception does not authorize a workflow dashboard in the Agent Panel. It authorizes one working surface for definition composition, dry-run, validation, and activation. The Workflow Registry remains the durable record store.

## Agent runtime plan reconciliation

Source: `build-plans/agent-runtime-workflow-panel-plan.md`.

### Carries forward

- Fiona is GenZen Operations Director.
- Hermes is an execution channel, not the authority layer.
- Supabase `workspace.records` and `workspace.work_events` remain the durable operational ledger.
- The current Hermes ladder in `src/services/agent.ts` remains the durable adapter path.
- Runtimes use named, validated tools rather than a generic SQL console.
- External, destructive, schema, credential, and publish actions require explicit human approval.
- `agent.sessions` is not the Workflow Run ledger.
- The canonical local MCP build remains `mcp-server/dist/index.js`.

### Superseded

- Railway/Kimi-first sequencing is historical, not the V2 build order.
- The proposed `agent_sessions`, `agent_messages`, standalone `workflow_runs`, `workflow_events`, and `agent_approvals` tables do not land. V2 extends Workflow Registry, Workflow Runs, and `workspace.work_events`.
- Fiona-only routing and one persistent Fiona thread are replaced by role-first routing and per-role threads.
- A broad Agent Gateway is not the first V2 proof. The mock adapter, transition RPC, Codex adapter, and one role-directed workflow come first.
- Model roles are not hardcoded in UI logic. Role assignment resolves occupant, binding, and model at dispatch.
- The old Block 0 through 7 sequence is superseded by V2 Gates 0 through 7.

### Canonical combined rule

Fiona retains organizational authority as Operations Director. Workflow work still targets a role. When `operations_director` is targeted, the runner resolves Fiona and her Hermes binding. When another role is targeted, the runner resolves that role's current occupant and approved binding. No missing occupant falls through to Fiona or any other agent.

## Agent-native chat plan reconciliation

Source: `build-plans/agent-native-chat-surface-port-plan.md`.

### Carries forward

- No second chat, task, workflow, approval, receipt, or persistence system.
- Conversation events must be typed and must not infer completion from prose.
- Operational events stay compact, contextual, collapsed by default, and linked to canonical records.
- Route context is visible and bounded.
- Existing dock, eject, streaming, stop, retry, fallback, and voice behavior must be characterized before decomposition.
- Bklit remains the only native chart renderer.
- Generated HTML cannot widen authority.
- Durable transcript ownership remains deferred.

### V2 extensions

- `ConversationEvent` v2 adds role, resolved agent, adapter, binding, model, and execution class.
- The conversation target becomes a role.
- The run inspector adds child runs, receipts, verification state, and the three-source authority display.
- Workflow events come from the Gate 1 transaction and adapter normalization, not assistant prose or broad polling.
- Gate 6 begins with the existing plan's behavior checklist, then extracts only tested seams.

### Still excluded

- Fixed run lists, approval queues, or workflow dashboards in the panel.
- A second action executor.
- A second chart stack.
- Durable transcript migration in Wave 1.
- Any new default surface before its specified gate.

## Gate sequence and ownership

The only authorized sequence is:

1. Gate 0 review and explicit approval.
2. Gate 1 data and control contracts.
3. Gate 2 deterministic mock/runtime proof.
4. Gate 3 Codex 0.145.0 worker-isolation proof.
5. Gate 4 one role-directed workflow.
6. Gate 5 complete forced-failure proof.
7. Gate 6 product surfaces and Claude 2.1.220 adapter.
8. Gate 7 evidence returned to Sogo.

Every implementation gate ends on `pnpm smoke`. UI gates also pass `DESIGN.md`. No production migration applies in the same session it is authored; migration review names affected tables and post-application readback before any later application session.

## Gate 0 package

- This scope reconciliation
- `v2-gate0-sogo-proof-record.md`
- `v2-gate0-admin-plane-inventory.md`
- `v2-gate0-runtime-contracts.md`
- `v2-gate1-contract-proposal.md`

Gate 0 exits only on Adam's explicit approval.
