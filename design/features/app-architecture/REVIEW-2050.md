# SPEC-2050 engineering review

2026-09-07 · Keel · advisory review of a proposed design-system update.

Recommendation: **revise the implementation contract, then implement the panel first**. The visual direction is usable. The specification currently treats several new capabilities as existing plumbing, which would produce misleading information or regressions if implemented literally.

Adam requested this review. Fable authored the candidate; Keel has not changed it. This is an engineering recommendation, not product acceptance or permission to publish. Candidate: `SPEC-2050.md`, SHA-256 `f620c74bf033da10356243409806105f1062a1240d1c8b36750dbca597dc200d`; source checkout `9272d1ea88e4bcc60d13a04403d836985cb547ff`. Existing unrelated untracked files were left alone.

## Findings supported by code or measurement

These distinguish an existing implementation bug from errors in the proposed implementation mapping. New 2050 behavior has not been built, so its missing contracts are not described as reproduced runtime failures.

### 1. Small metadata and hint text fails the app's contrast standard

**Observed specification defect.** Section 3 assigns `#5c6076` to mono metadata and `#3f4358` to hints at 10.5–12px. Using the repository's contrast function, metadata measures **2.74:1 on ground and 2.59:1 on Surface**; hints measure **1.74:1 and 1.65:1**. The existing checker requires 4.5:1 for normal and muted text. Frame 8h uses faint small text for the done condition and receipt; 8r does so for permission and receipt information.

Fix: use a readable text token for meaningful metadata, hints and quiet actions; retain dim colours for nonessential decoration. The proposed `--text-muted` already measures 5.06:1 on Surface. Evaluate every new text/surface pair across all seven flavours, fourteen accents and saved selection strengths. Two representative theme screenshots cannot replace that matrix.

Evidence: [spec tokens](SPEC-2050.md), [contrast checker](../../../scripts/check-design-system.mjs), [contrast implementation](../../../shared/theme-contrast.mjs).

### 2. Trace avatars use the wrong discriminator and omit persistence adapters

**Observed specification defect.** Section 7 calls trace a third `avatarKind` beside blob and sphere. Those are actually `avatarStyle` values. `avatarKind` selects a Blobatar silhouette. The renderer chooses its family from `avatarStyle`, and the profile readers normalize unknown styles back to sphere. There is no seed round trip in the current Agent metadata.

Fix: extend `avatarStyle` with `trace`, preserve `avatarKind` for existing silhouettes, and add a validated integer seed to the Hermes metadata and ACP registry adapters. Carry style and seed through the profile directory, team/room snapshots, panel, HUD and all avatar call sites. Preserve picture precedence. Verify that saving, reopening and restarting reproduce the same trace everywhere without changing old avatars.

Evidence: [Agent contract and serializer](../../../src/components/agents/agent-model.ts), [renderer selection](../../../src/components/agents/avatar.tsx), [gateway profile reader](../../../src/engine/profiles.ts).

### 3. Approval-step continuation is a runtime change

**Observed specification defect.** Section 5.6 promises that `meanwhile` continues steps independent of an answer, while section 8 says nothing new is needed on the backend. The runner follows one `currentStepId`. An unanswered approval sets `needs_approval` and breaks that loop. The published approval-step JSON schema has `additionalProperties: false` and admits neither new field.

Fix: revise the scope statement. For the initial design rollout, a meanwhile sentence can describe other work that is actually running. Continuing branches within the same run requires a separately bounded implementation: dependency rules, scheduling, durable step state, lease/version handling, approval payload binding and restart behavior. Adding fields to the editor cannot provide that behavior. If same-run continuation remains required, schedule and prove it explicitly before marking the spec complete; do not silently demote it to prose.

Evidence: [single-step traversal](../../../src/services/workflow-runner.ts), [unanswered approval](../../../src/services/workflow-runner.ts), [approval schema](../../../src/schemas/workflow-v1.schema.json).

### 4. The specified activity source is not the current Activity dashboard source

**Observed specification defect.** The spec names `collectActivitySnapshot` as the common source. Current Activity cards use `useActivity` → `collectActivitySources` → `buildActivityDashboard`. The older snapshot reads seven days of events, open workflow runs and session-store decisions; it does not include room prompts. A Home pulse based on that snapshot can disagree with Activity and miss a team's question. Its seven-day window also cannot implement an arbitrary “since last visit.”

Fix: reuse the current source/selector path and add a small explicit projection for Home and the dock. Actionable questions must retain owner, engine/session or room, request identity, full decision payload and resolution state. Preserve source errors, unknown coverage and workspace exclusions. Add scoped last-visit cursors and bounded pagination for deltas. Show unknown when evidence is unavailable; never turn a failed fetch into “everything is moving.”

Evidence: [current hook](../../../src/components/activity/use-activity.ts), [older collector](../../../src/lib/activity.ts), [room and workspace handling](../../../src/lib/activity-dashboard.ts).

### 5. Document review is not in the panel, and its receipts are not verified claims

**Observed specification defects.** Section 5.2 says proposals are reviewed in the panel “as today.” Today `InlineProposals` renders the old/new hunks in Docs and uses the document save session before applying them. It is not the panel's approval/clarify protocol. Document proposal receipts use `record_id: null` and carry the path in their payload; querying receipts “on the document record” misses these events. An accepted edit is not proof that a claim is verified.

Fix: preserve the existing hunk acceptance, dirty-draft flush, conflict checks and local file writer when moving the review controls. Keep the reviewable diff available. Specify canonical document/path resolution for receipts. A verified-claims count requires claim identities, explicit verification evidence and a binding to the relevant document revision. Until that evidence exists, show verification as unavailable, not zero or a count of accepted edits.

Evidence: [document review integration](../../../src/components/docs/document-page.tsx), [proposal actions](../../../src/proposals/use-proposals.ts), [receipt payload](../../../src/lib/data/work-receipts.ts).

### 6. Existing decision cards manufacture recommendations from list order

**Existing implementation bug exposed by this redesign.** The first non-deny approval choice is marked recommended, and the first single-select clarification option is always recommended. There is no evidence in those conditions that an agent recommended that answer. Reusing those props would turn an arbitrary first answer into a visible “recommended” label in 2050.

Fix: omit recommendations unless the decision includes an explicit supported recommendation. Preserve free text, multiple questions, multi-select, all permission scopes, denial and error/retry behavior. Number-key shortcuts must be scoped to the active decision and disabled while typing or composing text; Enter activates the focused choice, not an implicitly recommended approval. Resolve through the existing owning session/room path and reject stale requests.

Evidence: [approval recommendation](../../../src/components/agent/decision-card.tsx), [clarification recommendation](../../../src/components/agent/decision-card.tsx), [room request validation](../../../src/components/agent/panel-room.ts).

## Contracts to settle before their implementation slice

These are readiness limitations, not reproduced bugs:

| Contract | Concrete implementation requirement |
| --- | --- |
| Session and Not today | Define “session” as an app lifecycle, separately from agent conversations. Recommended: reset active mode on a genuine native app launch, preserve it through webview reloads and panel opening, retain the previous answer only as history. Main window owns it. Mirror it into detached/HUD state and suppress both toast hosts without stopping agents or resolving decisions. No inactivity timeout is needed to interpret silence: default to Thinking while the chooser remains optional. |
| Removable context | `MaterialContext` currently displays a reference. Sending reads the canonical context snapshot. Removing a chip must change the actual next-turn payload, including any route reference that re-identifies the removed material. Explain that removal affects future messages, not material already sent. |
| Move menu and set aside | Define field IDs/types, workspace/project relation and missing-value handling for Tasks. Define `keeping_out`, “Set aside” and “Rest for today” transitions and persistence. Do not map them to archive, cancellation or engine shutdown by inference. Existing tasks without new metadata remain reachable. |
| Dashboard bands | Existing pins have arbitrary grid coordinates and kinds, not semantic bands. Define classification and persistence for every pin kind, including custom/plugin widgets. Preserve scope, config and positions reversibly. Home's unchanged grid and the four-band workspace presentation must have explicit boundaries. |
| Shell fit and coverage | Specify content-relative margins, aside collapse/reopen, dock overflow, inspector placement, keyboard order and 200% reflow at the native 900×620 minimum. The full Project room and non-Activity Settings surfaces also need an adoption mapping; they are missing from the per-surface rollout despite “everywhere.” |
| Truthful language | Translate app-owned presentation labels without rewriting stored enum values, historical events, user documents or agent quotations. A failure must remain recognizably a failure. Resolve the spec's timestamp/no-clock wording and its out-of-scope badge-count wording against the explicitly required question count. |

Do not merely append the ten rules to `DESIGN.md`: replace the superseded typography, floating-surface and decision-action rules explicitly. Reconcile the database preservation exception and the saved Accent Strength preference with the proposed fixed 10% tint. `DIRECTION.md` also retains older collapse/HUD rules; mark those passages superseded by the accepted 2050 contract.

## Implementation sequence

The owner-approved visual direction remains the target. Implement against this repository, with one coherent user journey completed at a time.

1. **Correct the spec in place, then accept the bounded implementation scope.** Fable owns visual intent; engineering supplies the corrections above. Resolve database selection, lifecycle/set-aside semantics and whether same-run continuation is included. Record these in the existing packet rather than opening another design exploration.
2. **Panel proof, frame 8r.** Introduce only the tokens, Surface, typography and Choices needed by the real panel. Adapt the existing semantic primitives; retain their focus traps and keyboard behavior. Show one actual question, answer it, observe the correct transcript result, remove context and verify the next-turn payload. Repeat through ejected and HUD forms. Done when this real journey works and matches the accepted frame in the assembled app.
3. **Home and session modes.** Add the shell dock, shared question projection, pulse and lifecycle-owned mode. Prove a room question is visible; answering in one surface clears it in the others; Not today silences both windows; reload preserves the mode; app restart resets it; existing dashboard pins remain reachable. Introduce the move menu only with its field and scope contract. Preserve honest empty/error/offline states.
4. **Agents, Docs and Databases.** Deliver trace identity round trips, then the document proposal journey, then the database restyle. Make the selected-row change only after its outstanding owner decision. Prove vault save/conflict handling, all existing database view controls, pin scope and resizable/full-page peek behavior.
5. **Workflows.** Restyle library/composer/run using the existing runner first. If continuation is retained, implement its defined runtime increment and prove pending approval, independent work, denial, restart and no duplicate consequential action before claiming completion.
6. **Complete adoption.** Graph, Canvas, Activity, Unit/workspace bands, Project room, remaining Settings and Ask. Ask sends through the existing panel owner and renders that turn's result; it does not create a second conversation. Preserve generated/plugin widget compatibility and all Places. Complete a whole-app consistency pass after the final slice.

At each slice, use the existing relevant tests plus regression cases for changed behavior. Evaluate all-theme contrast automatically; inspect freshly rebuilt native Mocha and Flat White at default/minimum window sizes, 100%/200%, keyboard paths, realistic data and empty/error/pending states. An independent reviewer inspects the assembled result before promotion. Restart tests belong in the slice that changes persistence, not at the end. Integrate each finished slice before opening the next. Publication remains a separate explicit owner action.

## Verification and limits

- **Executed:** repository contrast calculations; 9 targeted Vitest files, **59 tests passed**. Covered agent model, Activity sources/projection, workflow schema/runner, decision gateway, inline proposals, decision primitive and Home pins. These establish the current baseline, not conformance of unbuilt 2050 behavior.
- **Inspected visually:** supplied local Turn 8 renders 8b, 8h and 8r. Reviewed the spec, inventory, direction, current `DESIGN.md`, build contract and relevant source paths. Source/measurement reliability is high for the six findings above. Runtime outcomes described for literal future implementations are engineering inferences.
- **Not performed:** native 2050 interaction, full visual coverage, live migration validation or deployment. No app implementation or approved design files were changed. Official Google DESIGN.md CLI lint was not run; the candidate is a feature spec, and no revised root DESIGN.md exists to lint/diff.
- **Context limits:** assignment readback returned 7 Keel projects and 35 open tasks. The available IntelliZen tool surface has no `navigate_memory`, `conclude_memory` or standalone work-event append tool. This local report is the review receipt; no unrelated record was mutated to manufacture a database receipt.

Decision threshold: retain the visual direction. Start the panel slice once its corrected behavior and token contract are accepted. If a desired feature lacks an authoritative source or transition, keep it explicitly pending and complete the independent visual work; never fill the missing behavior with reassuring prose or an inert control.
