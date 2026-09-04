import { isDatabaseViewHomePin, isInstrumentHomePin, isPluginHomePin, type HomePin } from "@/lib/home-pins";

/**
 * Catalog refreshes are only needed when pin identity changes. Placement-only
 * edits are already represented by the Home pins query and should not trigger
 * an expensive workspace catalog reload.
 */
export function homePinIdentitySignature(pins: HomePin[]) {
  return pins
    .map((pin) => isDatabaseViewHomePin(pin)
      ? `${pin.id}:database-view:${pin.databaseId}:${pin.viewId}`
      : isPluginHomePin(pin)
        ? `${pin.id}:plugin:${pin.pluginId}:${pin.widgetId}`
        : isInstrumentHomePin(pin)
          ? `${pin.id}:instrument:${pin.instrumentId}`
          : `${pin.id}:genui:${pin.widget.kind}`)
    .sort()
    .join("|");
}
