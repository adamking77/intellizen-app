import { homeDir, join } from "@tauri-apps/api/path";
import { mkdir, readDir, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs";

import { recordPluginWorkEvent } from "@/lib/data";

import { reloadPluginsNow } from "./boot";
import { unloadPlugin } from "./loader";

export const PLUGIN_APPROVAL_FIELD = "plugin_approval";
export const PLUGIN_METADATA_FILE = ".intellizen.json";

export interface PluginApproval {
  plugin_id: string;
  name: string;
  version: string;
  author: string;
  capabilities: string[];
  hashes: Record<string, string>;
}

export interface InstalledPluginMetadata {
  approval_record_id: string;
  author: string;
  version: string;
  capabilities: Record<string, boolean>;
  hashes: Record<string, string>;
  enabled: boolean;
}

export function parsePluginApproval(value: unknown): PluginApproval | null {
  try {
    const row = (typeof value === "string" ? JSON.parse(value) : value) as Partial<PluginApproval> | null;
    if (!row || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(row.plugin_id ?? "") || !row.name || !row.author || !row.hashes) return null;
    return {
      plugin_id: row.plugin_id!,
      name: row.name,
      version: row.version || "0.1.0",
      author: row.author,
      capabilities: Array.isArray(row.capabilities) ? row.capabilities.filter((item): item is string => typeof item === "string") : [],
      hashes: row.hashes,
    };
  } catch {
    return null;
  }
}

export function grantsComplete(approval: PluginApproval, grants: Record<string, boolean>) {
  return approval.capabilities.every((capability) => typeof grants[capability] === "boolean");
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifyPluginApproval(approval: PluginApproval, files: Record<string, string>) {
  for (const [file, expected] of Object.entries(approval.hashes)) {
    if (!(file in files)) throw new Error(`Missing staged file: ${file}`);
    if (await sha256(files[file]) !== expected) throw new Error(`Staged file changed after review: ${file}`);
  }
}

async function roots(pluginId: string) {
  const home = await homeDir();
  return {
    stage: await join(home, ".hermes", "plugins", ".intellizen-staging", pluginId),
    installed: await join(home, ".hermes", "plugins", pluginId),
  };
}

export async function installApprovedPlugin(recordId: string, approval: PluginApproval, grants: Record<string, boolean>) {
  if (!grantsComplete(approval, grants)) throw new Error("Decide every requested capability before installing.");
  const paths = await roots(approval.plugin_id);
  const manifestPath = await join(paths.stage, "plugin.yaml");
  const entryPath = await join(paths.stage, "intellizen", "plugin.js");
  const files = {
    "plugin.yaml": await readTextFile(manifestPath),
    "intellizen/plugin.js": await readTextFile(entryPath),
  };
  await verifyPluginApproval(approval, files);
  const installedEntry = await join(paths.installed, "intellizen");
  await mkdir(installedEntry, { recursive: true });
  await writeTextFile(await join(paths.installed, "plugin.yaml"), files["plugin.yaml"]);
  await writeTextFile(await join(installedEntry, "plugin.js"), files["intellizen/plugin.js"]);
  const metadata: InstalledPluginMetadata = {
    approval_record_id: recordId,
    author: approval.author,
    version: approval.version,
    capabilities: grants,
    hashes: approval.hashes,
    enabled: true,
  };
  await writeTextFile(await join(paths.installed, PLUGIN_METADATA_FILE), JSON.stringify(metadata, null, 2));
  await remove(paths.stage, { recursive: true });
  await recordPluginWorkEvent(recordId, "plugin.installed", `Installed plugin “${approval.name}”`, { plugin_id: approval.plugin_id, grants });
  await reloadPluginsNow();
}

export async function rejectPlugin(recordId: string, approval: PluginApproval) {
  const paths = await roots(approval.plugin_id);
  try {
    await remove(paths.stage, { recursive: true });
  } catch {
    // Rejection remains valid if the staged folder already vanished.
  }
  await recordPluginWorkEvent(recordId, "plugin.rejected", `Rejected plugin “${approval.name}”`, { plugin_id: approval.plugin_id });
}

export async function listInstalledPluginMetadata() {
  const home = await homeDir();
  const root = await join(home, ".hermes", "plugins");
  let entries: Awaited<ReturnType<typeof readDir>>;
  try {
    entries = await readDir(root);
  } catch {
    return [];
  }
  const found = await Promise.all(entries.filter((entry) => entry.isDirectory && !entry.name.startsWith(".")).map(async (entry) => {
    const dir = await join(root, entry.name);
    try {
      await readTextFile(await join(dir, "intellizen", "plugin.js"));
    } catch {
      return null;
    }
    try {
      const metadata = JSON.parse(await readTextFile(await join(dir, PLUGIN_METADATA_FILE))) as InstalledPluginMetadata;
      return { id: entry.name, dir, metadata };
    } catch {
      return { id: entry.name, dir, metadata: null };
    }
  }));
  return found.filter((item): item is NonNullable<typeof item> => item !== null);
}

export async function setPluginEnabled(id: string, enabled: boolean) {
  const { installed } = await roots(id);
  const metadataPath = await join(installed, PLUGIN_METADATA_FILE);
  let metadata: InstalledPluginMetadata;
  try {
    metadata = JSON.parse(await readTextFile(metadataPath)) as InstalledPluginMetadata;
  } catch {
    metadata = { approval_record_id: "legacy", author: "Unknown", version: "unknown", capabilities: {}, hashes: {}, enabled: true };
  }
  await writeTextFile(metadataPath, JSON.stringify({ ...metadata, enabled }, null, 2));
  if (enabled) await reloadPluginsNow();
  else unloadPlugin(id);
}

export async function uninstallPlugin(id: string) {
  const { installed } = await roots(id);
  await remove(installed, { recursive: true });
  unloadPlugin(id);
}
