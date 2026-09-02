// Starts the loader against the real disk, once, inside Tauri. Every plugin
// surface imports this module, so the first one to mount boots the loader.
import { homeDir, join } from "@tauri-apps/api/path";
import { readDir, readTextFile, stat } from "@tauri-apps/plugin-fs";

import { isTauriRuntime } from "@/components/layout/window-chrome";
import { toast } from "@/lib/toast";

import { reconcilePlugins, startPluginLoader, type PluginFs } from "./loader";
import { setPluginLoaderBoot, usePluginRegistry } from "./registry";

const tauriFs: PluginFs = {
  readDir: async (path) => (await readDir(path)).map((e) => ({ name: e.name, isDirectory: e.isDirectory })),
  readTextFile: (path) => readTextFile(path),
  mtime: async (path) => (await stat(path)).mtime?.getTime() ?? null,
};

let started = false;
let booted = false;
let stop: (() => void) | null = null;
let rootPromise: Promise<string> | null = null;
const stamps = new Map<string, string>();

export function pluginsRoot(): Promise<string> {
  rootPromise ??= homeDir().then((home) => join(home, ".hermes", "plugins"));
  return rootPromise;
}

function report(id: string) {
  const record = usePluginRegistry.getState().plugins[id];
  if (!record) return;
  if (record.status === "error") {
    toast.error(`Plugin "${record.name}" failed to load`, { description: record.error });
  } else if (booted) {
    toast.info(`Plugin "${record.name}" reloaded`);
  }
}

export function ensurePluginLoader() {
  if (started || !isTauriRuntime) return;
  started = true;
  void pluginsRoot().then((root) => {
    stop = startPluginLoader({
      fs: tauriFs,
      root,
      onLoaded: report,
    });
    // Anything loaded after the first pass is a hot reload worth a toast.
    setTimeout(() => {
      booted = true;
    }, 1_000);
  });
}

/** The ⌘K "Reload plugins" fallback: re-read every plugin now. */
export async function reloadPluginsNow() {
  if (!isTauriRuntime) return;
  stamps.clear();
  const root = await pluginsRoot();
  for (const id of await reconcilePlugins(tauriFs, root, stamps)) report(id);
}

export function stopPluginLoader() {
  stop?.();
  stop = null;
  started = false;
}

setPluginLoaderBoot(ensurePluginLoader);
