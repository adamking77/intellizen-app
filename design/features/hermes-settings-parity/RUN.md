# Feature Run Record

## Request

Implement all Settings and global hover/selection corrections identified by comparison with `/Users/adamking/projects/hermes-app`, including the previously requested agent avatar and panel-state corrections.

## Source contract

- Product: `PRODUCT.md`
- Design: `DESIGN.md`
- Donor implementation: `/Users/adamking/projects/hermes-app/src/pages/Settings.tsx` and `/Users/adamking/projects/hermes-app/src/tokens.css`
- Audit evidence: `settings-audit/report.md` and `interaction-state-audit/report.md` in the linked Codex visualization workspace.

## Route

Small brownfield parity implementation. No new product surface and no architecture change.

## Work log

- Implemented shared Hermes state primitives and seam-aware Settings shell.
- Updated all six Settings sections and route-specific selected states.
- Restored original transparent, accent-responsive IntelliZen mark and regenerated platform icons.
- Implemented shared Sphere/Blob avatar editing and donor animation modes across cards, modal, chat, panel, and HUD.
- Removed duplicate focus rings, persistent accent selection treatments, and legacy interaction timings.
- Verified the panel collapses completely and leaves one header reopen control.
- `pnpm run check`: passed.
- `pnpm test -- --maxWorkers=1`: 380 passed, 1 skipped.
- `ALLOW_LOCAL_ACCESS_KEY_BUILD=1 pnpm run build`: passed.
- `scripts/check-bundle-secrets.sh dist`: passed.
- Independent rendered comparison: passed with no actionable P0/P1/P2 disparities.

## Status

Complete for the requested desktop parity scope. Native-only data integration, 390px reflow, and 200% zoom remain outside this comparison round and are not claimed as release-verified.
