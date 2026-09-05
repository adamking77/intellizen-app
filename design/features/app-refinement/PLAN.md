# IntelliZen — one workspace, one refinement plan

Status: approved implementation and final native review complete, including editor coherence, Docs vault folders, audit cleanup and final panel polish. Current acceptance and limits: `evidence/final-polish/VERIFICATION.md`. Earlier receipts and snapshots remain historical evidence.

Owner: Keel. Target: the existing macOS app. Delivery route: refine and evaluate the real application against its approved design, using focused rendered studies only where an existing rule leaves a material visual decision unresolved. GenZen Build is excluded by Adam's instruction.

## Outcome

Adam can understand a project's situation, direct an agent, inspect its output and evidence, make a decision, and return later without reconstructing context. The interface presents that capability through restrained surfaces, precise typography, coherent proportions, compact information and contextual controls.

Success requires both dependable behaviour and visual refinement. Neither a screenshot nor a passing test suite establishes the other.

## Authority

- Product purpose and everyday working scene: `PRODUCT.md`, `ROADMAP.md`.
- Approved visual rules: `DESIGN.md`, `docs/stages/design-system-v3.md`.
- Approved composition: the recovered direction-study HTML at `output/audit-docs-workflows-2026-09-05/approved-direction-study.html`.
- Inspiration: the ten images and selection notes in `design/references/pinterest-2026-09-04/`. Extract their hierarchy, proportions, restraint and treatment of content; the approved rules control where individual images disagree.
- Completed baseline: `output/docs-workflows-repair/VERIFICATION.md`. Preserve the repaired Docs/Workflows behaviour and existing unrelated edits.
- Database exception: the approved Databases surfaces retain their own visual contract. Shared changes must be checked for regressions there.

This plan uses the existing product and design documents. It does not require creating a new foundation-document suite, adding a framework, or replacing the component kit.

### Approved Workflows correction, 2026-09-05

Adam expects a card-based workflow library and an editable visual composer supporting both manual and agent-assisted creation. His current direction overrides treating the later runs-first document as settled acceptance. He paused for discussion, then explicitly approved resuming with the proposed design.

The engineering recommendation presented in the conversation is: compact workflow cards; opening a workflow gives its visual composer the working area; node fields edit in context; the existing agent panel proposes inspectable changes to the same draft; validation and exact-version run history live in a collapsible lower drawer. Saving, activating and running remain distinct. Adam approved this recommendation with “yes go”; it now governs implementation.

Evidence reconciled: `docs/verification/v2-product-completion/04-workflow-catalog.png` shows the earlier card library; `stage-5-workflow-topology.md` records an editable spatial composer. Later `docs/stages/round-2.md:193` and `docs/stages/design-system-v3.md:413` prescribe the runs-first surface. The later specification's approval assertion has not been independently traced to a user approval of that particular interaction change.

Implementation: the card library now opens the editable composer. Inline fields, real connections, automatic/manual layout, undo/redo and local recovery use the existing schema. A narrow `propose_workflow_draft` MCP tool stages reviewable local changes without Registry mutation; the native review/apply path has been exercised. Exact run snapshots and the existing runtime boundary remain in place. Final independent native review subsequently passed; see `evidence/NATIVE-REVIEW.md` and the later `evidence/editor-coherence/NATIVE-REVIEW.md`.

### Canvas correction, 2026-09-05

Adam identified drop shadows, an overcrowded canvas header and expanded cards overlapping adjacent nodes. Remove canvas shadows; keep workflow identity, Save and Run in the header; disclose secondary workflow and step actions in contextual menus; place canvas tools in normal flow outside its drawing area. Expanded cards reserve actual measured dimensions and temporarily reflow neighbours without overwriting the saved arrangement. Verify input and Advanced-field growth, collapse, drag/Undo, menu keyboard focus and 200% zoom in the native app. Adam additionally rejected the accent fill on expanded cards: use the active theme’s neutral blend of raised and base planes, base-plane fields and subtle border. Accent remains reserved for connections and focus; verify dark and light themes.

## Scope and decisions

Audit every permanent Place plus project/workspace/session surfaces and the agent panel. Implement evidence-backed corrections to approved behaviour and optical refinements within the approved rules. A page that already meets the standard receives verification rather than a redesign.

Existing navigation, engine ownership, schemas and permission boundaries remain the starting contract. Home stays user-configured; agents remain selectable rather than hard-coded by name.

New interaction sequences, destinations or changes to binding design rules must be shown as specific proposals before implementation. This follows the explicit workflow-design rule in `ROADMAP.md`; it does not create a new approval requirement for ordinary fixes or already-approved behaviour. Complete independent approved work while any such proposal is pending.

Publishing, deployment, sending messages, live workflow execution, consequential approvals, destructive cleanup and schema migration are separate actions. Prepare concrete reviewable results first. Use isolated fixtures for mutation tests and existing real data for read-only checks.

## 1. Establish the whole-app baseline

Inspect the running application and the code behind each surface. Capture a compact screenshot/contact-sheet inventory with consistent viewport, theme, selection and data state. Preserve the initial diff so the earlier repair and unrelated work remain identifiable.

Cover Home, Databases, Docs, Graph, Canvas, Workflows, Agents, Settings, unit/project rooms, session transcripts, panel, ejected panel and HUD. Reuse existing valid evidence where the relevant source and state have not changed.

Evaluate each surface on:

1. Content hierarchy and the next meaningful action.
2. Proportion of navigation, working area and supporting material.
3. Typography, spacing, alignment, truncation and readable density.
4. Surface contrast, selected-state weight and colour distribution.
5. Consistency and placement of controls, menus, properties and receipts.
6. Context continuity, truthful state and recovery behaviour.

Record only concrete findings: source/reference, current evidence, user impact, affected component, proposed correction and verification. Distinguish observed defects from hypotheses. Mark each surface keep, refine or repair; rank data loss and misleading authority/status ahead of cosmetic changes.

Exit: a bounded issue ledger and coverage map. No unsupported claim that every page needs work.

## 2. Establish the visual benchmark in the real app

Use a project room, a document and the workflow builder as representative compositions. Apply the approved design to a small coherent set of changes before spreading any shared adjustment.

- Give the title, content and primary action unmistakable priority.
- Consolidate redundant header presentation where the existing interaction contract permits it; preserve distinct view levels and orientation.
- Balance compact information against breathing room around reading, decisions and relationships.
- Use the approved background planes and selection token consistently; reduce unnecessary filled containers rather than adding local opacity overrides.
- Align metadata, icon sizes, baselines, control heights and spacing rhythm.
- Keep ordinary supporting controls quiet and make contextual tools available where the work occurs.
- Retain readable contrast and visible keyboard focus in light and dark themes.

Produce matched before/reference/after evidence. The benchmark must feel coherent at both normal desktop width and with the agent panel open. Any requested departure from a binding design rule is documented with a concrete rendered proposal.

Exit: representative compositions satisfy the approved direction and have no new behaviour or accessibility regression. This benchmark becomes the comparison for subsequent pages.

## 3. Apply shared refinements and finish each surface

Start with common components only where the baseline demonstrates a shared cause: shell, headers, controls, tabs, fields, identities, statuses, drawers and receipts. Check the approved Database exception immediately after shared changes.

Then work in small reviewable packages:

| Package | Focus | Completion evidence |
| --- | --- | --- |
| Shell, project and workspace rooms | Orientation, title/properties/views, information density, ownership/blockers/decisions already supported by records | Real project and workspace states; no-context and sparse-data cases |
| Docs and Workflows | Optical refinement of the repaired composition; preserve saves, proposals, full source, draft and activation semantics | Updated desktop/panel/narrow captures plus existing regressions |
| Agent panel, sessions and receipts | Context visibility, message hierarchy, identity, approval choices and direct access to real outputs | Same selected project/document/run through panel and transcript |
| Graph and Canvas | Working-area proportion, quiet contextual controls, readable selection and inspection | Representative populated and sparse canvases |
| Agents and Settings | Scanability, restrained forms and dependable saved/pending/error states | Real configuration views and controlled failure cases |
| Home and Databases | Preserve approved customisation and Database design; correct only demonstrated defects | Regression comparison against their own authority |

Each package follows inspect → change → render → interact → independent review → correct. Keep a clear record of which shared changes affect which pages. Do not spread an unreviewed visual adjustment across the application.

Exit: every audited finding is fixed, explicitly retained with evidence, or separated into a specific unresolved proposal. A proposal is not counted as an implemented improvement.

## 4. Prove continuity, truth and recovery across surfaces

Walk the already-approved everyday sequence with one representative project:

1. Open the project and understand its purpose, ownership, current work and pending decision.
2. Open an agent-produced document and inspect its supporting records.
3. Review proposed changes without losing local edits or graph/metadata content.
4. Open the panel and verify the agent receives the intended project/material/authority context.
5. Follow work to its exact run, output, receipts and verification result.
6. Return to the project and see the same underlying records and status.
7. Restart/reconnect and recover the relevant context, drafts and history.

Use controlled fixtures for actual changes and runtime dispatch. Inspect live operational data without triggering external work. Switching agent engines must preserve or explicitly re-establish the intended context through existing supported contracts.

Check that queued, running, completed, verified, accepted, blocked, failed and unknown states retain their distinct meanings. A runtime completion or an agent assertion must not become verification evidence. Missing data must not resemble an empty workspace.

Address proven failures in persistence, record links, context binding and recovery. If a fix requires backend changes outside the approved scope, state the concrete dependency and keep that acceptance item open rather than concealing it in front-end state.

Exit: each transition has an observable result and an evidence link; no silent loss, ambiguous target or misleading success remains in the exercised journey.

## 5. Validate the assembled app

Functional verification:

- Meaningful targeted tests for affected behaviour, then repository checks and the full suite on the integrated source.
- Relevant engine/parity checks where a runtime boundary changed.
- Production frontend build and bundle-secret scan; native checks appropriate to changed code.
- A local built-app walk when packaging is in scope; distinguish development-app evidence from packaged-app evidence.

Design and accessibility verification:

- Native screenshots at 1180×760 and 1003×760, plus the constrained centre with the agent panel open.
- Docked/ejected panel at its supported narrow width, including 390px where specified.
- Representative light and dark compositions; shared states across all seven supported themes and selection-strength extremes.
- Keyboard navigation, visible focus, Escape/focus return, long names, empty/loading/error/recovery states and 200% zoom on the affected primary journeys.
- Independent comparison of the final assembled product with the approved references, not an earlier mock-up.

Freeze the reviewed source revision or patch fingerprint with its evidence. If a subsequent change affects that evidence, repeat the relevant checks.

Exit: final functional and visual reviews have no unresolved blocker. Log the exact tests, screenshots, environment and limits; never treat a green build as visual acceptance.

## 6. Close with an auditable result

Keep this file as the single plan. Supporting screenshots, logs and the issue ledger live under `design/features/app-refinement/evidence/` rather than creating competing specifications.

Deliver a short final account of what changed, what already worked, what was tested, the independent verdict and any explicit remaining proposal or operational limit. Record the required work receipt through the IntelliZen MCP. Do not claim deployed, packaged or personally accepted by Adam unless those events actually occurred.

### Definition of complete

- Every in-scope surface has been inspected against its correct authority.
- The intended visual hierarchy and restraint hold together across the app.
- Approved interactions remain intact, including the Database exception.
- The exercised project/document/agent/run sequence preserves context and exposes its real results.
- Changes survive navigation and the tested failure/reconnect cases.
- The final source passes its required technical checks and independent visual review.
- All claimed outcomes have fresh evidence; remaining limits are explicit.

### Progress

- [x] Compile the shared objective, sources, scope, sequence and acceptance criteria.
- [x] Whole-app baseline and bounded issue ledger.
- [x] Representative visual benchmark.
- [x] Shared and page-specific implementation packages.
- [x] Cross-surface continuity and recovery proof.
- [x] Integrated functional, visual and accessibility verification.
- [x] Final evidence and completion receipt.

## Steps-view follow-up — 2026-09-05

Adam requested that each insertion plus open a blank card exactly in the step sequence, with type selection inside that card, and that an expanded Steps-view card allow changing its type in place. Implement inline cancellable placeholders at entry, between steps and on either condition branch. Choosing a type creates and expands the real step; changing type preserves identity/title/routing and participates in Undo/Redo. Converting a divergent condition asks which successor to keep and retains the other steps. Existing runtime condition/approval payloads require a predecessor; explain unavailable choices instead of creating self-references. Canvas presentation is unchanged by this follow-up.

Verification: mounted insertion/cancel/focus/type-change/branch tests, helper routing/default tests, integrated checks/build, independent native Steps interaction. Evidence lives in `evidence/steps-editing/`. This follow-up does not rewrite the prior completed refinement snapshot.

Adam’s additional focus correction: workflow form fields use the shared neutral editing edge. Suppress the global accent outline for workflow selects and numeric fields; text inputs/textareas already use caret plus neutral border. Preserve keyboard focus treatment on action buttons.

## Outcome-card follow-up — 2026-09-05

Adam explicitly requested repair of immovable Complete/Blocked/Escalate outcomes. All three now support full-card drag, selection, saved positions and existing Undo/Redo while retaining fixed outcome semantics. Implementation, focused tests and independent source review passed. The later `evidence/editor-coherence/NATIVE-REVIEW.md` closes native direct dragging, Undo/Redo and reopen persistence for all three outcomes. Evidence: `evidence/outcome-dragging/VERIFICATION.md`.

## Direct card dragging and expert review — 2026-09-05

Adam requested removal of the coloured drag footer: implemented full-card/header dragging with protected form and control regions. Targeted tests/build checks passed; the later `evidence/editor-coherence/NATIVE-REVIEW.md` closes native interaction acceptance. His broader design/IA question was answered as recommendations, not authorization to redesign both editors: shared card meaning/control parity, progressive disclosure, readable routing, local validation and purpose-led library cards. Evidence: `evidence/card-drag-surface/`. This was an interim checkpoint; the shared editing follow-up below subsequently completed the native acceptance pass.

## Shared workflow editing experience — 2026-09-05

Adam approved implementation of the six recommendations with “Ok run those. Let's see them.” Steps and Canvas now use the same title-first card editor and type chooser; Trigger contains workflow inputs in both views; routes stay visible while Inputs, Output and Controls disclose supporting detail. Library cards prioritize purpose, owner and concrete readiness. Save/proposal reviews show readable changes and authority with exact definitions under Source. Validation targets the affected card and field. Optional canvas outline/search and minimal reveal preserve the user's zoom and layout; returning from Steps restores the canvas viewport. Flat neutral cards, protected form interactions and direct card dragging remain required.

Implementation and independent source/native review complete. Full application suite: 683 passed, 1 skipped. TypeScript/product/design checks, production frontend build and secret scan pass. Native review exercised direct dragging, insertion/type edits, validation focus, save review and 200% layouts using a separate local QA draft; Adam's existing four-step draft was preserved. No Registry saves, activation, real execution or agent sends are part of this test. Evidence: `evidence/editor-coherence/`.

Grouping is intentionally deferred until workflow scale justifies a grouping model; searchable outline supplies navigation now without introducing new workflow semantics.

## Final reconciliation and native polish — 2026-09-05

Completed the remaining heading reflow, historical status reconciliation and post-cleanup native walkthrough. Adam’s follow-ups also removed the floating panel/HUD exterior shadows, set the native background explicitly transparent and applied the shared control radius to composers. Native review exposed HUD growth moving controls off-screen; resize now moves the window only when needed to stay on the current monitor.

Fresh independent review passed the bounded panel/HUD, Docs and both workflow-editor journeys. Final checks: 668 frontend tests passed (one existing skip); 55 native tests passed (three opt-in integrations ignored); TypeScript, product/design/file-size checks, native lint/build, frontend build and secret scan passed. Evidence and explicit capture limits: `evidence/final-polish/VERIFICATION.md` and `NATIVE-REVIEW.md`. Grouping and non-case Brief templates remain deliberately deferred; no release, Registry write, live run or agent send is implied.

## Pane controls, compact header and theme review — 2026-09-05

Implemented Adam’s four interaction refinements: one Settings destination, a picker-led ejected header, persistent internal pane resizing with pointer/keyboard controls and a pill-shaped collapsed HUD. Fresh native review passed the exercised interactions, preserving the target, unsent draft and original widths. Evidence: `evidence/pane-controls/VERIFICATION.md`.

The theme question was audited against the canonical rules and current source. The palette structure is documented; the checker does not cover every actual foreground/accent pair and two contrast gaps remain recorded in `evidence/pane-controls/THEME-AUDIT.md`. The current interaction completion is not a claim of universal theme contrast compliance.
# Accent states follow-up — 2026-09-05

Completed chosen-accent hover/selection across all flavors, contrasting accent foregrounds, Accent Strength label, detached placeholder removal and visible disabled HUD voice controls. See `evidence/accent-states/VERIFICATION.md` and the independent native review there. This resolves the previously open shared-token contrast gaps. The interrupted final direct-HUD identity check remains a verification limit, not a continuity pass.
