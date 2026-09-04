// What is loaded right now: one record per plugin folder, its contributions,
// and its error if it failed. The hooks at the bottom are the only thing the
// app's surfaces touch.
import { useEffect, useMemo } from "react";
import { create } from "zustand";

import type {
  PluginCommand,
  PluginManifest,
  PluginPanelAction,
  PluginRoute,
  PluginSidebarEntry,
  PluginWidget,
} from "./contract";

export interface PluginContributionSet {
  routes: PluginRoute[];
  sidebar: PluginSidebarEntry[];
  widgets: PluginWidget[];
  commands: PluginCommand[];
  panelActions: PluginPanelAction[];
}

export interface PluginRecord {
  id: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  grants?: Record<string, boolean>;
  dir: string;
  status: "loaded" | "error";
  error?: string;
  loadedAt: number;
  contributions: PluginContributionSet;
}

export type Stamped<T> = T & { pluginId: string; pluginName: string };

type PluginRegistry = {
  plugins: Record<string, PluginRecord>;
  setLoaded: (record: Omit<PluginRecord, "status" | "error" | "loadedAt">) => void;
  setError: (meta: { id: string; dir: string; manifest?: PluginManifest }, error: string) => void;
  remove: (id: string) => void;
  clear: () => void;
};

export const emptyContributions = (): PluginContributionSet => ({
  routes: [],
  sidebar: [],
  widgets: [],
  commands: [],
  panelActions: [],
});

export const usePluginRegistry = create<PluginRegistry>((set) => ({
  plugins: {},
  setLoaded: (record) =>
    set((state) => ({
      plugins: { ...state.plugins, [record.id]: { ...record, status: "loaded", loadedAt: Date.now() } },
    })),
  setError: ({ id, dir, manifest }, error) =>
    set((state) => ({
      plugins: {
        ...state.plugins,
        [id]: {
          id,
          name: manifest?.name ?? id,
          description: manifest?.description,
          version: manifest?.version,
          dir,
          status: "error",
          error,
          loadedAt: Date.now(),
          contributions: emptyContributions(),
        },
      },
    })),
  remove: (id) =>
    set((state) => {
      const { [id]: _dropped, ...plugins } = state.plugins;
      return { plugins };
    }),
  clear: () => set({ plugins: {} }),
}));

function flatten<K extends keyof PluginContributionSet>(
  plugins: Record<string, PluginRecord>,
  key: K,
): Stamped<PluginContributionSet[K][number]>[] {
  return Object.values(plugins).flatMap((plugin) =>
    (plugin.contributions[key] as PluginContributionSet[K][number][]).map((item) => ({
      ...item,
      pluginId: plugin.id,
      pluginName: plugin.name,
    })),
  );
}

/** The loader is started by whichever plugin surface mounts first; the start
 *  is idempotent and a no-op outside Tauri. Injected to keep this module free
 *  of fs imports (tests build the registry without a loader). */
let bootLoader: (() => void) | null = null;
export function setPluginLoaderBoot(fn: () => void) {
  bootLoader = fn;
}

function usePluginsBoot() {
  useEffect(() => {
    bootLoader?.();
  }, []);
}

export function usePlugins(): PluginRecord[] {
  usePluginsBoot();
  const plugins = usePluginRegistry((state) => state.plugins);
  return useMemo(() => Object.values(plugins), [plugins]);
}

export function usePluginRoutes(): Stamped<PluginRoute>[] {
  usePluginsBoot();
  const plugins = usePluginRegistry((state) => state.plugins);
  return useMemo(() => flatten(plugins, "routes"), [plugins]);
}

export function usePluginSidebarEntries(): Stamped<PluginSidebarEntry>[] {
  usePluginsBoot();
  const plugins = usePluginRegistry((state) => state.plugins);
  return useMemo(
    () => flatten(plugins, "sidebar").sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [plugins],
  );
}

export function usePluginWidgets(): Stamped<PluginWidget>[] {
  usePluginsBoot();
  const plugins = usePluginRegistry((state) => state.plugins);
  return useMemo(() => flatten(plugins, "widgets"), [plugins]);
}

export function usePluginCommands(): Stamped<PluginCommand>[] {
  usePluginsBoot();
  const plugins = usePluginRegistry((state) => state.plugins);
  return useMemo(() => flatten(plugins, "commands"), [plugins]);
}

export function usePluginPanelActions(): Stamped<PluginPanelAction>[] {
  usePluginsBoot();
  const plugins = usePluginRegistry((state) => state.plugins);
  return useMemo(() => flatten(plugins, "panelActions"), [plugins]);
}
