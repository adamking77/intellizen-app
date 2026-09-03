# DOM, layout, and accessibility facts

- Settings retains one application navigation rail, one Settings section rail, and one content plane in the same order as Hermes.
- The main sidebar exposes one Settings link at its bottom status area; the duplicate page-list Settings entry is absent.
- The New Agent dialog exposes named Sphere and Blob buttons with `aria-pressed`; Blob exposes Auto plus ten named silhouettes.
- Agent editor controls expose named fields for agent name, role, model, identity, voice service, and voice id. Engine and Provider dropdowns are absent.
- The panel-collapse smoke removed the entire agent complementary region, including its splitter and duplicate panel actions. The main header then exposed one `Show agent panel` button.
- Shared keyboard focus is a single quiet outline. Text editors and the composer use the caret without a focus glow.
- Ordinary navigation and selected rows use the neutral raised surface. Accent remains for semantic status, primary actions, keyboard focus, and color selection.
- `prefers-reduced-motion` disables procedural-avatar transforms; speaking motion is driven by supplied audio amplitude.

No clipped or overlapping persistent control was observed in the captured desktop states. Narrow-width and 200% zoom evidence was not collected in this round.
