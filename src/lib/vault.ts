// Tauri fs plugin integration for vault operations
import { readDir, readTextFile, exists, mkdir, remove, writeTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { dirname, homeDir, join } from "@tauri-apps/api/path";

export type VaultRoot = "vault" | "intelligence";

const VAULT_SEGMENTS: Record<VaultRoot, readonly string[]> = {
  vault: ["vault"],
  intelligence: ["vault", "intelligence"],
};

const IGNORED_ROOT_ENTRY_NAMES = new Set([".DS_Store"]);
const IGNORED_VAULT_DIRECTORY_NAMES = new Set(["node_modules"]);

const vaultBasePathPromises: Partial<Record<VaultRoot, Promise<string>>> = {};

export interface VaultEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: VaultEntry[];
}

async function getVaultBasePath(root: VaultRoot = "intelligence"): Promise<string> {
  if (!vaultBasePathPromises[root]) {
    vaultBasePathPromises[root] = (async () => {
      const home = await homeDir();
      return join(home, ...VAULT_SEGMENTS[root]);
    })();
  }

  return vaultBasePathPromises[root]!;
}

function assertSafeVaultSubpath(subpath: string): void {
  if (!subpath) return;
  if (subpath.startsWith("/") || /^[A-Za-z]:[\\/]/.test(subpath)) {
    throw new Error("Vault paths must be relative.");
  }

  const segments = subpath.split(/[\\/]+/).filter(Boolean);
  if (segments.some((segment) => segment === "..")) {
    throw new Error("Vault paths cannot traverse outside the vault.");
  }
}

async function resolveVaultPath(
  subpath = "",
  root: VaultRoot = "intelligence",
): Promise<string> {
  assertSafeVaultSubpath(subpath);
  const base = await getVaultBasePath(root);
  return subpath ? join(base, subpath) : base;
}

async function ensureVaultDirectory(
  subpath = "",
  root: VaultRoot = "intelligence",
): Promise<void> {
  const fullPath = await resolveVaultPath(subpath, root);
  if (!(await exists(fullPath))) {
    await mkdir(fullPath, { recursive: true });
  }
}

export async function createVaultDirectory(
  subpath: string,
  root: VaultRoot = "intelligence",
): Promise<void> {
  try {
    await ensureVaultDirectory(subpath, root);
  } catch (error) {
    console.error("Failed to create vault directory:", error);
    throw error;
  }
}

function shouldIgnoreVaultEntry(
  entryName: string,
  isDirectory: boolean,
  root: VaultRoot,
): boolean {
  if (IGNORED_ROOT_ENTRY_NAMES.has(entryName)) {
    return true;
  }

  if (root === "vault" && isDirectory && IGNORED_VAULT_DIRECTORY_NAMES.has(entryName)) {
    return true;
  }

  return false;
}

async function readVaultDirectoryRecursive(
  subpath = "",
  root: VaultRoot = "intelligence",
): Promise<VaultEntry[]> {
  const basePath = await resolveVaultPath(subpath, root);
  const entries = (await readDir(basePath)).filter(
    (entry) => !shouldIgnoreVaultEntry(entry.name, entry.isDirectory, root),
  );

  const results = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = subpath ? await join(subpath, entry.name) : entry.name;

      const children = entry.isDirectory
        ? await readVaultDirectoryRecursive(entryPath, root).catch(() => [])
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
  subpath: string = "",
  root: VaultRoot = "intelligence",
): Promise<VaultEntry[]> {
  try {
    return await readVaultDirectoryRecursive(subpath, root);
  } catch (error) {
    console.error("Failed to read vault directory:", error);
    return [];
  }
}

/**
 * Read a vault file as text
 */
export async function readVaultFile(
  filepath: string,
  root: VaultRoot = "intelligence",
): Promise<string | null> {
  try {
    const fullPath = await resolveVaultPath(filepath, root);
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
export async function vaultPathExists(
  subpath: string,
  root: VaultRoot = "intelligence",
): Promise<boolean> {
  try {
    const fullPath = await resolveVaultPath(subpath, root);
    return await exists(fullPath);
  } catch {
    return false;
  }
}

/**
 * Write binary data into a file within the vault. Creates parent directories as needed.
 */
export async function writeVaultBinaryFile(filepath: string, data: Uint8Array): Promise<void> {
  try {
    await ensureVaultDirectory();
    const parentPath = await dirname(filepath);
    if (parentPath && parentPath !== ".") {
      await ensureVaultDirectory(parentPath);
    }
    const fullPath = await resolveVaultPath(filepath);
    await writeFile(fullPath, data);
  } catch (error) {
    console.error("Failed to write vault binary file:", error);
    throw error;
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
 * Ensure project directory exists under vault/intelligence/projects/<id>
 */
export async function ensureProjectDirectory(projectId: number): Promise<void> {
  try {
    const projectSubpath = await join("projects", String(projectId));
    await ensureVaultDirectory(projectSubpath);
  } catch (error) {
    console.error("Failed to create project directory:", error);
    throw error;
  }
}

/**
 * Remove an investigation directory from the vault if it exists.
 */
export async function removeInvestigationDirectory(caseId: string): Promise<boolean> {
  try {
    const investigationSubpath = await join("investigations", caseId);
    const fullPath = await resolveVaultPath(investigationSubpath);
    if (!(await exists(fullPath))) {
      return false;
    }
    await remove(fullPath, { recursive: true });
    return true;
  } catch (error) {
    console.error("Failed to remove investigation directory:", error);
    throw error;
  }
}

/**
 * Delete a single file from the vault.
 */
export async function removeVaultFile(filepath: string): Promise<void> {
  const fullPath = await resolveVaultPath(filepath);
  if (await exists(fullPath)) {
    await remove(fullPath);
  }
}

/**
 * Write text into a file within the vault. Creates parent directories as needed.
 */
export async function writeVaultFile(
  filepath: string,
  content: string,
  root: VaultRoot = "intelligence",
): Promise<void> {
  try {
    await ensureVaultDirectory("", root);
    const parentPath = await dirname(filepath);
    if (parentPath && parentPath !== ".") {
      await ensureVaultDirectory(parentPath, root);
    }
    const fullPath = await resolveVaultPath(filepath, root);
    await writeTextFile(fullPath, content);
  } catch (error) {
    console.error("Failed to write vault file:", error);
    throw error;
  }
}

/**
 * Resolve a vault-relative path to an absolute filesystem path
 */
export async function getVaultAbsolutePath(
  filepath: string,
  root: VaultRoot = "intelligence",
): Promise<string> {
  return resolveVaultPath(filepath, root);
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
