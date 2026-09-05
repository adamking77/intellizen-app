// Tauri fs plugin integration for vault operations
import { readDir, stat, readFile, readTextFile, exists, mkdir, remove, writeTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { dirname, homeDir, join } from "@tauri-apps/api/path";

import { canonicalDocumentPath, visibleVaultFile, visibleVaultFolder, type VaultDocumentInventory } from "./docs-library";

export type VaultRoot = "vault" | "intelligence";

const VAULT_SEGMENTS: Record<VaultRoot, readonly string[]> = {
  vault: ["vault"],
  intelligence: ["vault", "intelligence"],
};

const vaultBasePathPromises: Partial<Record<VaultRoot, Promise<string>>> = {};

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
  if (subpath.startsWith("vault:")) { subpath = subpath.slice(6); root = "vault"; }
  if (subpath.startsWith("/")) {
    const vaultBase = await getVaultBasePath("vault");
    if (subpath === vaultBase) return vaultBase;
    const prefix = `${vaultBase.replace(/\/$/, "")}/`;
    if (!subpath.startsWith(prefix)) throw new Error("Document paths must stay inside this Mac's vault.");
    const relativePath = subpath.slice(prefix.length);
    assertSafeVaultSubpath(relativePath);
    return join(vaultBase, relativePath);
  }
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

/**
 * Read a vault file as text
 */
export async function readVaultFile(
  filepath: string,
  root: VaultRoot = "intelligence",
): Promise<string> {
  try {
    const fullPath = await resolveVaultPath(filepath, root);
    return await readTextFile(fullPath);
  } catch (error) {
    console.error("Failed to read vault file:", error);
    throw error;
  }
}

export async function readVaultBinaryFile(filepath: string): Promise<Uint8Array> {
  return readFile(await resolveVaultPath(filepath));
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
export async function removeVaultFile(
  filepath: string,
  root: VaultRoot = "intelligence",
): Promise<void> {
  const fullPath = await resolveVaultPath(filepath, root);
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

/** Resolve document-relative assets through the same vault boundary as the file. */
export async function resolveVaultReference(reference: string, documentPath: string) {
  const source = canonicalDocumentPath(documentPath);
  if (!source) throw new Error("The document has no vault location.");
  const target = decodeURIComponent(reference.split("#")[0]);
  if (/^(?:[a-z]+:|\/)/i.test(target)) throw new Error("Only relative vault references can be opened here.");
  const parts = source.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!parts.length) throw new Error("This reference leaves the vault."); parts.pop(); }
    else parts.push(part);
  }
  return resolveVaultPath(parts.join("/"), "vault");
}
export async function openVaultReference(reference: string, documentPath: string) {
  const { openPath } = await import("@tauri-apps/plugin-opener");
  await openPath(await resolveVaultReference(reference, documentPath));
}

/** Docs scans user documents only; never follows aliases or scans runtime trees. */
export async function listVaultDocuments(): Promise<VaultDocumentInventory> {
  const inventory: VaultDocumentInventory = { files: [], folders: [], errors: [] };
  async function visit(path: string) {
    let entries;
    try { entries = await readDir(await resolveVaultPath(path, "vault")); }
    catch (error) { if (!path) throw error; inventory.errors.push({ path, message: String(error) }); return; }
    for (const entry of entries) {
      const relative = path ? `${path}/${entry.name}` : entry.name;
      if (entry.isSymlink) continue;
      if (entry.isDirectory && visibleVaultFolder(relative)) { inventory.folders.push(relative); await visit(relative); }
      else if (entry.isFile && visibleVaultFile(relative)) {
        let modifiedAt: string | undefined;
        try { modifiedAt = (await stat(await resolveVaultPath(relative, "vault"))).mtime?.toISOString(); } catch { /* File remains findable when metadata cannot be read. */ }
        inventory.files.push({ path: relative, name: entry.name, modifiedAt });
      }
    }
  }
  await visit(""); return inventory;
}

export async function openVaultFile(path: string) {
  const { openPath } = await import('@tauri-apps/plugin-opener');
  await openPath(await resolveVaultPath(path));
}
