// Plugin widgets on Home: rows in the Add widget menu, and the board of the
// ones Adam added. Which are added lives in localStorage on this Mac.
// ponytail: localStorage placement; upgrade path is a `plugin` kind of Home pin in the Home Pins database.
import { useCallback, useSyncExternalStore } from "react";
import { X } from "lucide-react";

import { PluginErrorBox, PluginSlot } from "./boundary";
import { usePluginWidgets, usePlugins } from "./registry";
import "./boot";

const STORAGE_KEY = "intelizen:plugin-widgets";
const CHANGE_EVENT = "intelizen:plugin-widgets-changed";

export const widgetKey = (pluginId: string, widgetId: string) => `${pluginId}:${widgetId}`;

function readShown(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

let cached = readShown();
let cachedRaw: string | null = null;

function snapshot(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* no storage */
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = readShown();
  }
  return cached;
}

function writeShown(keys: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    /* the change still applies for this session */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useShownPluginWidgets() {
  const shown = useSyncExternalStore(subscribe, snapshot, () => cached);
  const add = useCallback((key: string) => writeShown([...new Set([...snapshot(), key])]), []);
  const remove = useCallback((key: string) => writeShown(snapshot().filter((k) => k !== key)), []);
  return { shown, add, remove };
}

/** Rows for Home's Add widget menu. Renders nothing when no plugin offers one. */
export function PluginWidgetMenuItems({ onAdded }: { onAdded?: () => void }) {
  const widgets = usePluginWidgets();
  const { shown, add } = useShownPluginWidgets();
  if (widgets.length === 0) return null;
  return (
    <>
      <div className="mt-1 px-2 pb-1 pt-2">
        <span className="font-ui text-[var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--overlay-1)]">
          Plugin widgets
        </span>
      </div>
      {widgets.map((widget) => {
        const key = widgetKey(widget.pluginId, widget.id);
        const added = shown.includes(key);
        return (
          <button
            key={key}
            type="button"
            role="menuitem"
            disabled={added}
            onClick={() => {
              add(key);
              onAdded?.();
            }}
            className="block w-full rounded-[var(--r-plane)] px-2 py-2 text-left transition-colors hover:bg-[var(--surface-wash)] disabled:opacity-50"
          >
            <span className="block font-ui text-[var(--t-meta)] font-medium text-[var(--text)]">
              {widget.label}
              {added ? " · Added" : ""}
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

/** The added plugin widgets, each in its own error boundary. A widget whose
 *  plugin is broken shows the plugin's error in its place. */
export function PluginWidgetBoard() {
  const widgets = usePluginWidgets();
  const plugins = usePlugins();
  const { shown, remove } = useShownPluginWidgets();
  if (shown.length === 0) return null;

  return (
    <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-plugin-widgets>
      {shown.map((key) => {
        const widget = widgets.find((w) => widgetKey(w.pluginId, w.id) === key);
        const pluginId = key.slice(0, key.indexOf(":"));
        const plugin = plugins.find((p) => p.id === pluginId);
        const name = widget?.label ?? plugin?.name ?? pluginId;
        return (
          <section
            key={key}
            className="flex min-h-[120px] flex-col rounded-[var(--r-plane)] border border-[var(--border)] bg-[var(--mantle)]"
          >
            <header className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-3">
              <span className="truncate font-ui text-[var(--t-section)] font-light uppercase tracking-[0.14em] text-[var(--overlay-1)]">
                {name}
              </span>
              <button
                type="button"
                onClick={() => remove(key)}
                aria-label={`Remove ${name}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded-[var(--r-pill)] text-[var(--overlay-1)] hover:bg-[var(--surface-wash)] hover:text-[var(--text)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </header>
            <div className="min-h-0 flex-1 p-3">
              {widget ? (
                <PluginSlot name={widget.pluginName} render={widget.render} resetKey={plugin?.loadedAt} />
              ) : plugin?.status === "error" ? (
                <PluginErrorBox name={plugin.name} error={plugin.error ?? "unknown error"} />
              ) : (
                <p className="font-ui text-[var(--t-meta)] text-[var(--overlay-1)]">
                  Waiting for plugin “{pluginId}” to load.
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
