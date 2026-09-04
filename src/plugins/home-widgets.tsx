// Plugin widgets use the same shared Home Pins records as database and
// generated widgets. localStorage is read only once to migrate older picks.
import { isPluginHomePin, type HomePin } from "@/lib/home-pins";

import { PluginErrorBox, PluginSlot } from "./boundary";
import { usePluginWidgets, usePlugins } from "./registry";
import "./boot";

const LEGACY_STORAGE_KEY = "intelizen:plugin-widgets";

export const widgetKey = (pluginId: string, widgetId: string) => `${pluginId}:${widgetId}`;

export function parseWidgetKey(key: string) {
  const separator = key.indexOf(":");
  if (separator < 1 || separator === key.length - 1) return null;
  return { pluginId: key.slice(0, separator), widgetId: key.slice(separator + 1) };
}

export function readLegacyPluginWidgetKeys(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}

export function clearLegacyPluginWidgetKeys() {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // A completed remote migration remains authoritative when storage is unavailable.
  }
}

/** Rows for Home's Add widget menu. Renders nothing when no plugin offers one. */
export function PluginWidgetMenuItems({
  pins,
  onAdd,
}: {
  pins: HomePin[];
  onAdd: (widget: { pluginId: string; widgetId: string; title: string }) => void;
}) {
  const widgets = usePluginWidgets();
  if (widgets.length === 0) return null;
  return (
    <>
      <div className="mt-1 px-2 pb-1 pt-2">
        <span className="font-ui text-[var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--overlay-1)]">
          Plugin widgets
        </span>
      </div>
      {widgets.map((widget) => {
        const added = pins.some((pin) =>
          isPluginHomePin(pin) && pin.pluginId === widget.pluginId && pin.widgetId === widget.id
        );
        return (
          <button
            key={widgetKey(widget.pluginId, widget.id)}
            type="button"
            role="menuitem"
            disabled={added}
            onClick={() => onAdd({ pluginId: widget.pluginId, widgetId: widget.id, title: widget.label })}
            className="block w-full rounded-[var(--r-plane)] px-2 py-2 text-left transition-colors hover:bg-[var(--surface-wash)] disabled:opacity-50"
          >
            <span className="block font-ui text-[var(--t-meta)] font-medium text-[var(--text)]">
              {widget.label}{added ? " · Added" : ""}
            </span>
            <span className="mt-0.5 block font-ui text-[var(--t-count)] leading-4 text-[var(--overlay-1)]">
              {widget.description ?? widget.pluginName}
            </span>
          </button>
        );
      })}
    </>
  );
}

/** One isolated plugin contribution inside the shared draggable Home grid. */
export function PluginWidgetSurface({ pluginId, widgetId }: { pluginId: string; widgetId: string }) {
  const widgets = usePluginWidgets();
  const plugins = usePlugins();
  const widget = widgets.find((item) => item.pluginId === pluginId && item.id === widgetId);
  const plugin = plugins.find((item) => item.id === pluginId);
  if (widget) return <PluginSlot name={widget.pluginName} render={widget.render} resetKey={plugin?.loadedAt} />;
  if (plugin?.status === "error") return <PluginErrorBox name={plugin.name} error={plugin.error ?? "unknown error"} />;
  return (
    <p className="font-ui text-[var(--t-meta)] text-[var(--overlay-1)]">
      Waiting for plugin “{pluginId}” to load.
    </p>
  );
}
