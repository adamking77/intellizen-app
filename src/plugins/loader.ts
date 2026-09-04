// Reads `~/.hermes/plugins/<id>/`, evaluates `intellizen/plugin.js` as an ES
// module, and keeps the registry in step with the disk. A plugin that throws
// (at evaluation or inside register) is recorded with its error and the rest
// keep running; a fixing save reloads it on the next tick.
import * as React from "react";

import type { IntelliZenPlugin, PluginContext, PluginContributions, PluginManifest } from "./contract";
import { pluginRouteHref } from "./contract";
import { emptyContributions, usePluginRegistry, type PluginContributionSet } from "./registry";

export const PLUGIN_ENTRY = ["intellizen", "plugin.js"] as const;
export const PLUGIN_MANIFEST = "plugin.yaml";
export const PLUGIN_METADATA = ".intellizen.json";
export const POLL_MS = 5_000;

/** The slice of the fs plugin the loader needs, so tests can hand it a map. */
export interface PluginFs {
  readDir: (path: string) => Promise<{ name: string; isDirectory: boolean }[]>;
  readTextFile: (path: string) => Promise<string>;
  /** Modification time in ms, or null when unknown. Rejects when missing. */
  mtime: (path: string) => Promise<number | null>;
}

export interface PluginSource {
  id: string;
  dir: string;
  manifest: PluginManifest;
  source: string;
  author?: string;
  grants?: Record<string, boolean>;
  /** Changes whenever plugin.js or plugin.yaml changes; drives hot reload. */
  stamp: string;
}

const joinPath = (...parts: string[]) => parts.join("/").replace(/\/+/g, "/");

/** Top-level `key: value` scalars of a Hermes plugin.yaml. Lists and nested
 *  maps (hooks, provides_tools) are Hermes's business and are skipped. */
// ponytail: a scalar-only reader; upgrade path is a yaml dependency if a manifest field we need ever nests.
export function parsePluginYaml(text: string): PluginManifest {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    if (!raw || /^\s/.test(raw) || raw.startsWith("#")) continue;
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(raw);
    if (!match) continue;
    let value = match[2].trim();
    if (!value || value.startsWith("-") || value.startsWith("[") || value.startsWith("{")) continue;
    const quoted = /^(['"])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, "");
    out[match[1]] = value;
  }
  const { name, version, description } = out;
  return { name, version, description };
}

/** Every folder under `root` that carries our entry file. Folders without
 *  one are ordinary Hermes plugins and are not an error. */
export async function scanPluginRoot(fs: PluginFs, root: string): Promise<PluginSource[]> {
  let entries: { name: string; isDirectory: boolean }[];
  try {
    entries = await fs.readDir(root);
  } catch {
    return []; // No plugins folder yet.
  }
  const found: PluginSource[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory || entry.name.startsWith(".")) continue;
    const dir = joinPath(root, entry.name);
    const entryFile = joinPath(dir, ...PLUGIN_ENTRY);
    let entryMtime: number | null;
    try {
      entryMtime = await fs.mtime(entryFile);
    } catch {
      continue;
    }
    const manifestFile = joinPath(dir, PLUGIN_MANIFEST);
    let manifest: PluginManifest = {};
    let manifestMtime: number | null = null;
    try {
      manifestMtime = await fs.mtime(manifestFile);
      manifest = parsePluginYaml(await fs.readTextFile(manifestFile));
    } catch {
      /* plugin.yaml is optional on our side */
    }
    let author: string | undefined;
    let grants: Record<string, boolean> | undefined;
    let metadataMtime: number | null = null;
    try {
      const metadataFile = joinPath(dir, PLUGIN_METADATA);
      metadataMtime = await fs.mtime(metadataFile);
      const metadata = JSON.parse(await fs.readTextFile(metadataFile)) as { author?: unknown; capabilities?: unknown; enabled?: unknown };
      if (metadata.enabled === false) continue;
      if (typeof metadata.author === "string") author = metadata.author;
      if (metadata.capabilities && typeof metadata.capabilities === "object") grants = metadata.capabilities as Record<string, boolean>;
    } catch {
      /* Plugins installed before approvals have no IntelliZen metadata. */
    }
    let source: string;
    try {
      source = await fs.readTextFile(entryFile);
    } catch {
      continue; // Vanished mid-scan; the next tick reconciles.
    }
    found.push({
      id: entry.name,
      dir,
      manifest,
      source,
      author,
      grants,
      stamp: `${entryMtime ?? source.length}:${manifestMtime ?? ""}:${metadataMtime ?? ""}`,
    });
  }
  return found;
}

/** Evaluate plugin.js as an ES module. In the webview this is a blob URL
 *  (CSP `script-src blob:`); under node tests it is a data URL. */
export async function evaluatePlugin(source: string): Promise<IntelliZenPlugin> {
  const useBlob = typeof document !== "undefined" && typeof URL.createObjectURL === "function";
  const url = useBlob
    ? URL.createObjectURL(new Blob([source], { type: "text/javascript" }))
    : `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
  let mod: { default?: unknown };
  try {
    mod = await import(/* @vite-ignore */ url);
  } finally {
    if (useBlob) URL.revokeObjectURL(url);
  }
  const plugin = mod.default as IntelliZenPlugin | undefined;
  if (!plugin || typeof plugin.register !== "function") {
    throw new Error("plugin.js must default-export an object with a register(ctx) function");
  }
  return plugin;
}

const disposers = new Map<string, (() => void)[]>();

function disposePlugin(id: string) {
  for (const fn of disposers.get(id) ?? []) {
    try {
      fn();
    } catch (error) {
      console.warn(`[plugins] ${id}: dispose threw`, error);
    }
  }
  disposers.delete(id);
}

/** Run `register` and file the result. Never throws. */
export async function loadPlugin(item: PluginSource): Promise<void> {
  const registry = usePluginRegistry.getState();
  disposePlugin(item.id);
  const contributions: PluginContributionSet = emptyContributions();
  const own: (() => void)[] = [];
  const ctx: PluginContext = {
    id: item.id,
    React,
    h: React.createElement,
    register: (c: PluginContributions) => {
      if (c.route) contributions.routes.push(c.route);
      if (c.sidebar) contributions.sidebar.push(c.sidebar);
      if (c.widget) contributions.widgets.push(c.widget);
      if (c.command) contributions.commands.push(c.command);
      if (c.panelAction) contributions.panelActions.push(c.panelAction);
    },
    onDispose: (fn) => own.push(fn),
    routeHref: (path) => pluginRouteHref(item.id, path),
  };
  try {
    const plugin = await evaluatePlugin(item.source);
    plugin.register(ctx);
    disposers.set(item.id, own);
    registry.setLoaded({
      id: item.id,
      name: plugin.name ?? item.manifest.name ?? item.id,
      description: plugin.description ?? item.manifest.description,
      version: item.manifest.version,
      author: item.author,
      grants: item.grants,
      dir: item.dir,
      contributions,
    });
  } catch (error) {
    for (const fn of own) fn();
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[plugins] ${item.id} failed to load`, error);
    registry.setError({ id: item.id, dir: item.dir, manifest: item.manifest }, message);
  }
}

export function unloadPlugin(id: string) {
  disposePlugin(id);
  usePluginRegistry.getState().remove(id);
}

/** One pass: load what is new or changed, drop what is gone. Returns the ids
 *  that were (re)loaded so a caller can report them. */
export async function reconcilePlugins(
  fs: PluginFs,
  root: string,
  stamps: Map<string, string>,
): Promise<string[]> {
  const sources = await scanPluginRoot(fs, root);
  const seen = new Set<string>();
  const touched: string[] = [];
  for (const item of sources) {
    seen.add(item.id);
    if (stamps.get(item.id) === item.stamp) continue;
    stamps.set(item.id, item.stamp);
    await loadPlugin(item);
    touched.push(item.id);
  }
  for (const id of [...stamps.keys()]) {
    if (seen.has(id)) continue;
    stamps.delete(id);
    unloadPlugin(id);
  }
  return touched;
}

/** Boot scan, then a poll every `intervalMs` while the window is visible.
 *  Returns a stop function. `onLoaded` fires with each (re)loaded id. */
export function startPluginLoader(opts: {
  fs: PluginFs;
  root: string;
  intervalMs?: number;
  onLoaded?: (id: string) => void;
}): () => void {
  const stamps = new Map<string, string>();
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      for (const id of await reconcilePlugins(opts.fs, opts.root, stamps)) opts.onLoaded?.(id);
    } finally {
      busy = false;
    }
  };
  void tick();
  // ponytail: a 5 s mtime poll; upgrade path is plugin-fs `watch` once the Cargo feature is on.
  const timer = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    void tick();
  }, opts.intervalMs ?? POLL_MS);
  return () => clearInterval(timer);
}
