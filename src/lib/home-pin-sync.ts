import type { HomePin } from "@/lib/home-pins";

/**
 * Catalog refreshes are only needed when pin identity changes. Placement-only
 * edits are already represented by the Home pins query and should not trigger
 * an expensive workspace catalog reload.
 */
export function homePinIdentitySignature(pins: HomePin[]) {
  return pins
    .map((pin) => `${pin.id}:${pin.databaseId}:${pin.viewId}`)
    .sort()
    .join("|");
}
