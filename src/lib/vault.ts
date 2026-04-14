// Tauri fs plugin integration for vault operations
import { readDir, readTextFile, exists, mkdir, writeTextFile } from "@tauri-apps/plugin-fs";
import { dirname, homeDir, join } from "@tauri-apps/api/path";

const VAULT_SEGMENTS = ["vault", "intelligence"] as const;
let vaultBasePathPromise: Promise<string> | null = null;

export interface VaultEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: VaultEntry[];
}

async function getVaultBasePath(): Promise<string> {
  if (!vaultBasePathPromise) {
    vaultBasePathPromise = (async () => {
      const home = await homeDir();
      return join(home, ...VAULT_SEGMENTS);
    })();
  }

  return vaultBasePathPromise;
}

async function resolveVaultPath(subpath = ""): Promise<string> {
  const base = await getVaultBasePath();
  return subpath ? join(base, subpath) : base;
}

async function ensureVaultDirectory(subpath = ""): Promise<void> {
  const fullPath = await resolveVaultPath(subpath);
  if (!(await exists(fullPath))) {
    await mkdir(fullPath, { recursive: true });
  }
}

async function readVaultDirectoryRecursive(subpath = ""): Promise<VaultEntry[]> {
  const basePath = await resolveVaultPath(subpath);
  const entries = await readDir(basePath);

  const results = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = subpath ? await join(subpath, entry.name) : entry.name;

      const children = entry.isDirectory
        ? await readVaultDirectoryRecursive(entryPath).catch(() => [])
        : undefined;

      return {
        name: entry.name,
        path: entryPath,
        isDirectory: entry.isDirectory,
        ...(children ? { children } : {}),
      };
    }),
  );

  // Sort: directories first, then files
  return results.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Read vault directory structure
 */
export async function readVaultDirectory(
  subpath: string = ""
): Promise<VaultEntry[]> {
  try {
    return await readVaultDirectoryRecursive(subpath);
  } catch (error) {
    console.error("Failed to read vault directory:", error);
    return [];
  }
}

/**
 * Read a vault file as text
 */
export async function readVaultFile(filepath: string): Promise<string | null> {
  try {
    const fullPath = await resolveVaultPath(filepath);
    const content = await readTextFile(fullPath);
    return content;
  } catch (error) {
    console.error("Failed to read vault file:", error);
    return null;
  }
}

/**
 * Check if vault path exists
 */
export async function vaultPathExists(subpath: string): Promise<boolean> {
  try {
    const fullPath = await resolveVaultPath(subpath);
    return await exists(fullPath);
  } catch {
    return false;
  }
}

/**
 * Ensure investigation directory exists
 */
export async function ensureInvestigationDirectory(caseId: string): Promise<void> {
  try {
    const investigationSubpath = await join("investigations", caseId);
    await ensureVaultDirectory(investigationSubpath);
  } catch (error) {
    console.error("Failed to create investigation directory:", error);
    throw error;
  }
}

/**
 * Write text into a file within the vault. Creates parent directories as needed.
 */
export async function writeVaultFile(filepath: string, content: string): Promise<void> {
  try {
    await ensureVaultDirectory();
    const parentPath = await dirname(filepath);
    if (parentPath && parentPath !== ".") {
      await ensureVaultDirectory(parentPath);
    }
    const fullPath = await resolveVaultPath(filepath);
    await writeTextFile(fullPath, content);
  } catch (error) {
    console.error("Failed to write vault file:", error);
    throw error;
  }
}

/**
 * Organize vault files by type
 */
export function organizeVaultFiles(entries: VaultEntry[]): {
  investigations: VaultEntry[];
  sweeps: VaultEntry[];
  assessments: VaultEntry[];
  briefs: VaultEntry[];
} {
  return {
    investigations: entries.filter(
      (e) => e.isDirectory && e.name === "investigations"
    ),
    sweeps: entries.filter(
      (e) => !e.isDirectory && e.name.includes("sweep")
    ),
    assessments: entries.filter(
      (e) => !e.isDirectory && e.name.includes("assessment")
    ),
    briefs: entries.filter(
      (e) => !e.isDirectory && e.name.includes("brief")
    ),
  };
}
