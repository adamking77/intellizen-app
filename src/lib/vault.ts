// Tauri fs plugin integration for vault operations
import { readDir, readTextFile, exists, mkdir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";

const VAULT_BASE = "~/vault/intelligence";

export interface VaultEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: VaultEntry[];
}

/**
 * Read vault directory structure
 */
export async function readVaultDirectory(
  subpath: string = ""
): Promise<VaultEntry[]> {
  try {
    const basePath = await join(VAULT_BASE, subpath);
    const entries = await readDir(basePath);

    const results: VaultEntry[] = [];
    
    for (const entry of entries) {
      const entryPath = await join(subpath, entry.name);
      
      results.push({
        name: entry.name,
        path: entryPath,
        isDirectory: entry.isDirectory,
        ...(entry.isDirectory ? { children: [] } : {}),
      });
    }

    // Sort: directories first, then files
    return results.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
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
    const fullPath = await join(VAULT_BASE, filepath);
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
    const fullPath = await join(VAULT_BASE, subpath);
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
    const investigationPath = await join(VAULT_BASE, "investigations", caseId);
    const pathExists = await exists(investigationPath);
    
    if (!pathExists) {
      await mkdir(investigationPath, { recursive: true });
    }
  } catch (error) {
    console.error("Failed to create investigation directory:", error);
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
