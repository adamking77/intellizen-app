# J.5 donor comparison

Reviewed 2026-09-04 against the built Hermes Workspace donor and the current
IntelliZen branch. This record reuses the earlier native captures rather than
starting either application again.

| Surface | Donor | IntelliZen | Result |
|---|---|---|---|
| Row action menu | [built donor](../../wave-1-fidelity/round-1/evidence/screenshots/donor-agent-row-menu.png) | [built IntelliZen](../../wave-1-fidelity/round-3/evidence/screenshots/current-release-agent-menu.png) | One ellipsis trigger, one transient menu, grouped actions, and a word-coloured destructive action. |
| Panel and composer | [built donor](../../wave-1-fidelity/round-1/evidence/screenshots/donor-shell-workspace.jpeg) | [current branch, browser shell](current-panel-composer.png) | Same three-plane placement and compact transparent composer; the current branch uses the donor user-bubble token for user turns. The browser shell is intentionally offline because Hermes is available only in the Tauri host. |
| Ejected panel | [donor panel reference](../../wave-1-fidelity/round-1/evidence/screenshots/donor-reference-hud-panel.png) | [built IntelliZen](../../wave-1-fidelity/round-3/evidence/screenshots/current-release-panel-detached.png) | The ejected body now reads the donor HUD ground and shadow tokens. |
| Reduced HUD | [donor HUD reference](../../wave-1-fidelity/round-1/evidence/screenshots/donor-reference-hud-collapsed.png) | [built IntelliZen](../../wave-1-fidelity/round-3/evidence/screenshots/current-release-hud.png) | The reduced bar remains the ejected panel's compact state, with no docked HUD strip. |

The executable donor could not produce a populated conversation because its
provider was offline in the original native capture. Bubble parity is therefore
also checked directly against the donor source rather than inferred from an
empty screenshot:

| Token | Hermes donor | IntelliZen |
|---|---|---|
| `--user-bubble` dark | `accent 15% + raised` | `accent 15% + raised` |
| `--user-bubble` light | `accent 9% + white` | `accent 9% + white` |
| `--hud-bg` | `mantle` dark, `base` light | `mantle` dark, `base` light |
| `--hud-shadow` | `0 8px 28px`, alpha `.44` dark / `.22` light | same |
| `--r-sm` | donor compact-radius alias | IntelliZen's single 8px control-radius alias |

The remaining deliberate differences follow the v3 rules: IntelliZen uses the
selected plane instead of an accent outline, keeps keyboard focus on
`:focus-visible`, and uses borders only for active editing, named failure,
swatches, and live tree drop targets.
