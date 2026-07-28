# IntelliZen V2 Autonomous Completion Session Contract

**Date:** 2026-07-28
**Status:** Ready to activate from a fresh Codex task
**Implementation model:** GPT-5.6 Sol
**Adversarial reviewer:** Claude Code Opus 5 (`claude-opus-5`)
**Build repository:** `/Users/adamking/projects/intellizen-app`
**Branch:** `v2-integration`

## Purpose

This document is the execution contract for the final local IntelliZen V2
implementation run. It deliberately does not duplicate the technical roadmap
in `build-plans/v2-completion-plan.md`.

- The completion plan defines **what remains**.
- This contract defines **the authority, working method, review loop, quality
  bar, and stopping conditions** for the fresh session.

The short launcher at the end of this document activates both documents. Do not
paste this entire contract into chat.

## Source order

Start in `/Users/adamking/projects/intellizen-app` and read these sources in
order:

1. `CLAUDE.md`
2. `build-plans/v2-completion-plan.md`
3. `build-plans/v2-completion-session-contract.md`
4. `docs/verification/v2-product-completion/07-backend-audit-remediation.md`
5. `docs/verification/v2-product-completion/08-opus-adversarial-consensus.md`
6. `/Users/adamking/projects/intellizen-app-v2/docs/audits/v2-backend-code-review-2026-07-28.md`

Then inspect the real branch, complete tracked and untracked diff, tests, local
runtime state, and current artifact. Reality wins over documentation. Correct
stale documentation when discovered.

## Mission

Finish the locally actionable V2 implementation to the definition of local
completion in `build-plans/v2-completion-plan.md`.

This means:

- preserve and checkpoint the completed audit remediation;
- finish the remaining structural remediation;
- complete the workflow definition, topology, instance snapshot, and drift
  model;
- automate the isolated SQL contracts and safe Gate 4 proof;
- remove machine-specific runtime-binding assumptions;
- close automated, rendered, native, secret-safety, and documentation loops;
- obtain a fresh Claude Code Opus 5 adversarial approval of the final state;
- leave small, reviewable local commits and a durable completion receipt.

Do not stop after planning, after the first green test run, or after a partial
refactor. Continue until the local definition of done is satisfied or a genuine
external-authority gate is the only remaining work.

## Authority granted by the launcher

The launcher is explicit approval for ordinary, reversible work inside
`/Users/adamking/projects/intellizen-app`, including:

- inspecting all repository files, history, diffs, tests, and local build
  artifacts;
- editing, adding, moving, or deleting in-scope source, tests, scripts,
  migrations, fixtures, and documentation;
- removing dead code proven unreferenced;
- running local tests, formatters, type checks, linters, builds, smoke checks,
  local database containers, and native debug verification;
- starting and stopping local development processes;
- using Claude Code Opus 5 in read-only plan mode for adversarial review;
- staging in-scope changes and creating small local checkpoint commits on
  `v2-integration`;
- making implementation decisions that preserve the accepted architecture and
  contracts.

Do not ask for approval for routine implementation choices, file extraction,
test additions, local verification, or the authorized local checkpoint commits.
Make the smallest sound engineering decision, verify it, and continue.

## Actions not authorized

This contract does not authorize:

- applying migrations to production or any shared remote database;
- rotating live credentials;
- rewriting git history;
- force pushes, destructive resets, or deletion of unrelated user work;
- pushing a branch;
- opening or merging a pull request;
- producing or publishing a release DMG;
- signing, deploying, publishing, uploading, or releasing anything;
- sending anything to a person or external human-visible surface;
- expanding agent, database, MCP, or runtime permissions.

Prepare and verify the local artifacts needed for those gates, but leave each
gate visibly pending. Do not treat the absence of approval as a reason to stop
earlier local work.

## Session boot

1. Read the governing sources completely.
2. Inspect `git status`, the full diff against `HEAD`, untracked files,
   deletions, recent history, and the file-size ratchets.
3. Confirm the current verification baseline rather than trusting old counts.
4. Create a Codex goal for local IntelliZen V2 completion.
5. Create a live plan that follows Passes 0 through 3 and Pass 5 in the
   completion plan. Keep exactly one step in progress.
6. Report the starting state briefly: branch, dirty-tree scope, reproduced
   baseline, locally actionable work, and excluded external gates.
7. Begin implementation immediately.

Do not discard or overwrite existing work to manufacture a clean baseline. The
current worktree contains the already reviewed audit remediation.

## Execution sequence

### Checkpoint 0: preserve the consensual baseline

- Reproduce the current test, build, and secret-safety baseline.
- Inspect the complete remediation diff and reconcile it with the amended audit
  and Opus consensus receipt.
- Split the existing work into the smallest coherent local commits that preserve
  reviewability. A reasonable grouping is:
  - migration and authority hardening;
  - workflow and runtime correctness;
  - structural extractions and tests;
  - documentation and verification receipts.
- Do not mix unrelated cleanup into those commits.
- Run the checks appropriate to each checkpoint before committing it.

### Checkpoint 1: finish structural remediation

Complete Pass 1 of the completion plan.

For the Agent Panel:

- extract coordination, lifecycle, active-work, and message-command
  responsibilities rather than moving markup cosmetically;
- keep persistence, chat transport, and voice seams independent;
- mount the real coordinator in an integrated test;
- cover collapsed, docked, standalone, blocked, unavailable, error, and
  cancellation behavior;
- reduce the coordinator to the agreed ratchet and lower the ratchet in the
  same change.

For data access:

- move whole responsibilities out of `src/lib/data.ts`;
- keep compatibility only where consumers still require it;
- avoid permanent re-export indirection;
- keep record mutations, receipts, workflows, OSINT, and queries independently
  testable;
- lower the legacy ratchet after each material extraction.

For Graph:

- separate data/query, layout, rendering, selection, and inspector concerns;
- preserve behavior and the distinction between the Graph product surface and
  the xyflow workflow-topology surface;
- lower the ratchet once the extraction is proven.

Run focused tests continuously and the full verification suite at the
checkpoint boundary.

### Checkpoint 2: complete the workflow product model

Complete Pass 2 of the completion plan.

- Establish one canonical topology model shared by designer and execution
  visualization.
- Make the workflow definition and run instance boundary explicit.
- Persist an immutable definition version or content hash with each run
  snapshot.
- Preserve historical run truth when definitions change.
- Detect drift and require one explicit safe operator response.
- Never mutate an existing run through an implicit definition upgrade.
- Cover editing, snapshots, drift detection, and every allowed resolution with
  unit and rendered tests.

Prefer a small explicit model over a general workflow framework. Do not add a
second topology representation to bridge the first.

### Checkpoint 3: close verification and portability

Complete Pass 3 of the completion plan.

- Run all three SQL authority contracts against a disposable isolated Supabase
  environment through one named local command.
- Ensure the command is safe by default and cannot silently target production.
- Make Gate 4 repeatable without an external action by default.
- Replace machine-specific runtime paths with validated discovery or reviewed
  configuration.
- Make missing runtime dependencies fail loudly with actionable diagnostics.
- Rebuild the unsigned local debug `.app`.
- Complete native rendered acceptance and retain exact evidence paths.

Do not weaken a security boundary to make local automation easier.

### Checkpoint 4: final acceptance

Complete Pass 5 of the completion plan and update the durable receipts.

At minimum, run:

```bash
pnpm check
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
pnpm --dir mcp-server test
pnpm --dir mcp-server build
VITE_INTELLIZEN_LOCAL_ACCESS_KEY= pnpm smoke
./scripts/check-bundle-secrets.sh dist
VITE_INTELLIZEN_LOCAL_ACCESS_KEY= pnpm tauri build --debug --bundles app --no-sign
git diff --check
```

Also verify:

- Home, Settings, Team, Workflows, Agent Panel, workflow designer, live
  topology, drift handling, and failure diagnostics in the native app;
- bundle-secret absence in `dist/` and the exact debug `.app`;
- current file-size inventory and lowered ratchets;
- the isolated SQL contract runner;
- the safe Gate 4 proof;
- the final diff, including untracked files and deletions.

Record exact commands, pass counts, artifact paths, screenshots, limitations,
commit hashes, and external gates. Do not claim a verification surface passed
without observing it.

## Clean-code and no-bloat standard

Every change must make the system easier to reason about.

- Prefer deleting code over preserving dead compatibility.
- Prefer an existing pattern over a new abstraction.
- Extract complete responsibility, not line count.
- Do not add an interface, adapter, registry, event bus, capability table, or
  factory for one implementation.
- Do not add a wrapper that only renames or re-exports another function.
- Do not introduce a second source of truth during migration.
- Do not add a dependency unless the existing stack cannot reasonably solve the
  requirement. If one is genuinely required, document why its cost is earned.
- Do not raise a file-size ratchet. Lower it when a legacy file shrinks.
- Avoid speculative extensibility, generic framework work, and unrelated
  cleanup.
- Keep comments for non-obvious invariants and failure semantics.
- Test observable behavior and authority boundaries, not the implementation's
  own mocks.
- Treat rendered/native proof as separate from type and unit-test proof.
- Keep secrets, credential values, and sensitive environment contents out of
  prompts, logs, docs, commits, and reviewer context.

Before accepting a new abstraction, ask: does it remove duplicated policy or
make an actual boundary independently testable? If not, keep the code direct.

## Claude Code Opus 5 adversarial loop

Sol owns implementation and final judgment. Opus is an independent, read-only
adversarial reviewer. It must inspect the real repository and complete diff,
including untracked files, rather than reviewing a summary alone.

Start a new Claude review session for this completion run using the canonical
Opus model:

```bash
claude -p \
  --model opus \
  --effort high \
  --permission-mode plan \
  --output-format json \
  "<review request>"
```

Retain the returned session ID and continue the same review conversation with
`--resume <session-id>`. Do not reuse the earlier remediation review session as
the final completion review.

Use Opus at these boundaries:

1. after the baseline has been reproduced and the proposed structural seams
   are grounded in the current code;
2. after structural remediation;
3. after the workflow definition/instance model;
4. after verification and portability work;
5. on the final complete diff.

Each review request must ask Opus to:

- read the governing plan, this contract, amended audit, prior consensus
  receipt, current code, tests, migrations, and complete diff;
- search for correctness, authority, security, concurrency, retry,
  idempotency, cancellation, stale-state, migration, and secret-handling
  defects;
- challenge test adequacy and claims in verification documents;
- identify cosmetic decomposition, duplicated policy, speculative abstraction,
  unnecessary dependencies, dead compatibility, and other bloat;
- rank findings P0 through P3 with exact evidence;
- distinguish a confirmed defect from a preference;
- state what evidence would falsify each material finding;
- give an explicit `Approve` or `Reject`.

For every finding:

1. Reproduce or verify it independently.
2. If valid, add a focused regression test where practical, implement the
   narrow repair, and run the relevant checks.
3. If invalid, respond to Opus with concrete code, test, database, or runtime
   evidence.
4. Ask Opus to re-review the correction or rebuttal in the same session.
5. Continue until the disagreement is resolved on evidence.

Do not accept a suggestion merely because Opus made it. Do not dismiss it
without evidence. Consensus means both models agree on the code's actual
behavior, not that one model defers to the other.

## Consensus gate

Final adversarial consensus requires all of the following:

- Opus has reviewed the final complete diff and verification receipts;
- no unresolved P0, P1, or P2 finding remains;
- every earlier material finding is closed, withdrawn with evidence, or
  explicitly left as a P3 limitation;
- Opus returns the literal verdict `Approve`;
- Sol agrees that the approval is supported by the observed code and runtime
  evidence;
- the consensus receipt records the new Claude session ID, passes, findings,
  dispositions, verification counts, and remaining external gates.

An Opus approval does not replace tests, native verification, or Sol's
engineering judgment.

## Stopping rules

Do not stop for:

- routine implementation choices;
- a large but understood refactor;
- a failing test that can be diagnosed locally;
- a Claude rejection with actionable local findings;
- an external gate when unrelated local work remains;
- elapsed time alone.

Stop and report only when:

- the local definition of done and consensus gate are satisfied; or
- the only remaining action requires excluded external authority; or
- a genuine contradiction in the accepted product contract would materially
  change product behavior; or
- repeated evidence shows an environmental blocker cannot be repaired within
  the repository.

If an external gate is reached, finish every independent local task first and
leave an exact preflight and command sequence for the approved future action.

## Required final handoff

The final response and durable receipt must state:

- what was implemented;
- what was deleted or simplified;
- final file sizes and ratchets for the structural targets;
- exact automated and native verification results;
- the final debug artifact path;
- local commit hashes;
- the Opus session ID and explicit consensus verdict;
- an updated implementation-completeness assessment with denominators;
- the exact production, credential, push, PR, DMG, signing, deployment,
  publication, and release gates that remain.

Mark the Codex goal complete only when the local objective is genuinely
complete. Do not represent the external gates as completed.

## Fresh-task launcher

Paste only this into a new GPT-5.6 Sol task:

> Work autonomously to full local completion of IntelliZen V2 in
> `/Users/adamking/projects/intellizen-app`. Read `CLAUDE.md`, then
> `build-plans/v2-completion-plan.md` and
> `build-plans/v2-completion-session-contract.md` completely. Those documents
> define the work, your local authority, the no-bloat standard, verification
> gates, and the required read-only Claude Code Opus 5 adversarial loop. Create
> a goal and live plan, inspect the real dirty worktree, and execute through the
> local definition of done. Do not stop for routine approvals, planning, or
> partial progress. Do not perform any action the contract explicitly excludes.
