# SPEC-2050 product language follow-up

## Scope and method

Audited the rendered language in every permanent page (`Home`, `Databases`, `Docs`, `Graph`, `Canvas`, `Workflows`, `Agents`, and `Settings`), the department/workspace and project pages, room/session surfaces, and their dashboard, document, database, project, workflow, canvas, and graph components. The pass used the current UI behavior as its source of truth. It preserved action names, approval boundaries, receipt terminology, data states, and the compact layout.

Ponytail full mode kept changes local to existing strings and one missing Voice heading. Copy Audit classified vague headings, descriptions, helper text, and empty states; Copywriting Harness edit mode rewrote only language that was unclear or made a claim the current product did not support.

## Implemented changes

| Surface | Before | After |
| --- | --- | --- |
| Databases | “Open one and the editor takes over…” | “Choose a database to view its records, fields, and saved views.” Zero-change rows now say “No changes” instead of “0 changes.” |
| Docs | “Your documents, notes, and workflow sources live here.” | Names the contents, then gives the three available next actions. |
| Workflows | “Design how your agents work together.” | “Create workflows, assign steps, and review results.” |
| Workflow library | “Build your first workflow” | “No workflows yet,” followed by the actual create/save/activate path. |
| Workflow history | “No runs in the loaded history…” | “No workflow runs yet. Started runs and their receipts appear in this list.” |
| Workspace Projects | “projects have a place here” | Gives the project count and names out-of-scope work directly. |
| Project evidence, timeline, sessions, boards, and canvases | Future-tense “appear here” messages | States what is missing and, where available, the action or matching rule that supplies it. |
| Workspace dashboard | “No widgets yet” | “No dashboard widgets yet,” with the supported saved-view action. |
| Settings / General | “Startup and defaults.” | Names the default workspace, startup connections, and conversation behavior. |
| Settings / Voice | No page heading; implied both speech paths were local | Adds a `Voice` heading and distinguishes local dictation from the selected speaking service. |
| Settings / Context | “never duplicated here” | Points to each provider’s connection settings. |
| Graph summary | “is the knot with the most links” | “has the most connections.” |
| Document verification | “Done when not recorded” | “Completion criteria not recorded.” |
| Workflow counts | “1 steps · 1 roles” | “1 step · 1 role,” with plural forms for other counts. |
| Graph empty states | “durable place/scope” | Says that the linked evidence pile stores graph nodes and signals. |
| Home activity projection | Work events “landed” | Calls them “updates” and says when they were recorded. |
| Database record history and trash | “from here on” | Names future versioning and automatic trash behavior directly. |

Additional wording changes cover the document revision empty state, Favorites instruction, project fallback state, singular project evidence counts, workflow source link, and schedule empty state. Existing assertions were updated only where they already checked changed UI text.

## Reviewed and intentionally unchanged

- Canvas uses the selected canvas title and precise loading, save, missing-record, and creation states.
- Graph controls, node/connection fields, path and ego-network errors, and destructive confirmations describe their real actions.
- Database editor views use specific configuration and no-data guidance for tables, boards, calendars, timelines, galleries, and charts.
- Workflow design, dry run, approval, continuation, and receipt language remains technical where the terms help configure or verify execution.
- Settings Providers, Capabilities, and Plugins describe discovery, shared profiles, connection state, and granted capabilities precisely.
- Room/session headings use the selected room identity; unavailable-room and no-room states offer the correct next step.
- Activity’s description, “Decisions, live work, and usage across your agents,” accurately names its cards. Quiet Updates distinguishes saved updates and failed actions and tells the user how to dismiss them.

## Locked owner proposals

The audit did not edit locked owner files. Exact proposals were sent to their owners:

- Home: the owner applied “Choose how to work”; mode labels now say “read and review,” “review pending questions,” “work on tasks,” and “quiet notifications while work continues”; the quiet state now explains that approval actions remain paused and questions and updates are kept. “What you are keeping out right now” became “Work kept out of scope.”
- Agents: “The inventory of who can work for you.” → “Agents and teams available for work.” The empty and read-failure messages should name creation and retry behavior without claiming missing data is present.
- Appearance: the implementation inventory should become “Choose the app’s colors, accent, contrast, and pane arrangement.”
- Agent editor: “No folders — this agent sees only what it is told in the prompt.” should become “No folders — this agent receives no additional folder context.”

## Files changed

- Pages: `src/views/Databases.tsx`, `Reports.tsx`, `Workflows.tsx`, `Unit.tsx`, `Project.tsx`, and `Graph.tsx`
- Dashboard and Home projection: `src/components/home/workspace-dashboard.tsx`, `src/lib/home-availability.ts`
- Project: `src/components/project/project-board.tsx`, `project-sessions.tsx`, `project-views.tsx`, `project-visuals.tsx`
- Docs and databases: `src/components/docs/docs-rail.tsx`, `document-page.tsx`, `src/components/database/RecordInsightSections.tsx`
- Workflows: `src/components/workflows/workflow-library.tsx`, `workflow-detail.tsx`, `schedule-sheet.tsx`
- Settings: `src/components/settings/general.tsx`, `context.tsx`, `voice-settings.tsx`
- Existing text assertions: `src/views/Unit.test.tsx`, `src/components/home/workspace-dashboard.test.tsx`, `src/components/project/project-sessions.test.tsx`, `project-views.test.tsx`, and `src/components/workflows/workflow-library.test.tsx`

## Native review

The integrated native pass covered all eight Places, the relevant Settings sections, workspace/project context, and the requested Command-plus twice reflow spot check. Revised Databases, Docs, Voice, Activity, Appearance, Agents, workspace Projects, and workspace Dashboard wording rendered clearly at 1272 × 768. The app restored normal zoom with Command-0. Evidence and the two stale-runtime limitations are recorded in `design/features/app-architecture/evidence/2050-followups/VERIFICATION.md`.

Focused verification passed across 9 files and 49 tests after updating existing copy assertions. `pnpm check` also passed its file-size, product-contract, design-system, contrast, and TypeScript checks.
