# Round 2 and Design System V3 — local completion record

Recorded 2026-09-04 on `v3/phase-0` through `f94bbc4`. This verifies the
authorized local implementation of `docs/stages/round-2.md` and
`docs/stages/design-system-v3.md`. It does not claim a new native-app walk,
push, deployment, migration, plugin installation, `.app`, or DMG.

## Scope result

| Scope | Result | Commit evidence |
| --- | --- | --- |
| Design System V3 K.1–K.13 | Complete | `107f8b3` through `dbfc5ea`, including K.9–K.13 commits and the verification matrix under `docs/verification/design-system-v3/` |
| Round 2 F repairs | Complete | `32a385f` through `c7e4107` |
| Round 2 G engine seam | Complete | `37c3c45` through `5627fcc` |
| Round 2 H MCP door | Complete | `63b3098`, `7a44449`, `e8f00ca` |
| Round 2 J donor ports | Complete | `58660ac`, `4894423`, `f6ccf2e`, `3525141`, `aa5553f` |
| I.1 workspace Dashboard | Complete | `9488cd3` |
| I.2 session transcript | Complete | `4ca2c69` |
| I.3 case tabs and retired destinations | Complete | `fdc9e59` |
| I.4 plugin approval gate | Complete, implementation-only | `f12717c` |
| I.5 Home fixture removal, Choice A | Complete | `4c07df7` |
| I.6 Hermes-owned rooms | Complete | `f94bbc4` |

The production Database design is deliberately excluded from the v3 kit sweep.
Adam verified the restored design after `b7d1f76` and `618536c`; no database
surface was changed by the later Phase I commits.

## Final verification

- `pnpm test`: 105 files passed, 1 skipped; 522 tests passed, 1 skipped.
- `pnpm smoke` with inert publish-safe environment values: passed.
- `pnpm check`: file-size, product-contract, design-system, contrast, and
  TypeScript gates passed.
- Pinned gateway parity: passed, including the exact `groups.*` methods.
- MCP server: 25 tests passed; TypeScript build passed.
- Rust: strict Clippy passed; 53 tests passed, 3 environment-gated tests
  ignored.
- Frontend production build: passed with inert URL/key values.
- `scripts/check-bundle-secrets.sh dist`: no service-role JWT found.
- D.13 loader-ignored fixture proof: route, sidebar, widget, command, panel
  action, and isolated broken-plugin behavior passed.

## I.6 contract decision

The pinned Hermes roster validator accepts local and peer Hermes profile
targets only. It has no ACP target kind. Hermes-only rooms therefore use the
gateway's durable `groups.*` log; rooms containing ACP keep the existing local
round engine. Both use the existing room model and surface. Tests cover owner
selection, exact roster shape, replay from sequence zero after relaunch,
durable messages and receipts, approvals, mentions, target avatars, and the
mixed-room path.

## Deliberate boundaries

- No production or development app was launched during final verification.
- No real plugin was installed. I.4 requires a separate explicit approval for
  every installation; its staging, hash, capability-grant, install, enable,
  disable, uninstall, attribution, and failure contracts are tested.
- No `.app` or DMG was rebuilt, because the current task did not authorize a
  release and the production app was not to be launched.
- No push, deploy, publish, migration, or production data mutation was made.
- Existing untracked Playwright and preview scratch files were not staged.
