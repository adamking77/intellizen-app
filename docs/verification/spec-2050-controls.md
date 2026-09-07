# SPEC-2050 controls correction

Status: controls and final typography corrections verified in the packaged app and published to the authorized draft PR #24 on 2026-09-08.

Adam reopened verification because Home modes and small controls were not checked thoroughly. This report supersedes the earlier blanket completion claim. Ponytail full was used by Keel, Sol and Terra. GenZen Build remains disabled.

## Binding corrections from Adam

- Home's mode/action pill sits at the far left, activity pill at the far right; narrow layouts wrap. Activity text uses sentence case.
- Pop-up modals retain their shadow and blurred scrim.
- Attached, detached and HUD conversation geometry remains compact. The design reference does not override that layout.
- Set aside and Rest for today quiet local presentation while work continues.

## Reproduced defects and fixes

| Surface | Defect | Correction |
| --- | --- | --- |
| Not today | Dock collapsed into a narrow vertical stack at normal size; six pending question marks remained visible | Explicit full-width wrapper, bounded controls, hidden question count/dots; stored questions retained |
| Home dock | Count was inert; both pills centered; all-caps status | Count opens Deciding, pills align to opposite edges, sentence-case status, 36px base height |
| Home keyboard | Mode branch changes could lose focus; underline could become stale on resize | Arrow/Home/End navigation restores focus after rendering; indicator measures resize; keyboard motion stays immediate |
| Thinking | Held updates appeared as a full list | Saved update rows are shown in Deciding |
| Executing | Selecting a project still showed every unassigned task | Scope uses the authoritative hierarchy relation; All retains unassigned/older tasks; selection persists on return |
| Home scope | Long project names could widen the control | Bounded native select with a bottom hairline and accent focus |
| Home approval | IDs/hash dominated the question; disabled rejection controls lacked explanation | Plain current-step/context copy, technical disclosure, named preview and reason helper; exact approval concurrency checks unchanged |
| Shared Control | Ordinary controls inside a form submitted it | Default type=button, explicit submit preserved |
| Shared Segmented | Disabled current value removed the keyboard entry point; long groups overflowed | First enabled tab stop, disabled-aware arrows, bounded wrapping |
| Shared Choices | Caller key handler replaced number shortcuts | Composed handlers respect preventDefault, modifiers and disabled choices |
| Shared fields and pinned editors | Boxed/weak focus treatment | Transparent field, bottom hairline, accent focus; native inputs/selects retained |
| Agents / Workflow Library | View selectors did not consistently expose selection or remember it | Shared Segmented and persisted Cards/List preference |
| Docs / Database | Mode state and compact toolbar layout inconsistent | Selected planes match state; database action group wraps |
| Graph | Child canvas bypassed Connected ground; labels were faded; path used raw lavender | Canvas reads ground/surface/semantic accent, full muted ink, reacts to contrast/pane changes |
| Graph selector | Clear was nested inside another button; missing popup state | Sibling Clear, labelled dialog, expanded state, visible focus |
| Shared menu / cards | Old surface fills/borders and weak keyboard handling | Surface fill, menu focus/arrow/Escape handling, viewport clamping |
| Notes / motion | Colored Sonner variants and continuously animated loading marks | Neutral Note lane and static loading indicators; Pulse remains the activity motion |
| Agent identity | Selected accent could collide with saved semantic hues | Resolve safe identity colors consistently across avatar renderers |
| Typography | Tailwind compiled ambiguous `text-[var(--t-count)]` and other size tokens as `color`, leaving inherited font sizes | Explicit `length:` hints for all six existing size tokens; compiled CSS now emits `font-size` |
| Agents heading | Oversized rendered eyebrow; page and Teams headings shared one scale | Actual 10px eyebrow, 24px page title and 20px Teams heading, with clearer spacing |

## Review coverage

Source/caller review covered Home, Databases, database views and pin editor, Docs, Graph, Canvas, Workflows, Agents, Settings, Project, Room, and the shared shell/control primitives. Canvas authored colors and modal depth are intentional exceptions. A code review does not prove every runtime branch.

Native review used Tauri WebKit with actual local activity. The final unsigned release bundle was built successfully and launched from `src-tauri/target/release/bundle/macos/IntelliZen.app`; accessibility reported `tauri://localhost/home`, confirming packaged assets rather than the development server. No workflow approval or message was submitted for this pass.

| Native check | Observed result |
| --- | --- |
| Fresh process | New-session choice appeared with the prior mode stated |
| Not today | No question count/dots or notification lane; navigation remained reachable |
| Thinking → dock count | Opened Deciding and the real pending question |
| Keyboard Tab → arrow → End | Switched mode and retained focus on Not today |
| Home at 200% | Pills wrapped; all mode controls remained readable after the narrow agent drawer was dismissed |
| Executing project selector | Changed 93 all-scope tasks to the selected project's actual empty state, with guidance to All |
| Set aside → Restore | Local quiet state and Restore appeared; Restore removed the quiet state |
| Mode across navigation | Returning from Agents retained Executing |
| Agents Cards → List → Home → Agents | List selection persisted and list actions rendered |
| New-agent modal open / Escape | Shadow and blurred backdrop preserved; Create disabled without a name; no agent created |
| Graph help | Opened the explanation and closed with Escape, returning focus |

Final packaged-app rechecks passed: new-session choice; Not today; question-count navigation to Deciding; project scope filtering; Set aside and Restore; selected scope retained after Graph → Home; Home pills at opposite page edges at normal zoom and wrapped at 200%; Graph canvas/ground agreement and Insight/Construct controls; new-agent modal shadow/blur and Escape. Zoom was restored to 100%. These checks used the frozen source after the full-page Home width correction.

Private native images remain in `design/features/app-architecture/evidence/2050-followups/controls-*.png`. They are not copied into the publication checkout.

## Checks and practical limits

The publication checkout's full suite passed 903 tests with one skipped live test before the final scope-memory check; that final Home regression suite passes 14 tests. The initial clean-checkout run lacked required test environment values and failed during imports; the successful run used inert local Supabase values. No credentials were copied to that checkout.

Final Home and Dock tests passed 17/17 after the full-page width correction. The publication checkout's final design/TypeScript checks passed, including 145,110 contrast combinations. Contrast validation covers defined foreground/state token combinations, not every possible canvas/content color. Tests of approval behavior use controlled fixtures; real approvals were not issued. Native evidence covers the interactions listed above, not an exhaustive traversal of every application state.

The subsequent typography correction is a mechanical disambiguation of 565 font-token uses across 100 source files, preserving all token values. Generated production CSS was inspected for `font-size:var(--t-count/meta/ui/body/section/title)`. Earlier unit and contrast checks did not detect the invalid color declarations; they are not evidence that those sizes previously rendered correctly.

After that correction, the native release bundle rebuilt successfully. Relaunching the packaged app confirmed the Agents eyebrow/title/Teams hierarchy at normal and 200% zoom, Home Not today at both sizes, and compact attached-panel geometry. The Agents screenshot is `controls-packaged-agents-typography.png`. The design guard now rejects ambiguous font-token classes and checks Tailwind's generated font-size rules for all six tokens.

Final typography suite: 904 passed, one intentionally skipped live test, across 177 passing files. A concurrent run during native compilation hit Canvas/Reports timing failures; those suites passed 17/17 after compilation, then a fresh full suite passed. Final check/contrast gates passed. Logs: `/tmp/spec2050-publisher-typography-final-tests-retry.log`, `/tmp/spec2050-publisher-typography-guard.log`, and `/tmp/spec2050-native-typography-final.log`.

The local packaged build is private and unsigned. It includes this machine's local access configuration and must not be uploaded. GitHub receives source changes only.

Resolved scope difference: the reusable reference includes a rail-foot Pulse and universal ambient dock. The accepted app contract keeps Dock/Pulse contextual (Home owns session controls), reserves the sidebar footer for connection status (DESIGN.md:402), and preserves existing Graph/Canvas/Docs/Workflow toolbars. No extra global dock or rail status surface was introduced. This is an intentional app-specific mapping, not a claim that every reference feature was copied.
