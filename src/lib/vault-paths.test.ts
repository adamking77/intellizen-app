import { beforeEach, expect, it, vi } from "vitest";
const fs = vi.hoisted(() => ({ readDir: vi.fn(), readFile: vi.fn(), readTextFile: vi.fn(), exists: vi.fn(), mkdir: vi.fn(), remove: vi.fn(), writeTextFile: vi.fn(), writeFile: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => fs);
vi.mock("@tauri-apps/api/path", () => ({
  homeDir: async () => "/Users/adam/",
  join: async (...parts: string[]) => parts.join("/").replace(/\/+/g, "/"),
  dirname: async (path: string) => path.slice(0, path.lastIndexOf("/")),
}));
import { readVaultFile, writeVaultFile } from "./vault";
beforeEach(() => { vi.clearAllMocks(); fs.exists.mockResolvedValue(true); fs.readTextFile.mockResolvedValue("# Canonical report"); });
it("reads legacy intelligence-relative paths and direct canonical vault paths", async () => {
  await readVaultFile("documents/brief.md");
  expect(fs.readTextFile).toHaveBeenLastCalledWith("/Users/adam/vault/intelligence/documents/brief.md");
  await readVaultFile("/Users/adam/vault/initiatives/report.md");
  expect(fs.readTextFile).toHaveBeenLastCalledWith("/Users/adam/vault/initiatives/report.md");
});
it("writes canonical files without nesting them beneath intelligence", async () => {
  await writeVaultFile("/Users/adam/vault/report.md", "# Updated");
  expect(fs.writeTextFile).toHaveBeenCalledWith("/Users/adam/vault/report.md", "# Updated");
});
it("rejects other homes, prefix lookalikes and traversal before filesystem access", async () => {
  for (const path of ["/Users/other/vault/report.md", "/Users/adam/vault-backup/report.md", "/Users/adam/vault/../private.md", "../private.md"]) {
    await expect(readVaultFile(path)).rejects.toThrow();
  }
  expect(fs.readTextFile).not.toHaveBeenCalled();
});
it("resolves explicit portable vault-root paths and relative assets", async () => {
  const { resolveVaultReference } = await import('./vault');
  await readVaultFile('vault:journal/2026/09/note.md');
  expect(fs.readTextFile).toHaveBeenLastCalledWith('/Users/adam/vault/journal/2026/09/note.md');
  expect(await resolveVaultReference('../assets/chart.png', 'vault:work/client/reports/a.md')).toBe('/Users/adam/vault/work/client/assets/chart.png');
  await expect(resolveVaultReference('../../outside.txt', 'vault:note.md')).rejects.toThrow();
});
it("keeps unreadable folders explicit and skips aliases and runtime trees", async () => {
  const { listVaultDocuments } = await import('./vault');
  fs.readDir.mockImplementation(async (path) => {
    if (path === '/Users/adam/vault') return [
      { name:'work', isDirectory:true }, { name:'node_modules', isDirectory:true },
      { name:'alias', isDirectory:true, isSymlink:true }, { name:'.sync-conflicts', isDirectory:true },
    ];
    if (path === '/Users/adam/vault/work') throw new Error('Permission denied');
    throw new Error('Unexpected traversal');
  });
  const inventory = await listVaultDocuments();
  expect(inventory.files).toEqual([]); expect(inventory.errors).toHaveLength(1);
  expect(inventory.errors[0].path).toBe('work'); expect(fs.readDir).toHaveBeenCalledTimes(2);
});
