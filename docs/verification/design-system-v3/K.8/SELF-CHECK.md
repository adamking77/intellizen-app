# Design System V3 — K.8 self-check

## Review context

- **Verdict:** `AWAITING_ADAM_REVIEW`
- **Mode:** final implementation self-check
- **Candidate:** `v3/phase-0` through the production Database restoration
- **Authority:** advisory review
- **Conflict disclosure:** Keel authored and reviewed this work. This is not an independent review and does not satisfy an independent approval gate.
- **Scope:** `DESIGN.md`, `.impeccable/design.json`, the Round 2 and Design System V3 briefs, shipped K.1–K.8 behavior, and the existing verification package.

## Readiness

| Area | Result | Evidence |
| --- | --- | --- |
| Tokens and selection | Ready | `--r-plane: 12px`, `--r-ctl: 8px`, `--r-pill: 999px`, `--h-ctl: 28px`, and `--sel-step: 0.08` agree across CSS, `DESIGN.md`, and `.impeccable/design.json`. |
| Component rules | Ready | Shared controls, pills, identity, empty/failure states, skeletons, drawers, and selection states are recorded in `DESIGN.md`. |
| Product surfaces | Ready | Existing K.1–K.7 and K.9–K.13 evidence covers all seven flavors, edge selection strengths, drawers, Docs, Workflows, settings, agent surfaces, sidebar, continuity, and Activity. |
| Consistency sweep | Corrected | The v3 kit audit closes legacy patterns outside Databases. Adam rejected the database restyle; the installed production app and matching commit `904a456` now govern the database controls, accent-soft selection with 2px rail, property badges, views, and resizable/full-page record panel as a scoped exception. Home database pins remain compact rows. |
| Brief alignment | Ready | `docs/stages/round-2.md` routes the visual-system work to `docs/stages/design-system-v3.md`; the implementation follows its dependency order. |

## Validation

- `pnpm test`: 100 files passed, 1 skipped; 501 tests passed, 1 skipped.
- `pnpm check`: file-size, product-contract, design-system, contrast, and TypeScript gates passed.
- `VITE_INTELLIZEN_LOCAL_ACCESS_KEY= pnpm build`: passed.
- `scripts/check-bundle-secrets.sh dist`: no service-role JWT found.
- `DESIGN.md` frontmatter parses as YAML and `.impeccable/design.json` parses as JSON.
- The official Google `DESIGN.md` CLI was not run because it is not installed; no network install was introduced for this review.

## Remaining approval gates

- Adam's final native-app walk is still required.
- Adam must verify the restored Databases workspace before this recommendation
  can return to ready.
- An independent reviewer may convert this recommendation into an independent verdict.
- Phase I items remain individually approval-gated, including the rotation banner/retired presets and three non-case Brief templates.
- Slider and Follow-system light/dark defaults remain decisions to make after use, as specified by the brief.

No deploy, push, publish, or migration was performed.
