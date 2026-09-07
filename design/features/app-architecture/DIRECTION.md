# IntelliZen V3 · architectural direction, 2026-09-07

Historical exploration. Adam's subsequent 2026-09-07 native review preserves
the original attached/detached/HUD layout; only their colors and visual
treatment change. Do not use the expanded panel layout proposed here.
The later SPEC-2050 and its engineering corrections
govern the authorized implementation. In particular the aside collapses fully
with an available reopen control, and the external HUD remains; the older
40px strip and replacement in-window HUD proposal below are superseded.

Proposal. Nothing here is approved until Adam says so. It refines the app that exists (`INVENTORY.md`); it adds no Place, route or sidebar item. Mockups: Turn 6 in `design/explorations/claude-design-2026-09-06/`.

## The reading

V3 has the right bones: three planes, one hierarchy, a panel that can leave the window, a palette, fixed Places. What it lacks is a single frame. Each Place built its own header, rail, detail surface and tool cluster, so the app reads as ten small apps sharing a sidebar. Sophistication comes from one frame repeated, with the content changing inside it.

Adam's Pinterest boards (`design/references/pinterest-2026-09-06/`) say the same thing from the visual side: instruments, not dashboards; hairlines, not fills; chrome only when you reach for it; one accent; deliberate emptiness.

## Six moves, in order

### 1. One frame: the situation band

The shell owns a header row that every Place fills the same way. Left: crumb, title, one line of properties, one sentence of state. Right: the counts that need attention as a stat row (number large, word small, hairline between), and at most two actions. View tabs, where a Place has them, sit on the band's lower edge.

Replaces the five title treatments. Home, Unit, Project, Docs, Databases, Workflows, Agents and Settings all render into it. Graph and Canvas render into it too; their pickers become the title.

### 2. One aside, one inspector

**Aside** (left of content): the second-level rail Docs, Databases and Settings each hand-roll becomes one shell slot, 232 wide, ⌘[ to collapse to a 40px strip. When the agent panel is open and the window is under 1400, the aside collapses on its own so the shell never shows four full columns.

**Inspector** (right of content, left of the panel): the shared Drawer, the run drawer and the Database peek panel become one surface with three widths: peek 360, wide 620, page. Same header anatomy as the band. Space on any row opens peek (Quick Look); Esc closes; ⌘⏎ opens as page. The inspector never covers the agent panel; it takes width from content.

### 3. Floating layer as one system: the dock

One bottom-centre dock hosts the contextual tools each surface currently scatters in corners: canvas zoom and fit, graph mode and minimap toggle, docs Read/Edit and word count, table filter and sort, workflow Save and Run state. The dock is a 36px pill, hairline edge, no shadow at rest; it grows upward when a tool opens. Toasts land above it. The HUD stays as the dock's out-of-window form; in-window, "reduce to HUD" becomes a 44px pill at the dock's right end instead of a separate OS window, so focus never leaves the app.

### 4. Three focus levels

- **⌘⇧F Focus** (exists): hide sidebar.
- **⌘⇧R Reading**: hide sidebar and aside, panel reduces to the in-window pill, band collapses to one line, content centred at reading measure. For drafts, transcripts, signal detail.
- **Pin** (⌘P on an output): lock the agent panel's context to this output while you navigate elsewhere. The band shows a pinned chip; the panel's context row shows the pinned output with an unpin.

### 5. The panel sees what you see

The panel keeps its place and modes. Its content model changes to three regions: **Context** (the open output, the selection, the project; shown as chips you can remove or add), **Thread**, **Composer** that states permission and context before you type. Decisions render as a field pinned above the thread, the same component as the Attention card. Receipts fold into one line per run.

### 6. Dashboards in bands (Turn 5)

Home and workspace dashboards keep the grid and pin kinds; widgets live in four fixed bands with one anatomy and three sizes; chrome only in Arrange mode.

## What does not change

Places and their shortcuts. The hierarchy tree. Engine ownership. The Database editor's approved visual contract (the band and inspector apply around it, not inside its table). Seven flavours and fourteen accents. Selection as a plane.

## Form language applied

Hairlines between things, fills only for the one thing that is raised. Numbers at 22 to 26 light, labels at 11. Mono for identifiers, timestamps, counts and paths. Tracked capitals only for band section labels, never for page titles. One accent, spent on selection and connections. Captions under charts and lists instead of legends and filter chips. Nothing glows.

## Open for Adam

1. Is the in-window HUD pill acceptable, or is the separate window the point?
2. Does the inspector's page width replace the Database peek panel's full-page mode, or does Databases keep its own?
3. Reading focus for Docs only, or for any output?

## Neurodivergent correction, 2026-09-07

Source: `~/vault/initiatives/gokart-studio/products/NeuroDiv/knowledgebase/matrix.md`, `nd-process-framework.md`, the Sogo ethos, and Adam's own profile. The 2050 direction (Turns 7 and 8) is largely what those documents ask for: one thing at a time, plain sentences, chrome that recedes, the delta on return so nothing has to be re-explained, an idle state that treats rest as normal. Five things in it break the rules and are corrected below.

### What breaks

1. **Timers.** "waiting 52m", "1h 02m", "escalates in 44h" are countdowns and urgency framing. Banned. A question carries the time it was asked, as a fact, and nothing that ticks.
2. **Blocking language.** "Nothing else can move until you answer", "blocks Marcus · Ines", "waits on you". These make the user the obstacle. Demand framing re-triggers the system. The label becomes "a question for you"; what is held is stated as what the agents are doing meanwhile, never as what the user is holding up. Where the workflow allows, steps that do not truly depend on the answer proceed.
3. **Accent-filled primary actions.** "Approve draft" in the accent is a should. Actions are written as invitations in the same weight as their alternatives. One is marked recommended when there is a recommendation; none is louder.
4. **No done signal.** Outputs and moves must say what done looks like, because the reader often cannot tell when to stop. Every output carries a done line.
5. **No mode.** The app assumed the user is available. The session opens with "What's actually available today?" and four answers: Thinking, Deciding, Executing, Not today. The whole surface reshapes to the answer. Not today is a dignified state, not an absence.

### What is added

- **Move menus, not queues.** A project's "what to do" is a menu conditioned on capacity ("if you have thirty minutes and low energy", "if you have two hours and feel pulled"), each move with trigger, action, done signal and effort. Never a sequence, never a count of things left.
- **What you're keeping out.** Every workspace and project shows a real not-doing list, so the yes has room.
- **Hidden-demand probe.** When a question has sat for days the app does not repeat it. The agent offers one line: "Want to know what answering this would set in motion?"
- **Set aside.** A first-class action on any project or output, with no archive, no grey, no shame. Silence from the user is planned rest by default.
- **Never silent.** The pulse is continuous presence. An agent that is quiet says why in one clause ("reading 88 pages").
- **Counts, never percentages, for anything about the user.** Run outcomes may stay as counts of runs. No streaks, no completion rate, no daily minimum, anywhere.
- **Language.** Second person, calm, invitation ("you may", "when you're ready"). No "should", "need to", "make sure". No exclamation marks. No em-dashes. No praise for competence; receipts stay neutral.

### Sogo, applied

Your data stays where you put it: Docs stay vault markdown, records stay in the workspace database, nothing is copied into a proprietary store to render these screens. AI on your terms: agents still write only through proposals and confirmed MCP writes, and the panel shows exactly what the agent sees as removable chips. Your workflow is not dictated: moves are conditioned on state, not on the calendar; the calendar is a widget you may pin, never the spine.
