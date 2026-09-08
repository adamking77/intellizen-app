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

## Week theme and Pulse follow-up (2026-09-08)

The production date-derived Build / Marketing / Ops / Slack rotation is restored in AppShell's existing 34px window strip. It is passive persistent context across routes and Not today, with readable neutral ink and the complete label in its hover title. The original 2026-03-23 Build anchor is retained. Calendar-day arithmetic fixes the original daylight-saving edge case; local-midnight, focus and visibility refresh keep the displayed week current. Sunday uses singular day.

Pulse review against COMPONENTS.md, QUIET.md and rendered frame 8e found a confirmed idle-state gap: a known empty snapshot returned no graphic. Pulse now retains a flat, half-opacity neutral baseline with an accessible No active work label. Active waves retain the existing real-work data; Not today suppresses motion and question dots. Unknown data is not relabelled as rest. Ends fade as shown in the reference. The reference calls for a visible but static Pulse in Not today; no new motion was added to that mode.

Focused checks: Pulse/Home/Dock 18 passed; header/rotation/AppShell 10 passed, including midnight and daylight-saving rollover. The publication checkout's full check command passed, including TypeScript, product/design gates and 145,110 contrast pairs.

The combined unsigned native release build passed. The relaunched packaged app (`tauri://localhost/home`) showed Build week · 6 days remaining on Home and Agents, in focus mode, in Not today, and at 200% zoom. The idle Pulse line was visible in Not today with no question count/dots; at 200%, vertical scrolling kept the mode controls reachable while the week label stayed in the header. Zoom and attached-panel state were restored. Private screenshots: `week-theme-not-today-pulse.png` and `week-theme-not-today-pulse-200.png` in the existing local evidence directory. Live data had no active traces, so active-wave freezing was checked from the existing CSS contract and focused fixtures, not claimed as a live-work visual test.

Motion review of this change:

| Before | After | Why |
| --- | --- | --- |
| Known idle Pulse disappeared | Flat static baseline | Quiet status remains visible without inventing active agents |
| Hard SVG edges | Faded ends | Matches the Not today reference |

Verdict: approve the bounded motion change. Existing active traces use transform-only drift; Not today and reduced-motion CSS keep them static. The added idle baseline has no animation class.

## Avatar and agent-modal correction (2026-09-08)

The agent editor now offers only Sphere, Blob and Trace. Picture replacement,
removal and upload controls and their editor wiring are removed. Stored picture
assets are retained, but the shared Avatar renderer no longer lets them override
the selected style. Existing-agent footers contain only Delete, Cancel and Save;
new-agent footers contain Cancel and Save. Automatic draft recovery remains.

All avatar callers use the shared motion defaults. Sphere and Trace get subtle
pointer hover feedback and a 2.8-second breathing rhythm in prominent previews;
Blob retains its native animation. Shared speaking feedback remains available
to all styles. Not today and reduced motion disable movement, including Blob
and speaking feedback. No dependency was added.

Independent motion review caught and corrected an input-modality latch that
stopped avatar feedback after typing until the next click. Hover is governed by
pointer-capability CSS; keyboard focus does not trigger it. Focused tests cover
all three renderers, quiet-mode switching, keyboard continuity, editor action
sets, picture-control removal and draft recovery.

| Before | After | Why |
| --- | --- | --- |
| Keyboard input latched avatar movement off until a click | Session/reduced-motion gate with CSS hover capability checks | Moving the pointer works naturally after typing |
| Sphere/Trace and several small avatar callers stayed static | Shared hover feedback and prominent-preview breathing | The selected style has motion wherever the identity appears |

Motion review verdict: approve after the latch fix. New movement animates only
transforms; hover uses the existing 200ms easing token and remains interruptible.
The breathing duration intentionally matches Blobatar's ambient rhythm.

Final publication checks passed: 43/43 focused tests across five suites,
TypeScript, product/design guards and 145,110 contrast combinations. The native
release build completed successfully (`/tmp/spec2050-native-avatars-final.log`);
the resulting dist scan contained no service-role JWT. The local-access build
remains private and is not a distributable artifact.

The relaunched packaged app showed the exact existing-agent action set and
all three style previews. Changing Sphere → Trace → Blob → Sphere restored
the original selection and disabled Save; no profile was saved or deleted.
New-agent Save remained disabled without a name, with Cancel as its only other
footer action. Both buttons remained visible at 200% zoom while the editor body
scrolled. Cancel and Escape closed the modals, and zoom returned to 100%.
Shadow and backdrop blur were retained. Private screenshots are
`avatar-modal-existing.png`, `avatar-modal-trace.png`, `avatar-modal-new.png`
and `avatar-modal-new-200.png` in the existing local evidence directory.

Native visual coverage is the editor previews and footer behavior above.
Small-avatar caller coverage and quiet/speaking-state switching were verified
through the shared renderer audit and focused tests; live voice playback and
every individual avatar hover location were not exercised through the GUI.
